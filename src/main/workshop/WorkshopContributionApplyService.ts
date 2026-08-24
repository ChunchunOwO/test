import type { WorkshopDataCatalog } from './WorkshopDataCatalog';
import type { WorkshopRegistry } from './WorkshopRegistry';
import type { WorkshopActiveLyricsScene } from '../../shared/types/workshopLyricsScene';
import type { WorkshopActiveThemeBackground, WorkshopActiveVisualizerPreset } from '../../shared/types/workshop';
import type { WorkshopLyricsSceneService } from './WorkshopLyricsSceneService';
import type { WorkshopThemeBackgroundService } from './WorkshopThemeBackgroundService';
import type { WorkshopVisualizerPresetService } from './WorkshopVisualizerPresetService';
import {
  WorkshopContributionApplyError,
  type WorkshopContributionApplyAdapter,
  type WorkshopContributionApplyFailureReason,
  type WorkshopContributionApplyResult,
} from './WorkshopContributionApplyAdapter';

type WorkshopApplyRegistryPort = Pick<WorkshopRegistry, 'get'>;
type WorkshopApplyCatalogPort = Pick<WorkshopDataCatalog, 'get'>;

export type WorkshopContributionApplyServiceOptions = {
  registry: WorkshopApplyRegistryPort;
  catalog: WorkshopApplyCatalogPort;
  adapters: WorkshopContributionApplyAdapter[];
  lyricsScenes: Pick<WorkshopLyricsSceneService, 'getActive' | 'clear'>;
  visualizerPresets: Pick<WorkshopVisualizerPresetService, 'getActive'>;
  themeBackgrounds: Pick<WorkshopThemeBackgroundService, 'getActive'>;
};

export class WorkshopContributionApplyService {
  private readonly registry: WorkshopApplyRegistryPort;
  private readonly catalog: WorkshopApplyCatalogPort;
  private readonly adapters: Map<string, WorkshopContributionApplyAdapter>;
  private readonly lyricsScenes: Pick<WorkshopLyricsSceneService, 'getActive' | 'clear'>;
  private readonly visualizerPresets: Pick<WorkshopVisualizerPresetService, 'getActive'>;
  private readonly themeBackgrounds: Pick<WorkshopThemeBackgroundService, 'getActive'>;

  constructor(options: WorkshopContributionApplyServiceOptions) {
    this.registry = options.registry;
    this.catalog = options.catalog;
    this.adapters = new Map(options.adapters.map((adapter) => [adapter.contentKind, adapter]));
    this.lyricsScenes = options.lyricsScenes;
    this.visualizerPresets = options.visualizerPresets;
    this.themeBackgrounds = options.themeBackgrounds;
  }

  getActiveLyricsScene(): WorkshopActiveLyricsScene | null {
    return this.lyricsScenes.getActive();
  }

  clearActiveLyricsScene(): void {
    this.lyricsScenes.clear();
  }

  getActiveVisualizerPreset(): WorkshopActiveVisualizerPreset | null {
    return this.visualizerPresets.getActive();
  }

  getActiveThemeBackground(): WorkshopActiveThemeBackground | null {
    return this.themeBackgrounds.getActive();
  }

  async apply(sourceId: string, itemId: string): Promise<WorkshopContributionApplyResult> {
    const registryRecord = this.registry.get(sourceId, itemId);
    const activeRevision = registryRecord?.activeRevision;
    if (!registryRecord || registryRecord.state !== 'enabled' || !activeRevision) {
      return { ok: false, reason: 'content-not-enabled' };
    }

    const catalogRecord = this.catalog.get(sourceId, itemId);
    if (!catalogRecord) {
      return { ok: false, reason: 'catalog-not-ready' };
    }
    if (
      catalogRecord.contentId !== activeRevision.contentId ||
      catalogRecord.contentKind !== activeRevision.contentKind ||
      catalogRecord.version !== activeRevision.version ||
      catalogRecord.manifestSha256 !== activeRevision.manifestSha256
    ) {
      return { ok: false, reason: 'catalog-revision-mismatch' };
    }

    const adapter = this.adapters.get(catalogRecord.contentKind);
    if (!adapter) {
      return { ok: false, reason: 'content-kind-not-applicable' };
    }

    try {
      await adapter.apply(catalogRecord.contribution, {
        sourceId: catalogRecord.sourceId,
        itemId: catalogRecord.itemId,
        contentId: catalogRecord.contentId,
        version: catalogRecord.version,
        manifestSha256: catalogRecord.manifestSha256,
        registryUpdatedAt: registryRecord.updatedAt,
      });
      return { ok: true, contentKind: catalogRecord.contentKind };
    } catch (error) {
      const reason: WorkshopContributionApplyFailureReason =
        error instanceof WorkshopContributionApplyError ? error.reason : 'apply-failed';
      return { ok: false, reason };
    }
  }
}
