import { createHash } from 'node:crypto';
import type { AudioStatus } from '../../../shared/types/audio';
import type { IntegrationPlaybackAction } from '../../../shared/types/integrationPlatform';
import type {
  SteamListenTogetherError,
  SteamListenTogetherPlayback,
  SteamListenTogetherReaction,
  SteamListenTogetherReactionId,
  SteamListenTogetherSnapshot,
  SteamListenTogetherTrack,
} from '../../../shared/types/steam';
import { getIntegrationActionRouter } from '../core/IntegrationActionRouter';
import type { SteamClient } from './SteamRuntimeService';
import { SteamListenTogetherLocalTrackResolver } from './SteamListenTogetherLocalTrackResolver';

type SteamClientProvider = { getClient: () => SteamClient | null };
type ListenTogetherLobby = Awaited<ReturnType<SteamClient['matchmaking']['createLobby']>>;
type CallbackHandle = ReturnType<SteamClient['callback']['register']>;
type AudioStatusSource = {
  getStatus: () => AudioStatus;
  on: (event: 'status', listener: (status: AudioStatus) => void) => unknown;
  off: (event: 'status', listener: (status: AudioStatus) => void) => unknown;
};
type PlaybackActionRouter = { execute: (action: IntegrationPlaybackAction) => Promise<unknown> };
type LocalTrackResolver = { findAndPlay: (track: SteamListenTogetherTrack, startSeconds: number) => Promise<boolean> };

type ListenTogetherServiceOptions = {
  audioSession?: AudioStatusSource;
  actionRouter?: PlaybackActionRouter;
  localTrackResolver?: LocalTrackResolver;
  now?: () => number;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
};

type WirePlayback = Omit<SteamListenTogetherPlayback, 'receivedAt'>;
type ListenTogetherWirePacket =
  | { magic: typeof wireMagic; version: typeof protocolVersion; type: 'state'; sequence: number; playback: WirePlayback }
  | { magic: typeof wireMagic; version: typeof protocolVersion; type: 'hello'; sequence: number }
  | { magic: typeof wireMagic; version: typeof protocolVersion; type: 'reaction'; sequence: number; id: string; reaction: SteamListenTogetherReactionId; senderName: string };

const protocolVersion = 1 as const;
const wireMagic = 'ECHO_LISTEN_TOGETHER' as const;
const lobbyProtocolKey = 'echo_listen_protocol';
const lobbyModeKey = 'echo_listen_mode';
const lobbyMode = 'listen-together-v1';
const memberLimit = 4;
const receiveIntervalMs = 50;
const hostPublishIntervalMs = 1_000;
const maxPacketBytes = 32 * 1024;
const maxRecentReactions = 10;
const reactionTtlMs = 12_000;
const maxSteamId64 = (1n << 64n) - 1n;
const reactionIds = new Set<SteamListenTogetherReactionId>(['heart', 'fire', 'headphones', 'sparkles']);
const legacySteamCallback = {
  lobbyChatUpdate: 5,
  p2pSessionRequest: 6,
  p2pSessionConnectFail: 7,
  gameLobbyJoinRequested: 8,
} as const;

const parseLobbyId = (value: string): bigint | null => {
  const normalized = value.trim();
  if (!/^[1-9]\d{0,19}$/.test(normalized)) return null;
  try {
    const lobbyId = BigInt(normalized);
    return lobbyId <= maxSteamId64 ? lobbyId : null;
  } catch {
    return null;
  }
};

const safeText = (value: string | null | undefined, maxLength = 160): string | null => {
  const normalized = value?.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};

const normalizedIdentityText = (value: string | null | undefined): string =>
  (value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, ' ').trim();

const finiteNonNegative = (value: number, fallback = 0): number =>
  Number.isFinite(value) ? Math.max(0, value) : fallback;

