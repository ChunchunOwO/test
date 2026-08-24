import type { EqPreset, EqSavePresetRequest, EqState } from '../../shared/types/eq';
import {
  toWorkshopEqSavePresetRequest,
  type WorkshopDataContribution,
  type WorkshopDspPresetContribution,
} from './WorkshopDataContributionTypes';
import {
  WorkshopContributionApplyError,
  type WorkshopContributionApplyAdapter,
} from './WorkshopContributionApplyAdapter';

export type WorkshopDspPresetBridgePort = {
  getState: () => EqState;
  listPresets: () => EqPreset[];
  savePreset: (request: EqSavePresetRequest) => EqPreset;
  deletePreset: (presetId: string) => EqPreset[];
  setPreset: (presetId: string) => Promise<EqState>;
};

const requireDspContribution = (
  contribution: WorkshopDataContribution,
): WorkshopDspPresetContribution => {
  if (contribution.type !== 'echo-workshop-dsp-preset') {
    throw new WorkshopContributionApplyError('apply-failed');
  }
  return contribution;
};

const toSaveRequest = (preset: EqPreset): EqSavePresetRequest => ({
  id: preset.id,
  name: preset.name,
  preampDb: preset.preampDb,
  bands: preset.bands.map((band) => ({ ...band })),
});

export const createWorkshopDspPresetApplyAdapter = (
  getBridge: () => WorkshopDspPresetBridgePort,
): WorkshopContributionApplyAdapter => ({
  contentKind: 'dsp-preset',
  apply: async (rawContribution) => {
    const contribution = requireDspContribution(rawContribution);
    const bridge = getBridge();
    const request = toWorkshopEqSavePresetRequest(contribution);
    const previousState = bridge.getState();
    const previousPreset = bridge.listPresets().find((preset) => preset.id === request.id) ?? null;
    const preset = bridge.savePreset(request);

    try {
      const applied = await bridge.setPreset(preset.id);
      if (applied.presetId !== preset.id) {
        throw new WorkshopContributionApplyError('dsp-apply-not-confirmed');
      }
    } catch (error) {
      try {
        if (previousPreset) {
          bridge.savePreset(toSaveRequest(previousPreset));
        } else {
          bridge.deletePreset(preset.id);
        }
        if (bridge.listPresets().some((item) => item.id === previousState.presetId)) {
          await bridge.setPreset(previousState.presetId);
        }
      } catch {
        // Best-effort rollback; the original application failure remains authoritative.
      }
      throw error;
    }
  },
});
