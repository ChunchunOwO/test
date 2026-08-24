import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeSteamListenTogetherProbePacket,
  encodeSteamListenTogetherProbePacket,
  SteamListenTogetherProbeService,
} from './SteamListenTogetherProbeService';

type FakeMember = { steamId64: bigint; steamId32: string; accountId: number };

const member = (steamId64: bigint): FakeMember => ({
  steamId64,
  steamId32: steamId64.toString(),
  accountId: Number(steamId64),
});

const createLobby = ({
  id = 99n,
  owner = member(1n),
  members = [member(1n), member(2n)],
  data = {},
}: {
  id?: bigint;
  owner?: FakeMember;
  members?: FakeMember[];
  data?: Record<string, string>;
} = {}) => {
  const lobbyData = new Map(Object.entries(data));
  return {
    id,
    join: vi.fn(),
    leave: vi.fn(),
    openInviteDialog: vi.fn(),
    getMemberCount: vi.fn(() => BigInt(members.length)),
    getMemberLimit: vi.fn(() => 2n),
    getMembers: vi.fn(() => members),
    getOwner: vi.fn(() => owner),
    setJoinable: vi.fn(() => true),
    getData: vi.fn((key: string) => lobbyData.get(key) ?? null),
    setData: vi.fn((key: string, value: string) => {
      lobbyData.set(key, value);
      return true;
    }),
    deleteData: vi.fn((key: string) => lobbyData.delete(key)),
    getFullData: vi.fn(() => Object.fromEntries(lobbyData)),
    mergeFullData: vi.fn((next: Record<string, string>) => {
      for (const [key, value] of Object.entries(next)) lobbyData.set(key, value);
      return true;
    }),
  };
};

const createHarness = ({ localSteamId = 1n, lobby = createLobby() } = {}) => {
  const callbacks = new Map<number, (payload: never) => void>();
  const incoming: Array<{ data: Buffer; size: number; steamId: FakeMember }> = [];
  const client = {
    localplayer: {
      getSteamId: vi.fn(() => member(localSteamId)),
      getName: vi.fn(() => 'Test'),
    },
    matchmaking: {
      createLobby: vi.fn(async () => lobby),
      joinLobby: vi.fn(async () => lobby),
      getLobbies: vi.fn(async () => [lobby]),
    },
    networking: {
      sendP2PPacket: vi.fn((_steamId: bigint, _sendType: number, _data: Buffer) => true),
      isP2PPacketAvailable: vi.fn(() => incoming[0]?.size ?? 0),
      readP2PPacket: vi.fn(() => {
        const packet = incoming.shift();
        if (!packet) throw new Error('no packet');
        return packet;
      }),
      acceptP2PSession: vi.fn(),
    },
    callback: {
      SteamCallback: {
        LobbyChatUpdate: 5,
        P2PSessionRequest: 6,
        P2PSessionConnectFail: 7,
        GameLobbyJoinRequested: 8,
      },
      register: vi.fn((kind: number, handler: (payload: never) => void) => {
        callbacks.set(kind, handler);
        return { disconnect: vi.fn(() => callbacks.delete(kind)) };
      }),
    },
  };
  return {
    callbacks,
    client,
    incoming,
    lobby,
    service: new SteamListenTogetherProbeService(
      { getClient: () => client as never },
      { enabled: true },
    ),
  };
};

