import type {
  WorkshopAuthoringKind,
  WorkshopAutomationTrigger,
  WorkshopContentKind,
} from '../../shared/types/workshop';
import { translateFallback, useOptionalI18n } from '../i18n/I18nProvider';
import type { Locale, TranslationKey } from '../i18n/locales';

export type WorkshopTranslate = (
  key: TranslationKey,
  options?: Record<string, string | number>,
) => string;

export const useWorkshopTranslate = (): WorkshopTranslate => useOptionalI18n()?.t ?? translateFallback;

export const useWorkshopLocale = (): Locale => useOptionalI18n()?.locale ?? 'zh-CN';

export const workshopKindLabelKey = (kind: WorkshopContentKind | 'all' | null | undefined): TranslationKey => {
  switch (kind) {
    case 'all':
      return 'workshop.kind.all';
    case 'theme':
      return 'workshop.kind.theme';
    case 'lyrics-style':
      return 'workshop.kind.lyricsStyle';
    case 'visualizer-preset':
      return 'workshop.kind.visualizer';
    case 'dsp-preset':
      return 'workshop.kind.dsp';
    case 'audio-plugin-profile':
      return 'workshop.kind.audioPlugin';
    case 'plugin-package':
      return 'workshop.kind.pluginPackage';
    default:
      return 'workshop.kind.unknown';
  }
};

export const workshopKindFilterLabelKey = (filter: WorkshopContentKind | 'all'): TranslationKey => workshopKindLabelKey(filter);

export const workshopStateLabelKey = (state: string): TranslationKey => {
  switch (state) {
    case 'not-ingested':
      return 'workshop.state.notIngested';
    case 'detected':
      return 'workshop.state.detected';
    case 'downloading':
      return 'workshop.state.downloading';
    case 'verified':
      return 'workshop.state.verified';
    case 'staged':
      return 'workshop.state.staged';
    case 'disabled':
      return 'workshop.state.disabled';
    case 'enabled':
      return 'workshop.state.enabled';
    case 'quarantined':
      return 'workshop.state.quarantined';
    case 'error':
      return 'workshop.state.error';
    default:
      return 'workshop.state.error';
  }
};

export const workshopStateFilterLabelKey = (filter: 'all' | 'attention' | 'enabled' | 'disabled' | 'issue'): TranslationKey => {
  switch (filter) {
    case 'attention':
      return 'workshop.filter.state.attention';
    case 'enabled':
      return 'workshop.filter.state.enabled';
    case 'disabled':
      return 'workshop.filter.state.disabled';
    case 'issue':
      return 'workshop.filter.state.issue';
    default:
      return 'workshop.filter.state.all';
  }
};

export const workshopReconcileLabelKey = (state: 'idle' | 'running' | 'ready' | 'error'): TranslationKey => {
  switch (state) {
    case 'idle':
      return 'workshop.reconcile.idle';
    case 'running':
      return 'workshop.reconcile.running';
    case 'ready':
      return 'workshop.reconcile.ready';
    default:
      return 'workshop.reconcile.error';
  }
};

export const workshopActionRequestLabelKey = (
  action: 'download' | 'ingest' | 'enable' | 'disable' | 'apply' | 'use' | 'subscribe' | 'unsubscribe' | 'open-in-steam',
): TranslationKey => {
  switch (action) {
    case 'download':
      return 'workshop.action.download';
    case 'ingest':
      return 'workshop.action.ingest';
    case 'enable':
      return 'workshop.action.enable';
    case 'disable':
      return 'workshop.action.disable';
    case 'apply':
      return 'workshop.action.apply';
    case 'use':
      return 'workshop.action.use';
    case 'subscribe':
      return 'workshop.action.subscribe';
    case 'unsubscribe':
      return 'workshop.action.unsubscribe';
    default:
      return 'workshop.action.openInSteam';
  }
};