const createTrackDescriptor = (status: AudioStatus): SteamListenTogetherTrack | null => {
  const title = safeText(status.currentTrackTitle);
  if (!title) return null;
  const artist = safeText(status.currentTrackArtist);
  const album = safeText(status.currentTrackAlbum);
  const durationSeconds = finiteNonNegative(status.durationSeconds);
  const identity = JSON.stringify([
    normalizedIdentityText(title),
    normalizedIdentityText(artist),
    normalizedIdentityText(album),
    Math.round(durationSeconds),
  ]);
  return {
    key: createHash('sha256').update(identity).digest('hex').slice(0, 24),
    title,
    artist,
    album,
    durationSeconds,
  };
};

const createWirePlayback = (status: AudioStatus): WirePlayback => ({
  state: status.state,
  positionSeconds: finiteNonNegative(status.positionSeconds),
  durationSeconds: finiteNonNegative(status.durationSeconds),
  playbackRate: Number.isFinite(status.playbackRate) && status.playbackRate > 0 ? status.playbackRate : 1,
  track: createTrackDescriptor(status),
});

export const isSteamListenTogetherTrackMatch = (
  status: AudioStatus,
  remote: SteamListenTogetherTrack,
): boolean => {
  if (normalizedIdentityText(status.currentTrackTitle) !== normalizedIdentityText(remote.title)) return false;
  const remoteArtist = normalizedIdentityText(remote.artist);
  if (remoteArtist && normalizedIdentityText(status.currentTrackArtist) !== remoteArtist) return false;
  const localDuration = finiteNonNegative(status.durationSeconds);
  return remote.durationSeconds <= 0 || localDuration <= 0 || Math.abs(localDuration - remote.durationSeconds) <= 4;
};

export const encodeSteamListenTogetherPacket = (packet: ListenTogetherWirePacket): Buffer =>
  Buffer.from(JSON.stringify(packet), 'utf8');

export const decodeSteamListenTogetherPacket = (data: Buffer): ListenTogetherWirePacket | null => {
  if (data.length === 0 || data.length > maxPacketBytes) return null;
  try {
    const packet = JSON.parse(data.toString('utf8')) as Partial<ListenTogetherWirePacket>;
    if (packet.magic !== wireMagic || packet.version !== protocolVersion || !Number.isSafeInteger(packet.sequence) || Number(packet.sequence) < 0) return null;
    const sequence = Number(packet.sequence);
    if (packet.type === 'hello') return { magic: wireMagic, version: protocolVersion, type: 'hello', sequence };
    if (packet.type === 'reaction') {
      if (!reactionIds.has(packet.reaction as SteamListenTogetherReactionId)) return null;
      if (typeof packet.id !== 'string' || packet.id.length === 0 || packet.id.length > 128) return null;
      if (typeof packet.senderName !== 'string' || packet.senderName.length > 64) return null;
      return {
        magic: wireMagic,
        version: protocolVersion,
        type: 'reaction',
        sequence,
        id: packet.id,
        reaction: packet.reaction as SteamListenTogetherReactionId,
        senderName: safeText(packet.senderName, 64) ?? 'Steam listener',
      };
    }
    if (packet.type !== 'state' || !packet.playback || typeof packet.playback !== 'object') return null;
    const playback = packet.playback as Partial<WirePlayback>;
    if (!['idle', 'loading', 'playing', 'paused', 'stopped', 'ended', 'error'].includes(String(playback.state))) return null;
    if (!Number.isFinite(playback.positionSeconds) || !Number.isFinite(playback.durationSeconds) || !Number.isFinite(playback.playbackRate)) return null;
    let track: SteamListenTogetherTrack | null = null;
    if (playback.track !== null) {
      const candidate = playback.track as Partial<SteamListenTogetherTrack> | undefined;
      if (!candidate || typeof candidate.key !== 'string' || !/^[a-z0-9_-]{1,64}$/iu.test(candidate.key) || typeof candidate.title !== 'string' || !Number.isFinite(candidate.durationSeconds)) return null;
      const title = safeText(candidate.title);
      if (!title) return null;
      const artist = candidate.artist === null || typeof candidate.artist === 'string' ? safeText(candidate.artist) : null;
      const album = candidate.album === null || typeof candidate.album === 'string' ? safeText(candidate.album) : null;
      track = {
        key: candidate.key,
        title,
        artist,
        album,
        durationSeconds: finiteNonNegative(Number(candidate.durationSeconds)),
      };
    }
    return {
      magic: wireMagic,
      version: protocolVersion,
      type: 'state',
      sequence,
      playback: {
        state: playback.state as WirePlayback['state'],
        positionSeconds: finiteNonNegative(Number(playback.positionSeconds)),
        durationSeconds: finiteNonNegative(Number(playback.durationSeconds)),
        playbackRate: Math.max(0.25, Math.min(4, Number(playback.playbackRate))),
        track,
      },
    };
  } catch {
    return null;
  }
};

