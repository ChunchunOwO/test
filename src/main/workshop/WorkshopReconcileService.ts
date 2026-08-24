import type { WorkshopReconcileReport } from '../../shared/types/workshop';
import type { WorkshopDataContentHandlerRegistry } from './WorkshopDataContentHandler';
import {
  isWorkshopDataContentKind,
  type WorkshopDataCatalogRecord,
} from './WorkshopDataContributionTypes';
import { loadWorkshopDataCatalogRecord } from './WorkshopDataCatalogRecordLoader';
import type { WorkshopDataCatalog } from './WorkshopDataCatalog';
import type { WorkshopRegistry } from './WorkshopRegistry';
import type { WorkshopRegistryRecord } from './WorkshopRegistryTypes';
import type { WorkshopStagingInstaller } from './WorkshopStagingInstaller';

type WorkshopReconcileRegistryPort = Pick<
  WorkshopRegistry,
  'getHealth' | 'getSnapshot' | 'transition'
>;

type WorkshopReconcileCatalogPort = Pick<
  WorkshopDataCatalog,
  'getHealth' | 'getSnapshot' | 'get' | 'put' | 'remove'
>;

type WorkshopReconcileInstallerPort = Pick<WorkshopStagingInstaller, 'verifyRevision'>;

export type WorkshopReconcileServiceOptions = {
  registry: WorkshopReconcileRegistryPort;
  catalog: WorkshopReconcileCatalogPort;
  installer: WorkshopReconcileInstallerPort;
  handlers: WorkshopDataContentHandlerRegistry;
  now?: () => Date;
};

const itemKey = (sourceId: string, itemId: string): string =>
  `${sourceId.trim().toLowerCase()}\0${itemId.trim().toLowerCase()}`;

const catalogRecordsMatch = (
  left: WorkshopDataCatalogRecord,
  right: WorkshopDataCatalogRecord,
): boolean =>
  left.sourceId === right.sourceId &&
  left.itemId.toLowerCase() === right.itemId.toLowerCase() &&
  left.contentId === right.contentId &&
  left.contentKind === right.contentKind &&
  left.version === right.version &&
  left.manifestSha256 === right.manifestSha256 &&
  left.entryPath === right.entryPath &&
  JSON.stringify(left.contribution) === JSON.stringify(right.contribution);

export class WorkshopReconcileService {
  private readonly registry: WorkshopReconcileRegistryPort;
  private readonly catalog: WorkshopReconcileCatalogPort;
  private readonly installer: WorkshopReconcileInstallerPort;
  private readonly handlers: WorkshopDataContentHandlerRegistry;
  private readonly now: () => Date;
  private inFlight: Promise<WorkshopReconcileReport> | null = null;

  constructor(options: WorkshopReconcileServiceOptions) {
    this.registry = options.registry;
    this.catalog = options.catalog;
    this.installer = options.installer;
    this.handlers = options.handlers;
    this.now = options.now ?? (() => new Date());
  }

  reconcile(): Promise<WorkshopReconcileReport> {
    if (this.inFlight) {
      return this.inFlight;
    }
    const operation = this.run().finally(() => {
      if (this.inFlight === operation) {
        this.inFlight = null;
      }
    });
    this.inFlight = operation;
    return operation;
  }

  private async run(): Promise<WorkshopReconcileReport> {
    const startedAt = this.now().toISOString();
    const report = {
      examined: 0,
      stagedRecovered: 0,
      catalogRestored: 0,
      catalogPruned: 0,
      quarantined: 0,
      failureCodes: [] as string[],
    };
    const registryHealth = this.registry.getHealth();
    const catalogHealth = this.catalog.getHealth();
    if (!registryHealth.writable || !catalogHealth.writable) {
      this.addFailure(
        report.failureCodes,
        !registryHealth.writable ? 'registry-unreadable' : 'catalog-unreadable',
      );
      return this.completeReport(startedAt, report);
    }

    const registryRecords = this.registry.getSnapshot().records;
    const initialCatalogRecords = this.catalog.getSnapshot().records;
    const validCatalogKeys = new Set<string>();
    const removedCatalogKeys = new Set<string>();
    report.examined = registryRecords.length;

    for (const record of registryRecords) {
      if (record.state === 'staged') {
        await this.recoverStagedRecord(record, report);
        continue;
      }

      const revision = record.activeRevision;
      if (
        record.state === 'enabled' &&
        revision &&
        isWorkshopDataContentKind(revision.contentKind)
      ) {
        const reconciled = await this.reconcileEnabledRecord(record, report);
        if (reconciled) {
          validCatalogKeys.add(itemKey(record.sourceId, record.itemId));
        }
        continue;
      }

      await this.pruneCatalogRecord(record.sourceId, record.itemId, report, removedCatalogKeys);
    }

    for (const catalogRecord of initialCatalogRecords) {
      const key = itemKey(catalogRecord.sourceId, catalogRecord.itemId);
      if (validCatalogKeys.has(key) || removedCatalogKeys.has(key)) {
        continue;
      }
      await this.pruneCatalogRecord(
        catalogRecord.sourceId,
        catalogRecord.itemId,
        report,
        removedCatalogKeys,
      );
    }

    return this.completeReport(startedAt, report);
  }

