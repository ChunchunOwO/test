import { createSocket, type RemoteInfo, type Socket } from 'node:dgram';

const ntpEpochOffsetSeconds = 2_208_988_800n;
const nanosecondsPerSecond = 1_000_000_000n;
const ntpFractionScale = 0x1_0000_0000n;
const defaultPollIntervalMs = 3_000;
const defaultResponseTimeoutMs = 500;

export type AirPlay2NtpSample = {
  delayMs: number;
  offsetMs: number;
  remoteAddress: string;
  remotePort: number;
};

export type AirPlay2NtpSessionOptions = {
  nowNanoseconds?: () => bigint;
  onDiagnostic?: (message: string) => void;
  onSample?: (sample: AirPlay2NtpSample) => void;
  pollIntervalMs?: number;
  responseTimeoutMs?: number;
};

export const unixNanosecondsToNtp = (unixNanoseconds: bigint): bigint => {
  const seconds = unixNanoseconds / nanosecondsPerSecond + ntpEpochOffsetSeconds;
  const fraction = ((unixNanoseconds % nanosecondsPerSecond) * ntpFractionScale) / nanosecondsPerSecond;
  return (seconds << 32n) | fraction;
};

export const ntpToNanoseconds = (timestamp: bigint): bigint => {
  const seconds = timestamp >> 32n;
  const fraction = timestamp & 0xffff_ffffn;
  return (seconds - ntpEpochOffsetSeconds) * nanosecondsPerSecond
    + (fraction * nanosecondsPerSecond) / ntpFractionScale;
};

export const createAirPlayNtpRequest = (
  sequenceNumber: number,
  sentAtNanoseconds: bigint,
  previousClientReference: bigint | null = null,
  previousReceivedAtNanoseconds: bigint | null = null,
): Buffer => {
  const request = Buffer.alloc(32);
  request[0] = 0x80;
  request[1] = 0xd2;
  request.writeUInt16BE(sequenceNumber & 0xffff, 2);
  if (previousClientReference !== null) {
    request.writeBigUInt64BE(previousClientReference, 8);
  }
  if (previousReceivedAtNanoseconds !== null) {
    request.writeBigUInt64BE(unixNanosecondsToNtp(previousReceivedAtNanoseconds), 16);
  }
  request.writeBigUInt64BE(unixNanosecondsToNtp(sentAtNanoseconds), 24);
  return request;
};

const defaultNowNanoseconds = (): bigint => BigInt(Date.now()) * 1_000_000n;

export class AirPlay2NtpSession {
  private readonly nowNanoseconds: () => bigint;
  private readonly onDiagnostic: (message: string) => void;
  private readonly onSample: (sample: AirPlay2NtpSample) => void;
  private readonly pollIntervalMs: number;
  private readonly responseTimeoutMs: number;
  private socket: Socket | null = null;
  private remoteAddress: string | null = null;
  private remotePort = 0;
  private pollTimer: NodeJS.Timeout | null = null;
  private responseTimer: NodeJS.Timeout | null = null;
  private sequenceNumber = 7;
  private previousClientReference: bigint | null = null;
  private previousReceivedAtNanoseconds: bigint | null = null;
  private consecutiveTimeouts = 0;

  constructor(options: AirPlay2NtpSessionOptions = {}) {
    this.nowNanoseconds = options.nowNanoseconds ?? defaultNowNanoseconds;
    this.onDiagnostic = options.onDiagnostic ?? (() => undefined);
    this.onSample = options.onSample ?? (() => undefined);
    this.pollIntervalMs = Math.max(100, Math.round(options.pollIntervalMs ?? defaultPollIntervalMs));
    this.responseTimeoutMs = Math.max(50, Math.round(options.responseTimeoutMs ?? defaultResponseTimeoutMs));
  }

