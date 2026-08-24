import {
  workshopRegistryStates,
  type WorkshopContentKind,
  type WorkshopRegistryState,
} from '../../shared/types/workshop';

export { workshopRegistryStates };
export type { WorkshopRegistryState };

export const workshopRegistryFormatVersion = 1 as const;

export type WorkshopRegistryRevision = {
  contentId: string;
  contentKind: WorkshopContentKind;
  version: string;
  manifestSha256: string;
  directory: string;
  installedAt: string;
};

export type WorkshopRegistryError = {
  code: string;
  at: string;
};

export type WorkshopRegistryRecord = {
  sourceId: string;
  itemId: string;
  state: WorkshopRegistryState;
  candidateRevision: WorkshopRegistryRevision | null;
  activeRevision: WorkshopRegistryRevision | null;
  lastKnownGoodRevision: WorkshopRegistryRevision | null;
  approvedCapabilities: string[];
  error: WorkshopRegistryError | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkshopRegistrySnapshot = {
  formatVersion: typeof workshopRegistryFormatVersion;
  revision: number;
  records: WorkshopRegistryRecord[];
};

export type WorkshopRegistryHealth = {
  writable: boolean;
  error: 'registry-unreadable' | null;
};

export type WorkshopRegistryTransitionOptions = {
  candidateRevision?: WorkshopRegistryRevision;
  errorCode?: string;
};

export type WorkshopRegistryOptions = {
  filePath?: string;
  now?: () => Date;
};
