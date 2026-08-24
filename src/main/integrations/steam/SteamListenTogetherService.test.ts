import { describe, expect, it, vi } from 'vitest';
import type { AudioStatus } from '../../../shared/types/audio';
import {
  decodeSteamListenTogetherPacket,
  encodeSteamListenTogetherPacket,
  SteamListenTogetherService,
} from './SteamListenTogetherService';

const audioStatus = (patch: Partial<AudioStatus> = {}): AudioStatus => ({
  host: 'ready',
  state: 'playing',
  outputDeviceId: null,
  outputDeviceName: null,
  outputDeviceType: null,
  outputBackend: null,
  activeOutputBackendImpl: null,
  outputMode: 'shared',
  activeDecodeBackendImpl: null,
  volume: 1,
  playbackRate: 1,
  playbackSpeedMode: 'speed',
  currentFilePath: 'D:\\Private\\Starlight.flac',
  currentTrackId: 'track-local-only',
  currentTrackTitle: 'Starlight',
  currentTrackArtist: 'ECHO',
  currentTrackAlbum: 'Night Drive',
  durationSeconds: 225,
  positionSeconds: 42,
  channels: 2,
  codec: 'flac',
  bitDepth: 24,
  bitrate: 2_100_000,
  fileSampleRate: 96_000,
  decoderOutputSampleRate: 96_000,
  requestedOutputSampleRate: 96_000,
  actualDeviceSampleRate: 96_000,
  sharedDeviceSampleRate: 96_000,
  resampling: false,
  warnings: [],
  error: null,
  ...patch,
} as AudioStatus);

type TimerCallback = () => void;

const createHarness = (localSteamId: bigint, ownerSteamId: bigint, status: AudioStatus) => {
  const members = [{ steamId64: ownerSteamId }, ...(localSteamId === ownerSteamId ? [{ steamId64: 2n }] : [{ steamId64: localSteamId }])];
  const metadata: Record<string, string> = {
    echo_listen_protocol: '1',
    echo_listen_mode: 'listen-together-v1',
  };
  const callbacks = new Map<number, (payload: unknown) => void>();
  const incoming: Array<{ data: Buffer; steamId: { steamId64: bigint } }> = [];
  const sent: Array<{ peer: bigint; data: Buffer }> = [];
  const timers: TimerCallback[] = [];
  const lobby = {
    id: 9001n,
    leave: vi.fn(),
    openInviteDialog: vi.fn(),
    getMemberCount: vi.fn(() => BigInt(members.length)),
    getMembers: vi.fn(() => members),
    getOwner: vi.fn(() => ({ steamId64: ownerSteamId })),
    getData: vi.fn((key: string) => metadata[key] ?? null),
    mergeFullData: vi.fn((next: Record<string, string>) => { Object.assign(metadata, next); return true; }),
  };
  const client = {
    matchmaking: {
      createLobby: vi.fn(async () => lobby),
      joinLobby: vi.fn(async () => lobby),
    },
    callback: {
      register: vi.fn((kind: number, handler: (payload: unknown) => void) => {
        callbacks.set(kind, handler);
        return { disconnect: vi.fn() };
      }),
    },
    localplayer: {
      getSteamId: vi.fn(() => ({ steamId64: localSteamId })),
      getName: vi.fn(() => localSteamId === ownerSteamId ? 'Host' : 'Guest'),
      setRichPresence: vi.fn(),
    },
    networking: {
      sendP2PPacket: vi.fn((peer: bigint, _sendType: number, data: Buffer) => { sent.push({ peer, data }); return true; }),
      isP2PPacketAvailable: vi.fn(() => incoming[0]?.data.length ?? 0),
      readP2PPacket: vi.fn(() => incoming.shift()),
      acceptP2PSession: vi.fn(),
    },
  };
  const audio = {
    getStatus: vi.fn(() => status),
    on: vi.fn(),
    off: vi.fn(),
  };
  const execute = vi.fn(async () => undefined);
  const findAndPlay = vi.fn(async () => true);
  const service = new SteamListenTogetherService({ getClient: () => client as never }, {
    audioSession: audio,
    actionRouter: { execute },
    localTrackResolver: { findAndPlay },
    now: () => 1_000,
    setInterval: ((callback: TimerCallback) => { timers.push(callback); return timers.length as never; }) as never,
    clearInterval: vi.fn() as never,
  });
  return { service, lobby, client, callbacks, incoming, sent, timers, execute, findAndPlay };
};

describe('SteamListenTogetherService', () => {
  it('creates a friends room, adds join Rich Presence, and never sends local paths', async () => {
    const harness = createHarness(1n, 1n, audioStatus());
    const snapshot = await harness.service.createRoom();

    expect(snapshot).toMatchObject({ state: 'connected', role: 'host', memberCount: 2, syncState: 'host' });
    expect(harness.lobby.mergeFullData).toHaveBeenCalledWith({ echo_listen_protocol: '1', echo_listen_mode: 'listen-together-v1' });
    expect(harness.client.localplayer.setRichPresence).toHaveBeenCalledWith('connect', '+connect_lobby 9001');
    const statePacket = harness.sent.map((item) => decodeSteamListenTogetherPacket(item.data)).find((item) => item?.type === 'state');
    expect(statePacket).toMatchObject({ type: 'state', playback: { track: { title: 'Starlight', artist: 'ECHO' } } });
    expect(JSON.stringify(statePacket)).not.toContain('D:\\Private');
    expect(JSON.stringify(statePacket)).not.toContain('track-local-only');
  });

  it('strictly resolves the guest local copy and follows host position and playback state', async () => {
    const harness = createHarness(2n, 1n, audioStatus({ state: 'paused', currentTrackTitle: 'Different song', positionSeconds: 0 }));
    await harness.service.joinRoom('9001');
    harness.incoming.push({
      steamId: { steamId64: 1n },
      data: encodeSteamListenTogetherPacket({
        magic: 'ECHO_LISTEN_TOGETHER',
        version: 1,
        type: 'state',
        sequence: 10,
        playback: {
          state: 'playing',
          positionSeconds: 42,
          durationSeconds: 225,
          playbackRate: 1,
          track: { key: 'remote-key', title: 'Starlight', artist: 'ECHO', album: 'Night Drive', durationSeconds: 225 },
        },
      }),
    });

    harness.timers[0]?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(harness.findAndPlay).toHaveBeenCalledWith(expect.objectContaining({ title: 'Starlight' }), 42);
    expect(harness.execute).toHaveBeenCalledWith(expect.objectContaining({ action: 'seek', positionMs: 42_000 }));
    expect(harness.execute).toHaveBeenCalledWith(expect.objectContaining({ action: 'play' }));
    expect(harness.service.getSnapshot().syncState).toBe('synced');
  });

  it('broadcasts allowlisted ephemeral reactions to current room members', async () => {
    const harness = createHarness(1n, 1n, audioStatus());
    await harness.service.createRoom();
    harness.sent.length = 0;
    const snapshot = harness.service.sendReaction('heart');

    expect(snapshot.recentReactions).toEqual([expect.objectContaining({ reaction: 'heart', senderName: 'Host' })]);
    expect(decodeSteamListenTogetherPacket(harness.sent[0].data)).toMatchObject({ type: 'reaction', reaction: 'heart' });
  });
});
