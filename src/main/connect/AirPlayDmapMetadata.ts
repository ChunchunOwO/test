export type AirPlayDmapMetadata = {
  title: string | null;
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  durationSeconds: number | null;
};

export type AirPlayDmapMetadataParseResult = {
  metadata: AirPlayDmapMetadata | null;
  error: string | null;
};

const dmapHeaderBytes = 8;
const dmapMaxDepth = 8;
const dmapMaxAtoms = 512;

const containerTags = new Set([
  'cmst',
  'mdcl',
  'mlcl',
  'mlit',
  'msrv',
]);

const textTags: Record<string, keyof Pick<AirPlayDmapMetadata, 'title' | 'artist' | 'album' | 'albumArtist'>> = {
  minm: 'title',
  asar: 'artist',
  asal: 'album',
  asaa: 'albumArtist',
};

const decodeText = (value: Buffer): string | null => {
  const decoded = value.toString('utf8').replace(/\0+$/gu, '').trim();
  return decoded || null;
};

const readUnsignedBigEndian = (value: Buffer): number | null => {
  if (value.length === 1) return value.readUInt8(0);
  if (value.length === 2) return value.readUInt16BE(0);
  if (value.length === 4) return value.readUInt32BE(0);
  if (value.length === 8) {
    const bigint = value.readBigUInt64BE(0);
    return bigint <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(bigint) : null;
  }
  return null;
};

export const parseAirPlayDmapMetadata = (body: Buffer): AirPlayDmapMetadataParseResult => {
  if (body.length === 0) {
    return { metadata: null, error: 'DMAP metadata body is empty.' };
  }

  const metadata: AirPlayDmapMetadata = {
    title: null,
    artist: null,
    album: null,
    albumArtist: null,
    durationSeconds: null,
  };
  let atomCount = 0;
  let foundMetadata = false;

  const visit = (buffer: Buffer, depth: number): string | null => {
    if (depth > dmapMaxDepth) return `DMAP nesting exceeds ${dmapMaxDepth} levels.`;
    let offset = 0;
    while (offset < buffer.length) {
      if (buffer.length - offset < dmapHeaderBytes) {
        return `DMAP atom header is truncated at offset ${offset}.`;
      }
      atomCount += 1;
      if (atomCount > dmapMaxAtoms) return `DMAP metadata exceeds ${dmapMaxAtoms} atoms.`;

      const tag = buffer.subarray(offset, offset + 4).toString('ascii');
      const length = buffer.readUInt32BE(offset + 4);
      const payloadStart = offset + dmapHeaderBytes;
      const payloadEnd = payloadStart + length;
      if (payloadEnd > buffer.length) {
        return `DMAP atom ${tag} declares ${length} bytes beyond the ${buffer.length}-byte container.`;
      }
      const payload = buffer.subarray(payloadStart, payloadEnd);
      const textField = textTags[tag];
      if (textField) {
        metadata[textField] = decodeText(payload);
        foundMetadata = foundMetadata || metadata[textField] !== null;
      } else if (tag === 'astm') {
        const durationMilliseconds = readUnsignedBigEndian(payload);
        if (durationMilliseconds === null) {
          return `DMAP duration atom astm has unsupported width ${payload.length}.`;
        }
        metadata.durationSeconds = durationMilliseconds > 0 ? durationMilliseconds / 1000 : 0;
        foundMetadata = true;
      } else if (containerTags.has(tag) && payload.length > 0) {
        const error = visit(payload, depth + 1);
        if (error) return error;
      }
      offset = payloadEnd;
    }
    return null;
  };

  const error = visit(body, 0);
  if (error) return { metadata: null, error };
  if (!foundMetadata) return { metadata: null, error: 'DMAP body contains no supported metadata atoms.' };
  return { metadata, error: null };
};
