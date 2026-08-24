import type { WorkshopInstallLocationResult, WorkshopSource } from './WorkshopSource';
import type {
  WorkshopCompatibilityIssue,
  WorkshopCompatibilityResult,
  WorkshopCompatibilityService,
  WorkshopAvailableDependencies,
} from './WorkshopCompatibilityService';
import type { WorkshopRegistry } from './WorkshopRegistry';
import type {
  WorkshopRegistryRecord,
  WorkshopRegistryRevision,
} from './WorkshopRegistryTypes';
import {
  WorkshopStagingInstaller,
  type InspectedWorkshopContent,
  type WorkshopStagingInput,
  type WorkshopStagingResult,
} from './WorkshopStagingInstaller';

type WorkshopRegistryPort = Pick<
  WorkshopRegistry,
  'get' | 'getSnapshot' | 'registerDetected' | 'transition'
>;

type WorkshopCompatibilityPort = Pick<WorkshopCompatibilityService, 'evaluate'>;

type WorkshopStagingInstallerPort = {
  inspect(sourceDirectory: string): Promise<InspectedWorkshopContent>;
  stage(input: WorkshopStagingInput): Promise<WorkshopStagingResult>;
  verifyRevision(
    sourceId: string,
    itemId: string,
    revision: WorkshopRegistryRevision,
  ): Promise<InspectedWorkshopContent>;
  rollbackStaged(result: WorkshopStagingResult): Promise<boolean>;
};

export type WorkshopIngestionServiceOptions = {
  source: WorkshopSource;
  registry: WorkshopRegistryPort;
  compatibility: WorkshopCompatibilityPort;
  installer: WorkshopStagingInstallerPort;
  getAvailableDependencies?: () => WorkshopAvailableDependencies;
};

export type WorkshopIngestionResult =
  | {
      ok: true;
      record: WorkshopRegistryRecord;
      installationCreated: boolean;
      resumed: boolean;
    }
  | {
      ok: false;
      reason:
        | 'source-unavailable'
        | 'content-invalid'
        | 'incompatible'
        | 'staging-failed'
        | 'registry-error';
      record: WorkshopRegistryRecord | null;
      sourceReason?: Extract<WorkshopInstallLocationResult, { ok: false }>['reason'];
      compatibilityIssues?: WorkshopCompatibilityIssue[];
    };

const installedRegistryStates = new Set(['staged', 'disabled', 'enabled']);

export class WorkshopIngestionService {
  private readonly source: WorkshopSource;
  private readonly registry: WorkshopRegistryPort;
  private readonly compatibility: WorkshopCompatibilityPort;
  private readonly installer: WorkshopStagingInstallerPort;
  private readonly getAvailableDependencies: () => WorkshopAvailableDependencies;
  private readonly inFlight = new Map<string, Promise<WorkshopIngestionResult>>();

  constructor(options: WorkshopIngestionServiceOptions) {
    this.source = options.source;
    this.registry = options.registry;
    this.compatibility = options.compatibility;
    this.installer = options.installer;
    this.getAvailableDependencies = options.getAvailableDependencies ?? (() =>
      new Map(
        this.registry.getSnapshot().records
          .filter((record) => installedRegistryStates.has(record.state))
          .flatMap((record) => {
            const revision = record.activeRevision ?? record.candidateRevision;
            return revision ? [[record.itemId, revision.version] as const] : [];
          }),
      ));
  }

  ingestInstalledItem(itemIdInput: string): Promise<WorkshopIngestionResult> {
    const itemId = itemIdInput.trim();
    const operationKey = `${this.source.sourceId}\0${itemId.toLowerCase()}`;
    const existing = this.inFlight.get(operationKey);
    if (existing) {
      return existing;
    }

    const operation = this.runIngestion(itemId).finally(() => {
      if (this.inFlight.get(operationKey) === operation) {
        this.inFlight.delete(operationKey);
      }
    });
    this.inFlight.set(operationKey, operation);
    return operation;
  }

