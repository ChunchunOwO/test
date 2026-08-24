import { createSocket, type RemoteInfo, type Socket as UdpSocket } from 'node:dgram';
import { createServer, type Server, type Socket as TcpSocket } from 'node:net';
import {
  parseAirPlayRtpSyncPacket,
  type AirPlay2AudioTransportLike,
  type AirPlay2RtpSyncPacket,
  type AirPlay2UdpPorts,
} from './AirPlay2UdpTransport';

export type AirPlay2BufferedTransportOptions = {
  onData: (packet: Buffer, remote: RemoteInfo, retransmitted: boolean) => void;
  onDiagnostic?: (message: string) => void;
  onSync?: (sync: AirPlay2RtpSyncPacket, remote: RemoteInfo) => void;
};

const maxBufferedFrameBytes = 65_535;

const closeUdpSocket = async (socket: UdpSocket | null): Promise<void> => {
  if (!socket) return;
  await new Promise<void>((resolve) => {
    try {
      socket.close(() => resolve());
    } catch {
      resolve();
    }
  });
};

const closeTcpServer = async (server: Server | null): Promise<void> => {
  if (!server) return;
  await new Promise<void>((resolve) => {
    try {
      server.close(() => resolve());
    } catch {
      resolve();
    }
  });
};

const tcpRemoteInfo = (socket: TcpSocket): RemoteInfo => ({
  address: socket.remoteAddress ?? 'unknown',
  family: socket.remoteFamily === 'IPv6' ? 'IPv6' : 'IPv4',
  port: socket.remotePort ?? 0,
  size: 0,
});

export class AirPlay2BufferedTransport implements AirPlay2AudioTransportLike {
  private readonly onData: AirPlay2BufferedTransportOptions['onData'];
  private readonly onDiagnostic: (message: string) => void;
  private readonly onSync: NonNullable<AirPlay2BufferedTransportOptions['onSync']>;
  private controlSocket: UdpSocket | null = null;
  private dataServer: Server | null = null;
  private readonly dataSockets = new Set<TcpSocket>();
  private readonly socketBuffers = new Map<TcpSocket, Buffer>();
  private readonly socketListeners = new Map<TcpSocket, {
    close: () => void;
    data: (chunk: Buffer) => void;
    error: (error: Error) => void;
  }>();

  constructor(options: AirPlay2BufferedTransportOptions) {
    this.onData = options.onData;
    this.onDiagnostic = options.onDiagnostic ?? (() => undefined);
    this.onSync = options.onSync ?? (() => undefined);
  }

  async start(): Promise<AirPlay2UdpPorts> {
    await this.stop();
    const controlSocket = createSocket({ type: 'udp4', reuseAddr: true });
    const dataServer = createServer(this.handleDataConnection);
    this.controlSocket = controlSocket;
    this.dataServer = dataServer;
    controlSocket.on('message', this.handleControlMessage);
    controlSocket.on('error', this.handleControlError);
    dataServer.on('error', this.handleServerError);

    try {
      const [controlPort, dataPort] = await Promise.all([
        this.bindControl(controlSocket),
        this.listenData(dataServer),
      ]);
      return { controlPort, dataPort };
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  configureRemoteControl(_address: string | null, _port: number | null): void {
    // Buffered audio is delivered over reliable TCP and does not request RTP retransmission.
  }

  requestResend(_firstMissingSequenceNumber: number, _count: number): boolean {
    return false;
  }

  async stop(): Promise<void> {
    const controlSocket = this.controlSocket;
    const dataServer = this.dataServer;
    this.controlSocket = null;
    this.dataServer = null;
    if (controlSocket) {
      controlSocket.removeListener('message', this.handleControlMessage);
      controlSocket.removeListener('error', this.handleControlError);
    }
    if (dataServer) {
      dataServer.removeListener('connection', this.handleDataConnection);
      dataServer.removeListener('error', this.handleServerError);
    }
    for (const socket of this.dataSockets) {
      this.detachDataSocket(socket);
      socket.destroy();
    }
    this.dataSockets.clear();
    this.socketBuffers.clear();
    this.socketListeners.clear();
    await Promise.all([closeUdpSocket(controlSocket), closeTcpServer(dataServer)]);
  }

  private readonly handleControlMessage = (packet: Buffer, remote: RemoteInfo): void => {
    const sync = parseAirPlayRtpSyncPacket(packet);
    if (sync) {
      this.onSync(sync, remote);
      return;
    }
    const type = packet.length >= 2 ? packet[1] & 0x7f : -1;
    this.onDiagnostic(`unhandled buffered control packet type=${type} bytes=${packet.length} from ${remote.address}:${remote.port}`);
  };

  private readonly handleControlError = (error: Error): void => {
    this.onDiagnostic(`buffered control socket error: ${error.message}`);
  };

  private readonly handleServerError = (error: Error): void => {
    this.onDiagnostic(`buffered data server error: ${error.message}`);
  };

  private readonly handleDataConnection = (socket: TcpSocket): void => {
    this.dataSockets.add(socket);
    this.socketBuffers.set(socket, Buffer.alloc(0));
    const listeners = {
      data: (chunk: Buffer) => this.appendData(socket, chunk),
      error: (error: Error) => this.onDiagnostic(`buffered data socket error: ${error.message}`),
      close: () => this.detachDataSocket(socket),
    };
    this.socketListeners.set(socket, listeners);
    socket.on('data', listeners.data);
    socket.on('error', listeners.error);
    socket.on('close', listeners.close);
  };

  private appendData(socket: TcpSocket, chunk: Buffer): void {
    let buffer = Buffer.concat([this.socketBuffers.get(socket) ?? Buffer.alloc(0), chunk]);
    while (buffer.length >= 2) {
      const frameLength = buffer.readUInt16BE(0);
      if (frameLength < 2 || frameLength > maxBufferedFrameBytes) {
        this.onDiagnostic(`invalid buffered RTP frame length=${frameLength} from ${socket.remoteAddress ?? 'unknown'}:${socket.remotePort ?? 0}`);
        socket.destroy();
        return;
      }
      if (buffer.length < frameLength) break;
      const packet = buffer.subarray(2, frameLength);
      buffer = buffer.subarray(frameLength);
      this.onData(packet, tcpRemoteInfo(socket), false);
    }
    this.socketBuffers.set(socket, buffer);
  }

  private detachDataSocket(socket: TcpSocket): void {
    const listeners = this.socketListeners.get(socket);
    if (listeners) {
      socket.removeListener('data', listeners.data);
      socket.removeListener('error', listeners.error);
      socket.removeListener('close', listeners.close);
    }
    this.dataSockets.delete(socket);
    this.socketBuffers.delete(socket);
    this.socketListeners.delete(socket);
  }

  private bindControl(socket: UdpSocket): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const onError = (error: Error): void => {
        socket.off('listening', onListening);
        reject(error);
      };
      const onListening = (): void => {
        socket.off('error', onError);
        const address = socket.address();
        if (typeof address === 'string') reject(new Error('Buffered control socket did not bind to UDP.'));
        else resolve(address.port);
      };
      socket.once('error', onError);
      socket.once('listening', onListening);
      socket.bind(0);
    });
  }

  private listenData(server: Server): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const onError = (error: Error): void => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = (): void => {
        server.off('error', onError);
        const address = server.address();
        if (!address || typeof address === 'string') reject(new Error('Buffered data server did not bind to TCP.'));
        else resolve(address.port);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(0);
    });
  }
}
