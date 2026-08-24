import { describe, expect, it, vi } from 'vitest';
import {
  AirPlay2PtpClock,
  createAirPlay2PtpWakeAnnouncement,
  parseAirPlay2PtpPacket,
} from './AirPlay2PtpClock';

const sourceClockIdentity = Buffer.from('1020304050607080', 'hex');
const grandmasterClockIdentity = Buffer.from('8877665544332211', 'hex');

const createPtpHeader = (
  messageType: number,
  messageLength: number,
  sequenceId: number,
  correctionNanoseconds = 0n,
): Buffer => {
  const packet = Buffer.alloc(messageLength);
  packet[0] = 0x10 | messageType;
  packet[1] = 0x02;
  packet.writeUInt16BE(messageLength, 2);
  packet.writeBigInt64BE(correctionNanoseconds * 65_536n, 8);
  sourceClockIdentity.copy(packet, 20);
  packet.writeUInt16BE(1, 28);
  packet.writeUInt16BE(sequenceId, 30);
  return packet;
};

const writePtpTimestamp = (packet: Buffer, offset: number, nanoseconds: bigint): void => {
  const seconds = nanoseconds / 1_000_000_000n;
  const fraction = nanoseconds % 1_000_000_000n;
  packet.writeUInt16BE(Number((seconds >> 32n) & 0xffffn), offset);
  packet.writeUInt32BE(Number(seconds & 0xffff_ffffn), offset + 2);
  packet.writeUInt32BE(Number(fraction), offset + 6);
};

const createAnnounce = (sequenceId: number): Buffer => {
  const packet = createPtpHeader(11, 64, sequenceId);
  grandmasterClockIdentity.copy(packet, 53);
  return packet;
};

const createSync = (sequenceId: number, correctionNanoseconds = 0n): Buffer =>
  createPtpHeader(0, 44, sequenceId, correctionNanoseconds);

const createFollowUp = (
  sequenceId: number,
  masterTimeNanoseconds: bigint,
  correctionNanoseconds = 0n,
): Buffer => {
  const packet = createPtpHeader(8, 44, sequenceId, correctionNanoseconds);
  writePtpTimestamp(packet, 34, masterTimeNanoseconds);
  return packet;
};