export class SteamListenTogetherService {
  private state: SteamListenTogetherSnapshot['state'] = 'idle';
  private role: SteamListenTogetherSnapshot['role'] = 'none';
  private syncState: SteamListenTogetherSnapshot['syncState'] = 'not-in-room';
  private lobby: ListenTogetherLobby | null = null;
  private hostSteamId: bigint | null = null;
  private operationPending = false;
  private inviteJoinTask: Promise<void> | null = null;
  private callbackHandles: CallbackHandle[] = [];
  private receiveTimer: ReturnType<typeof globalThis.setInterval> | null = null;
  private publishTimer: ReturnType<typeof globalThis.setInterval> | null = null;
  private audioSession: AudioStatusSource | null = null;
  private audioLoadTask: Promise<AudioStatusSource | null> | null = null;
  private packetSequence = 0;
  private lastHostSequence = -1;
  private lastHostUpdateAtMs: number | null = null;
  private lastHostSignature: string | null = null;
  private remotePlayback: SteamListenTogetherPlayback | null = null;
  private lastError: SteamListenTogetherError | null = null;
  private recentReactions: SteamListenTogetherReaction[] = [];
  private readonly seenReactionIds = new Set<string>();
  private readonly attemptedTrackKeys = new Set<string>();
  private syncTask: Promise<void> = Promise.resolve();
  private readonly now: () => number;
  private readonly setIntervalFn: typeof globalThis.setInterval;
  private readonly clearIntervalFn: typeof globalThis.clearInterval;
  private readonly actionRouter: PlaybackActionRouter;
  private readonly localTrackResolver: LocalTrackResolver;
  private readonly configuredAudioSession: AudioStatusSource | null;
  private readonly hostStatusListener = (status: AudioStatus): void => this.publishHostStatus(status);

  constructor(
    private readonly runtime: SteamClientProvider,
    options: ListenTogetherServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.setIntervalFn = options.setInterval ?? globalThis.setInterval;
    this.clearIntervalFn = options.clearInterval ?? globalThis.clearInterval;
    this.actionRouter = options.actionRouter ?? getIntegrationActionRouter();
    this.localTrackResolver = options.localTrackResolver ?? new SteamListenTogetherLocalTrackResolver();
    this.configuredAudioSession = options.audioSession ?? null;
  }

  initialize(): void {
    const client = this.runtime.getClient();
    if (!client) return;
    this.ensureCallbacks(client);
    const connectArgumentIndex = process.argv.findIndex((value) => value === '+connect_lobby');
    const startupLobbyId = connectArgumentIndex >= 0 ? process.argv[connectArgumentIndex + 1] : undefined;
    if (startupLobbyId) this.beginInviteJoin(startupLobbyId);
  }

  getSnapshot(): SteamListenTogetherSnapshot {
    const client = this.runtime.getClient();
    if (client) this.ensureCallbacks(client);
    this.pruneReactions();
    if (this.lobby) this.reconcileRoomOwner(client);
    return {
      available: client !== null,
      state: this.state,
      role: this.role,
      lobbyId: this.lobby?.id.toString() ?? null,
      memberCount: this.getMemberCount(),
      memberLimit,
      localPlayerName: this.readLocalPlayerName(client),
      syncState: this.syncState,
      playback: this.role === 'host' ? this.createHostSnapshotPlayback() : this.remotePlayback,
      recentReactions: [...this.recentReactions],
      lastHostUpdateAt: this.lastHostUpdateAtMs === null ? null : new Date(this.lastHostUpdateAtMs).toISOString(),
      lastError: this.lastError,
    };
  }

