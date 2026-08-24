import { open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { extname } from 'node:path';
import { normalizeMp4AudioSampleEntryCodec } from '../../audio/Mp4AudioCodec';
import type { EmbeddedCoverData, MetadataFields } from '../libraryTypes';

const mp4Extensions = new Set(['.m4a', '.m4b', '.m4p', '.mp4', '.mov', '.alac']);
const maxTopLevelBoxes = 4096;
const maxMoovBytes = 24 * 1024 * 1024;
const maxIlstItems = 512;
const maxTextPayloadBytes = 4096;
const maxCoverPayloadBytes = 20 * 1024 * 1024;

type Mp4Box = {
  type: string;
  start: number;
  contentStart: number;
  end: number;
};

export type Mp4IlstMetadataFallback = {
  fields: Partial<MetadataFields>;
  embeddedCover?: EmbeddedCoverData;
};

const readExact = async (
  file: FileHandle,
  position: number,
  length: number,
): Promise<Buffer | null> => {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await file.read(buffer, 0, length, position);
  return bytesRead === length ? buffer : null;
};

const safeUint64 = (value: bigint): number | null =>
  value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;

const parseBoxAt = (buffer: Buffer, start: number, end: number): Mp4Box | null => {
  if (start < 0 || start + 8 > end || end > buffer.length) {
    return null;
  }

  const size32 = buffer.readUInt32BE(start);
  const type = buffer.toString('latin1', start + 4, start + 8);
  let headerBytes = 8;
  let size: number | null = size32;
  if (size32 === 1) {
    if (start + 16 > end) {
      return null;
    }
    headerBytes = 16;
    size = safeUint64(buffer.readBigUInt64BE(start + 8));
  } else if (size32 === 0) {
    size = end - start;
  }

  if (!size || size < headerBytes || start + size > end) {
    return null;
  }

  return {
    type,
    start,
    contentStart: start + headerBytes,
    end: start + size,
  };
};

const childBoxes = (buffer: Buffer, start: number, end: number, limit = maxIlstItems): Mp4Box[] => {
  const boxes: Mp4Box[] = [];
  let offset = start;
  while (offset + 8 <= end && boxes.length < limit) {
    const box = parseBoxAt(buffer, offset, end);
    if (!box) {
      break;
    }
    boxes.push(box);
    offset = box.end;
  }
  return boxes;
};

const firstChild = (buffer: Buffer, parent: Mp4Box, type: string, skipBytes = 0): Mp4Box | null =>
  childBoxes(buffer, parent.contentStart + skipBytes, parent.end).find((box) => box.type === type) ?? null;

const findPath = (buffer: Buffer, parent: Mp4Box, path: Array<{ type: string; skipBytes?: number }>): Mp4Box | null => {
  let current = parent;
  for (const segment of path) {
    const next = firstChild(buffer, current, segment.type, segment.skipBytes ?? 0);
    if (!next) {
      return null;
    }
    current = next;
  }
  return current;
};

const readMoovBox = async (file: FileHandle, fileSize: number): Promise<Buffer | null> => {
  let offset = 0;
  for (let scanned = 0; scanned < maxTopLevelBoxes && offset + 8 <= fileSize; scanned += 1) {
    const baseHeader = await readExact(file, offset, 8);
    if (!baseHeader) {
      return null;
    }

    const size32 = baseHeader.readUInt32BE(0);
    const type = baseHeader.toString('latin1', 4, 8);
    let size: number | null = size32;
    if (size32 === 1) {
      const largeHeader = await readExact(file, offset, 16);
      if (!largeHeader) {
        return null;
      }
      size = safeUint64(largeHeader.readBigUInt64BE(8));
    } else if (size32 === 0) {
      size = fileSize - offset;
    }

    if (!size || size < (size32 === 1 ? 16 : 8) || offset + size > fileSize) {
      return null;
    }
    if (type === 'moov') {
      return size <= maxMoovBytes ? readExact(file, offset, size) : null;
    }
    offset += size;
  }
  return null;
};

const uint16Pair = (payload: Buffer): { value: number | null; total: number | null } => {
  const valueOffset = payload.length >= 6 ? 2 : 0;
  if (valueOffset + 2 > payload.length) {
    return { value: null, total: null };
  }
  const value = payload.readUInt16BE(valueOffset);
  const total = valueOffset + 4 <= payload.length ? payload.readUInt16BE(valueOffset + 2) : 0;
  return {
    value: value > 0 ? value : null,
    total: total > 0 ? total : null,
  };
};

const decodeTextPayload = (payload: Buffer, dataType: number): string | null => {
  if (payload.length === 0 || payload.length > maxTextPayloadBytes) {
    return null;
  }

  let text: string;
  if (dataType === 2 && payload.length >= 2) {
    const evenLength = payload.length - (payload.length % 2);
    const littleEndian = Buffer.alloc(evenLength);
    for (let index = 0; index < evenLength; index += 2) {
      littleEndian[index] = payload[index + 1];
      littleEndian[index + 1] = payload[index];
    }
    text = littleEndian.toString('utf16le');
  } else {
    text = payload.toString('utf8');
  }
  const cleaned = text.replace(/^\uFEFF/u, '').replace(/\0+$/u, '').trim();
  return cleaned || null;
};

const detectCoverMimeType = (payload: Buffer, dataType: number): string | null => {
  if (payload.length >= 3 && payload[0] === 0xff && payload[1] === 0xd8 && payload[2] === 0xff) {
    return 'image/jpeg';
  }
  if (payload.length >= 8 && payload.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (payload.length >= 12 && payload.toString('ascii', 0, 4) === 'RIFF' && payload.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (payload.length >= 6 && /^GIF8[79]a$/u.test(payload.toString('ascii', 0, 6))) {
    return 'image/gif';
  }
  if (dataType === 13) {
    return 'image/jpeg';
  }
  if (dataType === 14) {
    return 'image/png';
  }
  return null;
};

const parseIlst = (buffer: Buffer, moov: Mp4Box, readCover: boolean): Mp4IlstMetadataFallback => {
  const fields: Partial<MetadataFields> = {};
  let embeddedCover: EmbeddedCoverData | undefined;
  const udta = firstChild(buffer, moov, 'udta');
  const meta = udta ? firstChild(buffer, udta, 'meta') : null;
  const ilst = meta ? firstChild(buffer, meta, 'ilst', 4) : null;
  if (!ilst) {
    return { fields };
  }

  for (const item of childBoxes(buffer, ilst.contentStart, ilst.end)) {
    const dataBox = firstChild(buffer, item, 'data');
    if (!dataBox || dataBox.contentStart + 8 > dataBox.end) {
      continue;
    }
    const dataType = buffer.readUInt32BE(dataBox.contentStart) & 0x00ffffff;
    const payload = buffer.subarray(dataBox.contentStart + 8, dataBox.end);
    const text = (): string | null => decodeTextPayload(payload, dataType);

    switch (item.type) {
      case '\u00a9nam': fields.title ??= text() ?? undefined; break;
      case '\u00a9ART': fields.artist ??= text() ?? undefined; break;
      case '\u00a9alb': fields.album ??= text() ?? undefined; break;
      case 'aART': fields.albumArtist ??= text() ?? undefined; break;
      case '\u00a9wrt': fields.composer ??= text() ?? undefined; break;
      case '\u00a9gen': fields.genre ??= text() ?? undefined; break;
      case '\u00a9cmt': fields.comment ??= text() ?? undefined; break;
      case '\u00a9day': {
        const date = text();
        const match = date?.match(/(?:^|\D)(\d{4})(?:\D|$)/u);
        if (match) fields.year ??= Number(match[1]);
        break;
      }
      case 'trkn': {
        const pair = uint16Pair(payload);
        fields.trackNo ??= pair.value;
        fields.totalTracks ??= pair.total;
        break;
      }
      case 'disk': {
        const pair = uint16Pair(payload);
        fields.discNo ??= pair.value;
        fields.totalDiscs ??= pair.total;
        break;
      }
      case 'tmpo': {
        if (payload.length >= 2) fields.bpm ??= payload.readUInt16BE(payload.length - 2);
        break;
      }
      case 'covr': {
        if (!readCover || embeddedCover || payload.length === 0 || payload.length > maxCoverPayloadBytes) {
          break;
        }
        const mimeType = detectCoverMimeType(payload, dataType);
        if (mimeType) {
          embeddedCover = { data: Buffer.from(payload), mimeType };
        }
        break;
      }
      default: break;
    }
  }
  return { fields, embeddedCover };
};

const parseMovieDuration = (buffer: Buffer, moov: Mp4Box): number | null => {
  const mvhd = firstChild(buffer, moov, 'mvhd');
  if (!mvhd || mvhd.contentStart + 20 > mvhd.end) {
    return null;
  }
  const version = buffer[mvhd.contentStart];
  const timescaleOffset = mvhd.contentStart + (version === 1 ? 20 : 12);
  const durationOffset = timescaleOffset + 4;
  if (durationOffset + (version === 1 ? 8 : 4) > mvhd.end) {
    return null;
  }
  const timescale = buffer.readUInt32BE(timescaleOffset);
  let duration = version === 1
    ? safeUint64(buffer.readBigUInt64BE(durationOffset))
    : buffer.readUInt32BE(durationOffset);
  if ((!duration || duration <= 0) && timescale > 0) {
    const mehd = findPath(buffer, moov, [{ type: 'mvex' }, { type: 'mehd' }]);
    if (mehd && mehd.contentStart + 8 <= mehd.end) {
      const mehdVersion = buffer[mehd.contentStart];
      const fragmentDurationOffset = mehd.contentStart + 4;
      if (fragmentDurationOffset + (mehdVersion === 1 ? 8 : 4) <= mehd.end) {
        duration = mehdVersion === 1
          ? safeUint64(buffer.readBigUInt64BE(fragmentDurationOffset))
          : buffer.readUInt32BE(fragmentDurationOffset);
      }
    }
  }
  return timescale > 0 && duration && duration > 0 ? duration / timescale : null;
};

const parseAlacConfig = (buffer: Buffer, entry: Mp4Box): { sampleRate: number | null; bitDepth: number | null } => {
  const config = childBoxes(buffer, entry.contentStart + 28, entry.end, 16).find((box) => box.type === 'alac');
  if (!config || config.contentStart + 28 > config.end) {
    return { sampleRate: null, bitDepth: null };
  }
  const configStart = config.contentStart + 4;
  const bitDepth = buffer[configStart + 5] || null;
  const sampleRate = buffer.readUInt32BE(configStart + 20) || null;
  return { sampleRate, bitDepth };
};

const parseAudioTechnicalFields = (buffer: Buffer, moov: Mp4Box): Partial<MetadataFields> => {
  for (const trak of childBoxes(buffer, moov.contentStart, moov.end).filter((box) => box.type === 'trak')) {
    const mdia = firstChild(buffer, trak, 'mdia');
    const hdlr = mdia ? firstChild(buffer, mdia, 'hdlr') : null;
    if (!mdia || !hdlr || hdlr.contentStart + 12 > hdlr.end || buffer.toString('ascii', hdlr.contentStart + 8, hdlr.contentStart + 12) !== 'soun') {
      continue;
    }
    const stsd = findPath(buffer, mdia, [
      { type: 'minf' },
      { type: 'stbl' },
      { type: 'stsd' },
    ]);
    if (!stsd || stsd.contentStart + 8 > stsd.end) {
      continue;
    }
    const entryCount = Math.min(buffer.readUInt32BE(stsd.contentStart + 4), 32);
    let entryOffset = stsd.contentStart + 8;
    for (let index = 0; index < entryCount && entryOffset + 36 <= stsd.end; index += 1) {
      const entry = parseBoxAt(buffer, entryOffset, stsd.end);
      if (!entry) {
        break;
      }
      const codec = normalizeMp4AudioSampleEntryCodec(entry.type);
      if (codec) {
        const fixedSampleRate = buffer.readUInt32BE(entry.start + 32) / 65536;
        const alac = codec === 'ALAC' ? parseAlacConfig(buffer, entry) : { sampleRate: null, bitDepth: null };
        const sampleRate = alac.sampleRate ?? (fixedSampleRate >= 8000 ? Math.round(fixedSampleRate) : null);
        const bitDepth = codec === 'ALAC' || codec === 'PCM'
          ? (alac.bitDepth ?? buffer.readUInt16BE(entry.start + 26) ?? null)
          : null;
        return { codec, sampleRate, bitDepth };
      }
      entryOffset = entry.end;
    }
  }
  return {};
};

export const isMp4IlstFallbackPath = (filePath: string): boolean =>
  mp4Extensions.has(extname(filePath).toLowerCase());

export const readMp4IlstMetadataFallback = async (
  filePath: string,
  readCover = true,
): Promise<Mp4IlstMetadataFallback | null> => {
  if (!isMp4IlstFallbackPath(filePath)) {
    return null;
  }

  let file: FileHandle | null = null;
  try {
    file = await open(filePath, 'r');
    const stats = await file.stat();
    if (!stats.isFile()) {
      return null;
    }
    const buffer = await readMoovBox(file, stats.size);
    if (!buffer) {
      return null;
    }
    const moov = parseBoxAt(buffer, 0, buffer.length);
    if (!moov || moov.type !== 'moov') {
      return null;
    }

    const fallback = parseIlst(buffer, moov, readCover);
    const duration = parseMovieDuration(buffer, moov);
    fallback.fields = {
      ...fallback.fields,
      ...parseAudioTechnicalFields(buffer, moov),
      ...(duration ? { duration } : {}),
    };
    return fallback;
  } catch {
    return null;
  } finally {
    await file?.close().catch(() => undefined);
  }
};
