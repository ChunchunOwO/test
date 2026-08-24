import React from 'react';
import ReactDOM from 'react-dom/client';
import { dismissStartupOverlayAfterStablePaint } from './startupOverlay';
import type { Root } from 'react-dom/client';
import { shouldStartHeavyRendererDiagnostics } from './diagnostics/rendererDiagnosticsMode';
import {
  applyAppearancePreferences,
  loadPersistedAppearancePreferences,
  readAppearancePreferences,
  registerAppearanceFontFile,
} from './preferences/appearancePreferences';
import {
  applyAccessibilityPreferences,
  defaultAccessibilityPreferences,
} from './preferences/accessibilityPreferences';
import { applyThemeMode, loadPersistedThemeMode, readThemeMode, watchSystemThemeMode, watchThemeSettings } from './preferences/themePreferences';
import type { AppearancePreferences, AppSettings } from '../shared/types/appSettings';
import { getAppBridge } from './utils/echoBridge';
import { createSettingsChangePatch } from './preferences/settingsChangePatch';

declare global {
  interface Window {
    __echoReactRoot?: Root;
  }
}

const appearancePreferences = readAppearancePreferences();
const themeMode = readThemeMode();
const appBridge = getAppBridge();
const heavyRendererDiagnosticsEnabled = shouldStartHeavyRendererDiagnostics();
const rendererSearchParams = new URLSearchParams(window.location.search);
const isDesktopLyricsWindow = rendererSearchParams.get('desktopLyrics') === '1';
const isMiniPlayerWindow = rendererSearchParams.get('miniPlayer') === '1';
const isPetWindow = rendererSearchParams.get('pet') === '1';
const applyRendererAccessibilityPreferences = (
  preferences: Parameters<typeof applyAccessibilityPreferences>[0],
): void => {
  applyAccessibilityPreferences(preferences, {
    applyUiScale: !isDesktopLyricsWindow && !isMiniPlayerWindow && !isPetWindow,
  });
};
applyThemeMode(themeMode);
applyAppearancePreferences(appearancePreferences);
applyRendererAccessibilityPreferences(defaultAccessibilityPreferences);
if (heavyRendererDiagnosticsEnabled) {
  void import('./diagnostics/memoryInteractionDiagnostics')
    .then(({ startMemoryInteractionDiagnostics }) => startMemoryInteractionDiagnostics())
    .catch(() => undefined);
}

const loadAppearanceFontFiles = (preferences: AppearancePreferences): void => {
  if (preferences.mainFontFilePath && appBridge) {
    void appBridge.loadFontFile(preferences.mainFontFilePath).then((fontFile) => registerAppearanceFontFile('main', fontFile)).catch(() => undefined);
  }

  if (preferences.chineseFontFilePath && appBridge) {
    void appBridge
      .loadFontFile(preferences.chineseFontFilePath)
      .then((fontFile) => registerAppearanceFontFile('chinese', fontFile))
      .catch(() => undefined);
  }

  if (preferences.fallbackFontFilePath && appBridge) {
    void appBridge
      .loadFontFile(preferences.fallbackFontFilePath)
      .then((fontFile) => registerAppearanceFontFile('fallback', fontFile))
      .catch(() => undefined);
  }
};

type LyricsFontSlot = 'lyrics' | 'desktopLyrics';

const requestedLyricsFontPaths = new Map<LyricsFontSlot, string>();

const loadLyricsFontFile = (slot: LyricsFontSlot, path: string | null | undefined): void => {
  if (!path || !appBridge || requestedLyricsFontPaths.get(slot) === path) {
    return;
  }

  requestedLyricsFontPaths.set(slot, path);
  void appBridge
    .loadFontFile(path)
    .then((fontFile) => registerAppearanceFontFile(slot, fontFile))
    .catch(() => {
      if (requestedLyricsFontPaths.get(slot) === path) {
        requestedLyricsFontPaths.delete(slot);
      }
    });
};

const loadLyricsFontFiles = (settings: Partial<AppSettings>): void => {
  loadLyricsFontFile('lyrics', settings.lyricsFontFilePath);
  loadLyricsFontFile('desktopLyrics', settings.desktopLyricsFontFilePath);
};

const reportRendererError = (payload: Parameters<NonNullable<Window['echo']['diagnostics']>['reportRendererError']>[0]): void => {
  void window.echo?.diagnostics.reportRendererError(payload).catch(() => undefined);
};

