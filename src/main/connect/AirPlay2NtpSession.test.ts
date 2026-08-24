import { createSocket } from 'node:dgram';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AirPlay2NtpSession,
  createAirPlayNtpRequest,
  ntpToNanoseconds,
  unixNanosecondsToNtp,
} from './AirPlay2NtpSession';

describe('AirPlay2NtpSession', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips NTP timestamps and builds RAOP timing requests', () => {
    const now = 1_800_000_000_123_456_789n;
    const encoded = unixNanosecondsToNtp(now);
    const decoded = ntpToNanoseconds(encoded);
    expect(now - decoded).toBeGreaterThanOrEqual(0n);
    expect(now - decoded).toBeLessThanOrEqual(1n);
    const request = createAirPlayNtpRequest(9, now);
    expect(request).toHaveLength(32);
    expect(request.subarray(0, 4)).toEqual(Buffer.from([0x80, 0xd2, 0x00, 0x09]));
    expect(request.readBigUInt64BE(24)).toBe(encoded);
  });

  it('binds a real timing port and samples a sender response', async () => {
    const sender = createSocket('udp4');
    await new Promise<void>((resolve) => sender.bind(0, '127.0.0.1', resolve));
    const senderAddress = sender.address();
    if (typeof senderAddress === 'string') throw new Error('unexpected sender address');
    let now = 1_800_000_000_000_000_000n;
    const samples: Array<{ delayMs: number; offsetMs: number }> = [];
    const session = new AirPlay2NtpSession({
      nowNanoseconds: () => now,
      pollIntervalMs: 60_000,
      responseTimeoutMs: 1_000,
      onSample: (sample) => samples.push(sample),
    });

    sender.once('message', (request, remote) => {
      const response = Buffer.alloc(32);
      response[0] = 0x80;
      response[1] = 0xd3;
      request.copy(response, 2, 2, 4);
      response.writeBigUInt64BE(request.readBigUInt64BE(24), 8);
      response.writeBigUInt64BE(unixNanosecondsToNtp(now + 2_000_000n), 16);
      response.writeBigUInt64BE(unixNanosecondsToNtp(now + 3_000_000n), 24);
      now += 5_000_000n;
      sender.send(response, remote.port, remote.address);
    });

    const localPort = await session.start('127.0.0.1', senderAddress.port);
    expect(localPort).toBeGreaterThan(0);
    await vi.waitFor(() => expect(samples).toHaveLength(1));
    expect(samples[0]?.delayMs).toBeCloseTo(4, 3);
    expect(samples[0]?.offsetMs).toBeCloseTo(0, 3);

    await session.stop();
    sender.close();
  });
});
