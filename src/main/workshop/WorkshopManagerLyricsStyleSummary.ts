import type { WorkshopManagerLyricsStyleSummary } from '../../shared/types/workshop';
import type {
  WorkshopDataCatalogRecord,
  WorkshopLyricsStyleContribution,
} from './WorkshopDataContributionTypes';

const isLyricsStyle = (
  contribution: WorkshopDataCatalogRecord['contribution'],
): contribution is WorkshopLyricsStyleContribution =>
  contribution.type === 'echo-workshop-lyrics-style';

export const buildWorkshopManagerLyricsStyleSummary = (
  record: WorkshopDataCatalogRecord | undefined,
): WorkshopManagerLyricsStyleSummary | null => {
  if (!record || !isLyricsStyle(record.contribution)) return null;
  return {
    styleId: record.contribution.id,
    title: record.contribution.title,
    description: record.contribution.description ?? null,
    hasScene: Boolean(record.contribution.scene),
  };
};