  async createRoom(): Promise<SteamListenTogetherSnapshot> {
    const client = this.requireClient();
    if (!client || !this.beginOperation()) return this.getSnapshot();
    this.state = 'creating';
    this.lastError = null;
    try {
      this.leaveRoomInternal();
      this.ensureCallbacks(client);
      const friendsOnly = 1 as Parameters<SteamClient['matchmaking']['createLobby']>[0];
      const lobby = await client.matchmaking.createLobby(friendsOnly, memberLimit);
      if (!lobby.mergeFullData({ [lobbyProtocolKey]: String(protocolVersion), [lobbyModeKey]: lobbyMode })) {
        lobby.leave();
        return this.fail('room_create_failed');
      }
      this.attachLobby(client, lobby);
    } catch {
      this.fail('room_create_failed');
    } finally {
      this.operationPending = false;
    }
    return this.getSnapshot();
  }

  async joinRoom(lobbyIdValue: string): Promise<SteamListenTogetherSnapshot> {
    const client = this.requireClient();
    if (!client) return this.getSnapshot();
    const lobbyId = parseLobbyId(lobbyIdValue);
    if (lobbyId === null) return this.fail('invalid_room_id');
    if (!this.beginOperation()) return this.getSnapshot();
    this.state = 'joining';
    this.lastError = null;
    try {
      this.leaveRoomInternal();
      this.ensureCallbacks(client);
      const lobby = await client.matchmaking.joinLobby(lobbyId);
      if (lobby.getData(lobbyProtocolKey) !== String(protocolVersion) || lobby.getData(lobbyModeKey) !== lobbyMode) {
        lobby.leave();
        return this.fail('incompatible_room');
      }
      this.attachLobby(client, lobby);
    } catch {
      this.fail('room_join_failed');
    } finally {
      this.operationPending = false;
    }
    return this.getSnapshot();
  }

  openInviteDialog(): SteamListenTogetherSnapshot {
    if (!this.lobby) return this.fail('not_in_room');
    if (this.role !== 'host') return this.fail('not_room_host');
    this.lobby.openInviteDialog();
    this.lastError = null;
    return this.getSnapshot();
  }

  leaveRoom(): SteamListenTogetherSnapshot {
    this.leaveRoomInternal();
    this.state = 'idle';
    this.lastError = null;
    return this.getSnapshot();
  }

  sendReaction(reaction: SteamListenTogetherReactionId): SteamListenTogetherSnapshot {
    const client = this.requireClient();
    if (!client) return this.getSnapshot();
    if (!this.lobby) return this.fail('not_in_room');
    if (!reactionIds.has(reaction)) return this.getSnapshot();
    const sequence = this.nextSequence();
    const id = `${client.localplayer.getSteamId().steamId64.toString()}-${sequence}`;
    const senderName = this.readLocalPlayerName(client) ?? 'Steam listener';
    this.recordReaction({ id, reaction, senderName, receivedAt: new Date(this.now()).toISOString() });
    this.sendWireToPeers(client, { magic: wireMagic, version: protocolVersion, type: 'reaction', sequence, id, reaction, senderName });
    return this.getSnapshot();
  }

  async requestSync(): Promise<SteamListenTogetherSnapshot> {
    const client = this.requireClient();
    if (!client) return this.getSnapshot();
    if (!this.lobby) return this.fail('not_in_room');
    if (this.role === 'host') {
      const status = this.getAudioStatus();
      if (status) this.publishHostStatus(status, true);
      return this.getSnapshot();
    }
    if (this.remotePlayback?.track) this.attemptedTrackKeys.delete(this.remotePlayback.track.key);
    this.sendHello(client);
    if (this.remotePlayback) this.queueGuestSync(this.remotePlayback);
    await this.syncTask;
    return this.getSnapshot();
  }

