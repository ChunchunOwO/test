import { randomBytes } from 'node:crypto';
import { createSocket, type RemoteInfo, type Socket } from 'node:dgram';

const ptpEventPort = 319;
const ptpGeneralPort = 320;
const ptpHeaderBytes = 34;
const ptpTimestampBytes = 10;
const ptpVersion = 2;
const ptpSyncMessageType = 0;
const ptpFollowUpMessageType = 8;
const ptpAnnounceMessageType = 11;
const defaultSampleMaxAgeNanoseconds = 2_000_000_000n;
const initialClockSettlingNanoseconds = 1_000_000_000n;
const negativeOffsetClampNanoseconds = -2_500_000n;

export type AirPlay2PtpPacket = {
  messageType: number;
  sequenceId: number;
  sourceClockIdentity: string;
  correctionNanoseconds: bigint;
  masterTimeNanoseconds: bigint | null;
  grandmasterClockIdentity: string | null;
  grandmasterPriority1: number | null;
  grandmasterPriority2: number | null;
};

export type AirPlay2PtpClockSample = {
  sourceAddress: string;
  sourceClockIdentity: string;
  grandmasterClockIdentity: string;
  sequenceId: number;
  localReceiveNanoseconds: bigint;
  masterTimeNanoseconds: bigint;
  localToMasterOffsetNanoseconds: bigint;
  smoothedOffsetNanoseconds: bigint;
  pairedSync: boolean;
};

export type AirPlay2PtpClockStatus = {
  running: boolean;
  masterClockIdentity: string | null;
  sourceAddress: string | null;
  lastSampleAtNanoseconds: bigint | null;
  smoothedOffsetNanoseconds: bigint | null;
  sampleCount: number;
};

export type AirPlay2PtpClockOptions = {
  nowNanoseconds?: () => bigint;
  onDiagnostic?: (message: string) => void;
  onSample?: (sample: AirPlay2PtpClockSample) => void;
  sampleMaxAgeNanoseconds?: bigint;
  eventPort?: number;
  generalPort?: number;
};

export type AirPlay2PtpClockLike = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  setPeerAddresses: (addresses: string[]) => void;
  getStatus: () => AirPlay2PtpClockStatus;
  localTimeForMasterTime: (masterTimeNanoseconds: bigint, timelineId?: bigint | string | null) => bigint | null;
};

type PendingSync = {
  correctionNanoseconds: bigint;
  receivedAtNanoseconds: bigint;
};

const createDefaultNowNanoseconds = (): (() => bigint) => {
  const wallClockBaseNanoseconds = BigInt(Date.now()) * 1_000_000n;
  const monotonicBaseNanoseconds = process.hrtime.bigint();
  return () => wallClockBaseNanoseconds + (process.hrtime.bigint() - monotonicBaseNanoseconds);
};

export const createAirPlay2PtpWakeAnnouncement = (
  clockIdentity: Buffer,
  sequenceId: number,
  priority1: number,
  priority2: number,
): Buffer => {
  if (clockIdentity.length !== 8) throw new Error('PTP clock identity must contain 8 bytes.');
  const packet = Buffer.alloc(64);
  packet[0] = 0x1b; // Apple PTP transport-specific profile, Announce message.
  packet[1] = ptpVersion;
  packet.writeUInt16BE(packet.length, 2);
  packet.writeUInt16BE(0x0408, 6);
  clockIdentity.copy(packet, 20);
  packet.writeUInt16BE(32776, 28);
  packet.writeUInt16BE(sequenceId & 0xffff, 30);
  packet[32] = 0x05;
  packet[33] = 0xfe;
  packet.writeUInt16BE(37, 44);
  packet[47] = priority1 & 0xff;
  packet.writeUInt32BE(0xf8fe436a, 48);
  packet[52] = priority2 & 0xff;
  clockIdentity.copy(packet, 53);
  packet[63] = 160;
  return packet;
};

const normalizeAddress = (address: string): string =>
  address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;

const readClockIdentity = (packet: Buffer, offset: number): string | null => {
  if (offset < 0 || offset + 8 > packet.length) return null;
  return packet.subarray(offset, offset + 8).toString('hex');
};

const readPtpTimestampNanoseconds = (packet: Buffer, offset: number): bigint | null => {
  if (offset < 0 || offset + ptpTimestampBytes > packet.length) return null;
  const seconds = (BigInt(packet.readUInt16BE(offset)) << 32n) | BigInt(packet.readUInt32BE(offset + 2));
  const nanoseconds = BigInt(packet.readUInt32BE(offset + 6));
  if (nanoseconds >= 1_000_000_000n) return null;
  return seconds * 1_000_000_000n + nanoseconds;
};

