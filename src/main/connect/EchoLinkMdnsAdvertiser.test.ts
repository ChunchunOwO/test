import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createSocket = vi.hoisted(() => vi.fn());

vi.mock('node:dgram', () => ({ createSocket }));

import { EchoLinkMdnsAdvertiser } from './EchoLinkMdnsAdvertiser';

class FakeSocket extends EventEmitter {
  readonly addMembership = vi.fn();
  readonly setMulticastInterface = vi.fn();
  readonly setMulticastTTL = vi.fn();
  readonly send = vi.fn((
    _packet: Buffer,
    _offset: number,
    _length: number,
    _port: number,
    _address: string,
    callback: (error?: Error | null) => void,
  ) => callback(null));
  readonly bind = vi.fn(() => queueMicrotask(() => this.emit('listening')));
  readonly close = vi.fn((callback?: () => void) => callback?.());
}

const encodeName = (name: string): Buffer => Buffer.concat([
  ...name.split('.').filter(Boolean).map((part) => {
    const body = Buffer.from(part, 'utf8');
    return Buffer.concat([Buffer.from([body.byteLength]), body]);
  }),
  Buffer.from([0]),
]);

const queryFor = (name: string): Buffer => Buffer.concat([
  Buffer.from([0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]),
  encodeName(name),
  Buffer.from([0, 12, 0, 1]),
]);

describe('EchoLinkMdnsAdvertiser', () => {
  let socket: FakeSocket;
  let advertiser: EchoLinkMdnsAdvertiser;

  beforeEach(() => {
    vi.useFakeTimers();
    socket = new FakeSocket();
    createSocket.mockReturnValue(socket);
    advertiser = new EchoLinkMdnsAdvertiser();
  });

  afterEach(async () => {
    await advertiser.stop(false);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('answers relevant queries and keeps a runtime UDP error boundary', async () => {
    await advertiser.start({
      name: 'Living Room ECHO',
      deviceId: 'pc-0123456789abcdef',
      address: '192.168.1.20',
      port: 26789,
      version: 2,
    });
    expect(socket.send).toHaveBeenCalledTimes(1);

    socket.emit('message', queryFor('_echo-link._tcp.local'));
    await vi.advanceTimersByTimeAsync(20);
    expect(socket.send).toHaveBeenCalledTimes(2);

    socket.emit('message', queryFor('_unrelated._tcp.local'));
    await vi.advanceTimersByTimeAsync(20);
    expect(socket.send).toHaveBeenCalledTimes(2);
    expect(() => socket.emit('error', new Error('late_udp_error'))).not.toThrow();

    await advertiser.stop(false);
    expect(socket.listenerCount('message')).toBe(0);
    expect(socket.listenerCount('error')).toBe(0);
  });
});
