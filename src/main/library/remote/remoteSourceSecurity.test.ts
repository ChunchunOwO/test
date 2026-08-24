import { describe, expect, it } from 'vitest';
import {
  assertRemoteSourceConfigInput,
  assertSafeRemotePath,
  normalizeRemoteSourceBaseUrl,
  sanitizeRemoteErrorMessage,
  sanitizeRemoteSourceConfig,
} from './remoteSourceSecurity';

describe('remote source security boundaries', () => {
  it('accepts literal private HTTP servers but rejects unresolved LAN-looking hostnames', () => {
    expect(normalizeRemoteSourceBaseUrl('webdav', 'http://192.168.1.20/dav', 'basic')).toBe('http://192.168.1.20/dav');
    expect(normalizeRemoteSourceBaseUrl('subsonic', 'http://localhost:4533', 'basic')).toBe('http://localhost:4533/');
    expect(() => normalizeRemoteSourceBaseUrl('subsonic', 'http://musicbox', 'basic')).toThrow('must use HTTPS');
    expect(() => normalizeRemoteSourceBaseUrl('subsonic', 'http://musicbox.local', 'basic')).toThrow('must use HTTPS');
    expect(() => normalizeRemoteSourceBaseUrl('webdav', 'http://public.example/dav', 'basic')).toThrow('must use HTTPS');
    expect(() => normalizeRemoteSourceBaseUrl('webdav', 'file:///C:/Music', 'none')).toThrow('HTTP or HTTPS');
    expect(() => normalizeRemoteSourceBaseUrl('webdav', 'https://user:pass@example.com/dav', 'basic')).toThrow('must not be embedded');
    expect(() => normalizeRemoteSourceBaseUrl('webdav', 'https://example.com/dav?token=secret', 'token')).toThrow('must not contain query');
  });

  it('whitelists provider configuration and removes legacy plaintext compatibility', () => {
    expect(() => assertRemoteSourceConfigInput({ password: 'secret' })).toThrow('dedicated secret field');
    expect(() => assertRemoteSourceConfigInput({ zconnectWebSession: true })).not.toThrow();
    expect(() => assertRemoteSourceConfigInput({ zconnectWebAuthorization: true })).toThrow('dedicated secret field');
    expect(sanitizeRemoteSourceConfig('subsonic', {
      authMode: 'password',
      clientName: 'spoofed-client',
      apiVersion: '1.16.1',
      token: 'leak',
      scanConcurrency: 999,
      allowCertificateDateErrors: true,
      zconnectWebSession: true,
    })).toEqual(expect.objectContaining({
      authMode: 'token',
      clientName: 'ECHO',
      apiVersion: '1.16.1',
      scanConcurrency: 4,
      allowCertificateDateErrors: true,
      zconnectWebSession: true,
    }));
  });

  it('rejects encoded traversal and redacts secrets from persisted errors', () => {
    expect(() => assertSafeRemotePath('/music/%2e%2e/private.flac')).toThrow('traversal');
    expect(sanitizeRemoteErrorMessage(new Error('GET https://alice:pw@example.test/file?token=abc password=oops')))
      .toBe('GET https://example.test/file password=[redacted]');
  });
});