describe('SteamListenTogetherProbeService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the packaged probe fail-closed unless explicitly enabled', async () => {
    const service = new SteamListenTogetherProbeService({ getClient: () => null }, { enabled: false });

    expect(service.getSnapshot()).toMatchObject({ enabled: false, state: 'disabled' });
    await expect(service.createRoom()).resolves.toMatchObject({ lastError: 'probe_disabled' });
  });

  it('creates a friends-only two-person lobby and sends an audio-rate transport probe', async () => {
    const harness = createHarness();
    const snapshot = await harness.service.createRoom();

    expect(harness.client.matchmaking.createLobby).toHaveBeenCalledWith(1, 2);
    expect(harness.lobby.mergeFullData).toHaveBeenCalledWith({
      echo_listen_protocol: '1',
      echo_listen_mode: 'transport-probe',
    });
    expect(snapshot).toMatchObject({
      state: 'connected',
      role: 'host',
      lobbyId: '99',
      memberCount: 2,
      transportRunning: true,
      targetKbps: 317,
    });

    harness.client.networking.sendP2PPacket.mockClear();
    await vi.advanceTimersByTimeAsync(40);

    const dataCalls = harness.client.networking.sendP2PPacket.mock.calls.filter((call) => call[1] === 1);
    expect(dataCalls.length).toBe(2);
    expect(dataCalls[0]?.[0]).toBe(2n);
    expect(decodeSteamListenTogetherProbePacket(dataCalls[0]?.[2] as Buffer)).toMatchObject({ kind: 'data' });
    harness.service.dispose();
  });

  it('accepts P2P sessions only from members of the active lobby', async () => {
    const harness = createHarness();
    await harness.service.createRoom();

    harness.callbacks.get(6)?.({ remote: 2n } as never);
    harness.callbacks.get(6)?.({ remote: 777n } as never);

    expect(harness.client.networking.acceptP2PSession).toHaveBeenCalledTimes(1);
    expect(harness.client.networking.acceptP2PSession).toHaveBeenCalledWith(2n);
    harness.service.dispose();
  });

  it('joins a compatible room from a Steam friend invite callback', async () => {
    const lobby = createLobby({
      data: { echo_listen_protocol: '1', echo_listen_mode: 'transport-probe' },
    });
    const harness = createHarness({ localSteamId: 2n, lobby });
    harness.service.initialize();

    harness.callbacks.get(8)?.({ lobby_steam_id: 99n, friend_steam_id: 1n } as never);
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.client.matchmaking.joinLobby).toHaveBeenCalledWith(99n);
    expect(harness.service.getSnapshot()).toMatchObject({ state: 'connected', role: 'guest', lobbyId: '99' });
    harness.service.dispose();
  });

  it('joins only compatible rooms and measures received throughput and sequence gaps', async () => {
    const lobby = createLobby({
      data: { echo_listen_protocol: '1', echo_listen_mode: 'transport-probe' },
    });
    const harness = createHarness({ localSteamId: 2n, lobby });
    await expect(harness.service.joinRoom('99')).resolves.toMatchObject({ role: 'guest', state: 'connected' });

    const first = encodeSteamListenTogetherProbePacket({ kind: 'data', sequence: 10, sentAtMs: Date.now() });
    harness.incoming.push({ data: first, size: first.length, steamId: member(1n) });
    await vi.advanceTimersByTimeAsync(10);
    const second = encodeSteamListenTogetherProbePacket({ kind: 'data', sequence: 12, sentAtMs: Date.now() });
    harness.incoming.push({ data: second, size: second.length, steamId: member(1n) });
    await vi.advanceTimersByTimeAsync(20);

    expect(harness.service.getSnapshot()).toMatchObject({
      receivedPackets: 2,
      estimatedLostPackets: 1,
      estimatedLossPercent: 33.33,
    });
    expect(harness.service.getSnapshot().receivedKbps).toBeGreaterThan(0);
    harness.service.dispose();
  });

  it('rejects malformed and incompatible lobby identifiers without joining', async () => {
    const harness = createHarness({
      localSteamId: 2n,
      lobby: createLobby({ data: { echo_listen_protocol: '99' } }),
    });

    await expect(harness.service.joinRoom('not-a-lobby')).resolves.toMatchObject({ lastError: 'invalid_room_id' });
    expect(harness.client.matchmaking.joinLobby).not.toHaveBeenCalled();
    await expect(harness.service.joinRoom('99')).resolves.toMatchObject({ lastError: 'incompatible_room' });
    expect(harness.lobby.leave).toHaveBeenCalledTimes(1);
    harness.service.dispose();
  });
});
