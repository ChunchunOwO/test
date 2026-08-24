import type { AudioStatus } from '../../shared/types/audio';
import { safeAudioDspOutputSettings, safeAudioResetOutputSettings } from '../../shared/audioSafeBaseline';
import { getLocalProEntitlementSnapshot, type LocalProEntitlementSnapshot } from '../plugins/LocalProEntitlements';
import { enqueueAudioCommand } from '../ipc/audioCommandQueue';
import { activeJsonRpcBridge } from './HostBridgeRegistry';
import { getAudioSession } from './AudioSession';
import { hasConfiguredProDsp, setCachedDspEntitlement } from './AudioDspEntitlementPolicy';
import { syncPersistedDspStateToNative } from './DspStateSync';

let lastReconciledProUnlocked: boolean | null = null;

const statusUsesEchoProDsp = (status: AudioStatus): boolean =>
  status.sdmMode === 'pcmToDsd' ||
  status.sdmRuntimeState === 'pcm_to_sdm_active' ||
  status.sdmRuntimeState === 'pcm_to_sdm_not_routed' ||
  (status.sdmActive === true && status.sdmMode !== 'dsdPassthrough' && status.sdmRuntimeState !== 'dsd_passthrough') ||
  (status.echoSrcMode !== undefined && status.echoSrcMode !== 'off') ||
  status.echoSrcActive === true ||
  (status.pcmDitherMode !== undefined && status.pcmDitherMode !== 'off') ||
  status.pcmDitherActive === true ||
  status.eqEnabled === true ||
  status.roomCorrectionEnabled === true ||
  status.channelBalanceEnabled === true ||
  status.replayGainEnabled === true;

export const applySafeAudioDspRuntimeBaseline = async (): Promise<AudioStatus> =>
  enqueueAudioCommand(() => getAudioSession().setOutput(safeAudioDspOutputSettings));

export const applyDefaultAudioRuntimeBaseline = async (): Promise<AudioStatus> =>
  enqueueAudioCommand(() => getAudioSession().setOutput(safeAudioResetOutputSettings));

export const reconcileEchoProAudioEntitlement = async (): Promise<LocalProEntitlementSnapshot> => {
  const snapshot = getLocalProEntitlementSnapshot('echo-pro');
  setCachedDspEntitlement(snapshot.unlocked);
  if (snapshot.unlocked) {
    lastReconciledProUnlocked = true;
    return snapshot;
  }
  if (lastReconciledProUnlocked === false) {
    return snapshot;
  }
  if (!snapshot.unlocked) {
    const session = getAudioSession();
    const status = session.getStatus();
    if (statusUsesEchoProDsp(status) || hasConfiguredProDsp()) {
      await enqueueAudioCommand(() => session.setOutput({
        ...safeAudioDspOutputSettings,
        dsdOutputMode: status.dsdOutputModeRequested === 'dop' ? 'dop' : 'pcm',
        sdmMode: status.sdmMode === 'dsdPassthrough' ? 'dsdPassthrough' : 'off',
      }));
    }
    const bridge = activeJsonRpcBridge;
    if (bridge && !bridge.isClosed) {
      await syncPersistedDspStateToNative(bridge);
      await bridge.setReplayGainConfig({
        trackGainDb: 0,
        albumGainDb: 0,
        peak: 0,
        mode: 0,
        preampDb: 0,
        preventClipping: false,
      });
    }
  }
  lastReconciledProUnlocked = false;
  return snapshot;
};

export const resetAudioEntitlementRuntimeForTests = (): void => {
  lastReconciledProUnlocked = null;
};