  dispose(): void {
    this.leaveRoomInternal();
    for (const handle of this.callbackHandles) handle.disconnect();
    this.callbackHandles = [];
  }

  private requireClient(): SteamClient | null {
    const client = this.runtime.getClient();
    if (!client) this.fail('steam_unavailable');
    return client;
  }

  private beginOperation(): boolean {
    if (this.operationPending) {
      this.fail('operation_in_progress');
      return false;
    }
    this.operationPending = true;
    return true;
  }

  private attachLobby(client: SteamClient, lobby: ListenTogetherLobby): void {
    this.lobby = lobby;
    this.state = 'connected';
    this.lastError = null;
    this.remotePlayback = null;
    this.lastHostSequence = -1;
    this.lastHostUpdateAtMs = null;
    this.attemptedTrackKeys.clear();
    this.receiveTimer = this.setIntervalFn(() => this.pumpPackets(client), receiveIntervalMs);
    this.reconcileRoomOwner(client, true);
    this.updateRoomPresence(client);
  }

  private reconcileRoomOwner(client: SteamClient | null, force = false): void {
    if (!client || !this.lobby) return;
    let ownerSteamId: bigint;
    try {
      ownerSteamId = this.lobby.getOwner().steamId64;
    } catch {
      return;
    }
    const localSteamId = client.localplayer.getSteamId().steamId64;
    const nextRole: SteamListenTogetherSnapshot['role'] = ownerSteamId === localSteamId ? 'host' : 'guest';
    if (!force && nextRole === this.role && ownerSteamId === this.hostSteamId) {
      return;
    }

    this.stopHostPublishing();
    this.role = nextRole;
    this.hostSteamId = ownerSteamId;
    if (nextRole === 'host') {
      this.syncState = 'host';
      this.startHostPublishing();
    } else {
      this.syncState = 'waiting-for-host';
      this.sendHello(client);
    }
    this.updateRoomPresence(client);
  }

  private ensureCallbacks(client: SteamClient): void {
    if (this.callbackHandles.length > 0) return;
    const callbackApi = client.callback as unknown as {
      register: (kind: number, handler: (payload: unknown) => void) => CallbackHandle;
    };
    this.callbackHandles = [
      callbackApi.register(legacySteamCallback.p2pSessionRequest, (payload) => {
        const remote = (payload as { remote?: unknown }).remote;
        if (typeof remote === 'bigint' && this.isCurrentLobbyMember(remote)) client.networking.acceptP2PSession(remote);
      }),
      callbackApi.register(legacySteamCallback.p2pSessionConnectFail, (payload) => {
        const remote = (payload as { remote?: unknown }).remote;
        if (typeof remote === 'bigint' && this.isCurrentLobbyMember(remote)) {
          this.lastError = 'transport_failed';
          if (this.role === 'guest' && remote === this.hostSteamId) this.syncState = 'error';
        }
      }),
      callbackApi.register(legacySteamCallback.lobbyChatUpdate, (payload) => {
        const lobbyId = (payload as { lobby?: unknown }).lobby;
        if (typeof lobbyId === 'bigint' && lobbyId === this.lobby?.id) this.reconcileRoomOwner(client, true);
      }),
      callbackApi.register(legacySteamCallback.gameLobbyJoinRequested, (payload) => {
        const lobbyId = (payload as { lobby_steam_id?: unknown }).lobby_steam_id;
        if (typeof lobbyId === 'bigint') this.beginInviteJoin(lobbyId.toString());
      }),
    ];
  }

  private beginInviteJoin(lobbyId: string): void {
    if (this.inviteJoinTask || this.operationPending) return;
    const task = this.joinRoom(lobbyId).then(() => undefined).finally(() => {
      if (this.inviteJoinTask === task) this.inviteJoinTask = null;
    });
    this.inviteJoinTask = task;
  }

