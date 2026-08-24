import { app } from 'electron';
import { registerCrashHandlers } from './diagnostics/crashHandlers';
import { registerAppLifecycle } from './app/lifecycle';
import { startDevApiServer } from './app/devApiServer';
import { registerIpc } from './ipc/registerIpc';
import { registerCoverProtocolScheme } from './protocol/coverProtocol';
import { initializeProtectedUserDataPath } from './app/dataProtection';
import { isLibraryRecoveryMode } from './app/libraryRecoveryMode';
import { initializeDevConsoleCapture, initializePerformanceStallMonitor } from './diagnostics/DevConsoleService';
import { markStartupStage, openEarlySafeModeShellIfEnabled, recordStartupPersistentStateSnapshot } from './diagnostics/StartupDiagnostics';
import { initializePrivateOverlay } from './plugins/privateOverlayLoader';
import { isUltraLightGpuRuntime } from './app/ultraLightGpuRuntime';
import { getSteamCurrentGameLanguage, initializeSteamworks } from './integrations/steam/SteamworksService';
import { getAppSettings, getAppSettingsUpdatedAt, setAppSettings } from './app/appSettings';
import { getSteamCloudSettingsSyncService } from './integrations/steam/SteamCloudSettingsSync';
import { resolveSteamAppLocale } from './integrations/steam/SteamAppLanguage';
import { isExternalModLoaderAutoStartEnabled } from './mods/ExternalModLoaderService';

if (isExternalModLoaderAutoStartEnabled() && !process.argv.includes('--no-mod-loader')) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.ECHO_MOD_DEBUG_PORT ?? '9229');
}

markStartupStage('main:module-loaded');
const protectedUserDataPath = initializeProtectedUserDataPath();
markStartupStage('main:user-data-path-initialized');
initializeSteamworks();
markStartupStage('main:steamworks-initialized');
openEarlySafeModeShellIfEnabled({
  appVersion: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  userDataPath: protectedUserDataPath,
});
registerCrashHandlers();
markStartupStage('main:crash-handlers-registered');
initializeDevConsoleCapture();
markStartupStage('main:dev-console-capture-initialized');
recordStartupPersistentStateSnapshot({
  appVersion: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  userDataPath: protectedUserDataPath,
  appPath: app.getAppPath(),
  execPath: process.execPath,
});
markStartupStage('main:persistent-state-snapshot-recorded');
initializePerformanceStallMonitor(async () => {
  try {
    const { getAudioSession, hasAudioSession } = await import('./audio/AudioSession');
    if (!hasAudioSession()) {
      return null;
    }
    return getAudioSession().getDiagnostics() as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
});
markStartupStage('main:performance-stall-monitor-initialized');
registerCoverProtocolScheme();
markStartupStage('main:cover-protocol-scheme-registered');
initializePrivateOverlay();
try {
  getSteamCloudSettingsSyncService().reconcileAtStartup({
    getSettings: getAppSettings,
    getLocalUpdatedAt: getAppSettingsUpdatedAt,
    applySettings: (settings) => setAppSettings(settings),
  });
  markStartupStage('main:steam-cloud-settings-reconciled');
} catch (error) {
  markStartupStage('main:steam-cloud-settings-failed', {
    error: error instanceof Error ? error.message : String(error),
  });
}
const steamLocale = resolveSteamAppLocale(getSteamCurrentGameLanguage());
if (steamLocale) {
  const currentSettings = getAppSettings();
  if (currentSettings.locale !== steamLocale) {
    setAppSettings({ locale: steamLocale });
  }
  markStartupStage('main:steam-language-applied', { locale: steamLocale });
} else {
  markStartupStage('main:steam-language-unavailable');
}
registerIpc();
markStartupStage('main:ipc-registered');
if (!isLibraryRecoveryMode() && !isUltraLightGpuRuntime()) {
  startDevApiServer();
  markStartupStage('main:dev-api-server-started');
} else {
  markStartupStage('main:dev-api-server-skipped', {
    reason: isUltraLightGpuRuntime() ? 'ultra-light-gpu-runtime' : 'library-recovery-mode',
  });
}
registerAppLifecycle();
markStartupStage('main:lifecycle-registered');
