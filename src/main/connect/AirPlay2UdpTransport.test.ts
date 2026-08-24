import { createSocket } from 'node:dgram';
import { describe, expect, it, vi } from 'vitest';
import {
  AirPlay2UdpTransport,
  createAirPlayResendRequest,
  parseAirPlayRtpSyncPacket,
} from './AirPlay2UdpTransport';

describe('AirPlay2UdpTransport', () => {
  it('encodes resend requests and parses RTP sync packets', () => {
    expect(createAirPlayResendRequest(3, 0xfffe, 2)).toEqual(
      Buffer.from([0x80, 0xd5, 0x00, 0x03, 0xff, 0xfe, 0x00, 0x02]),
    );
    const sync = Buffer.alloc(20);
    sync[0] = 0x80;
    sync[1] = 0xd4;
    sync.writeUInt32BE(123, 4);
    sync.writeBigUInt64BE(456n, 8);
    sync.writeUInt32BE(789, 16);
    expect(parseAirPlayRtpSyncPacket(sync)).toEqual({
      protocol: 'ntp',
      currentRtpTimestamp: 123,
      remoteNtpTimestamp: 456n,
      remoteMonotonicNanoseconds: null,
      nextRtpTimestamp: 789,
      clockIdentity: null,
    });
    const ptpSync = Buffer.alloc(28);
    ptpSync[0] = 0x80;
    ptpSync[1] = 0xd7;
    ptpSync.writeUInt32BE(321, 4);
    ptpSync.writeBigUInt64BE(654n, 8);
    ptpSync.writeUInt32BE(987, 16);
    Buffer.from('0102030405060708', 'hex').copy(ptpSync, 20);
    expect(parseAirPlayRtpSyncPacket(ptpSync)).toEqual({
      protocol: 'ptp',
      currentRtpTimestamp: 321,
      remoteNtpTimestamp: null,
      remoteMonotonicNanoseconds: 654n,
      nextRtpTimestamp: 987,
      clockIdentity: Buffer.from('0102030405060708', 'hex'),
    });
  });

  it('requests missing packets and unwraps retransmitted RTP', async () => {
    const sender = createSocket('udp4');
    await new Promise<void>((resolve) => sender.bind(0, '127.0.0.1', resolve));
    const senderAddress = sender.address();
    if (typeof senderAddress === 'string') throw new Error('unexpected sender address');
    const onData = vi.fn();
    const transport = new AirPlay2UdpTransport({ onData });
    const ports = await transport.start();
    transport.configureRemoteControl('127.0.0.1', senderAddress.port);

    const requestPromise = new Promise<Buffer>((resolve) => sender.once('message', resolve));
    expect(transport.requestResend(100, 2)).toBe(true);
    await expect(requestPromise).resolves.toEqual(
      Buffer.from([0x80, 0xd5, 0x00, 0x00, 0x00, 0x64, 0x00, 0x02]),
    );

    const rtp = Buffer.alloc(12);
    rtp[0] = 0x80;
    rtp[1] = 0x60;
    rtp.writeUInt16BE(100, 2);
    const resent = Buffer.concat([Buffer.from([0x80, 0xd6, 0, 0]), rtp]);
    sender.send(resent, ports.controlPort, '127.0.0.1');
    await vi.waitFor(() => expect(onData).toHaveBeenCalledTimes(1));
    expect(onData.mock.calls[0]?.[0]).toEqual(rtp);
    expect(onData.mock.calls[0]?.[2]).toBe(true);

    await transport.stop();
    sender.close();
  });
});
