import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EqBridge } from './EqBridge';
import type { EqState } from '../../shared/types/eq';
import { eqBandCount } from '../../shared/types/eq';
import { builtInEqPreampMaxExtraDb, builtInGraphicEqQ } from '../../shared/audio/eqBuiltInPresets';
import { computeEqResponseGainDbAtFrequency } from '../../renderer/components/audio/eqPanelUtils';

const tempDirs: string[] = [];
const servers: net.Server[] = [];
const sockets: net.Socket[] = [];

const createBridge = (): EqBridge => {
  const dir = mkdtempSync(join(tmpdir(), 'echo-eq-'));
  tempDirs.push(dir);
  return new EqBridge(dir);
};

const expectedBuiltInPresetIds = [
  'flat',
  'harman-target',
  'harman-in-ear',
  'diffuse-field',
  'bk-room-curve',
  'harman-over-ear-2013',
  'harman-over-ear-2015',
  'harman-over-ear-2018-no-bass',
  'harman-in-ear-2016',
  'harman-in-ear-2017',
  'harman-in-ear-2019-no-bass',
  'harman-speaker-room-2013',
  'diffuse-field-iso-11904-1',
  'diffuse-field-gras-kemar',
  'diffuse-field-5128',
  'studio-neutral',
  'bass-boost',
  'vocal-clear',
  'treble-sparkle',
  'loudness',
  'night',
  'headphone-warm',
  'anime-jpop',
  'rock',
  'classical',
  'classic-smiley',
  'vinyl-warmth',
  'broadcast-voice',
  'city-pop',
  'acoustic-silk',
  'piano-room',
  'lofi-dusk',
  'cinema-orchestra',
  'live-house',
  'female-vocal-air',
];

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  sockets.splice(0).forEach((socket) => socket.destroy());
  servers.splice(0).forEach((server) => server.close());
});

const createEqControlServer = async (
  options: { responseBands?: EqState['bands'] } = {},
): Promise<{ port: number; messages: Array<Record<string, unknown>>; closeClients: () => void }> => {
  const messages: Array<Record<string, unknown>> = [];
  let responseBands = (options.responseBands ?? createBridge().getState().bands).map((band) => ({ ...band }));
  let responseEnabled = true;
  let responsePreampDb = 0;
  let roomCorrectionState = {
    type: 'roomCorrection:state',
    ok: true,
    enabled: false,
    status: 'empty',
    irId: '',
    irName: '',
    channelMode: 'none',
    sampleRate: 0,
    tapCount: 0,
    trimDb: 0,
    latencySamples: 0,
    clippingRisk: false,
    error: '',
  };
  const clients: net.Socket[] = [];
  const server = net.createServer((socket) => {
    sockets.push(socket);
    clients.push(socket);
    socket.on('error', () => undefined);
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          const message = JSON.parse(line) as Record<string, unknown>;
          messages.push(message);
          const band = Number(message.band);
          if (message.type === 'eq:set-enabled') {
            responseEnabled = message.enabled === true;
          } else if (message.type === 'eq:set-preamp' && Number.isFinite(Number(message.preampDb))) {
            responsePreampDb = Number(message.preampDb);
          } else if (message.type === 'eq:set-preset' && Array.isArray(message.bands)) {
            responsePreampDb = Number(message.preampDb ?? responsePreampDb);
            responseBands = (message.bands as EqState['bands']).map((item) => ({ ...item }));
          } else if (Number.isInteger(band) && band >= 0 && band < responseBands.length) {
            if (message.type === 'eq:set-band-gain' && Number.isFinite(Number(message.gainDb))) {
              responseBands[band] = { ...responseBands[band], gainDb: Number(message.gainDb) };
            } else if (message.type === 'eq:set-band-frequency' && Number.isFinite(Number(message.frequencyHz))) {
              responseBands[band] = { ...responseBands[band], frequencyHz: Number(message.frequencyHz) };
            } else if (message.type === 'eq:set-band-q' && Number.isFinite(Number(message.q))) {
              responseBands[band] = { ...responseBands[band], q: Number(message.q) };
            } else if (message.type === 'eq:set-band-filter-type') {
              responseBands[band] = { ...responseBands[band], filterType: message.filterType as EqState['bands'][number]['filterType'] };
            } else if (message.type === 'eq:set-band-enabled') {
              responseBands[band] = { ...responseBands[band], enabled: message.enabled === true };
            }
          }
          if (message.type === 'channelBalance.setState') {
            socket.write(`${JSON.stringify({ type: 'channelBalance:state' })}\n`);
          } else if (message.type === 'roomCorrection.loadIr') {
            roomCorrectionState = {
              ...roomCorrectionState,
              status: roomCorrectionState.enabled ? 'active' : 'loaded',
              irId: String(message.irId ?? ''),
              irName: String(message.irName ?? ''),
              channelMode: 'mono',
              sampleRate: 48000,
              tapCount: 128,
              error: '',
            };
            socket.write(`${JSON.stringify(roomCorrectionState)}\n`);
          } else if (message.type === 'roomCorrection.setEnabled') {
            roomCorrectionState = {
              ...roomCorrectionState,
              enabled: message.enabled === true,
              status: roomCorrectionState.irId ? message.enabled === true ? 'active' : 'loaded' : 'empty',
            };
            socket.write(`${JSON.stringify(roomCorrectionState)}\n`);
          } else if (message.type === 'roomCorrection.setTrim') {
            roomCorrectionState = { ...roomCorrectionState, trimDb: Number(message.trimDb ?? 0) };
            socket.write(`${JSON.stringify(roomCorrectionState)}\n`);
          } else if (message.type === 'roomCorrection.clear') {
            roomCorrectionState = { ...roomCorrectionState, enabled: false, status: 'empty', irId: '', irName: '', channelMode: 'none', sampleRate: 0, tapCount: 0, error: '' };
            socket.write(`${JSON.stringify(roomCorrectionState)}\n`);
          } else {
            socket.write(`${JSON.stringify({ type: 'eq:state', enabled: responseEnabled, preampDb: responsePreampDb, bands: responseBands })}\n`);
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }
    });
  });

  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('test EQ control server did not bind to a TCP port');
  }

  return {
    port: address.port,
    messages,
    closeClients: () => clients.forEach((socket) => socket.destroy()),
  };
};