describe('AirPlay2PtpClock', () => {
  it('parses Apple-profile announce, sync, and follow-up messages', () => {
    const masterTime = 1_800_000_000_123_456_789n;
    expect(parseAirPlay2PtpPacket(createAnnounce(7))).toEqual(expect.objectContaining({
      messageType: 11,
      sequenceId: 7,
      sourceClockIdentity: sourceClockIdentity.toString('hex'),
      grandmasterClockIdentity: grandmasterClockIdentity.toString('hex'),
    }));
    expect(parseAirPlay2PtpPacket(createSync(8, 25n))).toEqual(expect.objectContaining({
      messageType: 0,
      correctionNanoseconds: 25n,
    }));
    expect(parseAirPlay2PtpPacket(createFollowUp(8, masterTime, 75n))).toEqual(expect.objectContaining({
      messageType: 8,
      masterTimeNanoseconds: masterTime,
      correctionNanoseconds: 75n,
    }));
  });

  it('builds a standards-shaped two-step wake announcement for a stalled source clock', () => {
    const identity = Buffer.from('0211223344556677', 'hex');
    const packet = createAirPlay2PtpWakeAnnouncement(identity, 0x1234, 247, 248);
    expect(packet).toHaveLength(64);
    expect(packet.readUInt16BE(2)).toBe(64);
    expect(packet.readUInt16BE(28)).toBe(32776);
    expect(packet.readUInt16BE(30)).toBe(0x1234);
    expect(parseAirPlay2PtpPacket(packet)).toEqual(expect.objectContaining({
      messageType: 11,
      sourceClockIdentity: identity.toString('hex'),
      grandmasterClockIdentity: identity.toString('hex'),
      grandmasterPriority1: 247,
      grandmasterPriority2: 248,
    }));
  });

  it('pairs sync receipt time with follow-up master time and converts an anchor to local time', async () => {
    const masterTime = 1_800_000_000_123_456_789n;
    const localSyncReceipt = masterTime - 2_000_000n;
    let now = localSyncReceipt;
    const onSample = vi.fn();
    const clock = new AirPlay2PtpClock({ nowNanoseconds: () => now, onSample, eventPort: 0, generalPort: 0 });
    await clock.start();
    try {
      clock.setPeerAddresses(['192.168.1.44']);
      expect(clock.ingestPacket(createAnnounce(1), '192.168.1.44', 0, now)).toBe(true);
      expect(clock.ingestPacket(createSync(2, 25n), '192.168.1.44', 0, localSyncReceipt)).toBe(true);
      now += 500_000n;
      expect(clock.ingestPacket(createFollowUp(2, masterTime, 75n), '192.168.1.44', 0, now)).toBe(true);

      expect(onSample).toHaveBeenCalledWith(expect.objectContaining({
        grandmasterClockIdentity: grandmasterClockIdentity.toString('hex'),
        localToMasterOffsetNanoseconds: 2_000_100n,
        pairedSync: true,
      }));
      expect(clock.localTimeForMasterTime(
        masterTime + 1_000_000_000n,
        BigInt(`0x${grandmasterClockIdentity.toString('hex')}`),
      )).toBe(localSyncReceipt + 1_000_000_000n - 100n);
      expect(clock.getStatus()).toEqual(expect.objectContaining({
        running: true,
        sampleCount: 1,
        masterClockIdentity: grandmasterClockIdentity.toString('hex'),
      }));
    } finally {
      await clock.stop();
    }
  });

  it('settles quickly on positive offsets while clamping delayed negative samples', async () => {
    const baseMasterTime = 1_800_000_000_000_000_000n;
    let now = baseMasterTime - 2_000_000n;
    const clock = new AirPlay2PtpClock({ nowNanoseconds: () => now, eventPort: 0, generalPort: 0 });
    await clock.start();
    try {
      clock.setPeerAddresses(['192.168.1.44']);
      clock.ingestPacket(createAnnounce(1), '192.168.1.44', 0, now);

      clock.ingestPacket(createSync(2), '192.168.1.44', 0, baseMasterTime - 2_000_000n);
      clock.ingestPacket(createFollowUp(2, baseMasterTime), '192.168.1.44', 0, now);
      expect(clock.getStatus().smoothedOffsetNanoseconds).toBe(2_000_000n);

      now += 100_000_000n;
      clock.ingestPacket(createSync(3), '192.168.1.44', 0, baseMasterTime + 99_000_000n);
      clock.ingestPacket(createFollowUp(3, baseMasterTime + 100_000_000n), '192.168.1.44', 0, now);
      expect(clock.getStatus().smoothedOffsetNanoseconds).toBe(2_000_000n);

      now += 1_100_000_000n;
      clock.ingestPacket(createSync(4), '192.168.1.44', 0, baseMasterTime + 1_197_000_000n);
      clock.ingestPacket(createFollowUp(4, baseMasterTime + 1_200_000_000n), '192.168.1.44', 0, now);
      expect(clock.getStatus().smoothedOffsetNanoseconds).toBe(2_062_500n);
    } finally {
      await clock.stop();
    }
  });

  it('filters non-peer timing packets and releases exclusive PTP ports on stop', async () => {
    const first = new AirPlay2PtpClock({ eventPort: 0, generalPort: 0 });
    await first.start();
    first.setPeerAddresses(['192.168.1.44']);
    expect(first.ingestPacket(createAnnounce(1), '192.168.1.45', 0)).toBe(false);
    expect(first.ingestPacket(createAnnounce(1), '192.168.1.44', 0, undefined, 320)).toBe(false);
    await first.stop();

    const second = new AirPlay2PtpClock({ eventPort: 0, generalPort: 0 });
    await expect(second.start()).resolves.toBeUndefined();
    await second.stop();
  });
});
