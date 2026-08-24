import {
  workshopApplicableContentKinds,
  type WorkshopActiveThemeBackground,
  type WorkshopActiveVisualizerPreset,
  type WorkshopBrowsePage,
  type WorkshopBrowseRequest,
  type WorkshopManagerAction,
  type WorkshopManagerActionResult,
  type WorkshopManagerItem,
  type WorkshopManagerItemRequest,
  type WorkshopManagerSnapshot,
  type WorkshopPluginCapability,
  type WorkshopPluginSnapshot,
  type WorkshopReconcileReport,
  type WorkshopReconcileStatus,
  type WorkshopRollbackResult,
  type WorkshopSubscriptionCatalog,
} from '../../shared/types/workshop';
import type { WorkshopActiveLyricsScene } from '../../shared/types/workshopLyricsScene';
import type { WorkshopDataActivationService } from './WorkshopDataActivationService';
import type { WorkshopDataCatalog } from './WorkshopDataCatalog';
import type { WorkshopContributionApplyService } from './WorkshopContributionApplyService';
import type { WorkshopIngestionService } from './WorkshopIngestionService';
import type { WorkshopReconcileService } from './WorkshopReconcileService';
import type { WorkshopRegistry } from './WorkshopRegistry';
import type { WorkshopSource } from './WorkshopSource';
import { buildWorkshopManagerThemeSummary } from './WorkshopManagerThemeSummary';
import { buildWorkshopManagerAudioPluginProfileSummary } from './WorkshopManagerAudioPluginProfileSummary';
import { buildWorkshopManagerLyricsStyleSummary } from './WorkshopManagerLyricsStyleSummary';
import type { WorkshopPluginService } from './WorkshopPluginService';

type WorkshopManagerRegistryPort = Pick<WorkshopRegistry, 'get' | 'getHealth' | 'getSnapshot' | 'rollbackToLastKnownGood'>;
type WorkshopManagerCatalogPort = Pick<WorkshopDataCatalog, 'get' | 'getHealth' | 'getSnapshot' | 'put' | 'remove'>;
type WorkshopManagerIngestionPort = Pick<WorkshopIngestionService, 'ingestInstalledItem'>;
type WorkshopManagerActivationPort = Pick<WorkshopDataActivationService, 'enable' | 'disable'>;
type WorkshopManagerReconcilePort = Pick<WorkshopReconcileService, 'reconcile'>;
type WorkshopManagerContributionApplyPort = Pick<
  WorkshopContributionApplyService,
  'apply' | 'getActiveLyricsScene' | 'clearActiveLyricsScene' | 'getActiveVisualizerPreset' | 'getActiveThemeBackground'
>;
type WorkshopManagerPluginPort = Pick<WorkshopPluginService, 'getSnapshot' | 'enable' | 'disable'>;

type WorkshopBrowsePort = {
  browse(request: WorkshopBrowseRequest): Promise<WorkshopBrowsePage>;
  subscribe(itemId: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  unsubscribe(itemId: string): Promise<{ ok: true } | { ok: false; reason: string }>;
  openInSteam(itemId: string): { ok: true } | { ok: false; reason: string };
};

export type WorkshopManagerServiceOptions = {
  source: WorkshopSource;
  registry: WorkshopManagerRegistryPort;
  catalog: WorkshopManagerCatalogPort;
  ingestion: WorkshopManagerIngestionPort;
  activation: WorkshopManagerActivationPort;
  reconcile: WorkshopManagerReconcilePort;
  contributionApply: WorkshopManagerContributionApplyPort;
  plugins?: WorkshopManagerPluginPort;
  getActiveThemeId?: () => string | null;
  browse?: WorkshopBrowsePort;
  now?: () => Date;
};

const itemKey = (sourceId: string, itemId: string): string =>
  `${sourceId.trim().toLowerCase()}\0${itemId.trim().toLowerCase()}`;

const normalizeItemRequest = (value: WorkshopManagerItemRequest): WorkshopManagerItemRequest | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const sourceId = typeof value.sourceId === 'string' ? value.sourceId.trim().toLowerCase() : '';
  const itemId = typeof value.itemId === 'string' ? value.itemId.trim() : '';
  if (!sourceId || sourceId.length > 64 || !itemId || itemId.length > 128) {
    return null;
  }
  return {
    sourceId,
    itemId,
    ...(value.approveUiRuntime === true ? { approveUiRuntime: true } : {}),
    ...(Array.isArray(value.approvePluginCapabilities)
      ? { approvePluginCapabilities: value.approvePluginCapabilities.filter((capability): capability is WorkshopPluginCapability =>
          typeof capability === 'string') }
      : {}),
  };
};

