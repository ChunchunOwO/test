import type { WorkshopDataContentHandlerRegistry } from './WorkshopDataContentHandler';
import {
  isWorkshopDataContentKind,
  type WorkshopDataCatalogRecord,
} from './WorkshopDataContributionTypes';
import { loadWorkshopDataCatalogRecord } from './WorkshopDataCatalogRecordLoader';
import type { WorkshopDataCatalog } from './WorkshopDataCatalog';
import type { WorkshopRegistry } from './WorkshopRegistry';
import type { WorkshopRegistryRecord, WorkshopRegistryRevision } from './WorkshopRegistryTypes';
import type { WorkshopStagingInstaller } from './WorkshopStagingInstaller';

type WorkshopDataActivationRegistryPort = Pick<WorkshopRegistry, 'get' | 'transition'>;

type WorkshopDataActivationCatalogPort = Pick<WorkshopDataCatalog, 'get' | 'put' | 'remove'>;

type WorkshopDataActivationInstallerPort = Pick<WorkshopStagingInstaller, 'verifyRevision'>;

export type WorkshopDataActivationServiceOptions = {
  registry: WorkshopDataActivationRegistryPort;
  catalog: WorkshopDataActivationCatalogPort;
  installer: WorkshopDataActivationInstallerPort;
  handlers: WorkshopDataContentHandlerRegistry;
  now?: () => Date;
};

export type WorkshopDataActivationResult =
  | {
      ok: true;
      action: 'enabled';
      record: WorkshopRegistryRecord;
      catalogRecord: WorkshopDataCatalogRecord;
    }
  | {
      ok: true;
      action: 'disabled';
      record: WorkshopRegistryRecord;
      catalogRecord: null;
    }
  | {
      ok: false;
      reason:
        | 'record-missing'
        | 'state-invalid'
        | 'content-kind-unsupported'
        | 'content-invalid'
        | 'catalog-error'
        | 'registry-error';
      record: WorkshopRegistryRecord | null;
    };

export class WorkshopDataActivationService {
  private readonly registry: WorkshopDataActivationRegistryPort;
  private readonly catalog: WorkshopDataActivationCatalogPort;
  private readonly installer: WorkshopDataActivationInstallerPort;
  private readonly handlers: WorkshopDataContentHandlerRegistry;
  private readonly now: () => Date;
  private readonly inFlight = new Map<string, Promise<WorkshopDataActivationResult>>();

  constructor(options: WorkshopDataActivationServiceOptions) {
    this.registry = options.registry;
    this.catalog = options.catalog;
    this.installer = options.installer;
    this.handlers = options.handlers;
    this.now = options.now ?? (() => new Date());
  }

  enable(sourceId: string, itemId: string): Promise<WorkshopDataActivationResult> {
    return this.runExclusive(sourceId, itemId, () => this.runEnable(sourceId, itemId));
  }

  disable(sourceId: string, itemId: string): Promise<WorkshopDataActivationResult> {
    return this.runExclusive(sourceId, itemId, () => this.runDisable(sourceId, itemId));
  }

  private async runEnable(
    sourceId: string,
    itemId: string,
  ): Promise<WorkshopDataActivationResult> {
    const record = this.readRegistryRecord(sourceId, itemId);
    if (!record) {
      return { ok: false, reason: 'record-missing', record: null };
    }
    if (record.state !== 'disabled' || !record.candidateRevision) {
      return { ok: false, reason: 'state-invalid', record };
    }
    if (!isWorkshopDataContentKind(record.candidateRevision.contentKind)) {
      return { ok: false, reason: 'content-kind-unsupported', record };
    }

    let catalogRecord: WorkshopDataCatalogRecord;
    try {
      catalogRecord = await loadWorkshopDataCatalogRecord(
        record.sourceId,
        record.itemId,
        record.candidateRevision,
        {
          installer: this.installer,
          handlers: this.handlers,
          now: this.now,
        },
      );
    } catch {
      return this.quarantine(record, 'content-invalid');
    }
    let previous: WorkshopDataCatalogRecord | null;
    try {
      previous = this.catalog.get(record.sourceId, record.itemId);
      this.catalog.put(catalogRecord);
    } catch {
      return { ok: false, reason: 'catalog-error', record };
    }

    try {
      const enabled = this.registry.transition(record.sourceId, record.itemId, 'enabled');
      return { ok: true, action: 'enabled', record: enabled, catalogRecord };
    } catch {
      try {
        this.restoreCatalog(record.sourceId, record.itemId, previous);
      } catch {
        // Consumers must still cross-check Registry state; a disabled record is never runnable.
      }
      return {
        ok: false,
        reason: 'registry-error',
        record: this.readRegistryRecord(record.sourceId, record.itemId),
      };
    }
  }

