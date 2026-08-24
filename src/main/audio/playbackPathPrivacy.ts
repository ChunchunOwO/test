import type { AudioStatus } from '../../shared/types/audio';

const remoteStreamTokenPath = /^(\/remote-stream\/)[^/?#]+/u;

export const isRemoteStreamProxyUrl = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return (url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1')
      && remoteStreamTokenPath.test(url.pathname);
  } catch {
    return false;
  }
};

export const redactPlaybackPathSecrets = (value: string): string => {
  if (!/^[a-z][a-z0-9+.-]*:\/\//iu.test(value)) {
    return value;
  }

  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(remoteStreamTokenPath, '$1redacted');
    if (url.username) url.username = 'redacted';
    if (url.password) url.password = 'redacted';
    if (url.search) url.search = '?redacted';
    if (url.hash) url.hash = '#redacted';
    return url.toString();
  } catch {
    return value;
  }
};

export const sanitizeAudioStatusForRenderer = (status: AudioStatus): AudioStatus => ({
  ...status,
  currentFilePath: status.currentFilePath ? redactPlaybackPathSecrets(status.currentFilePath) : null,
});
