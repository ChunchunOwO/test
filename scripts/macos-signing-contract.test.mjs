import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
const entitlementPaths = [
  join(projectRoot, 'build-resources', 'macos', 'entitlements.mac.plist'),
  join(projectRoot, 'build-resources', 'macos', 'entitlements.mac.inherit.plist'),
];

describe('macOS signing foundation contract', () => {
  it('keeps the unsigned development target explicitly outside Hardened Runtime', () => {
    expect(packageJson.build.mac).toMatchObject({
      identity: null,
      hardenedRuntime: false,
      target: [{ target: 'dir', arch: ['arm64'] }],
    });
    expect(packageJson.build.mac.notarize).toBeUndefined();
    expect(packageJson.build.mac.entitlements).toBeUndefined();
  });

  it('keeps least-privilege release entitlement drafts ready but disconnected from the dev target', () => {
    for (const entitlementPath of entitlementPaths) {
      const plist = readFileSync(entitlementPath, 'utf8');
      expect(plist).toContain('<key>com.apple.security.cs.allow-jit</key>');
      expect(plist).toContain('<key>com.apple.security.cs.allow-unsigned-executable-memory</key>');
      expect(plist).not.toContain('com.apple.security.app-sandbox');
      expect(plist).not.toContain('com.apple.security.cs.allow-dyld-environment-variables');
      expect(plist).not.toContain('com.apple.security.cs.disable-library-validation');
    }
  });
});
