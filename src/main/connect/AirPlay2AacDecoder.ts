import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { Readable, Writable } from 'node:stream';

export type AirPlay2AacFormat = {
  audioFormat: number;
  sampleRate: 44_100 | 48_000;
  channels: 2;
};

export type AirPlay2AacDecoderLike = {
  writeFrame: (frame: Buffer) => boolean;
  pauseOutput: () => void;
  resumeOutput: () => void;
  reset: () => Promise<void>;
  stop: () => Promise<void>;
};

type AirPlay2AacChildProcess = EventEmitter & {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  killed: boolean;
  kill: (signal?: NodeJS.Signals) => boolean;
};

export type AirPlay2AacDecoderOptions = {
  format: AirPlay2AacFormat;
  onPcm: (chunk: Buffer) => void;
  onDiagnostic?: (message: string) => void;
  onFailure?: (error: Error) => void;
  maxPendingInputBytes?: number;
  stopTimeoutMs?: number;
  resolveToolchain?: () => PromiseLike<{ path: string; healthy: boolean; error: string | null }> | { path: string; healthy: boolean; error: string | null };
  spawnProcess?: (file: string, args: string[]) => AirPlay2AacChildProcess;
};

const aacFrequencyIndex = new Map<number, number>([
  [44_100, 4],
  [48_000, 3],
]);

const defaultMaxPendingInputBytes = 4 * 1024 * 1024;
const defaultStopTimeoutMs = 1_000;

export const createAirPlay2AacAdtsFrame = (payload: Buffer, format: AirPlay2AacFormat): Buffer => {
  const frequencyIndex = aacFrequencyIndex.get(format.sampleRate);
  if (frequencyIndex === undefined) {
    throw new Error(`Unsupported AAC-LC sample rate ${format.sampleRate}.`);
  }
  const frameLength = payload.length + 7;
  if (frameLength > 0x1fff) {
    throw new Error(`AAC-LC frame is too large for ADTS (${payload.length} bytes).`);
  }

  const channelConfiguration = format.channels;
  const header = Buffer.allocUnsafe(7);
  header[0] = 0xff;
  header[1] = 0xf1; // MPEG-4, layer 0, no CRC.
  header[2] = (1 << 6) | (frequencyIndex << 2) | (channelConfiguration >> 2); // AAC-LC profile.
  header[3] = ((channelConfiguration & 0x03) << 6) | (frameLength >> 11);
  header[4] = (frameLength >> 3) & 0xff;
  header[5] = ((frameLength & 0x07) << 5) | 0x1f;
  header[6] = 0xfc; // Variable bitrate fullness and one raw data block.
  return Buffer.concat([header, payload], frameLength);
};

const defaultSpawnProcess = (file: string, args: string[]): AirPlay2AacChildProcess =>
  spawn(file, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }) as AirPlay2AacChildProcess;

const defaultResolveToolchain: NonNullable<AirPlay2AacDecoderOptions['resolveToolchain']> = async () => {
  const { resolveFfmpegToolchain } = await import('../audio/FfmpegToolchain');
  return resolveFfmpegToolchain();
};

export class AirPlay2AacDecoder implements AirPlay2AacDecoderLike {
  private readonly format: AirPlay2AacFormat;
  private readonly onPcm: (chunk: Buffer) => void;
  private readonly onDiagnostic: (message: string) => void;
  private readonly onFailure: (error: Error) => void;
  private readonly maxPendingInputBytes: number;
  private readonly stopTimeoutMs: number;
  private readonly resolveToolchain: NonNullable<AirPlay2AacDecoderOptions['resolveToolchain']>;
  private readonly spawnProcess: NonNullable<AirPlay2AacDecoderOptions['spawnProcess']>;
  private child: AirPlay2AacChildProcess | null = null;
  private pendingInput: Buffer[] = [];
  private pendingInputBytes = 0;
  private inputBackpressured = false;
  private pcmCarry: Buffer | null = null;
  private stopping = false;
  private stopped = false;
  private readonly handleStdoutData = (chunk: Buffer | Uint8Array): void => {
    if (this.stopping || this.stopped) return;
    const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    const pcm = this.pcmCarry ? Buffer.concat([this.pcmCarry, incoming]) : incoming;
    const alignedLength = pcm.length - (pcm.length % 4);
    this.pcmCarry = alignedLength === pcm.length ? null : Buffer.from(pcm.subarray(alignedLength));
    if (alignedLength > 0) this.onPcm(pcm.subarray(0, alignedLength));
  };
  private readonly handleStderrData = (chunk: Buffer | Uint8Array): void => {
    const message = Buffer.from(chunk).toString('utf8').trim();
    if (message) this.onDiagnostic(`AAC decoder: ${message.slice(0, 2_048)}`);
  };
  private readonly handleStdinDrain = (): void => {
    this.inputBackpressured = false;
    this.flushPendingInput();
  };
  private readonly handleError = (error: Error): void => {
    if (!this.stopping && !this.stopped) this.onFailure(error);
  };
  private readonly handleExit = (code: number | null, signal: NodeJS.Signals | null): void => {
    if (!this.stopping && !this.stopped) {
      this.onFailure(new Error(`AAC decoder exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'}).`));
    }
  };

