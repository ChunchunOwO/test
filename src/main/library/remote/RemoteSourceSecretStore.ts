import { safeStorage } from 'electron';

const legacyPlaintextPrefix = 'plain:';
const maximumCredentialBytes = 64 * 1024;
const maximumEncodedCredentialLength = 256 * 1024;

const decodeLegacyPlaintext = (value: string): string | null => {
  if (value.length > maximumEncodedCredentialLength) {
    return null;
  }
  try {
    const decoded = Buffer.from(value.slice(legacyPlaintextPrefix.length), 'base64').toString('utf8');
    return decoded.length > 0 && Buffer.byteLength(decoded, 'utf8') <= maximumCredentialBytes ? decoded : null;
  } catch {
    return null;
  }
};

export class RemoteSourceSecretStore {
  encrypt(secret: string | null | undefined): string | null {
    const normalized = typeof secret === 'string' && secret.length > 0 ? secret : null;
    if (!normalized) {
      return null;
    }
    if (Buffer.byteLength(normalized, 'utf8') > maximumCredentialBytes) {
      throw new Error('Remote source credential is too large.');
    }

    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Secure credential storage is unavailable. Remote source credentials were not saved.');
    }

    return safeStorage.encryptString(normalized).toString('base64');
  }

  decrypt(encryptedSecret: string | null | undefined): string | null {
    if (!encryptedSecret) {
      return null;
    }
    if (encryptedSecret.length > maximumEncodedCredentialLength) {
      return null;
    }

    if (encryptedSecret.startsWith(legacyPlaintextPrefix)) {
      return null;
    }

    try {
      const decrypted = safeStorage.decryptString(Buffer.from(encryptedSecret, 'base64'));
      return Buffer.byteLength(decrypted, 'utf8') <= maximumCredentialBytes ? decrypted : null;
    } catch {
      return null;
    }
  }

  migrateLegacyPlaintext(encryptedSecret: string | null | undefined): string | null | undefined {
    if (!encryptedSecret?.startsWith(legacyPlaintextPrefix)) {
      return undefined;
    }
    const plaintext = decodeLegacyPlaintext(encryptedSecret);
    if (!plaintext || !safeStorage.isEncryptionAvailable()) {
      return null;
    }
    try {
      return this.encrypt(plaintext);
    } catch {
      return null;
    }
  }
}