  private startHostPublishing(): void {
    if (this.publishTimer !== null || this.audioLoadTask !== null) return;
    const expectedLobbyId = this.lobby?.id ?? null;
    const task = this.ensureAudioSession().then((audioSession) => {
      if (!audioSession || this.role !== 'host' || this.lobby?.id !== expectedLobbyId) return null;
      audioSession.on('status', this.hostStatusListener);
      this.publishTimer = this.setIntervalFn(() => {
        const status = this.getAudioStatus();
        if (status) this.publishHostStatus(status);
      }, hostPublishIntervalMs);
      this.publishHostStatus(audioSession.getStatus(), true);
      return audioSession;
    }).catch(() => {
      if (this.role === 'host' && this.lobby?.id === expectedLobbyId) this.lastError = 'playback_sync_failed';
      return null;
    }).finally(() => {
      if (this.audioLoadTask === task) this.audioLoadTask = null;
    });
    this.audioLoadTask = task;
  }

  private stopHostPublishing(): void {
    if (this.publishTimer !== null) this.clearIntervalFn(this.publishTimer);
    this.publishTimer = null;
    this.audioSession?.off('status', this.hostStatusListener);
    this.lastHostSignature = null;
  }

  private async ensureAudioSession(): Promise<AudioStatusSource | null> {
    if (this.audioSession) return this.audioSession;
    if (this.configuredAudioSession) {
      this.audioSession = this.configuredAudioSession;
      return this.audioSession;
    }
    if (this.audioLoadTask) return this.audioLoadTask;
    const task = import('../../audio/AudioSession')
      .then(({ getAudioSession }) => {
        this.audioSession = getAudioSession();
        return this.audioSession;
      })
      .catch(() => null)
      .finally(() => {
        if (this.audioLoadTask === task) this.audioLoadTask = null;
      });
    this.audioLoadTask = task;
    return task;
  }

  private getAudioStatus(): AudioStatus | null {
    return (this.audioSession ?? this.configuredAudioSession)?.getStatus() ?? null;
  }

  private createHostSnapshotPlayback(): SteamListenTogetherPlayback | null {
    if (!this.lobby) return null;
    const status = this.getAudioStatus();
    return status ? { ...createWirePlayback(status), receivedAt: new Date(this.now()).toISOString() } : null;
  }

  private publishHostStatus(status: AudioStatus, force = false, onlyPeer?: bigint): void {
    const client = this.runtime.getClient();
    if (!client || !this.lobby || this.role !== 'host') return;
    const playback = createWirePlayback(status);
    const signature = JSON.stringify([
      playback.state,
      playback.track?.key ?? null,
      Math.floor(playback.positionSeconds),
      playback.durationSeconds,
      playback.playbackRate,
    ]);
    if (!force && signature === this.lastHostSignature) return;
    this.lastHostSignature = signature;
    const packet: ListenTogetherWirePacket = {
      magic: wireMagic,
      version: protocolVersion,
      type: 'state',
      sequence: this.nextSequence(),
      playback,
    };
    if (onlyPeer !== undefined) this.sendWire(client, onlyPeer, packet);
    else this.sendWireToPeers(client, packet);
  }

  private sendHello(client: SteamClient): void {
    if (this.role !== 'guest' || this.hostSteamId === null) return;
    this.sendWire(client, this.hostSteamId, {
      magic: wireMagic,
      version: protocolVersion,
      type: 'hello',
      sequence: this.nextSequence(),
    });
  }

  private sendWireToPeers(client: SteamClient, packet: ListenTogetherWirePacket): void {
    for (const peer of this.getPeerSteamIds(client)) this.sendWire(client, peer, packet);
  }

  private sendWire(client: SteamClient, peer: bigint, packet: ListenTogetherWirePacket): void {
    const encoded = encodeSteamListenTogetherPacket(packet);
    const sent = client.networking.sendP2PPacket(
      peer,
      2 as Parameters<SteamClient['networking']['sendP2PPacket']>[1],
      encoded,
    );
    if (!sent) this.lastError = 'transport_failed';
  }

