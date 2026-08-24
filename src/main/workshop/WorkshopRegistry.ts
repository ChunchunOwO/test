import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import {
  cloneWorkshopRegistryValue,
  createEmptyWorkshopRegistrySnapshot,
  normalizeWorkshopRegistryCapabilities,
  normalizeWorkshopRegistryErrorCode,
  normalizeWorkshopRegistryIdentity,
  normalizeWorkshopRegistryRecord,
  normalizeWorkshopRegistryRevision,
  normalizeWorkshopRegistrySnapshot,
} from './WorkshopRegistryCodec';
import {
  workshopRegistryFormatVersion,
  type WorkshopRegistryHealth,
  type WorkshopRegistryOptions,
  type WorkshopRegistryRecord,
  type WorkshopRegistrySnapshot,
  type WorkshopRegistryState,
  type WorkshopRegistryTransitionOptions,
} from './WorkshopRegistryTypes';

export { workshopRegistryFormatVersion, workshopRegistryStates } from './WorkshopRegistryTypes';
export type {
  WorkshopRegistryError,
  WorkshopRegistryHealth,
  WorkshopRegistryOptions,
  WorkshopRegistryRecord,
  WorkshopRegistryRevision,
  WorkshopRegistrySnapshot,
  WorkshopRegistryState,
  WorkshopRegistryTransitionOptions,
} from './WorkshopRegistryTypes';

const allowedTransitions: Record<WorkshopRegistryState, ReadonlySet<WorkshopRegistryState>> = {
  detected: new Set(['downloading', 'verified', 'quarantined', 'error']),
  downloading: new Set(['verified', 'quarantined', 'error']),
  verified: new Set(['staged', 'quarantined', 'error']),
  staged: new Set(['disabled', 'quarantined', 'error']),
  disabled: new Set(['enabled', 'downloading', 'quarantined', 'error']),
  enabled: new Set(['disabled', 'downloading', 'quarantined', 'error']),
  quarantined: new Set(['detected', 'downloading', 'disabled', 'error']),
  error: new Set(['detected', 'downloading', 'quarantined']),
};

export const getWorkshopRegistryPath = (): string =>
  join(app.getPath('userData'), 'workshop', 'registry.json');

export class WorkshopRegistry {
  private snapshot: WorkshopRegistrySnapshot;
  private writable = true;
  private loadError: WorkshopRegistryHealth['error'] = null;
  private readonly filePath: string;
  private readonly now: () => Date;

  constructor(options: WorkshopRegistryOptions = {}) {
    this.filePath = options.filePath ?? getWorkshopRegistryPath();
    this.now = options.now ?? (() => new Date());
    this.snapshot = this.load();
  }

  getHealth(): WorkshopRegistryHealth {
    return { writable: this.writable, error: this.loadError };
  }

  getSnapshot(): WorkshopRegistrySnapshot {
    return cloneWorkshopRegistryValue(this.snapshot);
  }

  get(sourceIdInput: string, itemIdInput: string): WorkshopRegistryRecord | null {
    const identity = normalizeWorkshopRegistryIdentity(sourceIdInput, itemIdInput);
    const record = this.find(identity.sourceId, identity.itemId);
    return record ? cloneWorkshopRegistryValue(record) : null;
  }

