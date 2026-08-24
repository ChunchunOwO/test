import type {
  WorkshopBrowseItem,
  WorkshopBrowsePage,
  WorkshopBrowseRequest,
  WorkshopBrowseSort,
  WorkshopDownloadInfo,
  WorkshopDownloadRequestResult,
  WorkshopInstallInfo,
  WorkshopSubscriptionCatalog,
  WorkshopSubscriptionItem,
} from '../../../shared/types/workshop';
import { workshopBrowseSorts } from '../../../shared/types/workshop';
import type { SteamClient } from './SteamRuntimeService';
import type { WorkshopInstallLocationResult, WorkshopSource } from '../../workshop/WorkshopSource';
import { buildWorkshopPreviewProtocolUrl } from '../../workshop/WorkshopSteamPreview';
import type { WorkshopAuthoringPublishClient } from '../../workshop/WorkshopAuthoringPublisher';

type SteamWorkshopApi = Pick<
  SteamClient['workshop'],
  | 'download'
  | 'downloadInfo'
  | 'getSubscribedItems'
  | 'installInfo'
  | 'state'
  | 'getAllItems'
  | 'subscribe'
  | 'unsubscribe'
  | 'createItem'
  | 'updateItem'
>;

type SteamWorkshopClient = {
  workshop: SteamWorkshopApi;
  overlay: Pick<SteamClient['overlay'], 'activateToWebPage'>;
  utils: Pick<SteamClient['utils'], 'getAppId'>;
};

type SteamWorkshopClientProvider = {
  getClient: () => SteamWorkshopClient | null;
};

const itemStateFlags = {
  subscribed: 1,
  installed: 4,
  needsUpdate: 8,
  downloading: 16,
  downloadPending: 32,
  locallyDisabled: 64,
} as const;

const steamWorkshopItemIdPattern = /^[1-9]\d{0,19}$/u;

const hasStateFlag = (state: number, flag: number): boolean => (state & flag) === flag;

type NormalizedSteamInstallInfo = WorkshopInstallInfo & { directory: string };

const normalizeInstallInfo = (
  value: ReturnType<SteamWorkshopApi['installInfo']>,
): NormalizedSteamInstallInfo | null => {
  if (
    !value ||
    typeof value.folder !== 'string' ||
    !value.folder.trim() ||
    value.sizeOnDisk < 0n ||
    !Number.isSafeInteger(value.timestamp) ||
    value.timestamp < 0
  ) {
    return null;
  }
  return {
    directory: value.folder,
    sizeOnDiskBytes: value.sizeOnDisk.toString(),
    installedAtUnixSeconds: value.timestamp,
  };
};

const normalizeDownloadInfo = (
  value: ReturnType<SteamWorkshopApi['downloadInfo']>,
): WorkshopDownloadInfo | null => {
  if (!value || value.current < 0n || value.total < 0n || value.current > value.total) {
    return null;
  }
  return {
    downloadedBytes: value.current.toString(),
    totalBytes: value.total.toString(),
  };
};

const failedSubscriptionItem = (itemId: string): WorkshopSubscriptionItem => ({
  itemId,
  subscribed: true,
  installed: false,
  needsUpdate: false,
  downloading: false,
  downloadPending: false,
  locallyDisabled: false,
  install: null,
  download: null,
  error: 'item-query-failed',
});

export class SteamWorkshopService implements WorkshopSource, WorkshopAuthoringPublishClient {
  readonly sourceId = 'steam';

  constructor(private readonly runtime: SteamWorkshopClientProvider) {}

