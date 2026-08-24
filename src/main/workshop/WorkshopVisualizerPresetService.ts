import { join } from 'node:path';
import { app } from 'electron';
import type { WorkshopActiveVisualizerPreset } from '../../shared/types/workshop';
import type { WorkshopContributionApplyContext } from './WorkshopContributionApplyAdapter';
import type { WorkshopDataCatalog } from './WorkshopDataCatalog';
import type { WorkshopVisualizerPresetContribution } from './WorkshopDataContributionTypes';
import type { WorkshopRegistry } from './WorkshopRegistry';
import {
  WorkshopRevisionReceiptStore,
  type WorkshopRevisionReceipt,
} from './WorkshopRevisionReceiptStore';

type VisualizerRegistryPort = Pick<WorkshopRegistry, 'get'>;
type VisualizerCatalogPort = Pick<WorkshopDataCatalog, 'get'>;

export const getWorkshopVisualizerPresetSelectionPath = (): string =>
  join(app.getPath('userData'), 'workshop', 'active-visualizer-preset.json');

export class WorkshopVisualizerPresetService {
  private readonly registry: VisualizerRegistryPort;
  private readonly catalog: VisualizerCatalogPort;
  private readonly store: WorkshopRevisionReceiptStore;

  constructor(options: {
    registry: VisualizerRegistryPort;
    catalog: VisualizerCatalogPort;
    store?: WorkshopRevisionReceiptStore;
  }) {
    this.registry = options.registry;
    this.catalog = options.catalog;
    this.store = options.store ?? new WorkshopRevisionReceiptStore(getWorkshopVisualizerPresetSelectionPath());
  }

  getSelection(): WorkshopRevisionReceipt | null {
    return this.store.get();
  }

  select(
    _contribution: WorkshopVisualizerPresetContribution,
    context: WorkshopContributionApplyContext,
  ): void {
    this.store.set({
      sourceId: context.sourceId,
      itemId: context.itemId,
      contentId: context.contentId,
      version: context.version,
      manifestSha256: context.manifestSha256,
      registryUpdatedAt: context.registryUpdatedAt,
    });
  }

  restore(selection: WorkshopRevisionReceipt | null): void {
    this.store.set(selection);
  }

  getActive(): WorkshopActiveVisualizerPreset | null {
    const selection = this.store.get();
    if (!selection) {
      return null;
    }
    const registryRecord = this.registry.get(selection.sourceId, selection.itemId);
    const activeRevision = registryRecord?.activeRevision;
    if (
      !registryRecord || registryRecord.state !== 'enabled' || !activeRevision ||
      activeRevision.contentId !== selection.contentId ||
      activeRevision.contentKind !== 'visualizer-preset' ||
      activeRevision.version !== selection.version ||
      activeRevision.manifestSha256 !== selection.manifestSha256 ||
      registryRecord.updatedAt !== selection.registryUpdatedAt
    ) {
      return null;
    }
    const catalogRecord = this.catalog.get(selection.sourceId, selection.itemId);
    const contribution = catalogRecord?.contribution;
    if (
      !catalogRecord ||
      catalogRecord.contentKind !== 'visualizer-preset' ||
      catalogRecord.contentId !== selection.contentId ||
      catalogRecord.version !== selection.version ||
      catalogRecord.manifestSha256 !== selection.manifestSha256 ||
      contribution?.type !== 'echo-workshop-visualizer-preset'
    ) {
      return null;
    }
    return {
      sourceId: selection.sourceId,
      itemId: selection.itemId,
      contentId: selection.contentId,
      version: selection.version,
      title: contribution.title,
      style: contribution.style,
      palette: [...contribution.palette],
      barCount: contribution.barCount,
      smoothing: contribution.smoothing,
      sensitivity: contribution.sensitivity,
      decay: contribution.decay,
      mirror: contribution.mirror,
    };
  }
}
