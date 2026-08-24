import { randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';

const echoLinkDeviceIdPattern = /^pc-[a-f0-9]{16}$/u;

const createEchoLinkDeviceId = (): string => `pc-${randomBytes(8).toString('hex')}`;

const defaultIdentityPath = (): string | null => {
  try {
    return join(app.getPath('userData'), 'echo-link-device-id');
  } catch {
    return null;
  }
};

export const loadOrCreateEchoLinkDeviceId = (filePath = defaultIdentityPath()): string => {
  const fallback = createEchoLinkDeviceId();
  if (!filePath) {
    return fallback;
  }

  try {
    const existing = readFileSync(filePath, 'utf8').trim().toLowerCase();
    if (echoLinkDeviceIdPattern.test(existing)) {
      return existing;
    }
  } catch {
    // A missing or temporarily unreadable identity is replaced below.
  }

  try {
    mkdirSync(dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${fallback}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(temporaryPath, filePath);
    try {
      chmodSync(filePath, 0o600);
    } catch {
      // Windows ACLs are authoritative; chmod is best-effort.
    }
    return fallback;
  } catch {
    try {
      const existing = readFileSync(filePath, 'utf8').trim().toLowerCase();
      return echoLinkDeviceIdPattern.test(existing) ? existing : fallback;
    } catch {
      return fallback;
    }
  }
};
