import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readMp4IlstMetadataFallback } from './Mp4IlstMetadataFallback';

const tempRoots: string[] = [];

const uint32 = (value: number): Buffer => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value, 0);
  return buffer;
};

const box = (type: string, ...payloads: Buffer[]): Buffer => {
  const payload = Buffer.concat(payloads);
  return Buffer.concat([uint32(payload.length + 8), Buffer.from(type, 'latin1'), payload]);
};

const dataItem = (type: string, dataType: number, payload: Buffer): Buffer =>
  box(type, box('data', uint32(dataType), uint32(0), payload));

const textItem = (type: string, value: string): Buffer =>
  dataItem(type, 1, Buffer.from(value, 'utf8'));

const pairItem = (type: string, value: number, total: number): Buffer => {
  const payload = Buffer.alloc(8);
  payload.writeUInt16BE(value, 2);
  payload.writeUInt16BE(total, 4);
  return dataItem(type, 0, payload);
};

const alacTrack = (): Buffer => {
  const alacConfig = Buffer.alloc(28);
  alacConfig[9] = 24;
  alacConfig.writeUInt32BE(96_000, 24);
  const entry = Buffer.alloc(36);
  entry.writeUInt32BE(72, 0);
  entry.write('alac', 4, 'ascii');
  entry.writeUInt16BE(1, 14);
  entry.writeUInt16BE(2, 24);
  entry.writeUInt16BE(16, 26);
  entry.writeUInt32BE(1 << 16, 32);
  const hdlr = Buffer.alloc(12);
  hdlr.write('soun', 8, 'ascii');
  const stsd = box('stsd', Buffer.alloc(4), uint32(1), entry, box('alac', alacConfig));
  return box(
    'trak',
    box(
      'mdia',
      box('hdlr', hdlr),
      box('minf', box('stbl', stsd)),
    ),
  );
};

const movieHeader = (duration: number): Buffer => {
  const payload = Buffer.alloc(20);
  payload.writeUInt32BE(1_000, 12);
  payload.writeUInt32BE(duration, 16);
  return box('mvhd', payload);
};

const writeFixture = (name: string, moov: Buffer): string => {
  const root = join(tmpdir(), `echo-mp4-ilst-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
  tempRoots.push(root);
  const filePath = join(root, name);
  writeFileSync(filePath, Buffer.concat([box('ftyp', Buffer.from('M4A ')), moov, box('mdat', Buffer.alloc(32))]));
  return filePath;
};

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('MP4 ilst metadata fallback', () => {
  it('recovers iTunes tags and a WebP covr payload whose data type is zero', async () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), uint32(12), Buffer.from('WEBPVP8X'), Buffer.alloc(16)]);
    const ilst = box(
      'ilst',
      textItem('\u00a9nam', 'Recovered title'),
      textItem('\u00a9ART', 'Recovered artist'),
      textItem('\u00a9alb', 'Recovered album'),
      textItem('aART', 'Recovered album artist'),
      textItem('\u00a9day', '2026-08-15'),
      pairItem('trkn', 3, 9),
      dataItem('covr', 0, webp),
    );
    const filePath = writeFixture(
      'webp-cover.m4a',
      box('moov', movieHeader(123_000), alacTrack(), box('udta', box('meta', Buffer.alloc(4), ilst))),
    );

    const result = await readMp4IlstMetadataFallback(filePath);

    expect(result?.fields).toMatchObject({
      title: 'Recovered title',
      artist: 'Recovered artist',
      album: 'Recovered album',
      albumArtist: 'Recovered album artist',
      trackNo: 3,
      totalTracks: 9,
      year: 2026,
      duration: 123,
      codec: 'ALAC',
      sampleRate: 96_000,
      bitDepth: 24,
    });
    expect(result?.embeddedCover?.mimeType).toBe('image/webp');
    expect(Buffer.from(result?.embeddedCover?.data ?? []).equals(webp)).toBe(true);
  });

  it('recovers fragmented duration from mehd and omits cover bytes for metadata-only reads', async () => {
    const mehdPayload = Buffer.concat([Buffer.alloc(4), uint32(245_500)]);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
    const ilst = box('ilst', textItem('\u00a9nam', 'Fragmented'), dataItem('covr', 13, jpeg));
    const filePath = writeFixture(
      'fragmented.m4a',
      box('moov', movieHeader(0), box('mvex', box('mehd', mehdPayload)), box('udta', box('meta', Buffer.alloc(4), ilst))),
    );

    const result = await readMp4IlstMetadataFallback(filePath, false);

    expect(result?.fields.title).toBe('Fragmented');
    expect(result?.fields.duration).toBe(245.5);
    expect(result?.embeddedCover).toBeUndefined();
  });
});
