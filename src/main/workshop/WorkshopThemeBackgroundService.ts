import { join } from 'node:path';
import { app } from 'electron';
import {
  defaultWorkshopThemeSkinEffects,
  defaultWorkshopThemeIdentity,
  defaultWorkshopThemeSkinLayout,
  defaultWorkshopThemeSkinStages,
  workshopThemeSkinAssetKeys,
  type WorkshopActiveThemeBackground,
  type WorkshopThemeSkinAssetUrls,
} from '../../shared/types/workshop';
import { buildWorkshopAssetUrl, buildWorkshopUiRuntimeUrl } from './WorkshopAssetPolicy';
import type { WorkshopContributionApplyContext } from './WorkshopContributionApplyAdapter';
import type { WorkshopDataCatalog } from './WorkshopDataCatalog';
import type { WorkshopThemePresetContribution } from './WorkshopDataContributionTypes';
import type { WorkshopRegistry } from './WorkshopRegistry';
import {
  WorkshopRevisionReceiptStore,
  type WorkshopRevisionReceipt,
} from './WorkshopRevisionReceiptStore';
import { buildWorkshopThemeCustomId } from './workshopThemeCustomId';

type ThemeBackgroundRegistryPort = Pick<WorkshopRegistry, 'get'>;
type ThemeBackgroundCatalogPort = Pick<WorkshopDataCatalog, 'get'>;

export const getWorkshopThemeBackgroundSelectionPath = (): string =>
  join(app.getPath('userData'), 'workshop', 'active-theme-background.json');

export const contributionHasWorkshopThemeSkin = (
  contribution: WorkshopThemePresetContribution,
): boolean => Boolean(contribution.skin || contribution.backgroundAsset || contribution.runtime);

const toAssetUrl = (
  sourceId: string,
  itemId: string,
  path: string | undefined,
): string | undefined => path ? buildWorkshopAssetUrl(sourceId, itemId, path) : undefined;

export class WorkshopThemeBackgroundService {
  private readonly registry: ThemeBackgroundRegistryPort;
  private readonly catalog: ThemeBackgroundCatalogPort;
  private readonly store: WorkshopRevisionReceiptStore;

  constructor(options: {
    registry: ThemeBackgroundRegistryPort;
    catalog: ThemeBackgroundCatalogPort;
    store?: WorkshopRevisionReceiptStore;
  }) {
    this.registry = options.registry;
    this.catalog = options.catalog;
    this.store = options.store ?? new WorkshopRevisionReceiptStore(getWorkshopThemeBackgroundSelectionPath());
  }

  getSelection(): WorkshopRevisionReceipt | null {
    return this.store.get();
  }

  select(
    contribution: WorkshopThemePresetContribution,
    context: WorkshopContributionApplyContext,
  ): void {
    this.store.set(contributionHasWorkshopThemeSkin(contribution) ? {
      sourceId: context.sourceId,
      itemId: context.itemId,
      contentId: context.contentId,
      version: context.version,
      manifestSha256: context.manifestSha256,
      registryUpdatedAt: context.registryUpdatedAt,
    } : null);
  }

  restore(selection: WorkshopRevisionReceipt | null): void {
    this.store.set(selection);
  }

  getActive(): WorkshopActiveThemeBackground | null {
    const selection = this.store.get();
    if (!selection) {
      return null;
    }
    const registryRecord = this.registry.get(selection.sourceId, selection.itemId);
    const activeRevision = registryRecord?.activeRevision;
    if (
      !registryRecord || registryRecord.state !== 'enabled' || !activeRevision ||
      activeRevision.contentId !== selection.contentId ||
      activeRevision.contentKind !== 'theme' ||
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
      catalogRecord.contentKind !== 'theme' ||
      catalogRecord.contentId !== selection.contentId ||
      catalogRecord.version !== selection.version ||
      catalogRecord.manifestSha256 !== selection.manifestSha256 ||
      contribution?.type !== 'echo-workshop-theme-preset' ||
      !contributionHasWorkshopThemeSkin(contribution)
    ) {
      return null;
    }
    const skin = contribution.skin;
    const assets: WorkshopThemeSkinAssetUrls = {};
    for (const key of workshopThemeSkinAssetKeys) {
      const path = key === 'background'
        ? (skin?.assets?.background ?? contribution.backgroundAsset)
        : skin?.assets?.[key];
      const url = toAssetUrl(selection.sourceId, selection.itemId, path);
      if (url) {
        assets[key] = url;
      }
    }
    return {
      sourceId: selection.sourceId,
      itemId: selection.itemId,
      contentId: selection.contentId,
      version: selection.version,
      themeId: buildWorkshopThemeCustomId(selection.sourceId, selection.itemId, selection.contentId),
      url: assets.background ?? null,
      mode: skin?.mode ?? 'chrome',
      layout: { ...defaultWorkshopThemeSkinLayout, ...skin?.layout },
      stages: { ...defaultWorkshopThemeSkinStages, ...skin?.stages },
      assets,
      effects: { ...defaultWorkshopThemeSkinEffects, ...skin?.effects },
      identity: skin?.identity ? {
        brandPresentation: skin.identity.brandPresentation,
        brandUrl: skin.identity.brandAsset
          ? toAssetUrl(selection.sourceId, selection.itemId, skin.identity.brandAsset) ?? null
          : null,
        showEditionBadge: skin.identity.showEditionBadge,
        showVersion: skin.identity.showVersion,
      } : { ...defaultWorkshopThemeIdentity },
      iconAtlas: skin?.iconAtlas ? {
        url: toAssetUrl(selection.sourceId, selection.itemId, skin.iconAtlas.asset) ?? '',
        columns: skin.iconAtlas.columns,
        rows: skin.iconAtlas.rows,
        map: { ...skin.iconAtlas.map },
      } : null,
      runtime: contribution.runtime ? {
        entryUrl: buildWorkshopUiRuntimeUrl(
          selection.sourceId,
          selection.itemId,
          contribution.runtime.entry,
        ),
        capabilities: [...contribution.runtime.capabilities],
      } : null,
    };
  }
}