export const workshopFailureLabelKey = (reason: string): TranslationKey | null => {
  switch (reason) {
    case 'content-not-enabled':
      return 'workshop.manager.failure.contentNotEnabled';
    case 'catalog-not-ready':
      return 'workshop.manager.failure.catalogNotReady';
    case 'catalog-revision-mismatch':
      return 'workshop.manager.failure.catalogMismatch';
    case 'content-kind-not-applicable':
      return 'workshop.manager.failure.kindNotApplicable';
    case 'theme-limit-reached':
      return 'workshop.manager.failure.themeLimit';
    case 'settings-apply-rejected':
      return 'workshop.manager.failure.settingsRejected';
    case 'dsp-apply-not-confirmed':
      return 'workshop.manager.failure.dspNotConfirmed';
    case 'apply-failed':
      return 'workshop.manager.failure.applyFailed';
    case 'not-subscribed':
      return 'workshop.manager.failure.notSubscribed';
    case 'source-unavailable':
      return 'workshop.manager.failure.sourceUnavailable';
    case 'request-rejected':
      return 'workshop.manager.failure.requestRejected';
    case 'source-error':
      return 'workshop.manager.failure.sourceError';
    case 'invalid-item-id':
      return 'workshop.manager.failure.invalidItem';
    case 'invalid-request':
      return 'workshop.manager.failure.invalidRequest';
    case 'reconcile-incomplete':
      return 'workshop.manager.failure.reconcileIncomplete';
    case 'ui-runtime-confirmation-required':
      return 'workshop.manager.failure.uiConfirm';
    case 'plugin-capabilities-confirmation-required':
      return 'workshop.manager.failure.pluginConfirm';
    case 'plugin-runtime-unavailable':
      return 'workshop.manager.failure.pluginRuntime';
    case 'plugin-package-invalid':
      return 'workshop.manager.failure.pluginInvalid';
    default:
      return null;
  }
};

export const workshopCapabilityLabelKey = (capability: string): TranslationKey | null => {
  switch (capability) {
    case 'navigation':
      return 'workshop.manager.capability.navigation';
    case 'playback:read':
      return 'workshop.manager.capability.playbackRead';
    case 'playback:control':
      return 'workshop.manager.capability.playbackControl';
    case 'playback:share':
      return 'workshop.manager.capability.playbackShare';
    case 'audio:spectrum':
      return 'workshop.manager.capability.audioSpectrum';
    case 'library:read':
      return 'workshop.manager.capability.libraryRead';
    case 'library:control':
      return 'workshop.manager.capability.libraryControl';
    case 'queue:read':
      return 'workshop.manager.capability.queueRead';
    case 'queue:control':
      return 'workshop.manager.capability.queueControl';
    case 'sources:provide':
      return 'workshop.manager.capability.sourcesProvide';
    case 'sources:direct':
      return 'workshop.manager.capability.sourcesDirect';
    case 'network:request':
      return 'workshop.manager.capability.networkRequest';
    case 'agent:runtime':
      return 'workshop.manager.capability.agentRuntime';
    case 'lyrics:provide':
      return 'workshop.manager.capability.lyricsProvide';
    case 'fs:plugin':
      return 'workshop.manager.capability.fsPlugin';
    default:
      return null;
  }
};

export const workshopAuthoringKindLabelKey = (kind: WorkshopAuthoringKind): TranslationKey => {
  switch (kind) {
    case 'theme':
      return 'workshop.author.kind.theme';
    case 'lyrics-style':
      return 'workshop.author.kind.lyrics';
    case 'visualizer-preset':
      return 'workshop.author.kind.visual';
    case 'dsp-preset':
      return 'workshop.author.kind.dsp';
    case 'audio-plugin-profile':
      return 'workshop.author.kind.vst';
    default:
      return 'workshop.author.kind.plugin';
  }
};

export const workshopVisibilityLabelKey = (
  visibility: 'public' | 'private' | 'friends-only' | 'unlisted' | string,
): TranslationKey => {
  switch (visibility) {
    case 'public':
      return 'workshop.author.visibility.public';
    case 'friends-only':
      return 'workshop.author.visibility.friends';
    case 'unlisted':
      return 'workshop.author.visibility.unlisted';
    default:
      return 'workshop.author.visibility.private';
  }
};

export const workshopTriggerLabelKey = (trigger: WorkshopAutomationTrigger): TranslationKey => {
  switch (trigger) {
    case 'track-started':
      return 'workshop.control.trigger.trackStarted';
    case 'track-ended':
      return 'workshop.control.trigger.trackEnded';
    case 'queue-changed':
      return 'workshop.control.trigger.queueChanged';
    case 'queue-empty':
      return 'workshop.control.trigger.queueEmpty';
    case 'device-changed':
      return 'workshop.control.trigger.deviceChanged';
    default:
      return 'workshop.control.trigger.timer';
  }
};
