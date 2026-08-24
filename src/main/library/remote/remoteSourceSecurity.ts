import { isIP } from 'node:net';
import type {
  RemoteSourceAuthType,
  RemoteSourceProvider,
} from '../../../shared/types/remoteSources';
import { normalizeRemoteDirectoryPath } from './remoteIdentity';

const maximumBaseUrlLength = 2_048;
const maximumConfigTextLength = 512;
const maximumConfigIdCount = 128;
const credentialConfigKey = /(authorization|cookie|credential|password|passwd|secret|token|api.?key)/iu;
const networkProviders = new Set<RemoteSourceProvider>(['webdav', 'jellyfin', 'emby', 'subsonic']);

const cleanText = (value: unknown, maximumLength = maximumConfigTextLength): string | null =>
  typeof value === 'string' && value.trim().length > 0
    ? value.replace(/[\u0000-\u001f\u007f]/gu, '').trim().slice(0, maximumLength)
    : null;

const clampInt = (value: unknown, fallback: number, minimum: number, maximum: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.round(parsed))) : fallback;
};

const cleanIdList = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = Array.from(new Set(value
    .map((item) => cleanText(item))
    .filter((item): item is string => Boolean(item))))
    .slice(0, maximumConfigIdCount);
  return items.length > 0 ? items : undefined;
};

const isPrivateOrLocalHostname = (hostname: string): boolean => {
  const normalized = hostname.replace(/^\[|\]$/gu, '').toLocaleLowerCase();
  if (
    normalized === 'localhost'
    || normalized.endsWith('.localhost')
  ) {
    return true;
  }

  if (isIP(normalized) === 6) {
    if (normalized === '::1') {
      return true;
    }
    const firstHextet = Number.parseInt(normalized.split(':', 1)[0] ?? '', 16);
    return Number.isFinite(firstHextet)
      && ((firstHextet & 0xfe00) === 0xfc00 || (firstHextet & 0xffc0) === 0xfe80);
  }

  if (isIP(normalized) !== 4) {
    return false;
  }

  const octets = normalized.split('.').map(Number);
  return octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
};

export const normalizeRemoteSourceBaseUrl = (
  provider: RemoteSourceProvider,
  value: string | null | undefined,
  authType: RemoteSourceAuthType,
): string | null => {
  const trimmed = cleanText(value, maximumBaseUrlLength);
  if (!networkProviders.has(provider)) {
    return trimmed;
  }
  if (!trimmed) {
    throw new Error(`${provider} server URL is required.`);
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${provider} server URL must be an absolute HTTP or HTTPS URL.`);
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) {
    throw new Error(`${provider} server URL must use HTTP or HTTPS.`);
  }
  if (url.username || url.password) {
    throw new Error('Remote source credentials must not be embedded in the server URL.');
  }
  if (url.search || url.hash) {
    throw new Error('Remote source server URLs must not contain query parameters or fragments.');
  }
  if (url.protocol === 'http:' && authType !== 'none' && !isPrivateOrLocalHostname(url.hostname)) {
    throw new Error('Credentialed remote sources must use HTTPS unless the server is on a private or local network.');
  }

  return url.toString();
};

export const sanitizeRemoteSourceConfig = (
  provider: RemoteSourceProvider,
  value: unknown,
): Record<string, unknown> => {
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const output: Record<string, unknown> = {};

  output.scanConcurrency = clampInt(input.scanConcurrency, 3, 1, provider === 'smb' || provider === 'sshfs' ? 6 : 4);
  for (const [key, maximum] of [
    ['metadataConcurrency', 4],
    ['coverConcurrency', 4],
    ['lyricsConcurrency', 4],
    ['durationBackfillConcurrency', 4],
  ] as const) {
    if (input[key] !== undefined) {
      output[key] = clampInt(input[key], 1, 1, maximum);
    }
  }

  if (provider === 'webdav') {
    const rootPath = cleanText(input.rootPath, maximumBaseUrlLength) ?? '/';
    try {
      assertSafeRemotePath(rootPath);
      output.rootPath = normalizeRemoteDirectoryPath(rootPath);
    } catch {
      output.rootPath = '/';
    }
  } else if (provider === 'smb' || provider === 'sshfs') {
    const rootPath = cleanText(input.rootPath, maximumBaseUrlLength) ?? '/';
    try {
      assertSafeRemotePath(rootPath);
      output.rootPath = rootPath;
    } catch {
      output.rootPath = '/';
    }
    output.accessMode = 'mounted';
    output.pathStyle = provider === 'smb' ? 'unc' : 'posix';
  } else if (provider === 'subsonic') {
    const apiVersion = cleanText(input.apiVersion, 32);
    output.apiVersion = apiVersion && /^\d+\.\d+\.\d+$/u.test(apiVersion) ? apiVersion : '1.16.1';
    output.clientName = 'ECHO';
    output.authMode = 'token';
    output.allowCertificateDateErrors = input.allowCertificateDateErrors === true;
    output.zconnectWebSession = input.zconnectWebSession === true;
    output.albumFullRefreshDays = clampInt(input.albumFullRefreshDays, 7, 1, 30);
    const musicFolderIds = cleanIdList(input.musicFolderIds);
    if (musicFolderIds) output.musicFolderIds = musicFolderIds;
  } else if (provider === 'jellyfin' || provider === 'emby') {
    const userId = cleanText(input.userId);
    const libraryIds = cleanIdList(input.libraryIds);
    if (userId) output.userId = userId;
    if (libraryIds) output.libraryIds = libraryIds;
  }

  return output;
};

export const assertNoCredentialFieldsInConfig = (value: unknown): void => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return;
  }
  const sensitiveKey = Object.keys(value as Record<string, unknown>).find((key) => credentialConfigKey.test(key));
  if (sensitiveKey) {
    throw new Error(`Remote source credentials must use the dedicated secret field, not config.${sensitiveKey}.`);
  }
};

export const assertRemoteSourceConfigInput = (value: unknown): void => {
  assertNoCredentialFieldsInConfig(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return;
  }
  const rootPath = (value as Record<string, unknown>).rootPath;
  if (typeof rootPath === 'string') {
    assertSafeRemotePath(rootPath);
  }
};

export const assertSafeRemotePath = (value: string): void => {
  const normalized = value.replace(/\\/gu, '/');
  if (normalized.includes('\u0000')) {
    throw new Error('Remote path contains an invalid null character.');
  }
  let decoded = normalized;
  try {
    decoded = decodeURIComponent(normalized);
  } catch {
    // The adapter will encode malformed percent sequences as ordinary path text.
  }
  if (decoded.split('/').some((part) => part === '.' || part === '..')) {
    throw new Error('Remote path traversal is not allowed.');
  }
};

export const sanitizeRemoteErrorMessage = (error: unknown, fallback = 'Remote source operation failed.'): string => {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : fallback;
  const redacted = raw
    .replace(/https?:\/\/[^\s"']+/giu, (match) => {
      try {
        const url = new URL(match);
        url.username = '';
        url.password = '';
        url.search = '';
        url.hash = '';
        return url.toString();
      } catch {
        return '[remote-url-redacted]';
      }
    })
    .replace(/(authorization|cookie|password|secret|token|api.?key)\s*[:=]\s*[^\s,;]+/giu, '$1=[redacted]')
    .replace(/(?:[A-Za-z]:\\|\\\\)[^\r\n"']+/gu, '[local-path-redacted]')
    .replace(/[\r\n\t]+/gu, ' ')
    .trim();
  return (redacted || fallback).slice(0, 1_024);
};
