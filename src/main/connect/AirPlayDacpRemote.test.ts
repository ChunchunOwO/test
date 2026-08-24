import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AirPlayDacpRemote,
  createAirPlayDacpMdnsQuery,
  findAirPlayDacpTarget,
  parseAirPlayDacpMdnsResponse,
  sendAirPlayDacpHttpCommand,
  type AirPlayDacpSender,
} from './AirPlayDacpRemote';

const sockets: Array<{ close: (callback?: () => void) => void }> = [];

afterEach(async () => {
  await Promise.all(sockets.splice(0).map((socket) => new Promise<void>((resolve) => socket.close(() => resolve()))));
});

const encodeName = (name: string): Buffer => Buffer.concat([
  ...name.split('.').map((label) => {
    const value = Buffer.from(label, 'utf8');
    return Buffer.concat([Buffer.from([value.length]), value]);
  }),
  Buffer.from([0]),
]);

const record = (name: string, type: number, data: Buffer): Buffer => {
  const header = Buffer.alloc(10);
  header.writeUInt16BE(type, 0);
  header.writeUInt16BE(1, 2);
  header.writeUInt32BE(120, 4);
  header.writeUInt16BE(data.length, 8);
  return Buffer.concat([encodeName(name), header, data]);
};

const dacpResponse = (instanceId = 'A1B2C3D4E5F60708'): Buffer => {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0x8400, 2);
  header.writeUInt16BE(3, 6);
  const instance = `iTunes_Ctrl_${instanceId}._dacp._tcp.local`;
  const host = 'iPhone.local';
  const srv = Buffer.alloc(6);
  srv.writeUInt16BE(3689, 4);
  return Buffer.concat([
    header,
    record('_dacp._tcp.local', 12, encodeName(instance)),
    record(instance, 33, Buffer.concat([srv, encodeName(host)])),
    record(host, 1, Buffer.from([192, 168, 1, 25])),
  ]);
};

const sender: AirPlayDacpSender = {
  dacpId: 'A1B2C3D4E5F60708',
  activeRemote: '1234567890',
  remoteAddress: '192.168.1.25',
  interfaceAddress: '192.168.1.89',
};

describe('AirPlayDacpRemote', () => {
  it('creates a DNS-SD PTR query for the DACP service', () => {
    const query = createAirPlayDacpMdnsQuery();
    expect(query.readUInt16BE(4)).toBe(1);
    expect(query.includes(Buffer.from('_dacp'))).toBe(true);
    expect(query.readUInt16BE(query.length - 4)).toBe(12);
  });

  it('parses PTR, SRV and A records from a DACP response', () => {
    const records = parseAirPlayDacpMdnsResponse(dacpResponse());
    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: '_dacp._tcp.local',
        type: 12,
        ptrName: 'itunes_ctrl_a1b2c3d4e5f60708._dacp._tcp.local',
      }),
      expect.objectContaining({
        type: 33,
        srvPort: 3689,
        srvTarget: 'iphone.local',
      }),
      expect.objectContaining({ name: 'iphone.local', type: 1, address: '192.168.1.25' }),
    ]));
  });

  it('matches a DACP service whose DNS instance retains leading zeroes omitted by the sender header', () => {
    const records = parseAirPlayDacpMdnsResponse(dacpResponse('0000000000A1B2C3'));
    expect(findAirPlayDacpTarget(records, {
      ...sender,
      dacpId: 'A1B2C3',
    })).toEqual({ host: '192.168.1.25', port: 3689 });
  });

  it('discovers once, caches the target, and sends authenticated commands', async () => {
    const discoverTarget = vi.fn(async () => ({ host: '192.168.1.25', port: 3689 }));
    const sendHttpCommand = vi.fn(async () => true);
    const remote = new AirPlayDacpRemote({ discoverTarget, sendHttpCommand });
    remote.updateSender(sender);

    await expect(remote.send('pause')).resolves.toBe(true);
    await expect(remote.send('play')).resolves.toBe(true);

    expect(discoverTarget).toHaveBeenCalledTimes(1);
    expect(sendHttpCommand).toHaveBeenNthCalledWith(1, { host: '192.168.1.25', port: 3689 }, '1234567890', 'pause');
    expect(sendHttpCommand).toHaveBeenNthCalledWith(2, { host: '192.168.1.25', port: 3689 }, '1234567890', 'play');
  });

  it('invalidates a failed endpoint and rediscovers once', async () => {
    const discoverTarget = vi.fn()
      .mockResolvedValueOnce({ host: '192.168.1.25', port: 3689 })
      .mockResolvedValueOnce({ host: '192.168.1.25', port: 3690 });
    const sendHttpCommand = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const remote = new AirPlayDacpRemote({ discoverTarget, sendHttpCommand });
    remote.updateSender(sender);

    await expect(remote.send('stop')).resolves.toBe(true);
    expect(discoverTarget).toHaveBeenCalledTimes(2);
    expect(sendHttpCommand).toHaveBeenLastCalledWith({ host: '192.168.1.25', port: 3690 }, '1234567890', 'stop');
  });

  it('sends the DACP path and Active-Remote header over HTTP', async () => {
    const received: { path?: string; activeRemote?: string } = {};
    const server = createServer((request, response) => {
      received.path = request.url;
      const activeRemote = request.headers['active-remote'];
      received.activeRemote = Array.isArray(activeRemote) ? activeRemote[0] : activeRemote;
      response.writeHead(204).end();
    });
    sockets.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server did not bind');

    await expect(sendAirPlayDacpHttpCommand(
      { host: '127.0.0.1', port: address.port },
      '1234567890',
      'pause',
    )).resolves.toBe(true);
    expect(received).toEqual({ path: '/ctrl-int/1/pause', activeRemote: '1234567890' });
  });

  it('does not send after session state is cleared', async () => {
    const sendHttpCommand = vi.fn(async () => true);
    const remote = new AirPlayDacpRemote({
      discoverTarget: async () => ({ host: '192.168.1.25', port: 3689 }),
      sendHttpCommand,
    });
    remote.updateSender(sender);
    remote.clear();

    await expect(remote.send('play')).resolves.toBe(false);
    expect(sendHttpCommand).not.toHaveBeenCalled();
  });
});
