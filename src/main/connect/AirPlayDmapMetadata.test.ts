import { describe, expect, it } from 'vitest';
import { parseAirPlayDmapMetadata } from './AirPlayDmapMetadata';

const atom = (tag: string, value: Buffer | string | number): Buffer => {
  const payload = typeof value === 'string'
    ? Buffer.from(value, 'utf8')
    : typeof value === 'number'
      ? (() => {
          const buffer = Buffer.alloc(4);
          buffer.writeUInt32BE(value, 0);
          return buffer;
        })()
      : value;
  const header = Buffer.alloc(8);
  header.write(tag, 0, 4, 'ascii');
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
};

describe('AirPlayDmapMetadata', () => {
  it('decodes nested AirPlay title, artist, album, album artist and duration atoms', () => {
    const body = atom('mlit', Buffer.concat([
      atom('minm', 'Air Song'),
      atom('asar', 'Singer'),
      atom('asal', 'Album'),
      atom('asaa', 'Album Artist'),
      atom('astm', 183_500),
    ]));

    expect(parseAirPlayDmapMetadata(body)).toEqual({
      metadata: {
        title: 'Air Song',
        artist: 'Singer',
        album: 'Album',
        albumArtist: 'Album Artist',
        durationSeconds: 183.5,
      },
      error: null,
    });
  });

  it('rejects truncated atoms instead of reading past the request body', () => {
    const body = atom('minm', 'Song');
    body.writeUInt32BE(100, 4);

    expect(parseAirPlayDmapMetadata(body)).toEqual({
      metadata: null,
      error: expect.stringContaining('beyond'),
    });
  });

  it('reports a valid but unsupported DMAP body', () => {
    expect(parseAirPlayDmapMetadata(atom('asgn', 'Rock'))).toEqual({
      metadata: null,
      error: 'DMAP body contains no supported metadata atoms.',
    });
  });
});
