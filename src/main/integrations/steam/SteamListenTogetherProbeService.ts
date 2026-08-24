import type { SteamListenTogetherProbeError, SteamListenTogetherProbeSnapshot } from '../../../shared/types/steam';
import type { SteamClient } from './SteamRuntimeService';

type SteamClientProvider = {
  getClient: () => SteamClient | null;
};

type ProbeLobby = Awaited<ReturnType<SteamClient['matchmaking']['createLobby']>>;
type CallbackHandle = ReturnType<SteamClient['callback']['register']>;

type ProbeServiceOptions = {
  enabled?: boolean;
  now?: () => number;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
};

type ProbePacket = {
  kind: 'data' | 'ping' | 'pong';
  sequence: number;
  sentAtMs: number;
};

const probeProtocolVersion = 1;
const probeMagic = 'ELTP';
const probePacketHeaderBytes = 24;
const probeDataPayloadBytes = 768;
const probeDataIntervalMs = 20;
const probePingIntervalMs = 1_000;
const probeReceiveIntervalMs = 10;
const probeReceiveWindowMs = 5_000;
const probeMaxPacketsPerPump = 256;
const maxSteamId64 = (1n << 64n) - 1n;
const lobbyProtocolKey = 'echo_listen_protocol';
const lobbyModeKey = 'echo_listen_mode';
const legacySteamCallback = {
  lobbyChatUpdate: 5,
  p2pSessionRequest: 6,
  p2pSessionConnectFail: 7,
  gameLobbyJoinRequested: 8,
} as const;

const packetKindByName: Record<ProbePacket['kind'], number> = {
  data: 1,
  ping: 2,
  pong: 3,
};

const packetNameByKind = new Map<number, ProbePacket['kind']>([
  [1, 'data'],
  [2, 'ping'],
  [3, 'pong'],
]);

const defaultEnabled = (): boolean =>
  process.env.ECHO_LISTEN_TOGETHER_PROBE === '1'
  || process.argv.includes('--echo-listen-together-probe');

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

export const encodeSteamListenTogetherProbePacket = (
  packet: ProbePacket,
  payloadBytes = packet.kind === 'data' ? probeDataPayloadBytes : 0,
): Buffer => {
  const output = Buffer.alloc(probePacketHeaderBytes + Math.max(0, payloadBytes));
  output.write(probeMagic, 0, 'ascii');
  output.writeUInt8(probeProtocolVersion, 4);
  output.writeUInt8(packetKindByName[packet.kind], 5);
  output.writeUInt32LE(packet.sequence >>> 0, 8);
  output.writeDoubleLE(packet.sentAtMs, 12);
  output.writeUInt32LE(Math.max(0, payloadBytes), 20);
  return output;
};

export const decodeSteamListenTogetherProbePacket = (data: Buffer): ProbePacket | null => {
  if (data.length < probePacketHeaderBytes || data.toString('ascii', 0, 4) !== probeMagic) return null;
  if (data.readUInt8(4) !== probeProtocolVersion) return null;
  const kind = packetNameByKind.get(data.readUInt8(5));
  const payloadBytes = data.readUInt32LE(20);
  if (!kind || probePacketHeaderBytes + payloadBytes !== data.length) return null;
  const sentAtMs = data.readDoubleLE(12);
  if (!Number.isFinite(sentAtMs) || sentAtMs < 0) return null;
  return {
    kind,
    sequence: data.readUInt32LE(8),
    sentAtMs,
  };
};

export class SteamListenTogetherProbeService {
  private readonly enabled: boolean;
  private readonly now: () => number;
  private readonly setIntervalFn: typeof globalThis.setInterval;
  private readonly clearIntervalFn: typeof globalThis.clearInterval;
  private state: SteamListenTogetherProbeSnapshot['state'];
  private role: SteamListenTogetherProbeSnapshot['role'] = 'none';
  private lobby: ProbeLobby | null = null;
  private hostSteamId: bigint | null = null;
  private operationPending = false;
  private inviteJoinTask: Promise<void> | null = null;
  private callbackHandles: CallbackHandle[] = [];
  private receiveTimer: ReturnType<typeof globalThis.setInterval> | null = null;
  private dataTimer: ReturnType<typeof globalThis.setInterval> | null = null;
  private pingTimer: ReturnType<typeof globalThis.setInterval> | null = null;
  private dataSequence = 0;
  private controlSequence = 0;
  private sentPackets = 0;
  private sentBytes = 0;
  private sendFailures = 0;
  private receivedPackets = 0;
  private receivedDataPackets = 0;
  private receivedBytes = 0;
  private estimatedLostPackets = 0;
  private rttTotalMs = 0;
  private rttSamples = 0;
  private lastPacketAtMs: number | null = null;
  private lastError: SteamListenTogetherProbeError | null = null;
  private readonly lastSequenceByPeer = new Map<bigint, number>();
  private readonly receivedWindow: Array<{ atMs: number; bytes: number }> = [];