export const parseAirPlay2PtpPacket = (packet: Buffer): AirPlay2PtpPacket | null => {
  if (packet.length < ptpHeaderBytes || (packet[1] & 0x0f) !== ptpVersion) return null;
  const messageLength = packet.readUInt16BE(2);
  if (messageLength < ptpHeaderBytes || messageLength > packet.length) return null;
  const messageType = packet[0] & 0x0f;
  const sourceClockIdentity = readClockIdentity(packet, 20);
  if (!sourceClockIdentity) return null;
  const correctionNanoseconds = packet.readBigInt64BE(8) / 65_536n;
  const sequenceId = packet.readUInt16BE(30);

  if (messageType === ptpFollowUpMessageType) {
    const masterTimeNanoseconds = readPtpTimestampNanoseconds(packet, ptpHeaderBytes);
    if (masterTimeNanoseconds === null) return null;
    return {
      messageType,
      sequenceId,
      sourceClockIdentity,
      correctionNanoseconds,
      masterTimeNanoseconds,
      grandmasterClockIdentity: null,
      grandmasterPriority1: null,
      grandmasterPriority2: null,
    };
  }

  if (messageType === ptpAnnounceMessageType) {
    const grandmasterClockIdentity = readClockIdentity(packet, 53);
    if (messageLength < 64 || !grandmasterClockIdentity) return null;
    return {
      messageType,
      sequenceId,
      sourceClockIdentity,
      correctionNanoseconds,
      masterTimeNanoseconds: null,
      grandmasterClockIdentity,
      grandmasterPriority1: packet[47],
      grandmasterPriority2: packet[52],
    };
  }

  if (messageType !== ptpSyncMessageType) return null;
  return {
    messageType,
    sequenceId,
    sourceClockIdentity,
    correctionNanoseconds,
    masterTimeNanoseconds: null,
    grandmasterClockIdentity: null,
    grandmasterPriority1: null,
    grandmasterPriority2: null,
  };
};

const closeSocket = async (socket: Socket | null): Promise<void> => {
  if (!socket) return;
  await new Promise<void>((resolve) => {
    try {
      socket.close(() => resolve());
    } catch {
      resolve();
    }
  });
};

const bindSocket = (socket: Socket, port: number): Promise<void> =>
  new Promise<void>((resolve, reject) => {
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
    socket.bind(port, '0.0.0.0');
  });

export class AirPlay2PtpClock implements AirPlay2PtpClockLike {
  private readonly nowNanoseconds: () => bigint;
  private readonly onDiagnostic: (message: string) => void;
  private readonly onSample: (sample: AirPlay2PtpClockSample) => void;
  private readonly sampleMaxAgeNanoseconds: bigint;
  private readonly eventPort: number;
  private readonly generalPort: number;
  private eventSocket: Socket | null = null;
  private generalSocket: Socket | null = null;
  private readonly peerAddresses = new Set<string>();
  private readonly pendingSyncs = new Map<string, PendingSync>();
  private readonly grandmasterBySource = new Map<string, string>();
  private readonly announceCountBySource = new Map<string, number>();
  private readonly wakeupTimers = new Set<NodeJS.Timeout>();
  private readonly localClockIdentity = (() => {
    const identity = randomBytes(8);
    identity[0] = (identity[0] & 0xfe) | 0x02;
    return identity;
  })();
  private wakeupSequenceId = 0;
  private mastershipStartedAtNanoseconds: bigint | null = null;
  private status: AirPlay2PtpClockStatus = {
    running: false,
    masterClockIdentity: null,
    sourceAddress: null,
    lastSampleAtNanoseconds: null,
    smoothedOffsetNanoseconds: null,
    sampleCount: 0,
  };

  constructor(options: AirPlay2PtpClockOptions = {}) {
    this.nowNanoseconds = options.nowNanoseconds ?? createDefaultNowNanoseconds();
    this.onDiagnostic = options.onDiagnostic ?? (() => undefined);
    this.onSample = options.onSample ?? (() => undefined);
    this.sampleMaxAgeNanoseconds = options.sampleMaxAgeNanoseconds ?? defaultSampleMaxAgeNanoseconds;
    this.eventPort = options.eventPort ?? ptpEventPort;
    this.generalPort = options.generalPort ?? ptpGeneralPort;
  }