  private async runIngestion(itemId: string): Promise<WorkshopIngestionResult> {
    let record: WorkshopRegistryRecord;
    try {
      record = this.registry.registerDetected(this.source.sourceId, itemId);
      const resumed = await this.tryResumeStaged(record);
      if (resumed) {
        return resumed;
      }
      record = this.prepareForIngestion(record);
    } catch {
      return this.registryFailure(itemId);
    }

    let location: WorkshopInstallLocationResult;
    try {
      location = this.source.getInstallLocation(itemId);
    } catch {
      location = { ok: false, reason: 'source-error' };
    }
    if (!location.ok) {
      try {
        record = this.registry.transition(this.source.sourceId, itemId, 'error', {
          errorCode: `source-${location.reason}`,
        });
      } catch {
        return this.registryFailure(itemId);
      }
      return {
        ok: false,
        reason: 'source-unavailable',
        sourceReason: location.reason,
        record,
      };
    }

    let content: InspectedWorkshopContent;
    try {
      content = await this.installer.inspect(location.directory);
    } catch {
      return this.quarantine(itemId, 'content-invalid', 'content-invalid');
    }

    let compatibility: WorkshopCompatibilityResult;
    try {
      compatibility = this.compatibility.evaluate(
        content.manifest,
        this.getAvailableDependencies(),
      );
    } catch {
      return this.quarantine(itemId, 'content-invalid', 'compatibility-check-failed');
    }
    if (!compatibility.compatible) {
      const result = this.quarantine(
        itemId,
        'incompatible',
        `compatibility-${compatibility.issues[0]?.code ?? 'unknown'}`,
      );
      return result.reason === 'registry-error' ? result : {
        ...result,
        compatibilityIssues: [...compatibility.issues],
      };
    }

    try {
      const current = this.registry.get(this.source.sourceId, itemId);
      if (!current) {
        return this.registryFailure(itemId);
      }
      record = current.state === 'verified'
        ? current
        : this.registry.transition(this.source.sourceId, itemId, 'verified');
    } catch {
      return this.registryFailure(itemId);
    }

    let staged: WorkshopStagingResult;
    try {
      staged = await this.installer.stage({
        sourceId: this.source.sourceId,
        itemId,
        content,
      });
    } catch {
      return this.quarantine(itemId, 'staging-failed', 'staging-failed');
    }

    let stagedRecorded = false;
    try {
      this.registry.transition(this.source.sourceId, itemId, 'staged', {
        candidateRevision: staged.revision,
      });
      stagedRecorded = true;
      record = this.registry.transition(this.source.sourceId, itemId, 'disabled');
      return {
        ok: true,
        record,
        installationCreated: staged.created,
        resumed: false,
      };
    } catch {
      if (!stagedRecorded) {
        try {
          await this.installer.rollbackStaged(staged);
        } catch {
          // The content remains inert and unregistered; later maintenance may clean this owned orphan.
        }
      }
      return this.registryFailure(itemId);
    }
  }

  private prepareForIngestion(record: WorkshopRegistryRecord): WorkshopRegistryRecord {
    if (record.state === 'error' || record.state === 'quarantined') {
      return this.registry.transition(record.sourceId, record.itemId, 'detected');
    }
    if (record.state === 'disabled' || record.state === 'enabled') {
      return this.registry.transition(record.sourceId, record.itemId, 'downloading');
    }
    return record;
  }

  private async tryResumeStaged(
    record: WorkshopRegistryRecord,
  ): Promise<WorkshopIngestionResult | null> {
    if (record.state !== 'staged' || !record.candidateRevision) {
      return null;
    }
    try {
      await this.installer.verifyRevision(record.sourceId, record.itemId, record.candidateRevision);
      const disabled = this.registry.transition(record.sourceId, record.itemId, 'disabled');
      return {
        ok: true,
        record: disabled,
        installationCreated: false,
        resumed: true,
      };
    } catch {
      return this.quarantine(record.itemId, 'staging-failed', 'staged-content-invalid');
    }
  }

  private quarantine(
    itemId: string,
    reason: 'content-invalid' | 'incompatible' | 'staging-failed',
    errorCode: string,
  ): Extract<WorkshopIngestionResult, { ok: false }> {
    try {
      const record = this.registry.transition(this.source.sourceId, itemId, 'quarantined', {
        errorCode,
      });
      return { ok: false, reason, record };
    } catch {
      return this.registryFailure(itemId);
    }
  }

  private registryFailure(
    itemId: string,
  ): Extract<WorkshopIngestionResult, { ok: false }> {
    let record: WorkshopRegistryRecord | null = null;
    try {
      record = this.registry.get(this.source.sourceId, itemId);
    } catch {
      // A fail-closed unreadable registry may reject even identity lookups.
    }
    return { ok: false, reason: 'registry-error', record };
  }
}

export const createWorkshopIngestionService = (
  options: Omit<WorkshopIngestionServiceOptions, 'installer'> & {
    installer?: WorkshopStagingInstallerPort;
    installRootDirectory?: string;
  },
): WorkshopIngestionService => {
  const { installer, installRootDirectory, ...serviceOptions } = options;
  return new WorkshopIngestionService({
    ...serviceOptions,
    installer: installer ?? new WorkshopStagingInstaller({ rootDirectory: installRootDirectory }),
  });
};