  constructor(
    private readonly runtime: SteamClientProvider,
    options: ProbeServiceOptions = {},
  ) {
    this.enabled = options.enabled ?? defaultEnabled();
    this.now = options.now ?? Date.now;
    this.setIntervalFn = options.setInterval ?? globalThis.setInterval;
    this.clearIntervalFn = options.clearInterval ?? globalThis.clearInterval;
    this.state = this.enabled ? 'idle' : 'disabled';
  }

  initialize(): void {
    if (!this.enabled) return;
    const client = this.runtime.getClient();
    if (!client) return;
    this.ensureCallbacks(client);
    const connectArgumentIndex = process.argv.findIndex((value) => value === '+connect_lobby');
    const startupLobbyId = connectArgumentIndex >= 0 ? process.argv[connectArgumentIndex + 1] : undefined;
    if (startupLobbyId) this.beginInviteJoin(startupLobbyId);
  }

  getSnapshot(): SteamListenTogetherProbeSnapshot {
    const client = this.runtime.getClient();
    if (this.enabled && client) this.ensureCallbacks(client);
    this.pruneReceivedWindow();
    const totalExpectedPackets = this.receivedDataPackets + this.estimatedLostPackets;
    return {
      enabled: this.enabled,
      available: client !== null,
      state: this.state,
      role: this.role,
      lobbyId: this.lobby?.id.toString() ?? null,
      memberCount: this.getMemberCount(),
      transportRunning: this.receiveTimer !== null,
      protocolVersion: probeProtocolVersion,
      targetKbps: Math.round(((probePacketHeaderBytes + probeDataPayloadBytes) * 8) / probeDataIntervalMs),
      sentPackets: this.sentPackets,
      sentBytes: this.sentBytes,
      sendFailures: this.sendFailures,
      receivedPackets: this.receivedPackets,
      receivedBytes: this.receivedBytes,
      receivedKbps: this.getReceivedKbps(),
      estimatedLostPackets: this.estimatedLostPackets,
      estimatedLossPercent: totalExpectedPackets > 0
        ? Math.round((this.estimatedLostPackets / totalExpectedPackets) * 10_000) / 100
        : 0,
      averageRttMs: this.rttSamples > 0 ? Math.round((this.rttTotalMs / this.rttSamples) * 10) / 10 : null,
      lastPacketAt: this.lastPacketAtMs === null ? null : new Date(this.lastPacketAtMs).toISOString(),
      lastError: this.lastError,
    };
  }

  async createRoom(): Promise<SteamListenTogetherProbeSnapshot> {
    const client = this.requireClient();
    if (!client) return this.getSnapshot();
    if (!this.beginOperation()) return this.getSnapshot();
    this.state = 'creating';
    this.lastError = null;
    try {
      this.leaveRoomInternal();
      this.ensureCallbacks(client);
      const friendsOnlyLobbyType = 1 as Parameters<SteamClient['matchmaking']['createLobby']>[0];
      const lobby = await client.matchmaking.createLobby(friendsOnlyLobbyType, 2);
      const protocolStored = lobby.mergeFullData({
        [lobbyProtocolKey]: String(probeProtocolVersion),
        [lobbyModeKey]: 'transport-probe',
      });
      if (!protocolStored) {
        lobby.leave();
        return this.fail('room_create_failed');
      }
      this.attachLobby(client, lobby, 'host', client.localplayer.getSteamId().steamId64);
    } catch {
      this.fail('room_create_failed');
    } finally {
      this.operationPending = false;
    }
    return this.getSnapshot();
  }