export class WorkshopManagerService {
  private readonly source: WorkshopSource;
  private readonly registry: WorkshopManagerRegistryPort;
  private readonly catalog: WorkshopManagerCatalogPort;
  private readonly ingestion: WorkshopManagerIngestionPort;
  private readonly activation: WorkshopManagerActivationPort;
  private readonly reconcileService: WorkshopManagerReconcilePort;
  private readonly contributionApply: WorkshopManagerContributionApplyPort;
  private readonly plugins: WorkshopManagerPluginPort | null;
  private readonly getActiveThemeId: () => string | null;
  private readonly browseSource: WorkshopBrowsePort | null;
  private readonly now: () => Date;
  private reconcileStatus: WorkshopReconcileStatus = { state: 'idle', lastReport: null };
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(options: WorkshopManagerServiceOptions) {
    this.source = options.source;
    this.registry = options.registry;
    this.catalog = options.catalog;
    this.ingestion = options.ingestion;
    this.activation = options.activation;
    this.reconcileService = options.reconcile;
    this.contributionApply = options.contributionApply;
    this.plugins = options.plugins ?? null;
    this.getActiveThemeId = options.getActiveThemeId ?? (() => null);
    this.browseSource = options.browse ?? null;
    this.now = options.now ?? (() => new Date());
  }

  startStartupReconcile(): void {
    void this.enqueueMutation(() => this.runReconcile()).catch(() => undefined);
  }

  getSnapshot(): WorkshopManagerSnapshot {
    const registryHealth = this.registry.getHealth();
    const registrySnapshot = this.registry.getSnapshot();
    const catalogHealth = this.catalog.getHealth();
    const catalogSnapshot = this.catalog.getSnapshot();
    let activeThemeId: string | null = null;
    try {
      activeThemeId = this.getActiveThemeId();
    } catch {
      activeThemeId = null;
    }
    let source: WorkshopSubscriptionCatalog;
    try {
      source = this.source.listSubscribed();
    } catch {
      source = { available: false, reason: 'subscription-query-failed', items: [] };
    }

    const subscriptions = new Map(
      source.items.map((item) => [itemKey(this.source.sourceId, item.itemId), item]),
    );
    const catalogRecords = new Map(
      catalogSnapshot.records.map((record) => [itemKey(record.sourceId, record.itemId), record]),
    );
    const items: WorkshopManagerItem[] = registrySnapshot.records.map((record) => {
      const revision = record.activeRevision ?? record.candidateRevision;
      const catalogRecord = catalogRecords.get(itemKey(record.sourceId, record.itemId));
      const catalogReady = Boolean(
        record.state === 'enabled' &&
        record.activeRevision &&
        catalogRecord &&
        catalogRecord.contentId === record.activeRevision.contentId &&
        catalogRecord.contentKind === record.activeRevision.contentKind &&
        catalogRecord.version === record.activeRevision.version &&
        catalogRecord.manifestSha256 === record.activeRevision.manifestSha256,
      );
      return {
        sourceId: record.sourceId,
        itemId: record.itemId,
        state: record.state,
        contentId: revision?.contentId ?? null,
        contentKind: revision?.contentKind ?? null,
        version: revision?.version ?? null,
        previousVersion: record.lastKnownGoodRevision?.version ?? null,
        enabled: record.state === 'enabled',
        catalogReady,
        errorCode: record.error?.code ?? null,
        subscription: subscriptions.get(itemKey(record.sourceId, record.itemId)) ?? null,
        theme: buildWorkshopManagerThemeSummary(catalogRecord, activeThemeId),
        lyricsStyle: buildWorkshopManagerLyricsStyleSummary(catalogRecord),
        audioPluginProfile: buildWorkshopManagerAudioPluginProfileSummary(catalogRecord),
      };
    });
    const knownKeys = new Set(items.map((item) => itemKey(item.sourceId, item.itemId)));
    for (const subscription of source.items) {
      const key = itemKey(this.source.sourceId, subscription.itemId);
      if (knownKeys.has(key)) {
        continue;
      }
      items.push({
        sourceId: this.source.sourceId,
        itemId: subscription.itemId,
        state: 'not-ingested',
        contentId: null,
        contentKind: null,
        version: null,
        previousVersion: null,
        enabled: false,
        catalogReady: false,
        errorCode: subscription.error,
        subscription,
        theme: null,
        lyricsStyle: null,
        audioPluginProfile: null,
      });
    }
    items.sort((left, right) =>
      Number(right.enabled) - Number(left.enabled) ||
      (left.contentId ?? left.itemId).localeCompare(right.contentId ?? right.itemId),
    );

    return {
      source,
      registry: {
        writable: registryHealth.writable,
        error: registryHealth.error,
        revision: registrySnapshot.revision,
      },
      catalog: {
        writable: catalogHealth.writable,
        error: catalogHealth.error,
        revision: catalogSnapshot.revision,
      },
      reconcile: {
        state: this.reconcileStatus.state,
        lastReport: this.reconcileStatus.lastReport
          ? { ...this.reconcileStatus.lastReport, failureCodes: [...this.reconcileStatus.lastReport.failureCodes] }
          : null,
      },
      items,
    };
  }

