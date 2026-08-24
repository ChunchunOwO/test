import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadOrCreateEchoLinkDeviceId } from './EchoLinkDeviceIdentity';

describe('loadOrCreateEchoLinkDeviceId', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('persists and reuses a random device identity', () => {
    const root = mkdtempSync(join(tmpdir(), 'echo-link-device-id-'));
    roots.push(root);
    const filePath = join(root, 'device-id');

    const first = loadOrCreateEchoLinkDeviceId(filePath);
    const second = loadOrCreateEchoLinkDeviceId(filePath);

    expect(first).toMatch(/^pc-[a-f0-9]{16}$/u);
    expect(second).toBe(first);
    expect(readFileSync(filePath, 'utf8').trim()).toBe(first);
  });

  it('replaces an invalid persisted identity', () => {
    const root = mkdtempSync(join(tmpdir(), 'echo-link-device-id-'));
    roots.push(root);
    const filePath = join(root, 'device-id');
    writeFileSync(filePath, 'machine-guid-or-corrupt-value\n', 'utf8');

    const identity = loadOrCreateEchoLinkDeviceId(filePath);

    expect(identity).toMatch(/^pc-[a-f0-9]{16}$/u);
    expect(readFileSync(filePath, 'utf8').trim()).toBe(identity);
  });
});
