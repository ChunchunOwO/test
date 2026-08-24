import { afterEach, describe, expect, it, vi } from 'vitest';
import { AirPlayRtpReorderBuffer } from './AirPlayRtpReorderBuffer';

describe('AirPlayRtpReorderBuffer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('releases out-of-order packets in sequence', () => {
    const packets: string[] = [];
    const gaps: number[] = [];
    const buffer = new AirPlayRtpReorderBuffer<string>({
      onPacket: (packet) => packets.push(packet),
      onGap: (gap) => gaps.push(gap),
    });

    buffer.push(100, '100');
    buffer.push(102, '102');
    buffer.push(101, '101');

    expect(packets).toEqual(['100', '101', '102']);
    expect(gaps).toEqual([]);
  });

  it('bounds a missing packet and advances after the reorder deadline', () => {
    vi.useFakeTimers();
    const packets: string[] = [];
    const gaps: number[] = [];
    const buffer = new AirPlayRtpReorderBuffer<string>({
      maxWaitMs: 25,
      onPacket: (packet) => packets.push(packet),
      onGap: (gap) => gaps.push(gap),
    });

    buffer.push(200, '200');
    buffer.push(202, '202');
    vi.advanceTimersByTime(25);

    expect(gaps).toEqual([1]);
    expect(packets).toEqual(['200', '202']);
  });

  it('requests missing packets once while retaining the reorder deadline', () => {
    vi.useFakeTimers();
    const packets: string[] = [];
    const missing: Array<[number, number]> = [];
    const buffer = new AirPlayRtpReorderBuffer<string>({
      maxWaitMs: 30,
      onPacket: (packet) => packets.push(packet),
      onGap: () => undefined,
      onMissing: (sequence, count) => missing.push([sequence, count]),
    });

    buffer.push(10, '10');
    buffer.push(13, '13');
    buffer.push(14, '14');
    expect(missing).toEqual([[11, 2]]);
    buffer.push(11, '11');
    buffer.push(12, '12');
    expect(packets).toEqual(['10', '11', '12', '13', '14']);
    expect(missing).toEqual([[11, 2]]);
  });

  it('handles sequence wraparound and drops late duplicates', () => {
    const packets: string[] = [];
    const buffer = new AirPlayRtpReorderBuffer<string>({
      onPacket: (packet) => packets.push(packet),
      onGap: () => undefined,
    });

    buffer.push(0xffff, 'last');
    buffer.push(0, 'first');
    buffer.push(0xffff, 'duplicate');

    expect(packets).toEqual(['last', 'first']);
  });
});
