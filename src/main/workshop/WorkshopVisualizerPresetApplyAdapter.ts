import type { WorkshopDataContribution, WorkshopVisualizerPresetContribution } from './WorkshopDataContributionTypes';
import {
  WorkshopContributionApplyError,
  type WorkshopContributionApplyAdapter,
  type WorkshopContributionApplyContext,
} from './WorkshopContributionApplyAdapter';
import type { WorkshopVisualizerPresetService } from './WorkshopVisualizerPresetService';

const requireVisualizerContribution = (
  contribution: WorkshopDataContribution,
): WorkshopVisualizerPresetContribution => {
  if (contribution.type !== 'echo-workshop-visualizer-preset') {
    throw new WorkshopContributionApplyError('apply-failed');
  }
  return contribution;
};

export const createWorkshopVisualizerPresetApplyAdapter = (
  visualizer: Pick<WorkshopVisualizerPresetService, 'getSelection' | 'select' | 'restore'>,
): WorkshopContributionApplyAdapter => ({
  contentKind: 'visualizer-preset',
  apply: async (rawContribution, context: WorkshopContributionApplyContext) => {
    const contribution = requireVisualizerContribution(rawContribution);
    const previous = visualizer.getSelection();
    try {
      visualizer.select(contribution, context);
    } catch {
      try {
        visualizer.restore(previous);
      } catch {
        // Best-effort rollback; the original persistence failure remains authoritative.
      }
      throw new WorkshopContributionApplyError('apply-failed');
    }
  },
});