  getActiveLyricsScene(): WorkshopActiveLyricsScene | null {
    return this.contributionApply.getActiveLyricsScene();
  }

  clearActiveLyricsScene(): boolean {
    this.contributionApply.clearActiveLyricsScene();
    return true;
  }

  getActiveVisualizerPreset(): WorkshopActiveVisualizerPreset | null {
    return this.contributionApply.getActiveVisualizerPreset();
  }

  getActiveThemeBackground(): WorkshopActiveThemeBackground | null {
    return this.contributionApply.getActiveThemeBackground();
  }

  getPluginSnapshot(): Promise<WorkshopPluginSnapshot> {
    return this.plugins?.getSnapshot() ?? Promise.resolve({ plugins: [] });
  }

  use(requestInput: WorkshopManagerItemRequest): Promise<WorkshopManagerActionResult> {
    return this.enqueueMutation(async () => {
      const request = normalizeItemRequest(requestInput);
      if (!request || request.sourceId !== this.source.sourceId) {
        return this.actionResult('use', false, 'invalid-request');
      }
      const item = this.getSnapshot().items.find(
        (entry) => entry.sourceId === request.sourceId && entry.itemId === request.itemId,
      );
      if (!item) {
        return this.actionResult('use', false, 'invalid-request');
      }

      const needsDownload = !item.subscription?.installed || Boolean(item.subscription.needsUpdate);
      if (needsDownload) {
        try {
          const download = this.source.requestDownload(request.itemId, true);
          if (!download.ok) {
            return this.actionResult('use', false, download.reason);
          }
          if (download.state === 'accepted') {
            return this.actionResult('use', true, 'download-started');
          }
        } catch {
          return this.actionResult('use', false, 'source-error');
        }
      }

      const ingest = await this.ingestion.ingestInstalledItem(request.itemId);
      if (!ingest.ok) {
        const missingDependencies = ingest.compatibilityIssues
          ?.filter((issue) => issue.code === 'dependency-missing' && issue.subject)
          .map((issue) => issue.subject as string) ?? [];
        if (missingDependencies.length > 0 && this.browseSource) {
          const subscriptions = await Promise.all(missingDependencies.map((itemId) =>
            this.browseSource!.subscribe(itemId).catch(() => ({ ok: false as const, reason: 'source-error' }))));
          if (subscriptions.every((result) => result.ok)) {
            return this.actionResult('use', true, 'dependency-subscriptions-started');
          }
          return this.actionResult('use', false, 'dependency-subscription-failed');
        }
        return this.actionResult('use', false, ingest.reason);
      }

      const contentKind = ingest.record.candidateRevision?.contentKind
        ?? ingest.record.activeRevision?.contentKind
        ?? null;
      if (contentKind === 'plugin-package') {
        if (!this.plugins) {
          return this.actionResult('use', false, 'plugin-runtime-unavailable');
        }
        const enabled = await this.plugins.enable(
          request.sourceId,
          request.itemId,
          request.approvePluginCapabilities,
        );
        return this.actionResult('use', enabled.ok, enabled.ok ? null : enabled.reason);
      }

      const enable = await this.activation.enable(request.sourceId, request.itemId);
      if (!enable.ok) {
        return this.actionResult('use', false, enable.reason);
      }

      if (
        enable.catalogRecord?.contribution.type === 'echo-workshop-theme-preset' &&
        enable.catalogRecord.contribution.runtime &&
        request.approveUiRuntime !== true
      ) {
        return this.actionResult('use', false, 'ui-runtime-confirmation-required');
      }

      if (
        contentKind &&
        (workshopApplicableContentKinds as readonly string[]).includes(contentKind)
      ) {
        const apply = await this.contributionApply.apply(request.sourceId, request.itemId);
        if (!apply.ok) {
          return this.actionResult('use', false, apply.reason);
        }
      }

      return this.actionResult('use', true, null);
    });
  }

