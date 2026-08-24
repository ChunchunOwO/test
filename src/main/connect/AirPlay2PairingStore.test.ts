import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AirPlay2PairingStore } from './AirPlay2PairingStore';

describe('AirPlay2PairingStore', () => {
  it('persists and reloads controller identities used by Pair-Verify', () => {
    const directory = mkdtempSync(join(tmpdir(), 'echo-airplay2-pairings-'));
    const filePath = join(directory, 'pairings.json');
    const publicKey = Buffer.alloc(32, 0x5a);

    const first = new AirPlay2PairingStore(filePath);
    first.saveController({ identifier: 'test-controller', publicKey, permissions: 1 });

    const second = new AirPlay2PairingStore(filePath);
    expect(second.getController('test-controller')).toEqual({
      identifier: 'test-controller',
      publicKey,
      permissions: 1,
    });
    expect(JSON.parse(readFileSync(filePath, 'utf8'))).toEqual({
      version: 1,
      controllers: {
        'test-controller': {
          publicKey: publicKey.toString('hex'),
          permissions: 1,
        },
      },
    });
  });

  it('rejects malformed controller keys', () => {
    const store = new AirPlay2PairingStore(null);
    expect(() => store.saveController({
      identifier: 'broken',
      publicKey: Buffer.alloc(31),
      permissions: 0,
    })).toThrow('pairing is invalid');
  });
});
