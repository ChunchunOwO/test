import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';

type GrantRecord = {
  provider: 'smb' | 'sshfs';
  path: string;
  expiresAtMs: number;
};

const grantTtlMs = 10 * 60 * 1000;

export class RemoteMountedRootGrantStore {
  private readonly grants = new Map<string, GrantRecord>();

  issue(provider: 'smb' | 'sshfs', path: string): { grantId: string; displayName: string } {
    this.prune();
    const grantId = randomUUID();
    this.grants.set(grantId, { provider, path, expiresAtMs: Date.now() + grantTtlMs });
    const displayName = basename(path.replace(/[\\/]+$/u, '')) || '已授权挂载目录';
    return { grantId, displayName: displayName.slice(0, 200) };
  }

  resolve(provider: 'smb' | 'sshfs', grantId: string | null | undefined): string | null {
    this.prune();
    if (!grantId) {
      return null;
    }
    const grant = this.grants.get(grantId) ?? null;
    return grant?.provider === provider ? grant.path : null;
  }

  consume(provider: 'smb' | 'sshfs', grantId: string | null | undefined): string | null {
    const path = this.resolve(provider, grantId);
    if (path && grantId) {
      this.grants.delete(grantId);
    }
    return path;
  }

  private prune(now = Date.now()): void {
    for (const [grantId, record] of this.grants) {
      if (record.expiresAtMs <= now) {
        this.grants.delete(grantId);
      }
    }
  }
}