  registerDetected(sourceIdInput: string, itemIdInput: string): WorkshopRegistryRecord {
    this.requireWritable();
    const identity = normalizeWorkshopRegistryIdentity(sourceIdInput, itemIdInput);
    const existing = this.find(identity.sourceId, identity.itemId);
    if (existing) {
      return cloneWorkshopRegistryValue(existing);
    }

    const now = this.now().toISOString();
    const record: WorkshopRegistryRecord = {
      ...identity,
      state: 'detected',
      candidateRevision: null,
      activeRevision: null,
      lastKnownGoodRevision: null,
      approvedCapabilities: [],
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    this.commit([...this.snapshot.records, record]);
    return cloneWorkshopRegistryValue(record);
  }

  transition(
    sourceIdInput: string,
    itemIdInput: string,
    nextState: WorkshopRegistryState,
    options: WorkshopRegistryTransitionOptions = {},
  ): WorkshopRegistryRecord {
    this.requireWritable();
    const identity = normalizeWorkshopRegistryIdentity(sourceIdInput, itemIdInput);
    const recordIndex = this.findIndex(identity.sourceId, identity.itemId);
    if (recordIndex < 0) {
      throw new Error('workshop_registry_record_missing');
    }

    const current = this.snapshot.records[recordIndex];
    if (!allowedTransitions[current.state].has(nextState)) {
      throw new Error(`workshop_registry_transition_invalid:${current.state}:${nextState}`);
    }

    const now = this.now().toISOString();
    const next = cloneWorkshopRegistryValue(current);
    next.state = nextState;
    next.updatedAt = now;
    this.applyCandidateRevision(next, nextState, options);
    this.applyError(next, nextState, options, now);
    this.applyActivation(current, next, nextState);

    const records = [...this.snapshot.records];
    records[recordIndex] = normalizeWorkshopRegistryRecord(next);
    this.commit(records);
    return cloneWorkshopRegistryValue(next);
  }

  setApprovedCapabilities(
    sourceIdInput: string,
    itemIdInput: string,
    capabilities: readonly string[],
  ): WorkshopRegistryRecord {
    this.requireWritable();
    const identity = normalizeWorkshopRegistryIdentity(sourceIdInput, itemIdInput);
    const recordIndex = this.findIndex(identity.sourceId, identity.itemId);
    if (recordIndex < 0) {
      throw new Error('workshop_registry_record_missing');
    }

    const next = cloneWorkshopRegistryValue(this.snapshot.records[recordIndex]);
    next.approvedCapabilities = normalizeWorkshopRegistryCapabilities([...capabilities]);
    next.updatedAt = this.now().toISOString();
    const records = [...this.snapshot.records];
    records[recordIndex] = next;
    this.commit(records);
    return cloneWorkshopRegistryValue(next);
  }

  rollbackToLastKnownGood(sourceIdInput: string, itemIdInput: string): WorkshopRegistryRecord {
    this.requireWritable();
    const identity = normalizeWorkshopRegistryIdentity(sourceIdInput, itemIdInput);
    const recordIndex = this.findIndex(identity.sourceId, identity.itemId);
    if (recordIndex < 0) throw new Error('workshop_registry_record_missing');
    const current = this.snapshot.records[recordIndex];
    if ((current.state !== 'enabled' && current.state !== 'disabled') || !current.lastKnownGoodRevision) {
      throw new Error('workshop_registry_rollback_unavailable');
    }
    const next = cloneWorkshopRegistryValue(current);
    const replacedRevision = current.activeRevision ?? current.candidateRevision;
    next.state = 'disabled';
    next.candidateRevision = current.lastKnownGoodRevision;
    next.activeRevision = null;
    next.lastKnownGoodRevision = replacedRevision;
    next.approvedCapabilities = [];
    next.error = null;
    next.updatedAt = this.now().toISOString();
    const records = [...this.snapshot.records];
    records[recordIndex] = normalizeWorkshopRegistryRecord(next);
    this.commit(records);
    return cloneWorkshopRegistryValue(next);
  }

  private applyCandidateRevision(
    record: WorkshopRegistryRecord,
    nextState: WorkshopRegistryState,
    options: WorkshopRegistryTransitionOptions,
  ): void {
    if (nextState === 'staged') {
      if (!options.candidateRevision) {
        throw new Error('workshop_registry_candidate_missing');
      }
      record.candidateRevision = normalizeWorkshopRegistryRevision(options.candidateRevision);
      return;
    }
    if (options.candidateRevision) {
      throw new Error('workshop_registry_candidate_not_allowed');
    }
  }

  private applyError(
    record: WorkshopRegistryRecord,
    nextState: WorkshopRegistryState,
    options: WorkshopRegistryTransitionOptions,
    now: string,
  ): void {
    if (nextState === 'error' || nextState === 'quarantined') {
      record.error = {
        code: normalizeWorkshopRegistryErrorCode(options.errorCode),
        at: now,
      };
      return;
    }
    if (options.errorCode !== undefined) {
      throw new Error('workshop_registry_error_not_allowed');
    }
    record.error = null;
  }

  private applyActivation(
    current: WorkshopRegistryRecord,
    next: WorkshopRegistryRecord,
    nextState: WorkshopRegistryState,
  ): void {
    if (nextState === 'enabled') {
      if (!next.candidateRevision) {
        throw new Error('workshop_registry_candidate_missing');
      }
      if (
        next.activeRevision &&
        next.activeRevision.manifestSha256 !== next.candidateRevision.manifestSha256
      ) {
        next.lastKnownGoodRevision = next.activeRevision;
      }
      next.activeRevision = next.candidateRevision;
      return;
    }
    if (nextState === 'disabled' && current.state === 'enabled') {
      next.lastKnownGoodRevision = next.activeRevision ?? next.lastKnownGoodRevision;
      next.activeRevision = null;
    }
  }

  private load(): WorkshopRegistrySnapshot {
    if (!existsSync(this.filePath)) {
      return createEmptyWorkshopRegistrySnapshot();
    }
    try {
      return normalizeWorkshopRegistrySnapshot(
        JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown,
      );
    } catch {
      this.writable = false;
      this.loadError = 'registry-unreadable';
      return createEmptyWorkshopRegistrySnapshot();
    }
  }

  private requireWritable(): void {
    if (!this.writable) {
      throw new Error('workshop_registry_unreadable');
    }
  }

  private find(sourceId: string, itemId: string): WorkshopRegistryRecord | undefined {
    return this.snapshot.records.find((record) =>
      record.sourceId === sourceId && record.itemId.toLowerCase() === itemId.toLowerCase(),
    );
  }

  private findIndex(sourceId: string, itemId: string): number {
    return this.snapshot.records.findIndex((record) =>
      record.sourceId === sourceId && record.itemId.toLowerCase() === itemId.toLowerCase(),
    );
  }

  private commit(recordsInput: WorkshopRegistryRecord[]): void {
    const records = recordsInput
      .map(normalizeWorkshopRegistryRecord)
      .sort((left, right) =>
        left.sourceId.localeCompare(right.sourceId) || left.itemId.localeCompare(right.itemId),
      );
    const snapshot: WorkshopRegistrySnapshot = {
      formatVersion: workshopRegistryFormatVersion,
      revision: this.snapshot.revision + 1,
      records,
    };
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    mkdirSync(dirname(this.filePath), { recursive: true });
    try {
      writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      renameSync(temporaryPath, this.filePath);
    } catch (error) {
      rmSync(temporaryPath, { force: true });
      throw error;
    }
    this.snapshot = snapshot;
  }
}