  browse(requestInput: WorkshopBrowseRequest): Promise<WorkshopBrowsePage> {
    return this.enqueueMutation(async () => {
      if (!this.browseSource) {
        return { available: false, reason: 'source-unavailable', page: 1, total: 0, items: [] };
      }
      try {
        return await this.browseSource.browse(requestInput);
      } catch {
        return { available: false, reason: 'query-failed', page: 1, total: 0, items: [] };
      }
    });
  }

  subscribe(requestInput: WorkshopManagerItemRequest): Promise<WorkshopManagerActionResult> {
    return this.enqueueMutation(async () => {
      const request = normalizeItemRequest(requestInput);
      if (!request || request.sourceId !== this.source.sourceId || !this.browseSource) {
        return this.actionResult('subscribe', false, 'invalid-request');
      }
      try {
        const result = await this.browseSource.subscribe(request.itemId);
        return this.actionResult('subscribe', result.ok, result.ok ? null : result.reason);
      } catch {
        return this.actionResult('subscribe', false, 'source-error');
      }
    });
  }

  unsubscribe(requestInput: WorkshopManagerItemRequest): Promise<WorkshopManagerActionResult> {
    return this.enqueueMutation(async () => {
      const request = normalizeItemRequest(requestInput);
      if (!request || request.sourceId !== this.source.sourceId || !this.browseSource) {
        return this.actionResult('unsubscribe', false, 'invalid-request');
      }
      try {
        const result = await this.browseSource.unsubscribe(request.itemId);
        return this.actionResult('unsubscribe', result.ok, result.ok ? null : result.reason);
      } catch {
        return this.actionResult('unsubscribe', false, 'source-error');
      }
    });
  }

  openInSteam(requestInput: WorkshopManagerItemRequest): Promise<WorkshopManagerActionResult> {
    return this.enqueueMutation(async () => {
      const request = normalizeItemRequest(requestInput);
      if (!request || request.sourceId !== this.source.sourceId || !this.browseSource) {
        return this.actionResult('open-in-steam', false, 'invalid-request');
      }
      try {
        const result = this.browseSource.openInSteam(request.itemId);
        return this.actionResult('open-in-steam', result.ok, result.ok ? null : result.reason);
      } catch {
        return this.actionResult('open-in-steam', false, 'source-error');
      }
    });
  }

  reconcile(): Promise<WorkshopManagerActionResult> {
    return this.enqueueMutation(async () => {
      const report = await this.runReconcile();
      return this.actionResult('reconcile', report.ok, report.ok ? null : 'reconcile-incomplete');
    });
  }

  requestDownload(requestInput: WorkshopManagerItemRequest): Promise<WorkshopManagerActionResult> {
    return this.enqueueMutation(async () => {
      const request = normalizeItemRequest(requestInput);
      if (!request || request.sourceId !== this.source.sourceId) {
        return this.actionResult('download', false, 'invalid-request');
      }
      try {
        const result = this.source.requestDownload(request.itemId, true);
        return this.actionResult('download', result.ok, result.ok ? null : result.reason);
      } catch {
        return this.actionResult('download', false, 'source-error');
      }
    });
  }

  ingest(requestInput: WorkshopManagerItemRequest): Promise<WorkshopManagerActionResult> {
    return this.enqueueMutation(async () => {
      const request = normalizeItemRequest(requestInput);
      if (!request || request.sourceId !== this.source.sourceId) {
        return this.actionResult('ingest', false, 'invalid-request');
      }
      const result = await this.ingestion.ingestInstalledItem(request.itemId);
      return this.actionResult('ingest', result.ok, result.ok ? null : result.reason);
    });
  }

  enable(requestInput: WorkshopManagerItemRequest): Promise<WorkshopManagerActionResult> {
    return this.runActivationAction('enable', requestInput);
  }

  disable(requestInput: WorkshopManagerItemRequest): Promise<WorkshopManagerActionResult> {
    return this.runActivationAction('disable', requestInput);
  }

