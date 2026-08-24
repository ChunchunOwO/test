import type {
  WorkshopDataContentKind,
  WorkshopDataContribution,
} from './WorkshopDataContributionTypes';

export type WorkshopContributionApplyContext = {
  sourceId: string;
  itemId: string;
  contentId: string;
  version: string;
  manifestSha256: string;
  registryUpdatedAt: string;
};

export type WorkshopContributionApplyFailureReason =
  | 'content-not-enabled'
  | 'catalog-not-ready'
  | 'catalog-revision-mismatch'
  | 'content-kind-not-applicable'
  | 'theme-limit-reached'
  | 'settings-apply-rejected'
  | 'lyrics-scene-state-unavailable'
  | 'dsp-apply-not-confirmed'
  | 'apply-failed';

export type WorkshopContributionApplyResult =
  | { ok: true; contentKind: WorkshopDataContentKind }
  | { ok: false; reason: WorkshopContributionApplyFailureReason };

export class WorkshopContributionApplyError extends Error {
  readonly reason: WorkshopContributionApplyFailureReason;

  constructor(reason: WorkshopContributionApplyFailureReason) {
    super(reason);
    this.name = 'WorkshopContributionApplyError';
    this.reason = reason;
  }
}

export type WorkshopContributionApplyAdapter = {
  readonly contentKind: WorkshopDataContentKind;
  apply: (
    contribution: WorkshopDataContribution,
    context: WorkshopContributionApplyContext,
  ) => Promise<void>;
};
