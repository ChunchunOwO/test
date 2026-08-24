import { createSocket, type RemoteInfo, type Socket } from 'node:dgram';

export type AirPlay2RtpSyncPacket = {
  protocol: 'ntp' | 'ptp';
  currentRtpTimestamp: number;
  nextRtpTimestamp: number;
  remoteNtpTimestamp: bigint | null;
  remoteMonotonicNanoseconds: bigint | null;
  clockIdentity: Buffer | null;
};

export type AirPlay2UdpTransportOptions = {
  onData: (packet: Buffer, remote: RemoteInfo, retransmitted: boolean) => void;
  onDiagnostic?: (message: string) => void;
  onSync?: (sync: AirPlay2RtpSyncPacket, remote: RemoteInfo) => void;
};

export type AirPlay2UdpPorts = {
  controlPort: number;
  dataPort: number;
};

export type AirPlay2AudioTransportLike = {
  start: () => Promise<AirPlay2UdpPorts>;
  configureRemoteControl: (address: string | null, port: number | null) => void;
  requestResend: (firstMissingSequenceNumber: number, count: number) => boolean;
  stop: () => Promise<void>;
};

export const createAirPlayResendRequest = (
  requestSequenceNumber: number,
  firstMissingSequenceNumber: number,
  count: number,
): Buffer => {
  const packet = Buffer.alloc(8);
  packet[0] = 0x80;
  packet[1] = 0xd5;
  packet.writeUInt16BE(requestSequenceNumber & 0xffff, 2);
  packet.writeUInt16BE(firstMissingSequenceNumber & 0xffff, 4);
  packet.writeUInt16BE(Math.max(1, Math.min(0xffff, Math.round(count))), 6);
  return packet;
};

export const parseAirPlayRtpSyncPacket = (packet: Buffer): AirPlay2RtpSyncPacket | null => {
  const type = packet.length >= 2 ? packet[1] & 0x7f : -1;
  if (type === 0x54 && packet.length >= 20) {
    return {
      protocol: 'ntp',
      currentRtpTimestamp: packet.readUInt32BE(4),
      remoteNtpTimestamp: packet.readBigUInt64BE(8),
      remoteMonotonicNanoseconds: null,
      nextRtpTimestamp: packet.readUInt32BE(16),
      clockIdentity: null,
    };
  }
  if (type !== 0x57 || packet.length < 28) {
    return null;
  }
  return {
    protocol: 'ptp',
    currentRtpTimestamp: packet.readUInt32BE(4),
    remoteNtpTimestamp: null,
    remoteMonotonicNanoseconds: packet.readBigUInt64BE(8),
    nextRtpTimestamp: packet.readUInt32BE(16),
    clockIdentity: Buffer.from(packet.subarray(20, 28)),
  };
};

const closeSocket = async (socket: Socket | null): Promise<void> => {
  if (!socket) {
    return;
  }
  await new Promise<void>((resolve) => {
    try {
      socket.close(() => resolve());
    } catch {
      resolve();
    }
  });
};

export class AirPlay2UdpTransport implements AirPlay2AudioTransportLike {
  private readonly onData: AirPlay2UdpTransportOptions['onData'];
  private readonly onDiagnostic: (message: string) => void;
  private readonly onSync: NonNullable<AirPlay2UdpTransportOptions['onSync']>;
  private controlSocket: Socket | null = null;
  private dataSocket: Socket | null = null;
  private remoteControlAddress: string | null = null;
  private remoteControlPort = 0;
  private resendRequestSequence = 0;

  constructor(options: AirPlay2UdpTransportOptions) {
    this.onData = options.onData;
    this.onDiagnostic = options.onDiagnostic ?? (() => undefined);
    this.onSync = options.onSync ?? (() => undefined);
  }

  async start(): Promise<AirPlay2UdpPorts> {
    await this.stop();
    const controlSocket = createSocket({ type: 'udp4', reuseAddr: true });
    const dataSocket = createSocket({ type: 'udp4', reuseAddr: true });
    this.controlSocket = controlSocket;
    this.dataSocket = dataSocket;
    controlSocket.on('message', this.handleControlMessage);
    controlSocket.on('error', this.handleControlError);
    dataSocket.on('message', this.handleDataMessage);
    dataSocket.on('error', this.handleDataError);

    try {
      const [controlPort, dataPort] = await Promise.all([
        this.bind(controlSocket),
        this.bind(dataSocket),
      ]);
      return { controlPort, dataPort };
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  configureRemoteControl(address: string | null, port: number | null): void {
    this.remoteControlAddress = address || null;
    this.remoteControlPort = Number.isInteger(port) && Number(port) > 0 && Number(port) <= 65_535
      ? Number(port)
      : 0;
  }

  requestResend(firstMissingSequenceNumber: number, count: number): boolean {
    const socket = this.controlSocket;
    const address = this.remoteControlAddress;
    if (!socket || !address || this.remoteControlPort <= 0 || count <= 0) {
      return false;
    }
    const packet = createAirPlayResendRequest(
      this.resendRequestSequence,
      firstMissingSequenceNumber,
      count,
    );
    this.resendRequestSequence = (this.resendRequestSequence + 1) & 0xffff;
    socket.send(packet, this.remoteControlPort, address, (error) => {
      if (error) {
        this.onDiagnostic(`resend request failed: ${error.message}`);
      }
    });
    return true;
  }

  async stop(): Promise<void> {
    const controlSocket = this.controlSocket;
    const dataSocket = this.dataSocket;
    this.controlSocket = null;
    this.dataSocket = null;
    this.remoteControlAddress = null;
    this.remoteControlPort = 0;
    this.resendRequestSequence = 0;
    if (controlSocket) {
      controlSocket.removeListener('message', this.handleControlMessage);
      controlSocket.removeListener('error', this.handleControlError);
    }
    if (dataSocket) {
      dataSocket.removeListener('message', this.handleDataMessage);
      dataSocket.removeListener('error', this.handleDataError);
    }
    await Promise.all([closeSocket(controlSocket), closeSocket(dataSocket)]);
  }

  private readonly handleControlMessage = (packet: Buffer, remote: RemoteInfo): void => {
    const type = packet.length >= 2 ? packet[1] & 0x7f : -1;
    if (type === 0x56 && packet.length >= 16) {
      this.onData(packet.subarray(4), remote, true);
      return;
    }
    const sync = parseAirPlayRtpSyncPacket(packet);
    if (sync) {
      this.onSync(sync, remote);
      return;
    }
    this.onDiagnostic(`unhandled control packet type=${type} bytes=${packet.length} from ${remote.address}:${remote.port}`);
  };

  private readonly handleDataMessage = (packet: Buffer, remote: RemoteInfo): void => {
    this.onData(packet, remote, false);
  };

  private readonly handleControlError = (error: Error): void => {
    this.onDiagnostic(`control socket error: ${error.message}`);
  };

  private readonly handleDataError = (error: Error): void => {
    this.onDiagnostic(`data socket error: ${error.message}`);
  };

  private bind(socket: Socket): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const onError = (error: Error): void => {
        socket.off('listening', onListening);
        reject(error);
      };
      const onListening = (): void => {
        socket.off('error', onError);
        const address = socket.address();
        if (typeof address === 'string') {
          reject(new Error('AirPlay UDP socket did not bind to an IP port.'));
          return;
        }
        resolve(address.port);
      };
      socket.once('error', onError);
      socket.once('listening', onListening);
      socket.bind(0);
    });
  }
}