  private pumpPackets(client: SteamClient): void {
    for (let index = 0; index < 128; index += 1) {
      const availableBytes = client.networking.isP2PPacketAvailable();
      if (!Number.isFinite(availableBytes) || availableBytes <= 0) return;
      let incoming: ReturnType<SteamClient['networking']['readP2PPacket']>;
      try {
        incoming = client.networking.readP2PPacket(availableBytes);
      } catch {
        this.lastError = 'transport_failed';
        return;
      }
      const peer = incoming.steamId.steamId64;
      if (!this.isCurrentLobbyMember(peer)) continue;
      const packet = decodeSteamListenTogetherPacket(incoming.data);
      if (!packet) continue;
      if (packet.type === 'hello') {
        const status = this.getAudioStatus();
        if (this.role === 'host' && status) this.publishHostStatus(status, true, peer);
        continue;
      }
      if (packet.type === 'reaction') {
        this.recordReaction({
          id: packet.id,
          reaction: packet.reaction,
          senderName: safeText(packet.senderName, 64) ?? 'Steam listener',
          receivedAt: new Date(this.now()).toISOString(),
        });
        continue;
      }
      if (this.role !== 'guest' || peer !== this.hostSteamId || packet.sequence <= this.lastHostSequence) continue;
      this.lastHostSequence = packet.sequence;
      this.lastHostUpdateAtMs = this.now();
      this.remotePlayback = { ...packet.playback, receivedAt: new Date(this.lastHostUpdateAtMs).toISOString() };
      this.queueGuestSync(this.remotePlayback);
    }
  }

  private queueGuestSync(playback: SteamListenTogetherPlayback): void {
    this.syncTask = this.syncTask.catch(() => undefined).then(async () => {
      try {
        await this.applyGuestSync(playback);
      } catch {
        this.syncState = 'error';
        this.lastError = 'playback_sync_failed';
      }
    });
  }

  private async applyGuestSync(playback: SteamListenTogetherPlayback): Promise<void> {
    if (!this.lobby || this.role !== 'guest' || playback !== this.remotePlayback) return;
    const remoteTrack = playback.track;
    if (!remoteTrack) {
      this.syncState = 'waiting-for-track';
      return;
    }

    const audioSession = await this.ensureAudioSession();
    if (!audioSession || !this.lobby || this.role !== 'guest' || playback !== this.remotePlayback) return;
    let localStatus = audioSession.getStatus();
    let matched = isSteamListenTogetherTrackMatch(localStatus, remoteTrack);
    if (!matched) {
      if (this.attemptedTrackKeys.has(remoteTrack.key)) {
        this.syncState = 'waiting-for-track';
        return;
      }
      this.attemptedTrackKeys.add(remoteTrack.key);
      this.syncState = 'syncing';
      matched = await this.localTrackResolver.findAndPlay(remoteTrack, playback.positionSeconds);
      if (!matched) {
        this.syncState = 'waiting-for-track';
        this.lastError = 'local_track_not_found';
        return;
      }
      localStatus = audioSession.getStatus();
    }

    this.syncState = 'syncing';
    const targetPosition = Math.min(playback.durationSeconds || Number.MAX_SAFE_INTEGER, playback.positionSeconds);
    const driftSeconds = Math.abs(finiteNonNegative(localStatus.positionSeconds) - targetPosition);
    if (playback.state === 'playing') {
      if (driftSeconds > 1.25) await this.executePlaybackAction('seek', targetPosition);
      if (localStatus.state !== 'playing') await this.executePlaybackAction('play');
    } else if (playback.state === 'paused') {
      if (localStatus.state === 'playing') await this.executePlaybackAction('pause');
      if (driftSeconds > 0.75) await this.executePlaybackAction('seek', targetPosition);
    } else if (playback.state === 'idle' || playback.state === 'stopped' || playback.state === 'ended') {
      if (localStatus.state !== 'idle' && localStatus.state !== 'stopped' && localStatus.state !== 'ended') {
        await this.executePlaybackAction('stop');
      }
    } else if (playback.state === 'loading') {
      return;
    }
    this.syncState = 'synced';
    this.lastError = null;
  }

