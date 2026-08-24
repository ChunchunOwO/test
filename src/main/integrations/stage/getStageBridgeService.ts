import type { AppSettings } from '../../../shared/types/appSettings';
import type { StageBridgeServerStatus } from '../../../shared/types/stage';
import { getAppSettings } from '../../app/appSettings';
import { getCrashReportService } from '../../diagnostics/CrashReportService';
import { markStartupStage } from '../../diagnostics/StartupDiagnostics';
import { defaultStageBridgeHost, StageBridgeService } from './StageBridgeService';

let defaultStageBridgeService: StageBridgeService | null = null;
let stageBridgeLifecycleQueue: Promise<void> = Promise.resolve();

const enqueueStageBridgeLifecycle = (operation: () => Promise<void>): Promise<void> => {
  const queued = stageBridgeLifecycleQueue.catch(() => undefined).then(operation);
  stageBridgeLifecycleQueue = queued.catch(() => undefined);
  return queued;
};

export const getStageBridgeService = (): StageBridgeService => {
  if (!defaultStageBridgeService) {
    defaultStageBridgeService = new StageBridgeService();
  }
  return defaultStageBridgeService;
};

const readEnabledState = (settings: Pick<AppSettings, 'obsBrowserSourceEnabled' | 'stageApiEnabled'>) => ({
  obsEnabled: settings.obsBrowserSourceEnabled === true,
  apiEnabled: settings.stageApiEnabled === true,
});

export const getStageBridgeServerStatus = (
  settings: AppSettings = getAppSettings(),
): StageBridgeServerStatus => defaultStageBridgeService?.getServerStatus() ?? {
  running: false,
  host: defaultStageBridgeHost,
  port: null,
  url: null,
  obsUrl: null,
  eventClients: 0,
  ...readEnabledState(settings),
};

export const syncStageBridgeIntegrationFromSettings = async (settings: AppSettings = getAppSettings()): Promise<void> => {
  const enabledState = readEnabledState(settings);
  await enqueueStageBridgeLifecycle(async () => {
    if (!enabledState.obsEnabled && !enabledState.apiEnabled) {
      await disposeStageBridgeIntegrationNow();
      markStartupStage('stage-bridge:stopped', {
        url: null,
        obsEnabled: false,
        apiEnabled: false,
      });
      return;
    }

    try {
      const status = await getStageBridgeService().configure(enabledState);
      markStartupStage(status.running ? 'stage-bridge:ready' : 'stage-bridge:stopped', {
        url: status.url,
        obsEnabled: enabledState.obsEnabled,
        apiEnabled: enabledState.apiEnabled,
      });
    } catch (error) {
      markStartupStage('stage-bridge:failed', { error: error instanceof Error ? error.message : String(error) });
      getCrashReportService().getLogger()?.warn('main', '[StageBridge] failed to update localhost bridge', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
};

export const initializeStageBridgeIntegration = async (): Promise<void> => {
  markStartupStage('stage-bridge:init');
  await syncStageBridgeIntegrationFromSettings();
};

const disposeStageBridgeIntegrationNow = async (): Promise<void> => {
  const service = defaultStageBridgeService;
  defaultStageBridgeService = null;
  if (!service) {
    return;
  }

  await service.stop();
};

export const disposeStageBridgeIntegration = (): Promise<void> =>
  enqueueStageBridgeLifecycle(disposeStageBridgeIntegrationNow);