  listSubscribed(): WorkshopSubscriptionCatalog {
    const client = this.runtime.getClient();
    if (!client) {
      return { available: false, reason: 'source-unavailable', items: [] };
    }

    let subscribedItemIds: bigint[];
    try {
      subscribedItemIds = client.workshop.getSubscribedItems();
    } catch {
      return { available: false, reason: 'subscription-query-failed', items: [] };
    }

    const seen = new Set<string>();
    const items: WorkshopSubscriptionItem[] = [];
    for (const rawItemId of subscribedItemIds) {
      const itemId = rawItemId.toString();
      if (seen.has(itemId)) {
        continue;
      }
      seen.add(itemId);
      try {
        const state = client.workshop.state(rawItemId);
        const installed = hasStateFlag(state, itemStateFlags.installed);
        const downloading = hasStateFlag(state, itemStateFlags.downloading);
        const downloadPending = hasStateFlag(state, itemStateFlags.downloadPending);
        const installInfo = installed ? normalizeInstallInfo(client.workshop.installInfo(rawItemId)) : null;
        items.push({
          itemId,
          subscribed: hasStateFlag(state, itemStateFlags.subscribed),
          installed,
          needsUpdate: hasStateFlag(state, itemStateFlags.needsUpdate),
          downloading,
          downloadPending,
          locallyDisabled: hasStateFlag(state, itemStateFlags.locallyDisabled),
          install: installInfo
            ? {
                sizeOnDiskBytes: installInfo.sizeOnDiskBytes,
                installedAtUnixSeconds: installInfo.installedAtUnixSeconds,
              }
            : null,
          download: downloading || downloadPending
            ? normalizeDownloadInfo(client.workshop.downloadInfo(rawItemId))
            : null,
          error: null,
        });
      } catch {
        items.push(failedSubscriptionItem(itemId));
      }
    }
    return { available: true, items };
  }

  getInstallLocation(itemIdInput: string): WorkshopInstallLocationResult {
    const itemId = itemIdInput.trim();
    if (!steamWorkshopItemIdPattern.test(itemId)) {
      return { ok: false, reason: 'invalid-item-id' };
    }
    const client = this.runtime.getClient();
    if (!client) {
      return { ok: false, reason: 'source-unavailable' };
    }

    try {
      const numericItemId = BigInt(itemId);
      if (!hasStateFlag(client.workshop.state(numericItemId), itemStateFlags.installed)) {
        return { ok: false, reason: 'not-installed' };
      }
      const installInfo = normalizeInstallInfo(client.workshop.installInfo(numericItemId));
      return installInfo
        ? { ok: true, itemId, ...installInfo }
        : { ok: false, reason: 'install-info-unavailable' };
    } catch {
      return { ok: false, reason: 'source-error' };
    }
  }

  requestDownload(itemIdInput: string, highPriority = false): WorkshopDownloadRequestResult {
    const itemId = itemIdInput.trim();
    if (!steamWorkshopItemIdPattern.test(itemId)) {
      return { ok: false, reason: 'invalid-item-id' };
    }
    const client = this.runtime.getClient();
    if (!client) {
      return { ok: false, reason: 'source-unavailable' };
    }

    try {
      const numericItemId = BigInt(itemId);
      const state = client.workshop.state(numericItemId);
      if (!hasStateFlag(state, itemStateFlags.subscribed)) {
        return { ok: false, reason: 'not-subscribed' };
      }
      if (
        hasStateFlag(state, itemStateFlags.installed) &&
        !hasStateFlag(state, itemStateFlags.needsUpdate)
      ) {
        return { ok: true, state: 'already-current' };
      }
      return client.workshop.download(numericItemId, highPriority)
        ? { ok: true, state: 'accepted' }
        : { ok: false, reason: 'request-rejected' };
    } catch {
      return { ok: false, reason: 'source-error' };
    }
  }