  constructor(options: AirPlay2AacDecoderOptions) {
    this.format = options.format;
    this.onPcm = options.onPcm;
    this.onDiagnostic = options.onDiagnostic ?? (() => undefined);
    this.onFailure = options.onFailure ?? (() => undefined);
    this.maxPendingInputBytes = options.maxPendingInputBytes ?? defaultMaxPendingInputBytes;
    this.stopTimeoutMs = options.stopTimeoutMs ?? defaultStopTimeoutMs;
    this.resolveToolchain = options.resolveToolchain ?? defaultResolveToolchain;
    this.spawnProcess = options.spawnProcess ?? defaultSpawnProcess;
  }

  async start(): Promise<void> {
    if (this.child) return;
    if (this.stopped) throw new Error('AAC decoder cannot be restarted after stop.');
    const toolchain = await this.resolveToolchain();
    if (!toolchain.healthy) {
      throw new Error(`FFmpeg is unavailable for AAC-LC decoding: ${toolchain.error ?? 'health check failed'}.`);
    }
    const args = [
      '-hide_banner', '-loglevel', 'warning',
      '-probesize', '32', '-analyzeduration', '0', '-flags', 'low_delay',
      '-f', 'aac', '-i', 'pipe:0',
      '-map', '0:a:0', '-vn', '-sn', '-dn',
      '-acodec', 'pcm_f32le', '-f', 'f32le',
      '-ar', String(this.format.sampleRate), '-ac', String(this.format.channels),
      '-flush_packets', '1', 'pipe:1',
    ];
    const child = this.spawnProcess(toolchain.path, args);
    this.child = child;
    child.stdout.on('data', this.handleStdoutData);
    child.stderr.on('data', this.handleStderrData);
    child.stdin.on('drain', this.handleStdinDrain);
    child.on('error', this.handleError);
    child.on('exit', this.handleExit);

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const onSpawn = (): void => {
        if (settled) return;
        settled = true;
        child.removeListener('error', onStartError);
        resolve();
      };
      const onStartError = (error: Error): void => {
        if (settled) return;
        settled = true;
        child.removeListener('spawn', onSpawn);
        reject(error);
      };
      child.once('spawn', onSpawn);
      child.once('error', onStartError);
    }).catch(async (error) => {
      await this.stop();
      throw error;
    });
  }

  writeFrame(frame: Buffer): boolean {
    const child = this.child;
    if (!child || this.stopping || this.stopped || child.stdin.destroyed || child.stdin.writableEnded) return false;
    const adtsFrame = createAirPlay2AacAdtsFrame(frame, this.format);
    if (this.pendingInputBytes + adtsFrame.length > this.maxPendingInputBytes) {
      this.onDiagnostic(`AAC decoder input queue full; rejected ${frame.length}-byte frame.`);
      return false;
    }
    if (this.inputBackpressured || this.pendingInput.length > 0) {
      this.pendingInput.push(adtsFrame);
      this.pendingInputBytes += adtsFrame.length;
      return true;
    }
    this.inputBackpressured = !child.stdin.write(adtsFrame);
    return true;
  }

  pauseOutput(): void {
    this.child?.stdout.pause();
  }

  resumeOutput(): void {
    this.child?.stdout.resume();
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    await this.stopProcess();
    this.stopped = true;
  }

  async reset(): Promise<void> {
    if (this.stopped) throw new Error('AAC decoder cannot be reset after stop.');
    await this.stopProcess();
    await this.start();
  }

  private async stopProcess(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    this.child = null;
    this.pendingInput = [];
    this.pendingInputBytes = 0;
    this.inputBackpressured = false;
    this.pcmCarry = null;
    if (!child) {
      this.stopping = false;
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        if (!child.killed) child.kill();
        finish();
      }, this.stopTimeoutMs);
      timer.unref?.();
      child.once('exit', finish);
      if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end();
      else finish();
    });

    child.stdout.removeListener('data', this.handleStdoutData);
    child.stderr.removeListener('data', this.handleStderrData);
    child.stdin.removeListener('drain', this.handleStdinDrain);
    child.removeListener('error', this.handleError);
    child.removeListener('exit', this.handleExit);
    this.stopping = false;
  }

  private flushPendingInput(): void {
    const child = this.child;
    if (!child || this.inputBackpressured || this.stopping || this.stopped) return;
    while (this.pendingInput.length > 0) {
      const frame = this.pendingInput.shift();
      if (!frame) break;
      this.pendingInputBytes -= frame.length;
      if (!child.stdin.write(frame)) {
        this.inputBackpressured = true;
        break;
      }
    }
  }
}

export const createDefaultAirPlay2AacDecoder = async (
  format: AirPlay2AacFormat,
  handlers: Pick<AirPlay2AacDecoderOptions, 'onPcm' | 'onDiagnostic' | 'onFailure'>,
): Promise<AirPlay2AacDecoderLike> => {
  const decoder = new AirPlay2AacDecoder({ format, ...handlers });
  await decoder.start();
  return decoder;
};
