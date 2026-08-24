import type { AppSettings } from '../../shared/types/appSettings';
import { getAppSettings } from '../app/appSettings';
import { getCrashReportService } from '../diagnostics/CrashReportService';
import { markStartupStage } from '../diagnostics/StartupDiagnostics';
import { getEchoLinkService, getExistingEchoLinkService } from './EchoLinkService';

let echoLinkBasicLifecycleQueue: Promise<void> = Promise.resolve();

const enqueueEchoLinkBasicLifecycle = (operation: () => Promise<void>): Promise<void> => {
  const queued = echoLinkBasicLifecycleQueue.catch(() => undefined).then(operation);
  echoLinkBasicLifecycleQueue = queued.catch(() => undefined);
  return queued;
};

export const syncEchoLinkBasicIntegrationFromSettings = async (
  settings: AppSettings = getAppSettings(),
): Promise<void> => {
  const enabled = settings.echoLinkBasicEnabled === true;
  await enqueueEchoLinkBasicLifecycle(async () => {
    const service = enabled ? getEchoLinkService() : getExistingEchoLinkService();
    if (!service) {
      markStartupStage('echo-link-basic:stopped', { enabled: false });
      return;
    }

    try {
      const status = await service.setBasicEnabled(enabled);
      markStartupStage(status.running ? 'echo-link-basic:ready' : 'echo-link-basic:stopped', {
        enabled: status.enabled,
        host: status.host,
        port: status.port,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      markStartupStage('echo-link-basic:failed', { error: message });
      getCrashReportService().getLogger()?.warn('main', '[EchoLinkBasic] failed to update LAN gateway', {
        error: message,
      });
    }
  });
};

export const initializeEchoLinkBasicIntegration = async (): Promise<void> => {
  markStartupStage('echo-link-basic:init');
  await syncEchoLinkBasicIntegrationFromSettings();
};