  async start(remoteAddress: string, remotePort: number): Promise<number> {
    await this.stop();
    if (!remoteAddress || !Number.isInteger(remotePort) || remotePort <= 0 || remotePort > 65_535) {
      throw new Error('AirPlay timing endpoint is invalid.');
    }

    const socket = createSocket('udp4');
    this.socket = socket;
    this.remoteAddress = remoteAddress;
    this.remotePort = remotePort;
    socket.on('message', this.handleMessage);
    socket.on('error', this.handleError);
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => {
          socket.off('listening', onListening);
          reject(error);
        };
        const onListening = (): void => {
          socket.off('error', onError);
          resolve();
        };
        socket.once('error', onError);
        socket.once('listening', onListening);
        socket.bind(0);
      });
    } catch (error) {
      await this.stop();
      throw error;
    }

    const address = socket.address();
    if (typeof address === 'string') {
      await this.stop();
      throw new Error('AirPlay timing socket did not bind to UDP.');
    }
    this.sendRequest();
    return address.port;
  }

  async stop(): Promise<void> {
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    this.remoteAddress = null;
    this.remotePort = 0;
    this.previousClientReference = null;
    this.previousReceivedAtNanoseconds = null;
    this.consecutiveTimeouts = 0;
    if (!socket) {
      return;
    }
    socket.removeListener('message', this.handleMessage);
    socket.removeListener('error', this.handleError);
    await new Promise<void>((resolve) => {
      try {
        socket.close(() => resolve());
      } catch {
        resolve();
      }
    });
  }

  private readonly handleMessage = (message: Buffer, remote: RemoteInfo): void => {
    if (message.length < 32 || (message[1] & 0x7f) !== 0x53) {
      this.onDiagnostic(`ignored timing packet type=${message[1] ?? -1} bytes=${message.length}`);
      return;
    }
    if (
      (this.remoteAddress && remote.address !== this.remoteAddress) ||
      (this.remotePort > 0 && remote.port !== this.remotePort)
    ) {
      this.onDiagnostic(`ignored timing response from ${remote.address}:${remote.port}`);
      return;
    }

    if (this.responseTimer) {
      clearTimeout(this.responseTimer);
      this.responseTimer = null;
    }
    const receivedAt = this.nowNanoseconds();
    const t0 = ntpToNanoseconds(message.readBigUInt64BE(8));
    const t1 = ntpToNanoseconds(message.readBigUInt64BE(16));
    const t2 = ntpToNanoseconds(message.readBigUInt64BE(24));
    const delay = (receivedAt - t0) - (t2 - t1);
    const offset = ((t1 - t0) + (t2 - receivedAt)) / 2n;
    this.previousClientReference = message.readBigUInt64BE(24);
    this.previousReceivedAtNanoseconds = receivedAt;
    this.consecutiveTimeouts = 0;
    this.onSample({
      delayMs: Number(delay) / 1_000_000,
      offsetMs: Number(offset) / 1_000_000,
      remoteAddress: remote.address,
      remotePort: remote.port,
    });
  };

  private readonly handleError = (error: Error): void => {
    this.onDiagnostic(`timing socket error: ${error.message}`);
  };

  private sendRequest(): void {
    const socket = this.socket;
    const remoteAddress = this.remoteAddress;
    if (!socket || !remoteAddress || this.remotePort <= 0) {
      return;
    }
    const request = createAirPlayNtpRequest(
      this.sequenceNumber,
      this.nowNanoseconds(),
      this.previousClientReference,
      this.previousReceivedAtNanoseconds,
    );
    this.sequenceNumber = (this.sequenceNumber + 1) & 0xffff;
    socket.send(request, this.remotePort, remoteAddress, (error) => {
      if (error) {
        this.onDiagnostic(`timing request failed: ${error.message}`);
      }
    });
    this.responseTimer = setTimeout(() => {
      this.responseTimer = null;
      this.consecutiveTimeouts += 1;
      if (this.consecutiveTimeouts === 1 || this.consecutiveTimeouts % 5 === 0) {
        this.onDiagnostic(`timing response timeout (${this.consecutiveTimeouts} consecutive)`);
      }
    }, this.responseTimeoutMs);
    this.responseTimer.unref?.();
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      this.sendRequest();
    }, this.pollIntervalMs);
    this.pollTimer.unref?.();
  }

  private clearTimers(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.responseTimer) {
      clearTimeout(this.responseTimer);
      this.responseTimer = null;
    }
  }
}
