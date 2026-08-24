import { createSocket, type Socket } from 'node:dgram';
import { request as httpRequest } from 'node:http';
import { isIP } from 'node:net';

export type AirPlayDacpCommand = 'play' | 'pause' | 'stop';

export type AirPlayDacpSender = {
  dacpId: string;
  activeRemote: string;
  remoteAddress: string;
  interfaceAddress?: string | null;
};

export type AirPlayDacpTarget = {
  host: string;
  port: number;
};

export type AirPlayDacpRemoteLike = {
  updateSender: (sender: AirPlayDacpSender) => void;
  clear: () => void;
  send: (command: AirPlayDacpCommand) => Promise<boolean>;
};

type AirPlayDacpRemoteDependencies = {
  discoverTarget?: (sender: AirPlayDacpSender) => Promise<AirPlayDacpTarget | null>;
  sendHttpCommand?: (
    target: AirPlayDacpTarget,
    activeRemote: string,
    command: AirPlayDacpCommand,
  ) => Promise<boolean>;
};

export type AirPlayDacpDnsRecord = {
  name: string;
  type: number;
  ptrName?: string;
  srvTarget?: string;
  srvPort?: number;
  address?: string;
};

const mdnsAddress = '224.0.0.251';
const mdnsPort = 5353;
const dacpServiceName = '_dacp._tcp.local';
const dnsTypeA = 1;
const dnsTypePtr = 12;
const dnsTypeSrv = 33;
const discoveryTimeoutMs = 1200;
const commandTimeoutMs = 1500;

const normalizeDnsName = (value: string): string => value.replace(/\.$/u, '').toLowerCase();

const encodeDnsName = (name: string): Buffer => Buffer.concat([
  ...normalizeDnsName(name).split('.').map((label) => {
    const value = Buffer.from(label, 'utf8');
    if (value.length > 63) {
      throw new Error(`DNS label is too long: ${label}`);
    }
    return Buffer.concat([Buffer.from([value.length]), value]);
  }),
  Buffer.from([0]),
]);

export const createAirPlayDacpMdnsQuery = (name = dacpServiceName, type = dnsTypePtr): Buffer => {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(1, 4);
  const question = Buffer.alloc(4);
  question.writeUInt16BE(type, 0);
  // A query sent from an ephemeral port is a legacy mDNS query. Responders must
  // return a unicast answer to that source port, so it can coexist with the
  // long-lived receiver advertiser bound to UDP 5353.
  question.writeUInt16BE(1, 2);
  return Buffer.concat([header, encodeDnsName(name), question]);
};

const readDnsName = (
  packet: Buffer,
  startOffset: number,
  visited = new Set<number>(),
): { name: string; offset: number } | null => {
  if (startOffset < 0 || startOffset >= packet.length || visited.has(startOffset) || visited.size > 16) {
    return null;
  }
  visited.add(startOffset);
  const labels: string[] = [];
  let offset = startOffset;
  let nextOffset = startOffset;
  let jumped = false;

  while (offset < packet.length) {
    const length = packet[offset];
    if (length === 0) {
      if (!jumped) nextOffset = offset + 1;
      return { name: normalizeDnsName(labels.join('.')), offset: nextOffset };
    }
    if ((length & 0xc0) === 0xc0) {
      if (offset + 1 >= packet.length) return null;
      const pointer = ((length & 0x3f) << 8) | packet[offset + 1];
      const suffix = readDnsName(packet, pointer, visited);
      if (!suffix) return null;
      labels.push(suffix.name);
      if (!jumped) nextOffset = offset + 2;
      jumped = true;
      return { name: normalizeDnsName(labels.join('.')), offset: nextOffset };
    }
    if ((length & 0xc0) !== 0 || length > 63 || offset + 1 + length > packet.length) {
      return null;
    }
    offset += 1;
    labels.push(packet.subarray(offset, offset + length).toString('utf8'));
    offset += length;
  }
  return null;
};

