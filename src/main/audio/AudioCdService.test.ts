import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  AudioCdService,
  parseAudioCdTracksFromFfmpegOutput,
  parseWindowsAudioCdDrives,
  parseWindowsCddaToc,
} from './AudioCdService';

const testDrive = {
  id: 'cd:D:',
  device: 'D:',
};

type MockChildProcess = EventEmitter & {
  stdout: PassThrough;
  stderr: PassThrough;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
};

const createMockChild = (): MockChildProcess => {
  const child = new EventEmitter() as MockChildProcess;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = vi.fn(() => {
    child.killed = true;
    return true;
  });
  return child;
};

const createWindowsNativeService = (spawn: ReturnType<typeof vi.fn>): AudioCdService => new AudioCdService({
  platform: 'win32',
  ffmpegPath: 'ffmpeg-test.exe',
  nativeHostPath: 'echo-audio-host-test.exe',
  spawn: spawn as never,
  listDrives: async () => [{
    ...testDrive,
    name: 'Test CD drive',
    mediaLoaded: true,
    driveLetter: 'D',
    volumeName: null,
  }],
});

describe('AudioCdService parsers', () => {
  it('parses Windows CD-ROM drive JSON from PowerShell', () => {
    const drives = parseWindowsAudioCdDrives(JSON.stringify({
      Drive: 'D:',
      MediaLoaded: true,
      Name: 'HL-DT-ST DVDRAM',
      VolumeName: 'ALBUM_DISC',
    }));

    expect(drives).toEqual([{
      id: 'cd:D:',
      device: 'D:',
      name: 'HL-DT-ST DVDRAM',
      mediaLoaded: true,
      driveLetter: 'D',
      volumeName: 'ALBUM_DISC',
    }]);
  });

  it('parses ffmetadata chapters into playable Audio CD tracks', () => {
    const tracks = parseAudioCdTracksFromFfmpegOutput(testDrive, [
      ';FFMETADATA1',
      '[CHAPTER]',
      'TIMEBASE=1/75',
      'START=0',
      'END=37108',
      'title=Intro',
      '[CHAPTER]',
      'TIMEBASE=1/75',
      'START=37108',
      'END=56868',
      'title=Main Theme',
    ].join('\n'));

    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({
      id: 'cd:D::track-01',
      driveId: 'cd:D:',
      device: 'D:',
      index: 1,
      title: 'Intro',
      startSeconds: 0,
      playable: true,
    });
    expect(tracks[0].durationSeconds).toBeCloseTo(494.77, 2);
    expect(tracks[1]).toMatchObject({
      index: 2,
      title: 'Main Theme',
      playable: true,
    });
    expect(tracks[1].startSeconds).toBeCloseTo(494.77, 2);
    expect(tracks[1].durationSeconds).toBeCloseTo(263.47, 2);
  });

  it('parses FFmpeg probe chapter logs when metadata export is unavailable', () => {
    const tracks = parseAudioCdTracksFromFfmpegOutput(testDrive, [
      'Input #0, libcdio, from \'D:\':',
      '  Chapters:',
      '    Chapter #0:0: start 0.000000, end 208.426667',
      '    Chapter #0:1: start 208.426667, end 421.173333',
    ].join('\n'));

    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({
      index: 1,
      title: 'Track 01',
      playable: true,
    });
    expect(tracks[0].durationSeconds).toBeCloseTo(208.43, 2);
    expect(tracks[1].startSeconds).toBeCloseTo(208.43, 2);
  });

  it('parses Windows native CDDA TOC and excludes data tracks', () => {
    const tracks = parseWindowsCddaToc(testDrive, JSON.stringify({
      tracks: [
        { index: 1, startLba: 0, endLba: 15_632, audio: true },
        { index: 2, startLba: 15_632, endLba: 31_500, audio: true },
        { index: 3, startLba: 31_500, endLba: 40_000, audio: false },
      ],
    }));

    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toMatchObject({
      index: 1,
      title: 'Track 01',
      startSeconds: 0,
      playable: true,
    });
    expect(tracks[0].durationSeconds).toBeCloseTo(208.43, 2);
    expect(tracks[1].startSeconds).toBeCloseTo(208.43, 2);
    expect(tracks[1].durationSeconds).toBeCloseTo(211.57, 2);
  });

  it('selects the Windows native CDDA backend when bundled FFmpeg has no libcdio', async () => {
    const spawn = vi.fn((_file: string, args: string[]) => {
      const child = createMockChild();
      queueMicrotask(() => {
        if (args.includes('--cdda-capabilities')) {
          child.stdout.end('{"windowsNativeCdda":true}\n');
        } else if (args.includes('--cdda-toc')) {
          child.stdout.end('{"tracks":[{"index":1,"startLba":0,"endLba":750,"audio":true}]}\n');
        } else if (args.includes('--cdda-read')) {
          child.stdout.end(Buffer.alloc(8));
        } else {
          child.stdout.end('Devices:\n D  dshow DirectShow capture\n');
        }
        child.stderr.end();
        child.emit('close', 0, null);
      });
      return child;
    });
    const service = createWindowsNativeService(spawn);

    const status = await service.getStatus();

    expect(status).toMatchObject({
      inputAvailable: true,
      inputBackend: 'windows-native-cdda',
      nativeCddaAvailable: true,
      ffmpegAvailable: true,
      libcdioAvailable: false,
      error: null,
    });
    expect(status.tracks).toHaveLength(1);
    expect(status.tracks[0].durationSeconds).toBe(10);

    const opened = await service.createTrackPcmStream({ driveId: 'cd:D:', trackIndex: 1 });
    const chunks: Buffer[] = [];
    for await (const chunk of opened.stream) {
      chunks.push(Buffer.from(chunk));
    }
    expect(opened.backendImpl).toBe('windows-native-cdda-pcm');
    expect(Buffer.concat(chunks)).toHaveLength(8);
    expect(spawn).toHaveBeenCalledWith(
      'echo-audio-host-test.exe',
      ['--cdda-read', 'D:', '--track', '1'],
      expect.objectContaining({ windowsHide: true }),
    );
  });

  it('surfaces a native read failure that happens after PCM output starts', async () => {
    const spawn = vi.fn((_file: string, args: string[]) => {
      const child = createMockChild();
      queueMicrotask(() => {
        if (args.includes('--cdda-capabilities')) {
          child.stdout.end('{"windowsNativeCdda":true}\n');
          child.stderr.end();
          child.emit('close', 0, null);
          return;
        }
        if (args.includes('--cdda-toc')) {
          child.stdout.end('{"tracks":[{"index":1,"startLba":0,"endLba":750,"audio":true}]}\n');
          child.stderr.end();
          child.emit('close', 0, null);
          return;
        }
        if (args.includes('--cdda-read')) {
          child.stdout.write(Buffer.alloc(8));
          child.stdout.end();
          child.stderr.end('audio_cd_raw_read_failed_win32_1117\n');
          child.emit('close', 1, null);
          return;
        }
        child.stdout.end('Devices:\n D  dshow DirectShow capture\n');
        child.stderr.end();
        child.emit('close', 0, null);
      });
      return child;
    });
    const service = createWindowsNativeService(spawn);
    const opened = await service.createTrackPcmStream({ driveId: 'cd:D:', trackIndex: 1 });

    const consume = async (): Promise<void> => {
      for await (const _chunk of opened.stream) {
        // Drain the simulated prefix. Process exit still decides success.
      }
    };
    await expect(consume()).rejects.toThrow('audio_cd_raw_read_failed_win32_1117');
  });

  it('terminates the native reader when the PCM consumer cancels playback', async () => {
    const state: { readChild?: MockChildProcess } = {};
    const spawn = vi.fn((_file: string, args: string[]) => {
      const child = createMockChild();
      queueMicrotask(() => {
        if (args.includes('--cdda-capabilities')) {
          child.stdout.end('{"windowsNativeCdda":true}\n');
          child.stderr.end();
          child.emit('close', 0, null);
        } else if (args.includes('--cdda-toc')) {
          child.stdout.end('{"tracks":[{"index":1,"startLba":0,"endLba":750,"audio":true}]}\n');
          child.stderr.end();
          child.emit('close', 0, null);
        } else if (args.includes('--cdda-read')) {
          state.readChild = child;
        } else {
          child.stdout.end('Devices:\n D  dshow DirectShow capture\n');
          child.stderr.end();
          child.emit('close', 0, null);
        }
      });
      return child;
    });
    const service = createWindowsNativeService(spawn);
    const opened = await service.createTrackPcmStream({ driveId: 'cd:D:', trackIndex: 1 });
    await new Promise<void>((resolve) => {
      opened.stream.once('close', resolve);
      opened.stream.destroy();
    });

    expect(state.readChild).toBeDefined();
    expect(state.readChild?.kill).toHaveBeenCalledOnce();
  });
});