  async browse(requestInput: WorkshopBrowseRequest): Promise<WorkshopBrowsePage> {
    const request = normalizeBrowseRequest(requestInput);
    if (!request) {
      return { available: false, reason: 'invalid-request', page: 1, total: 0, items: [] };
    }
    const client = this.runtime.getClient();
    if (!client) {
      return { available: false, reason: 'source-unavailable', page: request.page, total: 0, items: [] };
    }
    try {
      const appId = client.utils.getAppId();
      const subscribed = new Set(
        client.workshop.getSubscribedItems().map((itemId) => itemId.toString()),
      );
      const result = await client.workshop.getAllItems(
        request.page,
        browseQueryType(request.sort, request.searchText),
        0,
        appId,
        appId,
        {
          includeMetadata: true,
          searchText: request.searchText,
        },
      );
      const items: WorkshopBrowseItem[] = [];
      for (const item of result.items) {
        if (!item || item.banned) {
          continue;
        }
        const itemId = item.publishedFileId.toString();
        if (!steamWorkshopItemIdPattern.test(itemId)) {
          continue;
        }
        items.push({
          itemId,
          title: redactBrowseText(item.title, 120) || `Workshop #${itemId}`,
          description: redactBrowseText(item.description, 280),
          tags: item.tags.slice(0, 8).map((tag) => redactBrowseText(tag, 40)).filter(Boolean),
          subscribed: subscribed.has(itemId),
          numUpvotes: Number.isFinite(item.numUpvotes) ? Math.max(0, item.numUpvotes) : 0,
          numDownvotes: Number.isFinite(item.numDownvotes) ? Math.max(0, item.numDownvotes) : 0,
          subscriptionCount: subscriptionCountFrom(item.statistics?.numSubscriptions),
          previewUrl: buildWorkshopPreviewProtocolUrl(item.previewUrl ?? ''),
          updatedAtUnixSeconds: Number.isSafeInteger(item.timeUpdated) ? item.timeUpdated : 0,
        });
      }
      return {
        available: true,
        page: request.page,
        total: Number.isSafeInteger(result.totalResults) ? result.totalResults : items.length,
        items,
      };
    } catch {
      return { available: false, reason: 'query-failed', page: request.page, total: 0, items: [] };
    }
  }

  async subscribe(itemIdInput: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    return this.changeSubscription(itemIdInput, 'subscribe');
  }

  async unsubscribe(itemIdInput: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    return this.changeSubscription(itemIdInput, 'unsubscribe');
  }

  async createItem(appId?: number | null) {
    const client = this.runtime.getClient();
    if (!client) throw new Error('workshop_authoring_steam_unavailable');
    return client.workshop.createItem(appId);
  }

  async updateItem(
    itemId: bigint,
    update: Parameters<WorkshopAuthoringPublishClient['updateItem']>[1],
    appId?: number | null,
  ) {
    const client = this.runtime.getClient();
    if (!client) throw new Error('workshop_authoring_steam_unavailable');
    return client.workshop.updateItem(itemId, update, appId);
  }

  openInSteam(itemIdInput: string): { ok: true } | { ok: false; reason: string } {
    const itemId = itemIdInput.trim();
    if (!steamWorkshopItemIdPattern.test(itemId)) {
      return { ok: false, reason: 'invalid-item-id' };
    }
    const client = this.runtime.getClient();
    if (!client) {
      return { ok: false, reason: 'source-unavailable' };
    }
    try {
      client.overlay.activateToWebPage(`https://steamcommunity.com/sharedfiles/filedetails/?id=${itemId}`);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'source-error' };
    }
  }

  private async changeSubscription(
    itemIdInput: string,
    action: 'subscribe' | 'unsubscribe',
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const itemId = itemIdInput.trim();
    if (!steamWorkshopItemIdPattern.test(itemId)) {
      return { ok: false, reason: 'invalid-item-id' };
    }
    const client = this.runtime.getClient();
    if (!client) {
      return { ok: false, reason: 'source-unavailable' };
    }
    try {
      await client.workshop[action](BigInt(itemId));
      return { ok: true };
    } catch {
      return { ok: false, reason: 'source-error' };
    }
  }
}

const browseQueryTypeBySort: Record<WorkshopBrowseSort, number> = {
  trend: 3,
  votes: 0,
  recent: 1,
};

const normalizeBrowseRequest = (value: WorkshopBrowseRequest): WorkshopBrowseRequest | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const page = value.page;
  const sort = value.sort;
  const searchText = typeof value.searchText === 'string' ? value.searchText.trim() : '';
  if (!Number.isSafeInteger(page) || page < 1 || page > 10_000) {
    return null;
  }
  if (!(workshopBrowseSorts as readonly string[]).includes(sort)) {
    return null;
  }
  if (searchText.length > 120) {
    return null;
  }
  return {
    page,
    sort,
    ...(searchText ? { searchText } : {}),
  };
};

const browseQueryType = (sort: WorkshopBrowseSort, searchText: string | undefined): number =>
  searchText ? 11 : browseQueryTypeBySort[sort];

const redactBrowseText = (value: string | undefined, maximum: number): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.replace(/\s+/gu, ' ').trim().slice(0, maximum);
};

const subscriptionCountFrom = (value: bigint | undefined): number | null => {
  if (value === undefined) {
    return null;
  }
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
};