  private async runDisable(
    sourceId: string,
    itemId: string,
  ): Promise<WorkshopDataActivationResult> {
    const record = this.readRegistryRecord(sourceId, itemId);
    if (!record) {
      return { ok: false, reason: 'record-missing', record: null };
    }
    if (record.state !== 'enabled' || !record.activeRevision) {
      return { ok: false, reason: 'state-invalid', record };
    }

    let previous: WorkshopDataCatalogRecord | null;
    try {
      previous = this.catalog.get(record.sourceId, record.itemId);
      if (!previous || !this.catalogMatchesRevision(previous, record.activeRevision)) {
        return { ok: false, reason: 'catalog-error', record };
      }
      this.catalog.remove(record.sourceId, record.itemId);
    } catch {
      return { ok: false, reason: 'catalog-error', record };
    }

    try {
      const disabled = this.registry.transition(record.sourceId, record.itemId, 'disabled');
      return { ok: true, action: 'disabled', record: disabled, catalogRecord: null };
    } catch {
      try {
        this.catalog.put(previous);
      } catch {
        // Registry remains enabled; fail closed consumers must require a matching catalog record.
      }
      return {
        ok: false,
        reason: 'registry-error',
        record: this.readRegistryRecord(record.sourceId, record.itemId),
      };
    }
  }

  private quarantine(
    record: WorkshopRegistryRecord,
    reason: 'content-invalid',
  ): WorkshopDataActivationResult {
    try {
      const quarantined = this.registry.transition(record.sourceId, record.itemId, 'quarantined', {
        errorCode: 'data-activation-invalid',
      });
      return { ok: false, reason, record: quarantined };
    } catch {
      return { ok: false, reason: 'registry-error', record };
    }
  }

  private restoreCatalog(
    sourceId: string,
    itemId: string,
    previous: WorkshopDataCatalogRecord | null,
  ): void {
    if (previous) {
      this.catalog.put(previous);
    } else {
      this.catalog.remove(sourceId, itemId);
    }
  }

  private catalogMatchesRevision(
    catalogRecord: WorkshopDataCatalogRecord,
    revision: WorkshopRegistryRevision,
  ): boolean {
    return catalogRecord.contentId === revision.contentId &&
      catalogRecord.contentKind === revision.contentKind &&
      catalogRecord.version === revision.version &&
      catalogRecord.manifestSha256 === revision.manifestSha256;
  }

  private readRegistryRecord(sourceId: string, itemId: string): WorkshopRegistryRecord | null {
    try {
      return this.registry.get(sourceId, itemId);
    } catch {
      return null;
    }
  }

  private runExclusive(
    sourceId: string,
    itemId: string,
    run: () => Promise<WorkshopDataActivationResult>,
  ): Promise<WorkshopDataActivationResult> {
    const key = `${sourceId.trim().toLowerCase()}\0${itemId.trim().toLowerCase()}`;
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }
    const operation = run().finally(() => {
      if (this.inFlight.get(key) === operation) {
        this.inFlight.delete(key);
      }
    });
    this.inFlight.set(key, operation);
    return operation;
  }
}
