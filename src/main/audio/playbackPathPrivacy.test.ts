import { describe, expect, it } from 'vitest';
import type { AudioStatus } from '../../shared/types/audio';
import { isRemoteStreamProxyUrl, redactPlaybackPathSecrets, sanitizeAudioStatusForRenderer } from './playbackPathPrivacy';

describe('playbackPathPrivacy', () => {
  it('redacts remote proxy path capabilities and all URL credential surfaces', () => {
    const raw = 'http://user:password@127.0.0.1:19000/remote-stream/secret-token?signature=secret#fragment';
    const redacted = redactPlaybackPathSecrets(raw);

    expect(redacted).toContain('/remote-stream/redacted');
    expect(redacted).not.toContain('secret-token');
    expect(redacted).not.toContain('password');
    expect(redacted).not.toContain('signature=secret');
    expect(isRemoteStreamProxyUrl(raw)).toBe(true);
  });

  it('sanitizes renderer status without mutating the host-owned status', () => {
    const status = {
      currentFilePath: 'http://127.0.0.1:19000/remote-stream/secret-token',
    } as AudioStatus;

    const sanitized = sanitizeAudioStatusForRenderer(status);

    expect(sanitized.currentFilePath).toContain('/remote-stream/redacted');
    expect(status.currentFilePath).toContain('secret-token');
  });
});