  private async recoverStagedRecord(
    record: WorkshopRegistryRecord,
    report: Pick<WorkshopReconcileReport, 'stagedRecovered' | 'quarantined' | 'failureCodes'>,
  ): Promise<void> {
    if (!record.candidateRevision) {
      this.quarantine(record, 'staged-revision-missing', report);
      return;
    }
    try {
      await this.installer.verifyRevision(record.sourceId, record.itemId, record.candidateRevision);
      this.registry.transition(record.sourceId, record.itemId, 'disabled');
      report.stagedRecovered += 1;
    } catch {
      this.quarantine(record, 'staged-content-invalid', report);
    }
  }

  private async reconcileEnabledRecord(
    record: WorkshopRegistryRecord,
    report: Pick<
      WorkshopReconcileReport,
      'catalogRestored' | 'catalogPruned' | 'quarantined' | 'failureCodes'
    >,
  ): Promise<boolean> {
    const revision = record.activeRevision;
    if (!revision || !isWorkshopDataContentKind(revision.contentKind)) {
      return false;
    }

    let existing: WorkshopDataCatalogRecord | null = null;
    try {
      existing = this.catalog.get(record.sourceId, record.itemId);
      const loaded = await loadWorkshopDataCatalogRecord(
        record.sourceId,
        record.itemId,
        revision,
        {
          installer: this.installer,
          handlers: this.handlers,
          now: this.now,
        },
        existing?.activatedAt,
      );
      if (!existing || !catalogRecordsMatch(existing, loaded)) {
        this.catalog.put(loaded);
        report.catalogRestored += 1;
      }
      return true;
    } catch {
      try {
        if (this.catalog.remove(record.sourceId, record.itemId)) {
          report.catalogPruned += 1;
        }
      } catch {
        this.addFailure(report.failureCodes, 'catalog-prune-failed');
      }
      this.quarantine(record, 'enabled-content-invalid', report);
      return false;
    }
  }

  private async pruneCatalogRecord(
    sourceId: string,
    itemId: string,
    report: Pick<WorkshopReconcileReport, 'catalogPruned' | 'failureCodes'>,
    removedCatalogKeys: Set<string>,
  ): Promise<void> {
    try {
      if (this.catalog.remove(sourceId, itemId)) {
        report.catalogPruned += 1;
      }
      removedCatalogKeys.add(itemKey(sourceId, itemId));
    } catch {
      this.addFailure(report.failureCodes, 'catalog-prune-failed');
    }
  }

  private quarantine(
    record: WorkshopRegistryRecord,
    errorCode: string,
    report: Pick<WorkshopReconcileReport, 'quarantined' | 'failureCodes'>,
  ): void {
    try {
      this.registry.transition(record.sourceId, record.itemId, 'quarantined', { errorCode });
      report.quarantined += 1;
    } catch {
      this.addFailure(report.failureCodes, 'registry-quarantine-failed');
    }
  }

  private addFailure(failureCodes: string[], code: string): void {
    if (failureCodes.length < 50) {
      failureCodes.push(code);
    }
  }

  private completeReport(
    startedAt: string,
    report: Omit<WorkshopReconcileReport, 'ok' | 'startedAt' | 'completedAt'>,
  ): WorkshopReconcileReport {
    return {
      ok: report.failureCodes.length === 0,
      startedAt,
      completedAt: this.now().toISOString(),
      ...report,
    };
  }
}