window.addEventListener('error', (event) => {
  reportRendererError({
    message: event.message || 'Renderer error',
    stack: event.error instanceof Error ? event.error.stack : undefined,
    filename: event.filename || undefined,
    lineno: event.lineno,
    colno: event.colno,
    source: 'error',
    timestamp: new Date().toISOString(),
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  reportRendererError({
    message: reason instanceof Error ? reason.message : String(reason ?? 'Unhandled renderer rejection'),
    stack: reason instanceof Error ? reason.stack : undefined,
    source: 'unhandledrejection',
    timestamp: new Date().toISOString(),
  });
});

if (heavyRendererDiagnosticsEnabled) {
  void import('./diagnostics/performanceStallMonitor')
    .then(({ startPerformanceStallMonitor }) => startPerformanceStallMonitor())
    .catch(() => undefined);
}
loadAppearanceFontFiles(appearancePreferences);
if (appBridge) {
  watchThemeSettings(() => appBridge.getSettings());
} else {
  watchSystemThemeMode(readThemeMode);
}
void loadPersistedThemeMode().catch(() => undefined);
void loadPersistedAppearancePreferences()
  .then((preferences) => {
    applyAppearancePreferences(preferences);
    loadAppearanceFontFiles(preferences);
  })
  .catch(() => undefined);
let crossEditionSettingsSnapshot: Partial<AppSettings> | null = null;
const refreshCrossEditionSettings = async (): Promise<void> => {
  if (!appBridge) return;
  const settings = await appBridge.getSettings();
  const previousSettings = crossEditionSettingsSnapshot;
  const changedPatch = previousSettings ? createSettingsChangePatch(previousSettings, settings) : null;
  crossEditionSettingsSnapshot = settings;

  if (!previousSettings || (changedPatch && 'accessibilityPreferences' in changedPatch)) {
    applyRendererAccessibilityPreferences(settings.accessibilityPreferences);
  }
  if (!previousSettings || (changedPatch && ('lyricsFontFilePath' in changedPatch || 'desktopLyricsFontFilePath' in changedPatch))) {
    loadLyricsFontFiles(settings);
  }
  if (changedPatch && Object.keys(changedPatch).length > 0) {
    window.dispatchEvent(new CustomEvent('settings:changed', { detail: changedPatch }));
  }
};
void refreshCrossEditionSettings().catch(() => undefined);
appBridge?.onSharedSettingsChanged(() => {
  void refreshCrossEditionSettings().catch(() => undefined);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    void refreshCrossEditionSettings().catch(() => undefined);
  }
});

window.addEventListener('settings:changed', (event) => {
  const patch = event instanceof CustomEvent ? (event.detail as Partial<AppSettings> | null) : null;
  if (!patch || typeof patch !== 'object') {
    return;
  }

  if ('lyricsFontFilePath' in patch || 'desktopLyricsFontFilePath' in patch) {
    loadLyricsFontFiles(patch);
  }
  if ('accessibilityPreferences' in patch) {
    applyRendererAccessibilityPreferences(patch.accessibilityPreferences);
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element');
}

const reactRoot = window.__echoReactRoot ?? ReactDOM.createRoot(rootElement);
window.__echoReactRoot = reactRoot;

const renderWindow = async (): Promise<void> => {
  if (import.meta.env.DEV && rendererSearchParams.get('crashGuardPreview') === '1') {
    const { CrashGuard, CrashGuardPreviewFailure } = await import('./crash-guard/CrashGuard');
    document.documentElement.dataset.echoStartup = 'disabled';
    document.querySelector('.echo-startup-shell')?.remove();
    reactRoot.render(
      <CrashGuard label="main-window">
        <CrashGuardPreviewFailure />
      </CrashGuard>,
    );
    return;
  }

  const [{ I18nProvider, preloadInitialLocaleTranslations }, { CrashGuard }] = await Promise.all([
    import('./i18n/I18nProvider'),
    import('./crash-guard/CrashGuard'),
  ]);
  await preloadInitialLocaleTranslations();

  if (isPetWindow) {
    const [{ PetApp }] = await Promise.all([
      import('./pet/PetApp'),
      import('./styles/petStyles'),
    ]);
    reactRoot.render(
      <React.StrictMode>
        <CrashGuard label="pet">
          <I18nProvider>
            <PetApp />
          </I18nProvider>
        </CrashGuard>
      </React.StrictMode>,
    );
    return;
  }

  if (isMiniPlayerWindow) {
    const [{ MiniPlayerApp }] = await Promise.all([
      import('./mini-player/MiniPlayerApp'),
      import('./styles/miniPlayerStyles'),
    ]);
    reactRoot.render(
      <React.StrictMode>
        <CrashGuard label="mini-player">
          <I18nProvider>
            <MiniPlayerApp />
          </I18nProvider>
        </CrashGuard>
      </React.StrictMode>,
    );
    return;
  }

  if (isDesktopLyricsWindow) {
    const [{ DesktopLyricsApp }] = await Promise.all([
      import('./desktop-lyrics/DesktopLyricsApp'),
      import('./styles/desktopLyricsStyles'),
    ]);
    reactRoot.render(
      <React.StrictMode>
        <CrashGuard label="desktop-lyrics">
          <I18nProvider>
            <DesktopLyricsApp />
          </I18nProvider>
        </CrashGuard>
      </React.StrictMode>,
    );
    return;
  }

  const [{ App, prepareAppStartup }] = await Promise.all([
    import('./app/App'),
    import('./styles/mainWindowStyles'),
  ]);
  const appStartupPreparation = prepareAppStartup();
  reactRoot.render(
    <React.StrictMode>
      <CrashGuard label="main-window">
        <App />
      </CrashGuard>
    </React.StrictMode>,
  );
  await appStartupPreparation;
  await dismissStartupOverlayAfterStablePaint();
};

void renderWindow().catch((error) => {
  reportRendererError({
    message: `Renderer entry failed to load: ${error instanceof Error ? error.message : String(error)}`,
    stack: error instanceof Error ? error.stack : undefined,
    source: 'error',
    timestamp: new Date().toISOString(),
  });
  throw error;
});