export const parseAirPlayDacpMdnsResponse = (packet: Buffer): AirPlayDacpDnsRecord[] => {
  if (packet.length < 12) return [];
  const questionCount = packet.readUInt16BE(4);
  const recordCount = packet.readUInt16BE(6) + packet.readUInt16BE(8) + packet.readUInt16BE(10);
  if (questionCount > 64 || recordCount > 256) return [];
  let offset = 12;

  for (let index = 0; index < questionCount; index += 1) {
    const questionName = readDnsName(packet, offset);
    if (!questionName || questionName.offset + 4 > packet.length) return [];
    offset = questionName.offset + 4;
  }

  const records: AirPlayDacpDnsRecord[] = [];
  for (let index = 0; index < recordCount; index += 1) {
    const recordName = readDnsName(packet, offset);
    if (!recordName || recordName.offset + 10 > packet.length) return records;
    const type = packet.readUInt16BE(recordName.offset);
    const dataLength = packet.readUInt16BE(recordName.offset + 8);
    const dataOffset = recordName.offset + 10;
    const endOffset = dataOffset + dataLength;
    if (endOffset > packet.length) return records;
    const record: AirPlayDacpDnsRecord = { name: recordName.name, type };
    if (type === dnsTypePtr) {
      const ptrName = readDnsName(packet, dataOffset);
      if (ptrName) record.ptrName = ptrName.name;
    } else if (type === dnsTypeSrv && dataLength >= 7) {
      const target = readDnsName(packet, dataOffset + 6);
      if (target) {
        record.srvPort = packet.readUInt16BE(dataOffset + 4);
        record.srvTarget = target.name;
      }
    } else if (type === dnsTypeA && dataLength === 4) {
      record.address = Array.from(packet.subarray(dataOffset, endOffset)).join('.');
    }
    records.push(record);
    offset = endOffset;
  }
  return records;
};

const normalizeDacpId = (value: string): string => {
  const normalized = value.replace(/^0x/iu, '').replace(/^0+/u, '').toLowerCase();
  return normalized || '0';
};

const dacpServiceMatchesId = (serviceName: string, dacpId: string): boolean => {
  const instanceName = normalizeDnsName(serviceName).split(`.${dacpServiceName}`)[0] ?? '';
  const idMatch = /([0-9a-f]+)$/iu.exec(instanceName);
  return Boolean(idMatch?.[1] && normalizeDacpId(idMatch[1]) === dacpId);
};

export const findAirPlayDacpTarget = (
  records: AirPlayDacpDnsRecord[],
  sender: AirPlayDacpSender,
): AirPlayDacpTarget | null => {
  const dacpId = normalizeDacpId(sender.dacpId);
  const instanceNames = new Set(
    records
      .filter((record) => record.type === dnsTypePtr && record.name === dacpServiceName && record.ptrName && dacpServiceMatchesId(record.ptrName, dacpId))
      .map((record) => record.ptrName as string),
  );
  for (const record of records) {
    if (record.type === dnsTypeSrv && record.name.endsWith(`.${dacpServiceName}`) && dacpServiceMatchesId(record.name, dacpId)) {
      instanceNames.add(record.name);
    }
  }
  const srv = records.find((record) =>
    record.type === dnsTypeSrv &&
    instanceNames.has(record.name) &&
    record.srvTarget &&
    record.srvPort &&
    record.srvPort > 0,
  );
  if (!srv?.srvTarget || !srv.srvPort) return null;
  const address = records.find((record) => record.type === dnsTypeA && record.name === srv.srvTarget)?.address;
  return { host: address ?? sender.remoteAddress, port: srv.srvPort };
};

const closeSocket = async (socket: Socket): Promise<void> => new Promise((resolve) => {
  try {
    socket.close(() => resolve());
  } catch {
    resolve();
  }
});