  private async executePlaybackAction(action: 'play' | 'pause' | 'stop' | 'seek', positionSeconds?: number): Promise<void> {
    const requestId = `steam-listen-${this.now()}-${this.nextSequence()}`;
    if (action === 'seek') {
      await this.actionRouter.execute({ requestId, action, positionMs: Math.round(finiteNonNegative(positionSeconds ?? 0) * 1000) });
      return;
    }
    await this.actionRouter.execute({ requestId, action });
  }

  private recordReaction(reaction: SteamListenTogetherReaction): void {
    if (this.seenReactionIds.has(reaction.id)) return;
    this.seenReactionIds.add(reaction.id);
    this.recentReactions = [...this.recentReactions, reaction].slice(-maxRecentReactions);
    if (this.seenReactionIds.size > 100) {
      this.seenReactionIds.clear();
      for (const item of this.recentReactions) this.seenReactionIds.add(item.id);
    }
  }

  private pruneReactions(): void {
    const cutoff = this.now() - reactionTtlMs;
    this.recentReactions = this.recentReactions.filter((reaction) => Date.parse(reaction.receivedAt) >= cutoff);
  }

  private updateRoomPresence(client: SteamClient): void {
    if (!this.lobby) return;
    try {
      client.localplayer.setRichPresence('connect', `+connect_lobby ${this.lobby.id.toString()}`);
      client.localplayer.setRichPresence('steam_player_group', this.lobby.id.toString());
      client.localplayer.setRichPresence('steam_player_group_size', String(this.getMemberCount()));
    } catch {
      this.lastError = 'transport_failed';
    }
  }

  private clearRoomPresence(): void {
    const client = this.runtime.getClient();
    if (!client) return;
    try {
      client.localplayer.setRichPresence('connect', null);
      client.localplayer.setRichPresence('steam_player_group', null);
      client.localplayer.setRichPresence('steam_player_group_size', null);
    } catch {
      // Steam may already be shutting down.
    }
  }

  private getPeerSteamIds(client: SteamClient): bigint[] {
    if (!this.lobby) return [];
    const localSteamId = client.localplayer.getSteamId().steamId64;
    return this.lobby.getMembers().map((member) => member.steamId64).filter((steamId) => steamId !== localSteamId);
  }

  private isCurrentLobbyMember(steamId: bigint): boolean {
    return this.lobby?.getMembers().some((member) => member.steamId64 === steamId) === true;
  }

  private getMemberCount(): number {
    if (!this.lobby) return 0;
    const count = this.lobby.getMemberCount();
    return Number(count > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : count);
  }

  private readLocalPlayerName(client: SteamClient | null): string | null {
    if (!client) return null;
    try {
      return safeText(client.localplayer.getName(), 64);
    } catch {
      return null;
    }
  }

  private nextSequence(): number {
    const current = this.packetSequence;
    this.packetSequence = (this.packetSequence + 1) >>> 0;
    return current;
  }

  private leaveRoomInternal(): void {
    if (this.receiveTimer !== null) this.clearIntervalFn(this.receiveTimer);
    this.receiveTimer = null;
    this.stopHostPublishing();
    this.clearRoomPresence();
    try {
      this.lobby?.leave();
    } catch {
      // Best-effort teardown; Steam may already be unavailable.
    }
    this.lobby = null;
    this.role = 'none';
    this.hostSteamId = null;
    this.syncState = 'not-in-room';
    this.remotePlayback = null;
    this.lastHostSequence = -1;
    this.lastHostUpdateAtMs = null;
    this.attemptedTrackKeys.clear();
    this.recentReactions = [];
    this.seenReactionIds.clear();
  }

  private fail(error: SteamListenTogetherError): SteamListenTogetherSnapshot {
    this.state = 'error';
    this.lastError = error;
    if (this.lobby) this.syncState = 'error';
    return this.getSnapshot();
  }
}