describe('EqBridge protocol validation', () => {
  it('does not surface a startup error when the native EQ control port is not listening yet', async () => {
    const bridge = createBridge();
    const errorListener = vi.fn();
    const closedServer = await createEqControlServer();
    const port = closedServer.port;
    const server = servers.at(-1);
    if (server) {
      servers.splice(servers.indexOf(server), 1);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    bridge.on('error', errorListener);
    bridge.connect(port);
    await expect(bridge.syncStateToNative()).resolves.toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(errorListener).not.toHaveBeenCalled();
    const state = await bridge.setBandGain({ band: 2, gainDb: 3 });
    expect(state.bands[2].gainDb).toBe(3);
  });

  it('ignores stale control socket closes after a newer native host connects', async () => {
    const bridge = createBridge();
    const first = await createEqControlServer();
    const second = await createEqControlServer();

    bridge.connect(first.port);
    await new Promise((resolve) => setTimeout(resolve, 0));
    bridge.connect(second.port);
    await new Promise((resolve) => setTimeout(resolve, 0));
    first.closeClients();

    await bridge.setBandGain({ band: 2, gainDb: 4 });

    expect(second.messages.some((message) => message.type === 'eq:set-band-gain' && message.band === 2)).toBe(true);
  });

  it('keeps the intended EQ curve when a fresh native host answers enable with Flat state', async () => {
    const bridge = createBridge();
    await bridge.setPreset('harman-target');
    await bridge.setEnabled(true);
    const intendedBands = bridge.getState().bands;
    const server = await createEqControlServer({ responseBands: createBridge().getState().bands });

    bridge.connect(server.port);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect.poll(() => server.messages.some((message) => message.type === 'eq:set-preset')).toBe(true);
    const presetMessage = server.messages.find((message) => message.type === 'eq:set-preset') as { bands?: EqState['bands'] } | undefined;

    expect(presetMessage?.bands?.map((band) => band.gainDb)).toEqual(intendedBands.map((band) => band.gainDb));
    expect(bridge.getState().bands.map((band) => band.gainDb)).toEqual(intendedBands.map((band) => band.gainDb));
  });

  it('rejects invalid band indexes', async () => {
    const bridge = createBridge();

    await expect(bridge.setBandGain({ band: 99, gainDb: 2 })).rejects.toThrow('invalid_eq_band_index');
  });

  it('clamps gain and preamp ranges before updating state', async () => {
    const bridge = createBridge();

    await bridge.setBandGain({ band: 2, gainDb: 50 });
    await bridge.setPreamp(-40);

    const state = bridge.getState();
    expect(state.bands[2].gainDb).toBe(12);
    expect(state.preampDb).toBe(-12);
  });

  it('clamps editable band frequencies before updating state', async () => {
    const bridge = createBridge();

    await bridge.setBandFrequency({ band: 2, frequencyHz: 50000 });

    expect(bridge.getState().bands[2].frequencyHz).toBe(20000);
  });

  it('normalizes old persisted EQ bands with PEQ defaults', () => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-eq-'));
    tempDirs.push(dir);
    writeFileSync(
      join(dir, 'eq-state.json'),
      JSON.stringify({
        enabled: true,
        preampDb: -2,
        bands: Array.from({ length: 10 }, (_value, index) => ({
          frequencyHz: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000][index],
          gainDb: index === 0 ? 4 : 0,
        })),
      }),
      'utf8',
    );

    const bridge = new EqBridge(dir);
    const state = bridge.getState();

    expect(state.bands[0]).toMatchObject({
      gainDb: 4,
      q: 1,
      filterType: 'peaking',
      enabled: true,
    });
  });

  it('refreshes a persisted built-in curve to the current safe voicing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-eq-'));
    tempDirs.push(dir);
    const staleState = createBridge().getState();
    writeFileSync(
      join(dir, 'eq-state.json'),
      JSON.stringify({
        ...staleState,
        enabled: true,
        preampDb: -2,
        presetId: 'harman-target',
        presetName: 'Harman 2018',
        bands: staleState.bands.map((band) => ({ ...band, gainDb: 2, q: 1 })),
      }),
      'utf8',
    );

    const bridge = new EqBridge(dir);

    expect(bridge.getState()).toMatchObject({
      enabled: true,
      preampDb: -2.3,
      presetId: 'harman-target',
      presetName: 'Harman Inspired · Balanced',
    });
    expect(bridge.getState().bands[0]).toMatchObject({ gainDb: 0.6, q: builtInGraphicEqQ });
  });

  it('clamps PEQ Q and propagates band type and bypass state to native control', async () => {
    const bridge = createBridge();
    const server = await createEqControlServer();
    bridge.connect(server.port);
    await new Promise((resolve) => setTimeout(resolve, 0));

    await bridge.setBandQ({ band: 3, q: 50 });
    await bridge.setBandFilterType({ band: 3, filterType: 'lowShelf' });
    await bridge.setBandEnabled({ band: 3, enabled: false });

    expect(bridge.getState().bands[3]).toMatchObject({
      q: 12,
      filterType: 'lowShelf',
      enabled: false,
    });
    expect(server.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'eq:set-band-q', band: 3, q: 12 }),
      expect.objectContaining({ type: 'eq:set-band-filter-type', band: 3, filterType: 'lowShelf' }),
      expect.objectContaining({ type: 'eq:set-band-enabled', band: 3, enabled: false }),
    ]));
  });

  it('does not send optional DSP sync commands when Room Correction and channel balance are default off', async () => {
    const bridge = createBridge();
    const server = await createEqControlServer();
    bridge.connect(server.port);

    await expect.poll(() => server.messages.some((message) => message.type === 'eq:set-preset')).toBe(true);

    expect(server.messages.some((message) => String(message.type).startsWith('roomCorrection.'))).toBe(false);
    expect(server.messages.some((message) => String(message.type).startsWith('channelBalance.'))).toBe(false);
  });

  it('imports room correction WAV files and sends the copied IR to native control', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-eq-'));
    tempDirs.push(dir);
    const sourceIr = join(dir, 'desk-ir.wav');
    writeFileSync(sourceIr, Buffer.from('RIFF----WAVEfmt '));
    const bridge = new EqBridge(dir);
    const server = await createEqControlServer();
    bridge.connect(server.port);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const state = await bridge.importRoomCorrectionIr(sourceIr);

    expect(state).toMatchObject({
      status: 'loaded',
      irName: 'desk-ir',
      channelMode: 'mono',
      sampleRate: 48000,
      tapCount: 128,
    });
    const loadMessage = server.messages.find((message) => message.type === 'roomCorrection.loadIr');
    expect(loadMessage).toEqual(expect.objectContaining({
      irId: state.irId,
      irName: 'desk-ir',
    }));
    expect(String(loadMessage?.path)).toContain('room-correction');
    expect(existsSync(String(loadMessage?.path))).toBe(true);
  });

  it('persists room correction trim and enabled state independently from EQ presets', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-eq-'));
    tempDirs.push(dir);
    const sourceIr = join(dir, 'room.wav');
    writeFileSync(sourceIr, Buffer.from('RIFF----WAVEfmt '));
    const bridge = new EqBridge(dir);
    const server = await createEqControlServer();
    bridge.connect(server.port);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await bridge.syncStateToNative();

    await bridge.importRoomCorrectionIr(sourceIr);
    await bridge.setRoomCorrectionTrim(-99);
    const enabled = await bridge.setRoomCorrectionEnabled(true);

    expect(enabled).toMatchObject({ enabled: true, status: 'active', trimDb: -24 });
    expect(server.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'roomCorrection.setTrim', trimDb: -24 }),
      expect.objectContaining({ type: 'roomCorrection.setEnabled', enabled: true }),
    ]));

    const reloaded = new EqBridge(dir);
    expect(reloaded.getRoomCorrectionState()).toMatchObject({ enabled: true, irName: 'room', trimDb: -24 });

    const cleared = await bridge.clearRoomCorrection();
    expect(cleared).toMatchObject({ enabled: false, status: 'empty', irId: null });
  });

  it('backs up old EQ files before first Phase 2 format write', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-eq-'));
    tempDirs.push(dir);
    writeFileSync(join(dir, 'eq-state.json'), JSON.stringify(createBridge().getState()), 'utf8');
    writeFileSync(join(dir, 'eq-presets.json'), JSON.stringify([]), 'utf8');
    const bridge = new EqBridge(dir);

    await bridge.setBandQ({ band: 1, q: 2 });

    expect(existsSync(join(dir, 'eq-backups', 'phase2-backup.done'))).toBe(true);
  });

  it('refuses malformed preset data', () => {
    const bridge = createBridge();

    expect(() =>
      bridge.savePreset({
        name: 'Broken',
        preampDb: 0,
        bands: [{ frequencyHz: 31, gainDb: 0, q: 1 }],
      }),
    ).toThrow('invalid_eq_preset');
  });

  it('persists user presets outside the audio callback path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-eq-'));
    tempDirs.push(dir);
    const bridge = new EqBridge(dir);
    const state = bridge.getState();

    bridge.savePreset({
      name: 'Desk Headphones',
      preampDb: -2,
      bands: state.bands,
    });

    const reloaded = new EqBridge(dir);
    expect(reloaded.listPresets().some((preset) => preset.name === 'Desk Headphones')).toBe(true);
  });

  it('restores the last EQ enabled state and curve after restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-eq-'));
    tempDirs.push(dir);
    const bridge = new EqBridge(dir);

    await bridge.setPreset('harman-target');
    await bridge.setEnabled(true);
    await bridge.setBandGain({ band: 0, gainDb: 3.5 });
    await bridge.setPreamp(-3);

    const reloaded = new EqBridge(dir);

    expect(reloaded.getState()).toMatchObject({
      enabled: true,
      preampDb: -3,
      presetId: 'custom',
      presetName: 'Custom',
    });
    expect(reloaded.getState().bands[0].gainDb).toBe(3.5);
  });

  it('falls back to disabled Flat EQ when persisted state is malformed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'echo-eq-'));
    tempDirs.push(dir);
    writeFileSync(join(dir, 'eq-state.json'), JSON.stringify({ enabled: true, bands: [{ gainDb: 999 }] }), 'utf8');

    const bridge = new EqBridge(dir);

    expect(bridge.getState()).toMatchObject({
      enabled: false,
      preampDb: 0,
      presetId: 'flat',
      presetName: 'Flat',
    });
  });

  it('selects a newly saved preset in the bridge state', () => {
    const bridge = createBridge();
    const stateChanges: EqState[] = [];
    bridge.on('state', (nextState: EqState) => stateChanges.push(nextState));

    const saved = bridge.savePreset({
      name: 'Desk Headphones',
      preampDb: -2,
      bands: bridge.getState().bands.map((band, index) => (index === 1 ? { ...band, gainDb: 3 } : band)),
    });

    expect(bridge.getState()).toMatchObject({
      presetId: saved.id,
      presetName: 'Desk Headphones',
      preampDb: -2,
    });
    expect(bridge.getState().bands[1].gainDb).toBe(3);
    expect(stateChanges.at(-1)).toMatchObject({ presetId: saved.id, presetName: 'Desk Headphones' });
  });

  it('stores EQ profiles and only auto-applies explicitly bound output profiles', async () => {
    const bridge = createBridge();
    await bridge.setBandGain({ band: 0, gainDb: 5 });
    const desk = bridge.saveProfile({
      name: 'Desk DAC',
      state: bridge.getState(),
    });
    await bridge.setBandGain({ band: 0, gainDb: -5 });
    const bt = bridge.saveProfile({
      name: 'Bluetooth',
      state: bridge.getState(),
    });
    const target = {
      outputMode: 'shared',
      outputDeviceId: 'device-a',
      outputDeviceName: 'Desk DAC',
      outputDeviceType: 'shared',
      sharedBackend: 'windows',
    };

    bridge.bindProfileToOutput({ profileId: desk.id, target });
    bridge.bindProfileToOutput({ profileId: bt.id, target: { ...target, outputDeviceId: 'device-b', outputDeviceName: 'Bluetooth' } });

    expect(bridge.getProfileBinding(target)).toMatchObject({ profileId: desk.id, profileName: 'Desk DAC' });
    bridge.applyBoundProfileForOutput(target);
    expect(bridge.getState().bands[0].gainDb).toBe(5);
    bridge.applyBoundProfileForOutput({ ...target, outputDeviceId: 'missing-device' });
    expect(bridge.getState().bands[0].gainDb).toBe(5);
  });

  it('includes restrained reference-inspired curves as read-only built-in presets', async () => {
    const bridge = createBridge();
    const presets = bridge.listPresets();
    const harman = presets.find((preset) => preset.id === 'harman-target');

    expect(harman).toMatchObject({
      name: 'Harman Inspired · Balanced',
      preampDb: -2.3,
      readonly: true,
    });
    expect(harman?.bands[0]).toMatchObject({ gainDb: 0.6, q: builtInGraphicEqQ });
    expect(harman?.bands[23].gainDb).toBe(0.2);
    expect(presets.find((preset) => preset.id === 'harman-over-ear-2015')).toMatchObject({
      name: 'Harman Inspired · OE Warm',
      preampDb: -2.2,
      readonly: true,
      bands: expect.arrayContaining([
        expect.objectContaining({ frequencyHz: 3150, gainDb: 0.4, q: builtInGraphicEqQ }),
      ]),
    });

    await bridge.setPreset('harman-target');

    expect(bridge.getState()).toMatchObject({
      presetId: 'harman-target',
      presetName: 'Harman Inspired · Balanced',
      preampDb: -2.3,
    });
  });

  it('keeps every built-in preset locked to safe curve guardrails', () => {
    const bridge = createBridge();
    const builtInPresets = bridge.listPresets().filter((preset) => preset.readonly);

    expect(builtInPresets.map((preset) => preset.id)).toEqual(expectedBuiltInPresetIds);
    for (const preset of builtInPresets) {
      expect(preset.bands).toHaveLength(eqBandCount);
      expect(preset.preampDb, preset.name).toBeGreaterThanOrEqual(-12);
      expect(preset.preampDb, preset.name).toBeLessThanOrEqual(0);
      expect(preset.bands.every((band) => band.filterType !== 'lowPass' && band.filterType !== 'highPass' && band.filterType !== 'notch'), preset.name).toBe(true);
      expect(preset.bands.every((band) => band.q === builtInGraphicEqQ), preset.name).toBe(true);

      const gains = preset.bands.map((band) => band.gainDb);
      expect(Math.max(...gains), preset.name).toBeLessThanOrEqual(2);
      expect(Math.min(...gains), preset.name).toBeGreaterThanOrEqual(-2);
      expect(preset.preampDb + Math.max(...gains), preset.name).toBeLessThanOrEqual(0);

      const responsePeakDb = Math.max(...Array.from({ length: 241 }, (_value, index) => {
        const frequencyHz = 20 * (1000 ** (index / 240));
        return computeEqResponseGainDbAtFrequency(preset.bands, frequencyHz);
      }));
      expect(preset.preampDb + responsePeakDb, preset.name).toBeLessThanOrEqual(0);
      expect(-preset.preampDb - Math.max(0, responsePeakDb), preset.name).toBeLessThanOrEqual(builtInEqPreampMaxExtraDb);

      if (preset.id === 'flat') {
        expect(gains.every((gainDb) => gainDb === 0), preset.name).toBe(true);
        continue;
      }

      expect(Math.max(...gains) - Math.min(...gains), preset.name).toBeGreaterThanOrEqual(0.4);
      expect(gains.some((gainDb) => Math.abs(gainDb) >= 0.2), preset.name).toBe(true);
      for (let index = 1; index < gains.length; index += 1) {
        expect(Math.abs(gains[index] - gains[index - 1]), preset.name).toBeLessThanOrEqual(0.7);
      }
    }

    const bandGain = (presetId: string, frequencyHz: number): number => {
      const preset = builtInPresets.find((candidate) => candidate.id === presetId);
      return preset?.bands.find((band) => band.frequencyHz === frequencyHz)?.gainDb ?? Number.NaN;
    };
    const presetRmsDelta = (leftId: string, rightId: string): number => {
      const left = builtInPresets.find((preset) => preset.id === leftId)?.bands.map((band) => band.gainDb) ?? [];
      const right = builtInPresets.find((preset) => preset.id === rightId)?.bands.map((band) => band.gainDb) ?? [];
      const squares = left.map((gainDb, index) => {
        const delta = gainDb - (right[index] ?? 0);
        return delta * delta;
      });
      return Math.sqrt(squares.reduce((sum, value) => sum + value, 0) / Math.max(1, squares.length));
    };

    expect(bandGain('vocal-clear', 8000)).toBeGreaterThanOrEqual(0);
    expect(bandGain('bass-boost', 20)).toBeGreaterThanOrEqual(1);
    expect(bandGain('bass-boost', 315)).toBeGreaterThanOrEqual(0);

    const distinctPairs: Array<[string, string]> = [
      ['anime-jpop', 'city-pop'],
      ['rock', 'live-house'],
      ['classical', 'piano-room'],
      ['bk-room-curve', 'harman-speaker-room-2013'],
      ['diffuse-field-iso-11904-1', 'diffuse-field-gras-kemar'],
      ['vocal-clear', 'female-vocal-air'],
      ['bass-boost', 'headphone-warm'],
    ];
    for (const [leftId, rightId] of distinctPairs) {
      expect(presetRmsDelta(leftId, rightId), `${leftId} ~ ${rightId}`).toBeGreaterThanOrEqual(0.2);
    }
  });

  it('clamps channel balance parameters before updating state', async () => {
    const bridge = createBridge();

    await bridge.setChannelBalanceState({
      enabled: true,
      balance: 5,
      leftGainDb: -80,
      rightGainDb: 12,
      leftDelayMs: -2,
      rightDelayMs: 99,
      monoMode: 'sum',
      constantPower: false,
    });

    expect(bridge.getChannelBalanceState()).toMatchObject({
      enabled: true,
      balance: 1,
      leftGainDb: -12,
      rightGainDb: 6,
      leftDelayMs: 0,
      rightDelayMs: 10,
      monoMode: 'sum',
      constantPower: false,
    });
  });

  it('resets channel balance to a transparent default', async () => {
    const bridge = createBridge();

    await bridge.setChannelBalanceState({
      enabled: true,
      balance: -0.5,
      swapLeftRight: true,
      monoMode: 'left',
      invertRight: true,
    });
    await bridge.resetChannelBalance();

    expect(bridge.getChannelBalanceState()).toMatchObject({
      enabled: false,
      balance: 0,
      leftGainDb: 0,
      rightGainDb: 0,
      leftDelayMs: 0,
      rightDelayMs: 0,
      swapLeftRight: false,
      monoMode: 'off',
      invertLeft: false,
      invertRight: false,
      constantPower: true,
    });
  });
});
