import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { normalizeWorkshopRegistryIdentity } from './WorkshopRegistryCodec';

export type WorkshopRevisionReceipt = {
  sourceId: string;
  itemId: string;
  contentId: string;
  version: string;
  manifestSha256: string;
  registryUpdatedAt: string;
};

const sha256Pattern = /^[a-f0-9]{64}$/u;
const contentIdPattern = /^[a-z0-9](?:[a-z0-9._-]{1,78}[a-z0-9])?$/u;

const normalizeReceipt = (value: unknown): WorkshopRevisionReceipt => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('workshop_revision_receipt_invalid');
  }
  const input = value as Partial<WorkshopRevisionReceipt>;
  const identity = normalizeWorkshopRegistryIdentity(input.sourceId ?? '', input.itemId ?? '');
  const contentId = typeof input.contentId === 'string' ? input.contentId.trim().toLowerCase() : '';
  const version = typeof input.version === 'string' ? input.version.trim() : '';
  const manifestSha256 = typeof input.manifestSha256 === 'string'
    ? input.manifestSha256.trim().toLowerCase()
    : '';
  const registryUpdatedAt = typeof input.registryUpdatedAt === 'string' ? input.registryUpdatedAt.trim() : '';
  if (
    !contentIdPattern.test(contentId) ||
    !version || version.length > 64 ||
    !sha256Pattern.test(manifestSha256) ||
    !registryUpdatedAt || registryUpdatedAt.length > 64
  ) {
    throw new Error('workshop_revision_receipt_invalid');
  }
  return { ...identity, contentId, version, manifestSha256, registryUpdatedAt };
};

export class WorkshopRevisionReceiptStore {
  private readonly filePath: string;
  private receipt: WorkshopRevisionReceipt | null;
  private writable = true;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.receipt = this.load();
  }

  get(): WorkshopRevisionReceipt | null {
    return this.receipt ? { ...this.receipt } : null;
  }

  set(receiptInput: WorkshopRevisionReceipt | null): void {
    if (!this.writable) {
      throw new Error('workshop_revision_receipt_unreadable');
    }
    const receipt = receiptInput ? normalizeReceipt(receiptInput) : null;
    const payload = { formatVersion: 1, receipt };
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    mkdirSync(dirname(this.filePath), { recursive: true });
    try {
      writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      renameSync(temporaryPath, this.filePath);
      this.receipt = receipt;
    } catch (error) {
      rmSync(temporaryPath, { force: true });
      throw error;
    }
  }

  private load(): WorkshopRevisionReceipt | null {
    if (!existsSync(this.filePath)) {
      return null;
    }
    try {
      const input = JSON.parse(readFileSync(this.filePath, 'utf8')) as {
        formatVersion?: number;
        receipt?: unknown;
      };
      if (input.formatVersion !== 1) {
        throw new Error('workshop_revision_receipt_version_invalid');
      }
      return input.receipt ? normalizeReceipt(input.receipt) : null;
    } catch {
      this.writable = false;
      return null;
    }
  }
}
