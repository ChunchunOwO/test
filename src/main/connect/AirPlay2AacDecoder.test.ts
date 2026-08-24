import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  AirPlay2AacDecoder,
  createAirPlay2AacAdtsFrame,
  type AirPlay2AacFormat,
} from './AirPlay2AacDecoder';

const format44100: AirPlay2AacFormat = { audioFormat: 0x400000, sampleRate: 44_100, channels: 2 };
const format48000: AirPlay2AacFormat = { audioFormat: 0x800000, sampleRate: 48_000, channels: 2 };

const createFakeChild = () => {
  const child = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = vi.fn(() => {
    child.killed = true;
    child.emit('exit', null, 'SIGTERM');
    return true;
  });
  child.stdin.once('finish', () => child.emit('exit', 0, null));
  return child;
};

describe('AirPlay2AacDecoder', () => {
  it('wraps raw AAC-LC payloads in valid 44.1 kHz and 48 kHz ADTS headers', () => {
    const payload = Buffer.from([1, 2, 3, 4, 5]);
    const frame44100 = createAirPlay2AacAdtsFrame(payload, format44100);
    const frame48000 = createAirPlay2AacAdtsFrame(payload, format48000);

    expect(frame44100.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xf1]));
    expect((frame44100[2] >> 6) & 0x03).toBe(1);
    expect((frame44100[2] >> 2) & 0x0f).toBe(4);
    expect((frame48000[2] >> 2) & 0x0f).toBe(3);
    expect(((frame44100[2] & 1) << 2) | (frame44100[3] >> 6)).toBe(2);
    expect(((frame44100[3] & 0x03) << 11) | (frame44100[4] << 3) | (frame44100[5] >> 5)).toBe(payload.length + 7);
    expect(frame44100.subarray(7)).toEqual(payload);
  });

  it('keeps one FFmpeg process alive, forwards PCM, and releases listeners on stop', async () => {
    const child = createFakeChild();
    const onPcm = vi.fn();
    const spawnProcess = vi.fn(() => {
      queueMicrotask(() => child.emit('spawn'));
      return child;
    });
    const decoder = new AirPlay2AacDecoder({
      format: format48000,
      onPcm,
      resolveToolchain: () => ({ path: 'ffmpeg-test', healthy: true, error: null }),
      spawnProcess: spawnProcess as never,
    });
    const input: Buffer[] = [];
    child.stdin.on('data', (chunk) => input.push(Buffer.from(chunk)));

    await decoder.start();
    expect(decoder.writeFrame(Buffer.from([0xaa, 0xbb]))).toBe(true);
    child.stdout.write(Buffer.from([0, 0, 0]));
    expect(onPcm).not.toHaveBeenCalled();
    child.stdout.write(Buffer.from([0, 1, 1, 1, 1]));

    expect(spawnProcess).toHaveBeenCalledTimes(1);
    const spawnCalls = spawnProcess.mock.calls as unknown as Array<[string, string[]]>;
    expect(spawnCalls[0]?.[1]).toEqual(expect.arrayContaining([
      '-f', 'aac', '-acodec', 'pcm_f32le', '-ar', '48000', '-ac', '2',
    ]));
    expect(Buffer.concat(input).subarray(7)).toEqual(Buffer.from([0xaa, 0xbb]));
    expect(onPcm).toHaveBeenCalledWith(Buffer.from([0, 0, 0, 0, 1, 1, 1, 1]));

    decoder.pauseOutput();
    child.stdout.write(Buffer.from([1, 1, 1, 1]));
    expect(onPcm).toHaveBeenCalledTimes(1);
    decoder.resumeOutput();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(onPcm).toHaveBeenCalledTimes(2);

    await decoder.stop();
    expect(child.stdout.listenerCount('data')).toBe(0);
    expect(child.stderr.listenerCount('data')).toBe(0);
    expect(child.stdin.listenerCount('drain')).toBe(0);
    expect(decoder.writeFrame(Buffer.from([3]))).toBe(false);
  });

  it('queues input behind FFmpeg stdin backpressure without reordering frames', async () => {
    const child = createFakeChild();
    const writes: Buffer[] = [];
    const originalWrite = child.stdin.write.bind(child.stdin);
    let first = true;
    vi.spyOn(child.stdin, 'write').mockImplementation(((chunk: Uint8Array) => {
      writes.push(Buffer.from(chunk));
      if (first) {
        first = false;
        return false;
      }
      return originalWrite(chunk);
    }) as never);
    const decoder = new AirPlay2AacDecoder({
      format: format44100,
      onPcm: vi.fn(),
      resolveToolchain: () => ({ path: 'ffmpeg-test', healthy: true, error: null }),
      spawnProcess: (() => {
        queueMicrotask(() => child.emit('spawn'));
        return child;
      }) as never,
    });

    await decoder.start();
    expect(decoder.writeFrame(Buffer.from([1]))).toBe(true);
    expect(decoder.writeFrame(Buffer.from([2]))).toBe(true);
    expect(writes).toHaveLength(1);
    child.stdin.emit('drain');
    expect(writes).toHaveLength(2);
    expect(writes[0]?.subarray(7)).toEqual(Buffer.from([1]));
    expect(writes[1]?.subarray(7)).toEqual(Buffer.from([2]));
    await decoder.stop();
  });

  it('replaces the FFmpeg process when buffered playback is flushed', async () => {
    const children = [createFakeChild(), createFakeChild()];
    const spawnProcess = vi.fn(() => {
      const child = children.shift();
      if (!child) throw new Error('unexpected decoder spawn');
      queueMicrotask(() => child.emit('spawn'));
      return child;
    });
    const decoder = new AirPlay2AacDecoder({
      format: format48000,
      onPcm: vi.fn(),
      resolveToolchain: () => ({ path: 'ffmpeg-test', healthy: true, error: null }),
      spawnProcess: spawnProcess as never,
    });

    await decoder.start();
    await decoder.reset();
    expect(spawnProcess).toHaveBeenCalledTimes(2);
    expect(decoder.writeFrame(Buffer.from([1, 2]))).toBe(true);
    await decoder.stop();
  });
});
