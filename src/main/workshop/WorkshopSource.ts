import type {
  WorkshopDownloadRequestResult,
  WorkshopSubscriptionCatalog,
} from '../../shared/types/workshop';

export type WorkshopInstallLocationResult =
  | {
      ok: true;
      itemId: string;
      directory: string;
      sizeOnDiskBytes: string;
      installedAtUnixSeconds: number;
    }
  | {
      ok: false;
      reason: 'invalid-item-id' | 'source-unavailable' | 'not-installed' | 'install-info-unavailable' | 'source-error';
    };

export interface WorkshopSource {
  readonly sourceId: string;

  listSubscribed(): WorkshopSubscriptionCatalog;

  requestDownload(itemId: string, highPriority?: boolean): WorkshopDownloadRequestResult;

  getInstallLocation(itemId: string): WorkshopInstallLocationResult;
}