export const discoverAirPlayDacpTarget = async (sender: AirPlayDacpSender): Promise<AirPlayDacpTarget | null> => {
  const socket = createSocket({ type: 'udp4', reuseAddr: true });
  const records: AirPlayDacpDnsRecord[] = [];
  let settled = false;
  let timer: NodeJS.Timeout | null = null;
  const finish = async (target: AirPlayDacpTarget | null, resolve: (value: AirPlayDacpTarget | null) => void): Promise<void> => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    await closeSocket(socket);
    resolve(target);
  };

  return new Promise<AirPlayDacpTarget | null>((resolve) => {
    socket.on('message', (packet) => {
      records.push(...parseAirPlayDacpMdnsResponse(packet));
      if (records.length > 1024) records.splice(0, records.length - 1024);
      const target = findAirPlayDacpTarget(records, sender);
      if (target) void finish(target, resolve);
    });
    socket.once('error', () => void finish(null, resolve));
    socket.bind(0, () => {
      try {
        if (sender.interfaceAddress && isIP(sender.interfaceAddress) === 4) {
          socket.setMulticastInterface(sender.interfaceAddress);
        }
        socket.setMulticastTTL(255);
        socket.send(createAirPlayDacpMdnsQuery(), mdnsPort, mdnsAddress, (error) => {
          if (error) void finish(null, resolve);
        });
      } catch {
        void finish(null, resolve);
      }
    });
    timer = setTimeout(() => void finish(null, resolve), discoveryTimeoutMs);
    timer.unref?.();
  });
};

export const sendAirPlayDacpHttpCommand = async (
  target: AirPlayDacpTarget,
  activeRemote: string,
  command: AirPlayDacpCommand,
): Promise<boolean> => new Promise((resolve) => {
  let settled = false;
  const finish = (value: boolean): void => {
    if (settled) return;
    settled = true;
    resolve(value);
  };
  const request = httpRequest({
    host: target.host,
    port: target.port,
    path: `/ctrl-int/1/${command}`,
    method: 'GET',
    headers: {
      'Active-Remote': activeRemote,
      Connection: 'close',
    },
  }, (response) => {
    response.resume();
    response.once('aborted', () => finish(false));
    response.once('error', () => finish(false));
    response.once('end', () => finish(Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 400)));
  });
  request.setTimeout(commandTimeoutMs, () => request.destroy(new Error('DACP command timed out.')));
  request.once('error', () => finish(false));
  request.end();
});

export class AirPlayDacpRemote implements AirPlayDacpRemoteLike {
  private sender: AirPlayDacpSender | null = null;
  private target: AirPlayDacpTarget | null = null;
  private discovery: Promise<AirPlayDacpTarget | null> | null = null;
  private readonly discoverTarget: (sender: AirPlayDacpSender) => Promise<AirPlayDacpTarget | null>;
  private readonly sendHttpCommand: (
    target: AirPlayDacpTarget,
    activeRemote: string,
    command: AirPlayDacpCommand,
  ) => Promise<boolean>;

  constructor(dependencies: AirPlayDacpRemoteDependencies = {}) {
    this.discoverTarget = dependencies.discoverTarget ?? discoverAirPlayDacpTarget;
    this.sendHttpCommand = dependencies.sendHttpCommand ?? sendAirPlayDacpHttpCommand;
  }

  updateSender(sender: AirPlayDacpSender): void {
    const identity = `${sender.dacpId}\0${sender.activeRemote}\0${sender.remoteAddress}\0${sender.interfaceAddress ?? ''}`;
    const currentIdentity = this.sender
      ? `${this.sender.dacpId}\0${this.sender.activeRemote}\0${this.sender.remoteAddress}\0${this.sender.interfaceAddress ?? ''}`
      : null;
    if (identity === currentIdentity) return;
    this.target = null;
    this.discovery = null;
    this.sender = { ...sender };
  }

  clear(): void {
    this.sender = null;
    this.target = null;
    this.discovery = null;
  }

  async send(command: AirPlayDacpCommand): Promise<boolean> {
    const sender = this.sender;
    if (!sender) return false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const target = this.target ?? await this.resolveTarget(sender);
      if (!target || this.sender !== sender) return false;
      if (await this.sendHttpCommand(target, sender.activeRemote, command)) return true;
      this.target = null;
    }
    return false;
  }

  private async resolveTarget(sender: AirPlayDacpSender): Promise<AirPlayDacpTarget | null> {
    this.discovery ??= this.discoverTarget(sender).finally(() => {
      this.discovery = null;
    });
    const target = await this.discovery;
    if (this.sender === sender && target) this.target = target;
    return target;
  }
}
