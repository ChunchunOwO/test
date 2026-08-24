import { connect } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { AirPlay2BufferedTransport } from './AirPlay2BufferedTransport';

describe('AirPlay2BufferedTransport', () => {
  it('accepts length-prefixed RTP frames over a real TCP data socket', async () => {
    const onData = vi.fn();
    const transport = new AirPlay2BufferedTransport({ onData });
    const ports = await transport.start();
    const socket = connect({ host: '127.0.0.1', port: ports.dataPort });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });

    const first = Buffer.from('first-buffered-packet');
    const second = Buffer.from('second-buffered-packet');
    const frame = (packet: Buffer): Buffer => {
      const length = Buffer.alloc(2);
      length.writeUInt16BE(packet.length + 2);
      return Buffer.concat([length, packet]);
    };
    const firstFrame = frame(first);
    socket.write(firstFrame.subarray(0, 5));
    socket.write(Buffer.concat([firstFrame.subarray(5), frame(second)]));

    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(2));
    expect(onData.mock.calls[0]?.[0]).toEqual(first);
    expect(onData.mock.calls[1]?.[0]).toEqual(second);
    expect(onData.mock.calls[0]?.[2]).toBe(false);

    socket.destroy();
    await transport.stop();
  });
});
