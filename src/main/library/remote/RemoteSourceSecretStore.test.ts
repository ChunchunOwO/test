import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeStorageState = vi.hoisted(() => ({ available: true }));

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => safeStorageState.available,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8').replace(/^encrypted:/u, ''),
  },
}));

import { RemoteSourceSecretStore } from './RemoteSourceSecretStore';

describe('RemoteSourceSecretStore', () => {
  beforeEach(() => {
    safeStorageState.available = true;
  });

  it('fails closed instead of persisting a reversible plaintext fallback', () => {
    safeStorageState.available = false;
    const store = new RemoteSourceSecretStore();

    expect(() => store.encrypt('do-not-store-plaintext')).toThrow('Secure credential storage is unavailable');
  });

  it('migrates legacy plaintext only when operating-system encryption is available', () => {
    const store = new RemoteSourceSecretStore();
    const legacy = `plain:${Buffer.from('legacy-password', 'utf8').toString('base64')}`;

    expect(store.decrypt(legacy)).toBeNull();
    expect(store.migrateLegacyPlaintext(legacy)).toBe(Buffer.from('encrypted:legacy-password').toString('base64'));

    safeStorageState.available = false;
    expect(store.migrateLegacyPlaintext(legacy)).toBeNull();
  });

  it('rejects oversized current and legacy credentials', () => {
    const store = new RemoteSourceSecretStore();
    const oversized = 'x'.repeat(64 * 1024 + 1);
    const legacy = `plain:${Buffer.from(oversized, 'utf8').toString('base64')}`;

    expect(() => store.encrypt(oversized)).toThrow('too large');
    expect(store.migrateLegacyPlaintext(legacy)).toBeNull();
  });
});
