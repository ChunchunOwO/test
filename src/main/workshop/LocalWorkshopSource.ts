import { resolve } from 'node:path';
import type {
  WorkshopDownloadRequestResult,
  WorkshopSubscriptionCatalog,
} from '../../shared/types/workshop';
import type { WorkshopInstallLocationResult, WorkshopSource } from './WorkshopSource';

const localItemIdPattern = /^[1-9]\d{0,19}$/u;
const sourceIdPattern = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/u;
const byteCountPattern = /^(?:0|[1-9]\d*)$/u;

export type LocalWorkshopSourceItem = {
  itemId: string;
  directory: string;
  sizeOnDiskBytes: string;
  installedAtUnixSeconds: number;
};

const normalizeItem = (item: LocalWorkshopSourceItem): LocalWorkshopSourceItem => {
  if (
    typeof item.itemId !== 'string' ||
    typeof item.directory !== 'string' ||
    !item.directory.trim() ||
    typeof item.sizeOnDiskBytes !== 'string'
  ) {
    throw new Error('local_workshop_item_invalid');
  }
  const itemId = item.itemId.trim();
  if (!localItemIdPattern.test(itemId)) {
    throw new Error('local_workshop_item_id_invalid');
  }
  if (!byteCountPattern.test(item.sizeOnDiskBytes)) {
    throw new Error('local_workshop_size_invalid');
  }
  if (!Number.isSafeInteger(item.installedAtUnixSeconds) || item.installedAtUnixSeconds < 0) {
    throw new Error('local_workshop_timestamp_invalid');
  }
  return {
    itemId,
    directory: resolve(item.directory.trim()),
    sizeOnDiskBytes: item.sizeOnDiskBytes,
    installedAtUnixSeconds: item.installedAtUnixSeconds,
  };
};

export class LocalWorkshopSource implements WorkshopSource {
  readonly sourceId: string;
  private readonly items = new Map<string, LocalWorkshopSourceItem>();

  constructor(items: readonly LocalWorkshopSourceItem[], sourceId = 'local') {
    const normalizedSourceId = sourceId.trim().toLowerCase();
    if (!sourceIdPattern.test(normalizedSourceId)) {
      throw new Error('local_workshop_source_id_invalid');
    }
    this.sourceId = normalizedSourceId;
    for (const input of items) {
      const item = normalizeItem(input);
      if (this.items.has(item.itemId)) {
        throw new Error('local_workshop_item_duplicate');
      }
      this.items.set(item.itemId, item);
    }
  }

  listSubscribed(): WorkshopSubscriptionCatalog {
    return {
      available: true,
      items: [...this.items.values()].map((item) => ({
        itemId: item.itemId,
        subscribed: true,
        installed: true,
        needsUpdate: false,
        downloading: false,
        downloadPending: false,
        locallyDisabled: false,
        install: {
          sizeOnDiskBytes: item.sizeOnDiskBytes,
          installedAtUnixSeconds: item.installedAtUnixSeconds,
        },
        download: null,
        error: null,
      })),
    };
  }

  requestDownload(itemIdInput: string, _highPriority = false): WorkshopDownloadRequestResult {
    const itemId = itemIdInput.trim();
    if (!localItemIdPattern.test(itemId)) {
      return { ok: false, reason: 'invalid-item-id' };
    }
    return this.items.has(itemId)
      ? { ok: true, state: 'already-current' }
      : { ok: false, reason: 'not-subscribed' };
  }

  getInstallLocation(itemIdInput: string): WorkshopInstallLocationResult {
    const itemId = itemIdInput.trim();
    if (!localItemIdPattern.test(itemId)) {
      return { ok: false, reason: 'invalid-item-id' };
    }
    const item = this.items.get(itemId);
    return item
      ? { ok: true, ...item }
      : { ok: false, reason: 'not-installed' };
  }
}