  async start(): Promise<void> {
    await this.stop();
    const eventSocket = createSocket({ type: 'udp4', reuseAddr: false });
    const generalSocket = createSocket({ type: 'udp4', reuseAddr: false });
    this.eventSocket = eventSocket;
    this.generalSocket = generalSocket;
    eventSocket.on('message', this.handleEventMessage);
    eventSocket.on('error', this.handleEventError);
    generalSocket.on('message', this.handleGeneralMessage);
    generalSocket.on('error', this.handleGeneralError);
    try {
      await Promise.all([
        bindSocket(eventSocket, this.eventPort),
        bindSocket(generalSocket, this.generalPort),
      ]);
      this.status = { ...this.status, running: true };
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    const eventSocket = this.eventSocket;
    const generalSocket = this.generalSocket;
    this.eventSocket = null;
    this.generalSocket = null;
    if (eventSocket) {
      eventSocket.removeListener('message', this.handleEventMessage);
      eventSocket.removeListener('error', this.handleEventError);
    }
    if (generalSocket) {
      generalSocket.removeListener('message', this.handleGeneralMessage);
      generalSocket.removeListener('error', this.handleGeneralError);
    }
    this.pendingSyncs.clear();
    this.grandmasterBySource.clear();
    this.announceCountBySource.clear();
    for (const timer of this.wakeupTimers) clearTimeout(timer);
    this.wakeupTimers.clear();
    this.mastershipStartedAtNanoseconds = null;
    this.status = {
      running: false,
      masterClockIdentity: null,
      sourceAddress: null,
      lastSampleAtNanoseconds: null,
      smoothedOffsetNanoseconds: null,
      sampleCount: 0,
    };
    await Promise.all([closeSocket(eventSocket), closeSocket(generalSocket)]);
  }

  setPeerAddresses(addresses: string[]): void {
    this.peerAddresses.clear();
    for (const address of addresses) {
      const normalized = normalizeAddress(address.trim());
      if (normalized) this.peerAddresses.add(normalized);
    }
  }

  getStatus(): AirPlay2PtpClockStatus {
    return { ...this.status };
  }

  localTimeForMasterTime(masterTimeNanoseconds: bigint, timelineId: bigint | string | null = null): bigint | null {
    const status = this.status;
    if (
      !status.running ||
      status.smoothedOffsetNanoseconds === null ||
      status.lastSampleAtNanoseconds === null ||
      this.nowNanoseconds() - status.lastSampleAtNanoseconds > this.sampleMaxAgeNanoseconds
    ) {
      return null;
    }
    if (timelineId !== null) {
      const expected = typeof timelineId === 'bigint'
        ? timelineId.toString(16).padStart(16, '0')
        : timelineId.toLowerCase().replace(/[^a-f0-9]/gu, '').padStart(16, '0');
      if (status.masterClockIdentity !== expected) return null;
    }
    return masterTimeNanoseconds - status.smoothedOffsetNanoseconds;
  }

  ingestPacket(
    packet: Buffer,
    sourceAddress: string,
    destinationPort: number,
    receivedAtNanoseconds = this.nowNanoseconds(),
    sourcePort: number | null = null,
  ): boolean {
    const normalizedAddress = normalizeAddress(sourceAddress);
    if (
      this.peerAddresses.size === 0
      || !this.peerAddresses.has(normalizedAddress)
      || (sourcePort !== null && sourcePort !== destinationPort)
    ) return false;
    const parsed = parseAirPlay2PtpPacket(packet);
    if (!parsed) return false;

    const key = `${parsed.sourceClockIdentity}:${parsed.sequenceId}`;
    if (parsed.messageType === ptpAnnounceMessageType && destinationPort === this.generalPort) {
      this.grandmasterBySource.set(
        parsed.sourceClockIdentity,
        parsed.grandmasterClockIdentity ?? parsed.sourceClockIdentity,
      );
      const announceCount = (this.announceCountBySource.get(parsed.sourceClockIdentity) ?? 0) + 1;
      this.announceCountBySource.set(parsed.sourceClockIdentity, announceCount);
      if (announceCount === 3) {
        this.sendWakeupAnnouncementSequence(
          normalizedAddress,
          parsed.grandmasterPriority1 ?? 248,
          parsed.grandmasterPriority2 ?? 248,
        );
      }
      return true;
    }
    if (parsed.messageType === ptpSyncMessageType && destinationPort === this.eventPort) {
      this.pendingSyncs.set(key, {
        correctionNanoseconds: parsed.correctionNanoseconds,
        receivedAtNanoseconds,
      });
      while (this.pendingSyncs.size > 64) {
        const oldest = this.pendingSyncs.keys().next().value as string | undefined;
        if (!oldest) break;
        this.pendingSyncs.delete(oldest);
      }
      return true;
    }
    if (
      parsed.messageType !== ptpFollowUpMessageType ||
      destinationPort !== this.generalPort ||
      parsed.masterTimeNanoseconds === null
    ) {
      return false;
    }

    const sync = this.pendingSyncs.get(key);
    this.pendingSyncs.delete(key);
    this.announceCountBySource.set(parsed.sourceClockIdentity, 0);
    const localReceiveNanoseconds = sync?.receivedAtNanoseconds ?? receivedAtNanoseconds;
    const correctedMasterTime = parsed.masterTimeNanoseconds
      + parsed.correctionNanoseconds
      + (sync?.correctionNanoseconds ?? 0n);
    const rawOffset = correctedMasterTime - localReceiveNanoseconds;
    const grandmasterClockIdentity = this.grandmasterBySource.get(parsed.sourceClockIdentity)
      ?? parsed.sourceClockIdentity;
    const previousMaster = this.status.masterClockIdentity;
    const previousSmoothed = previousMaster === grandmasterClockIdentity
      ? this.status.smoothedOffsetNanoseconds
      : null;
    if (previousSmoothed === null || previousMaster !== grandmasterClockIdentity) {
      this.mastershipStartedAtNanoseconds = receivedAtNanoseconds;
    }
    const mastershipAge = this.mastershipStartedAtNanoseconds === null
      ? 0n
      : receivedAtNanoseconds - this.mastershipStartedAtNanoseconds;
    let smoothedOffset = rawOffset;
    if (previousSmoothed !== null) {
      const jitter = rawOffset - previousSmoothed;
      if (jitter >= 0n) {
        smoothedOffset = mastershipAge < initialClockSettlingNanoseconds
          ? rawOffset
          : previousSmoothed + jitter / 16n;
      } else if (mastershipAge < initialClockSettlingNanoseconds) {
        smoothedOffset = previousSmoothed;
      } else {
        const clampedJitter = jitter < negativeOffsetClampNanoseconds
          ? negativeOffsetClampNanoseconds
          : jitter;
        smoothedOffset = previousSmoothed + clampedJitter / 256n;
      }
    }
    const sample: AirPlay2PtpClockSample = {
      sourceAddress: normalizedAddress,
      sourceClockIdentity: parsed.sourceClockIdentity,
      grandmasterClockIdentity,
      sequenceId: parsed.sequenceId,
      localReceiveNanoseconds,
      masterTimeNanoseconds: correctedMasterTime,
      localToMasterOffsetNanoseconds: rawOffset,
      smoothedOffsetNanoseconds: smoothedOffset,
      pairedSync: Boolean(sync),
    };
    this.status = {
      running: this.status.running,
      masterClockIdentity: grandmasterClockIdentity,
      sourceAddress: normalizedAddress,
      lastSampleAtNanoseconds: receivedAtNanoseconds,
      smoothedOffsetNanoseconds: smoothedOffset,
      sampleCount: this.status.sampleCount + 1,
    };
    this.onSample(sample);
    return true;
  }

  private sendWakeupAnnouncementSequence(sourceAddress: string, sourcePriority1: number, sourcePriority2: number): void {
    const socket = this.generalSocket;
    if (!socket) return;
    const firstPriority = sourcePriority1 > 2 ? sourcePriority1 - 1 : 248;
    const secondPriority = sourcePriority1 < 254 ? sourcePriority1 + 1 : 250;
    const send = (priority1: number): void => {
      if (this.generalSocket !== socket) return;
      const packet = createAirPlay2PtpWakeAnnouncement(
        this.localClockIdentity,
        this.wakeupSequenceId++,
        priority1,
        sourcePriority2,
      );
      socket.send(packet, this.generalPort, sourceAddress, (error) => {
        if (error) this.onDiagnostic(`PTP wake announcement failed for ${sourceAddress}:${this.generalPort}: ${error.message}`);
      });
    };
    send(firstPriority);
    const timer = setTimeout(() => {
      this.wakeupTimers.delete(timer);
      send(secondPriority);
    }, 150);
    timer.unref?.();
    this.wakeupTimers.add(timer);
    this.onDiagnostic(`PTP clock at ${sourceAddress} announced without follow-up; sent wake sequence.`);
  }

  private readonly handleEventMessage = (packet: Buffer, remote: RemoteInfo): void => {
    this.ingestPacket(packet, remote.address, this.eventPort, this.nowNanoseconds(), remote.port);
  };

  private readonly handleGeneralMessage = (packet: Buffer, remote: RemoteInfo): void => {
    this.ingestPacket(packet, remote.address, this.generalPort, this.nowNanoseconds(), remote.port);
  };

  private readonly handleEventError = (error: Error): void => {
    this.onDiagnostic(`PTP event socket error: ${error.message}`);
  };

  private readonly handleGeneralError = (error: Error): void => {
    this.onDiagnostic(`PTP general socket error: ${error.message}`);
  };
}