  apply(requestInput: WorkshopManagerItemRequest): Promise<WorkshopManagerActionResult> {
    return this.enqueueMutation(async () => {
      const request = normalizeItemRequest(requestInput);
      if (!request) {
        return this.actionResult('apply', false, 'invalid-request');
      }
      const item = this.getSnapshot().items.find(
        (entry) => entry.sourceId === request.sourceId && entry.itemId === request.itemId,
      );
      if (item?.theme?.uiRuntime && request.approveUiRuntime !== true) {
        return this.actionResult('apply', false, 'ui-runtime-confirmation-required');
      }
      const result = await this.contributionApply.apply(request.sourceId, request.itemId);
      return this.actionResult('apply', result.ok, result.ok ? null : result.reason);
    });
  }

  rollback(requestInput: WorkshopManagerItemRequest): Promise<WorkshopRollbackResult> {
    return this.enqueueMutation(async () => {
      const request = normalizeItemRequest(requestInput);
      if (!request) return { ok: false, reason: 'invalid-request', snapshot: this.getSnapshot() };
      const record = this.registry.get(request.sourceId, request.itemId);
      if (!record?.lastKnownGoodRevision || (record.state !== 'enabled' && record.state !== 'disabled')) {
        return { ok: false, reason: 'rollback-unavailable', snapshot: this.getSnapshot() };
      }
      const previousCatalog = this.catalog.get(request.sourceId, request.itemId);
      try {
        if (previousCatalog) this.catalog.remove(request.sourceId, request.itemId);
        this.registry.rollbackToLastKnownGood(request.sourceId, request.itemId);
        return { ok: true, reason: null, snapshot: this.getSnapshot() };
      } catch {
        if (previousCatalog) {
          try { this.catalog.put(previousCatalog); } catch { /* Registry/catalog cross-check remains fail closed. */ }
        }
        return { ok: false, reason: 'rollback-failed', snapshot: this.getSnapshot() };
      }
    });
  }

  private runActivationAction(
    action: 'enable' | 'disable',
    requestInput: WorkshopManagerItemRequest,
  ): Promise<WorkshopManagerActionResult> {
    return this.enqueueMutation(async () => {
      const request = normalizeItemRequest(requestInput);
      if (!request) {
        return this.actionResult(action, false, 'invalid-request');
      }
      const item = this.getSnapshot().items.find(
        (entry) => entry.sourceId === request.sourceId && entry.itemId === request.itemId,
      );
      if (item?.contentKind === 'plugin-package') {
        if (!this.plugins) {
          return this.actionResult(action, false, 'plugin-runtime-unavailable');
        }
        const pluginResult = action === 'enable'
          ? await this.plugins.enable(request.sourceId, request.itemId, request.approvePluginCapabilities)
          : await this.plugins.disable(request.sourceId, request.itemId);
        return this.actionResult(action, pluginResult.ok, pluginResult.ok ? null : pluginResult.reason);
      }
      const result = await this.activation[action](request.sourceId, request.itemId);
      return this.actionResult(action, result.ok, result.ok ? null : result.reason);
    });
  }

  private async runReconcile(): Promise<WorkshopReconcileReport> {
    this.reconcileStatus = { ...this.reconcileStatus, state: 'running' };
    try {
      const report = await this.reconcileService.reconcile();
      this.reconcileStatus = {
        state: report.ok ? 'ready' : 'error',
        lastReport: report,
      };
      return report;
    } catch {
      const timestamp = this.now().toISOString();
      const report: WorkshopReconcileReport = {
        ok: false,
        startedAt: timestamp,
        completedAt: timestamp,
        examined: 0,
        stagedRecovered: 0,
        catalogRestored: 0,
        catalogPruned: 0,
        quarantined: 0,
        failureCodes: ['reconcile-failed'],
      };
      this.reconcileStatus = { state: 'error', lastReport: report };
      return report;
    }
  }

  private actionResult(
    action: WorkshopManagerAction,
    ok: boolean,
    reason: string | null,
  ): WorkshopManagerActionResult {
    return { ok, action, reason, snapshot: this.getSnapshot() };
  }

  private enqueueMutation<T>(run: () => Promise<T>): Promise<T> {
    const operation = this.mutationTail.then(run, run);
    this.mutationTail = operation.then(() => undefined, () => undefined);
    return operation;
  }
}