  async joinRoom(lobbyIdValue: string): Promise<SteamListenTogetherProbeSnapshot> {
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
      if (
        lobby.getData(lobbyProtocolKey) !== String(probeProtocolVersion)
        || lobby.getData(lobbyModeKey) !== 'transport-probe'
      ) {
        lobby.leave();
        return this.fail('incompatible_room');
      }
      this.attachLobby(client, lobby, 'guest', lobby.getOwner().steamId64);
    } catch {
      this.fail('room_join_failed');
    } finally {
      this.operationPending = false;
    }
    return this.getSnapshot();
  }

  openInviteDialog(): SteamListenTogetherProbeSnapshot {
    if (!this.enabled) return this.fail('probe_disabled');
    if (!this.lobby) return this.fail('not_in_room');
    if (this.role !== 'host') return this.fail('not_room_host');
    this.lobby.openInviteDialog();
    this.lastError = null;
    return this.getSnapshot();
  }

  leaveRoom(): SteamListenTogetherProbeSnapshot {
    this.leaveRoomInternal();
    this.state = this.enabled ? 'idle' : 'disabled';
    this.lastError = null;
    return this.getSnapshot();
  }

  dispose(): void {
    this.leaveRoomInternal();
    this.disconnectCallbacks();
  }

  private requireClient(): SteamClient | null {
    if (!this.enabled) {
      this.fail('probe_disabled');
      return null;
    }
    const client = this.runtime.getClient();
    if (!client) {
      this.fail('steam_unavailable');
      return null;
    }
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

  private attachLobby(
    client: SteamClient,
    lobby: ProbeLobby,
    role: Exclude<SteamListenTogetherProbeSnapshot['role'], 'none'>,
    hostSteamId: bigint,
  ): void {
    this.lobby = lobby;
    this.role = role;
    this.hostSteamId = hostSteamId;
    this.state = 'connected';
    this.lastError = null;
    this.resetMetrics();
    this.receiveTimer = this.setIntervalFn(() => this.pumpPackets(client), probeReceiveIntervalMs);
    this.dataTimer = this.setIntervalFn(() => this.sendDataFrames(client), probeDataIntervalMs);
    this.pingTimer = this.setIntervalFn(() => this.sendPings(client), probePingIntervalMs);
    this.sendPings(client);
  }

  private ensureCallbacks(client: SteamClient): void {
    if (this.callbackHandles.length > 0) return;
    const callbackApi = client.callback as unknown as {
      register: (kind: number, handler: (payload: unknown) => void) => CallbackHandle;
    };
    this.callbackHandles = [
      callbackApi.register(legacySteamCallback.p2pSessionRequest, (payload) => {
        const remote = (payload as { remote?: unknown }).remote;
        if (typeof remote === 'bigint' && this.isCurrentLobbyMember(remote)) {
          client.networking.acceptP2PSession(remote);
        }
      }),
      callbackApi.register(legacySteamCallback.p2pSessionConnectFail, (payload) => {
        const remote = (payload as { remote?: unknown }).remote;
        if (typeof remote === 'bigint' && this.isCurrentLobbyMember(remote)) {
          this.failAndLeave('p2p_session_failed');
        }
      }),
      callbackApi.register(legacySteamCallback.lobbyChatUpdate, () => {
        if (this.role === 'guest' && this.hostSteamId !== null && !this.isCurrentLobbyMember(this.hostSteamId)) {
          this.failAndLeave('host_left');
        }
      }),
      callbackApi.register(legacySteamCallback.gameLobbyJoinRequested, (payload) => {
        const lobbyId = (payload as { lobby_steam_id?: unknown }).lobby_steam_id;
        if (typeof lobbyId === 'bigint') this.beginInviteJoin(lobbyId.toString());
      }),
    ];
  }

  private beginInviteJoin(lobbyId: string): void {
    if (this.inviteJoinTask || this.operationPending) return;
    const task = this.joinRoom(lobbyId)
      .then(() => undefined)
      .finally(() => {
        if (this.inviteJoinTask === task) this.inviteJoinTask = null;
      });
    this.inviteJoinTask = task;
  }

  private disconnectCallbacks(): void {
    for (const handle of this.callbackHandles) handle.disconnect();
    this.callbackHandles = [];
  }

  private sendDataFrames(client: SteamClient): void {
    if (this.role !== 'host' || !this.lobby) return;
    const packet = encodeSteamListenTogetherProbePacket({
      kind: 'data',
      sequence: this.nextDataSequence(),
      sentAtMs: this.now(),
    });
    for (const peer of this.getPeerSteamIds(client)) this.sendPacket(client, peer, 1, packet);
  }

  private sendPings(client: SteamClient): void {
    if (!this.lobby) return;
    const packet = encodeSteamListenTogetherProbePacket({
      kind: 'ping',
      sequence: this.nextControlSequence(),
      sentAtMs: this.now(),
    });
    const peers = this.role === 'guest' && this.hostSteamId !== null
      ? [this.hostSteamId]
      : this.getPeerSteamIds(client);
    for (const peer of peers) this.sendPacket(client, peer, 2, packet);
  }

  private sendPacket(client: SteamClient, peer: bigint, sendType: number, packet: Buffer): void {
    const sent = client.networking.sendP2PPacket(
      peer,
      sendType as Parameters<SteamClient['networking']['sendP2PPacket']>[1],
      packet,
    );
    if (!sent) {
      this.sendFailures += 1;
      return;
    }
    this.sentPackets += 1;
    this.sentBytes += packet.length;
  }

  private pumpPackets(client: SteamClient): void {
    for (let index = 0; index < probeMaxPacketsPerPump; index += 1) {
      const availableBytes = client.networking.isP2PPacketAvailable();
      if (!Number.isFinite(availableBytes) || availableBytes <= 0) return;
      let incoming: ReturnType<SteamClient['networking']['readP2PPacket']>;
      try {
        incoming = client.networking.readP2PPacket(availableBytes);
      } catch {
        return;
      }
      if (!this.isCurrentLobbyMember(incoming.steamId.steamId64)) continue;
      const decoded = decodeSteamListenTogetherProbePacket(incoming.data);
      if (!decoded) continue;
      this.recordIncoming(incoming.steamId.steamId64, incoming.data.length, decoded);
      if (decoded.kind === 'ping') {
        const pong = encodeSteamListenTogetherProbePacket({ ...decoded, kind: 'pong' });
        this.sendPacket(client, incoming.steamId.steamId64, 2, pong);
      } else if (decoded.kind === 'pong') {
        const rttMs = this.now() - decoded.sentAtMs;
        if (Number.isFinite(rttMs) && rttMs >= 0 && rttMs < 60_000) {
          this.rttTotalMs += rttMs;
          this.rttSamples += 1;
        }
      }
    }
  }

  private recordIncoming(peer: bigint, bytes: number, packet: ProbePacket): void {
    const now = this.now();
    this.receivedPackets += 1;
    this.receivedBytes += bytes;
    this.lastPacketAtMs = now;
    this.receivedWindow.push({ atMs: now, bytes });
    if (packet.kind !== 'data') return;
    this.receivedDataPackets += 1;
    const previous = this.lastSequenceByPeer.get(peer);
    if (previous !== undefined && packet.sequence > previous + 1) {
      this.estimatedLostPackets += packet.sequence - previous - 1;
    }
    if (previous === undefined || packet.sequence > previous) this.lastSequenceByPeer.set(peer, packet.sequence);
  }

  private getPeerSteamIds(client: SteamClient): bigint[] {
    if (!this.lobby) return [];
    const localSteamId = client.localplayer.getSteamId().steamId64;
    return this.lobby.getMembers()
      .map((member) => member.steamId64)
      .filter((steamId) => steamId !== localSteamId);
  }

  private isCurrentLobbyMember(steamId: bigint): boolean {
    return this.lobby?.getMembers().some((member) => member.steamId64 === steamId) === true;
  }

  private getMemberCount(): number {
    if (!this.lobby) return 0;
    const count = this.lobby.getMemberCount();
    return Number(count > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : count);
  }

  private getReceivedKbps(): number {
    if (this.receivedWindow.length < 2) return 0;
    const first = this.receivedWindow[0];
    const last = this.receivedWindow[this.receivedWindow.length - 1];
    if (!first || !last || last.atMs <= first.atMs) return 0;
    const bytes = this.receivedWindow.reduce((sum, entry) => sum + entry.bytes, 0);
    return Math.round(((bytes * 8) / (last.atMs - first.atMs)) * 10) / 10;
  }

  private pruneReceivedWindow(): void {
    const cutoff = this.now() - probeReceiveWindowMs;
    while (this.receivedWindow[0] && this.receivedWindow[0].atMs < cutoff) this.receivedWindow.shift();
  }

  private nextDataSequence(): number {
    const current = this.dataSequence;
    this.dataSequence = (this.dataSequence + 1) >>> 0;
    return current;
  }

  private nextControlSequence(): number {
    const current = this.controlSequence;
    this.controlSequence = (this.controlSequence + 1) >>> 0;
    return current;
  }

  private resetMetrics(): void {
    this.dataSequence = 0;
    this.controlSequence = 0;
    this.sentPackets = 0;
    this.sentBytes = 0;
    this.sendFailures = 0;
    this.receivedPackets = 0;
    this.receivedDataPackets = 0;
    this.receivedBytes = 0;
    this.estimatedLostPackets = 0;
    this.rttTotalMs = 0;
    this.rttSamples = 0;
    this.lastPacketAtMs = null;
    this.lastSequenceByPeer.clear();
    this.receivedWindow.length = 0;
  }

  private leaveRoomInternal(): void {
    if (this.receiveTimer !== null) this.clearIntervalFn(this.receiveTimer);
    if (this.dataTimer !== null) this.clearIntervalFn(this.dataTimer);
    if (this.pingTimer !== null) this.clearIntervalFn(this.pingTimer);
    this.receiveTimer = null;
    this.dataTimer = null;
    this.pingTimer = null;
    try {
      this.lobby?.leave();
    } catch {
      // Best-effort teardown; the Steam client may already be unavailable.
    }
    this.lobby = null;
    this.role = 'none';
    this.hostSteamId = null;
  }

  private fail(error: SteamListenTogetherProbeError): SteamListenTogetherProbeSnapshot {
    this.state = error === 'probe_disabled' ? 'disabled' : 'error';
    this.lastError = error;
    return this.getSnapshot();
  }

  private failAndLeave(error: SteamListenTogetherProbeError): void {
    this.leaveRoomInternal();
    this.state = 'error';
    this.lastError = error;
  }
}
