import type { WorkshopActiveLyricsScene, WorkshopLyricsSceneNode } from '../../shared/types/workshopLyricsScene';
import type { WorkshopContributionApplyContext } from './WorkshopContributionApplyAdapter';
import { buildWorkshopAssetUrl } from './WorkshopAssetPolicy';
import type { WorkshopDataCatalog } from './WorkshopDataCatalog';
import type { WorkshopLyricsStyleContribution } from './WorkshopDataContributionTypes';
import type { WorkshopRegistry } from './WorkshopRegistry';
import {
  WorkshopLyricsSceneSelectionStore,
  type WorkshopLyricsSceneSelection,
} from './WorkshopLyricsSceneSelectionStore';

type WorkshopLyricsSceneRegistryPort = Pick<WorkshopRegistry, 'get'>;
type WorkshopLyricsSceneCatalogPort = Pick<WorkshopDataCatalog, 'get'>;

export type WorkshopLyricsSceneServiceOptions = {
  registry: WorkshopLyricsSceneRegistryPort;
  catalog: WorkshopLyricsSceneCatalogPort;
  store?: WorkshopLyricsSceneSelectionStore;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const rewriteSceneAssets = (
  scene: WorkshopLyricsStyleContribution['scene'],
  sourceId: string,
  itemId: string,
): NonNullable<WorkshopLyricsStyleContribution['scene']> => {
  if (!scene) {
    throw new Error('workshop_lyrics_scene_missing');
  }
  const rewriteNode = (node: WorkshopLyricsSceneNode): WorkshopLyricsSceneNode => {
    if (node.type === 'group') {
      return { ...node, children: node.children.map(rewriteNode) };
    }
    if (node.type === 'image') {
      return { ...node, src: buildWorkshopAssetUrl(sourceId, itemId, node.asset) };
    }
    return node;
  };
  return {
    ...scene,
    ...(scene.backgroundAsset
      ? { backgroundSrc: buildWorkshopAssetUrl(sourceId, itemId, scene.backgroundAsset) }
      : {}),
    root: rewriteNode(scene.root) as typeof scene.root,
  };
};

export class WorkshopLyricsSceneService {
  private readonly registry: WorkshopLyricsSceneRegistryPort;
  private readonly catalog: WorkshopLyricsSceneCatalogPort;
  private readonly store: WorkshopLyricsSceneSelectionStore;

  constructor(options: WorkshopLyricsSceneServiceOptions) {
    this.registry = options.registry;
    this.catalog = options.catalog;
    this.store = options.store ?? new WorkshopLyricsSceneSelectionStore();
  }

  getSelection(): WorkshopLyricsSceneSelection | null {
    return this.store.get();
  }

  select(
    contribution: WorkshopLyricsStyleContribution,
    context: WorkshopContributionApplyContext,
  ): void {
    this.store.set(contribution.scene ? {
      sourceId: context.sourceId,
      itemId: context.itemId,
      contentId: context.contentId,
      version: context.version,
      manifestSha256: context.manifestSha256,
      registryUpdatedAt: context.registryUpdatedAt,
    } : null);
  }

  restore(selection: WorkshopLyricsSceneSelection | null): void {
    this.store.set(selection);
  }

  clear(): void {
    this.store.set(null);
  }

  getActive(): WorkshopActiveLyricsScene | null {
    const selection = this.store.get();
    if (!selection) {
      return null;
    }
    const registryRecord = this.registry.get(selection.sourceId, selection.itemId);
    const activeRevision = registryRecord?.activeRevision;
    if (
      !registryRecord || registryRecord.state !== 'enabled' || !activeRevision ||
      activeRevision.contentId !== selection.contentId ||
      activeRevision.contentKind !== 'lyrics-style' ||
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
      catalogRecord.contentKind !== 'lyrics-style' ||
      catalogRecord.contentId !== selection.contentId ||
      catalogRecord.version !== selection.version ||
      catalogRecord.manifestSha256 !== selection.manifestSha256 ||
      contribution?.type !== 'echo-workshop-lyrics-style' ||
      !contribution.scene
    ) {
      return null;
    }
    return clone({
      sourceId: selection.sourceId,
      itemId: selection.itemId,
      contentId: selection.contentId,
      version: selection.version,
      title: contribution.title,
      scene: rewriteSceneAssets(contribution.scene, selection.sourceId, selection.itemId),
    });
  }
}
