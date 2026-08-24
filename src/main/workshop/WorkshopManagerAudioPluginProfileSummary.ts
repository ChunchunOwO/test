import type { WorkshopManagerAudioPluginProfileSummary } from '../../shared/types/workshop';
import type {
  WorkshopAudioPluginProfileContribution,
  WorkshopDataCatalogRecord,
} from './WorkshopDataContributionTypes';

const isAudioPluginProfile = (
  contribution: WorkshopDataCatalogRecord['contribution'],
): contribution is WorkshopAudioPluginProfileContribution =>
  contribution.type === 'echo-workshop-audio-plugin-profile';

export const buildWorkshopManagerAudioPluginProfileSummary = (
  record: WorkshopDataCatalogRecord | undefined,
): WorkshopManagerAudioPluginProfileSummary | null => {
  if (!record || !isAudioPluginProfile(record.contribution)) {
    return null;
  }
  const profile = record.contribution;
  return {
    profileId: profile.id,
    title: profile.title,
    description: profile.description ?? null,
    format: profile.format,
    role: profile.role,
    plugin: { ...profile.plugin },
    parameterCount: profile.parameters.length,
    presetCount: profile.presets.length,
    routing: { ...profile.routing },
    runtime: {
      state: 'adapter-required',
      adapterApi: profile.adapter.api,
      minimumVersion: profile.adapter.minimumVersion,
    },
  };
};
