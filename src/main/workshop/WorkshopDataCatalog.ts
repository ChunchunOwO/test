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
  cloneWorkshopDataCatalogValue,
  createEmptyWorkshopDataCatalogSnapshot,
  normalizeWorkshopDataCatalogRecord,
  normalizeWorkshopDataCatalogSnapshot,
} from './WorkshopDataCatalogCodec';
import type { WorkshopDataContentHandlerRegistry } from './WorkshopDataContentHandler';
import {
  workshopDataCatalogFormatVersion,
  type WorkshopDataCatalogHealth,
  type WorkshopDataCatalogRecord,
  type WorkshopDataCatalogSnapshot,
} from './WorkshopDataContributionTypes';
import { createWorkshopDataHandlerRegistry } from './WorkshopDataHandlers';
import { normalizeWorkshopRegistryIdentity } from './WorkshopRegistryCodec';

export type WorkshopDataCatalogOptions = {
  filePath?: string;
  handlers?: WorkshopDataContentHandlerRegistry;
};

export const getWorkshopDataCatalogPath = (): string =>
  join(app.getPath('userData'), 'workshop', 'data-catalog.json');

export class WorkshopDataCatalog {
  private snapshot: WorkshopDataCatalogSnapshot;
  private writable = true;
  private loadError: WorkshopDataCatalogHealth['error'] = null;
  private readonly filePath: string;
  private readonly handlers: WorkshopDataContentHandlerRegistry;

  constructor(options: WorkshopDataCatalogOptions = {}) {
    this.filePath = options.filePath ?? getWorkshopDataCatalogPath();
    this.handlers = options.handlers ?? createWorkshopDataHandlerRegistry();
    this.snapshot = this.load();
  }

  getHealth(): WorkshopDataCatalogHealth {
    return { writable: this.writable, error: this.loadError };
  }

  getSnapshot(): WorkshopDataCatalogSnapshot {
    return cloneWorkshopDataCatalogValue(this.snapshot);
  }

  get(sourceIdInput: string, itemIdInput: string): WorkshopDataCatalogRecord | null {
    const identity = normalizeWorkshopRegistryIdentity(sourceIdInput, itemIdInput);
    const record = this.find(identity.sourceId, identity.itemId);
    return record ? cloneWorkshopDataCatalogValue(record) : null;
  }

  put(recordInput: WorkshopDataCatalogRecord): WorkshopDataCatalogRecord {
    this.requireWritable();
    const record = normalizeWorkshopDataCatalogRecord(recordInput, this.handlers);
    const existingIndex = this.findIndex(record.sourceId, record.itemId);
    const records = [...this.snapshot.records];
    if (existingIndex >= 0) {
      records[existingIndex] = record;
    } else {
      records.push(record);
    }
    this.commit(records);
    return cloneWorkshopDataCatalogValue(record);
  }

  remove(sourceIdInput: string, itemIdInput: string): WorkshopDataCatalogRecord | null {
    this.requireWritable();
    const identity = normalizeWorkshopRegistryIdentity(sourceIdInput, itemIdInput);
    const existingIndex = this.findIndex(identity.sourceId, identity.itemId);
    if (existingIndex < 0) {
      return null;
    }
    const existing = this.snapshot.records[existingIndex];
    this.commit(this.snapshot.records.filter((_record, index) => index !== existingIndex));
    return cloneWorkshopDataCatalogValue(existing);
  }

  private load(): WorkshopDataCatalogSnapshot {
    if (!existsSync(this.filePath)) {
      return createEmptyWorkshopDataCatalogSnapshot();
    }
    try {
      return normalizeWorkshopDataCatalogSnapshot(
        JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown,
        this.handlers,
      );
    } catch {
      this.writable = false;
      this.loadError = 'catalog-unreadable';
      return createEmptyWorkshopDataCatalogSnapshot();
    }
  }

  private requireWritable(): void {
    if (!this.writable) {
      throw new Error('workshop_data_catalog_unreadable');
    }
  }

  private find(sourceId: string, itemId: string): WorkshopDataCatalogRecord | undefined {
    return this.snapshot.records.find((record) =>
      record.sourceId === sourceId && record.itemId.toLowerCase() === itemId.toLowerCase());
  }

  private findIndex(sourceId: string, itemId: string): number {
    return this.snapshot.records.findIndex((record) =>
      record.sourceId === sourceId && record.itemId.toLowerCase() === itemId.toLowerCase());
  }

  private commit(recordsInput: WorkshopDataCatalogRecord[]): void {
    const records = recordsInput
      .map((record) => normalizeWorkshopDataCatalogRecord(record, this.handlers))
      .sort((left, right) =>
        left.sourceId.localeCompare(right.sourceId) || left.itemId.localeCompare(right.itemId));
    const snapshot: WorkshopDataCatalogSnapshot = {
      formatVersion: workshopDataCatalogFormatVersion,
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
