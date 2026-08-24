import { AudioLines, Loader2, Power } from 'lucide-react';
import type { PlayableTrack } from '../../../shared/types/remoteSources';
import type {
  HqPlayerConnectionMode,
  HqPlayerConnectionTestResult,
  HqPlayerDefaultPlaybackBackend,
  HqPlayerPlaybackControlPlan,
  HqPlayerPlaybackControlSendReason,
  HqPlayerPlaybackHandoffPlan,
  HqPlayerPlaybackHandoffReason,
  HqPlayerRemotePlaybackStatus,
  HqPlayerSettings,
  HqPlayerStatus,
} from '../../../shared/types/hqplayer';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/locales';

type Translate = ReturnType<typeof useI18n>['t'];
type HqTone = 'off' | 'listen' | 'live' | 'error';

type ConnectHqPlayerWorkspaceProps = {
  draft: HqPlayerSettings;
  effectiveDraft: HqPlayerSettings;
  status: HqPlayerStatus | null;
  testResult: HqPlayerConnectionTestResult | null;
  lastHandoff: HqPlayerPlaybackHandoffPlan | null;
  lastControl: HqPlayerPlaybackControlPlan | null;
  currentPlayable: PlayableTrack | null;
  currentCover: string | null;
  busy: 'settings' | 'test' | null;
  onToggleEnabled: () => void;
  onPatchDraft: (patch: Partial<HqPlayerSettings>) => void;
};

const hqPlayerLocalHost = '127.0.0.1';
const hqPlayerConnectionModes: HqPlayerConnectionMode[] = ['localDesktop', 'remote'];
const hqPlayerDefaultBackends: HqPlayerDefaultPlaybackBackend[] = ['echoNative', 'ask', 'hqplayer'];

const hqPlayerStateLabel: Record<HqPlayerStatus['state'], TranslationKey> = {
  disabled: 'connectPage.hqplayer.state.disabled',
  'not-configured': 'connectPage.hqplayer.state.notConfigured',
  checking: 'connectPage.hqplayer.state.checking',
  available: 'connectPage.hqplayer.state.available',
  unavailable: 'connectPage.hqplayer.state.unavailable',
};

const hqPlayerModeLabel: Record<HqPlayerConnectionMode, TranslationKey> = {
  localDesktop: 'connectPage.hqplayer.mode.localDesktop',
  remote: 'connectPage.hqplayer.mode.remote',
};

const hqPlayerBackendLabel: Record<HqPlayerDefaultPlaybackBackend, TranslationKey> = {
  echoNative: 'connectPage.hqplayer.backend.echoNative',
  ask: 'connectPage.hqplayer.backend.ask',
  hqplayer: 'connectPage.hqplayer.backend.hqplayer',
};

const hqPlayerHandoffReasonLabel: Record<HqPlayerPlaybackHandoffReason, TranslationKey> = {
  hqplayer_disabled: 'connectPage.hqplayer.handoffReason.disabled',
  hqplayer_control_port_not_configured: 'connectPage.hqplayer.handoffReason.portNotConfigured',
  hqplayer_confirmation_required: 'connectPage.hqplayer.handoffReason.confirmationRequired',
  echo_native_selected: 'connectPage.hqplayer.handoffReason.echoNativeSelected',
  remote_hqplayer_requires_media_server: 'connectPage.hqplayer.handoffReason.remoteRequiresMediaServer',
  media_server_not_ready: 'connectPage.hqplayer.handoffReason.mediaServerNotReady',
  spotify_sdk_required: 'connectPage.hqplayer.handoffReason.spotifySdkRequired',
  streaming_item_unplayable: 'connectPage.hqplayer.handoffReason.streamingItemUnplayable',
  streaming_proxy_required: 'connectPage.hqplayer.handoffReason.streamingProxyRequired',
  source_requires_headers: 'connectPage.hqplayer.handoffReason.sourceRequiresHeaders',
  source_resolution_failed: 'connectPage.hqplayer.handoffReason.sourceResolutionFailed',
  unsupported_media_type: 'connectPage.hqplayer.handoffReason.unsupportedMediaType',
};

const hqPlayerSendReasonLabel: Record<HqPlayerPlaybackControlSendReason, TranslationKey> = {
  control_plan_missing: 'connectPage.hqplayer.sendReason.controlPlanMissing',
  handoff_not_ready: 'connectPage.hqplayer.sendReason.handoffNotReady',
  source_missing: 'connectPage.hqplayer.sendReason.sourceMissing',
  source_requires_headers: 'connectPage.hqplayer.sendReason.sourceRequiresHeaders',
  hqplayer_control_port_not_configured: 'connectPage.hqplayer.sendReason.portNotConfigured',
  hqplayer_connection_timeout: 'connectPage.hqplayer.sendReason.timeout',
  hqplayer_connection_refused: 'connectPage.hqplayer.sendReason.refused',
  hqplayer_connection_failed: 'connectPage.hqplayer.sendReason.failed',
  hqplayer_protocol_error: 'connectPage.hqplayer.sendReason.protocolError',
  hqplayer_response_error: 'connectPage.hqplayer.sendReason.responseError',
};

const hqPlayerExposureLabel: Record<NonNullable<HqPlayerPlaybackControlPlan['source']>['exposure'], TranslationKey> = {
  'local-file': 'connectPage.hqplayer.exposure.localFile',
  'loopback-http': 'connectPage.hqplayer.exposure.loopbackHttp',
  'direct-http': 'connectPage.hqplayer.exposure.directHttp',
  'media-server': 'connectPage.hqplayer.exposure.mediaServer',
};

const hqPlayerRemoteStateLabel: Record<HqPlayerRemotePlaybackStatus['state'], TranslationKey> = {
  stopped: 'connectPage.state.stopped',
  paused: 'connectPage.state.paused',
  playing: 'connectPage.state.playing',
  'stop-requested': 'connectPage.hqplayer.remoteState.stopRequested',
  unknown: 'connectPage.common.unknown',
};

const formatTime = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = String(safe % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
};

const parsePort = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return null;
  }
  return parsed;
};

const formatHqEndpoint = (settings: Pick<HqPlayerSettings, 'host' | 'port'>, t: Translate): string =>
  settings.port ? `${settings.host}:${settings.port}` : `${settings.host}:${t('connectPage.common.notConfigured')}`;

const formatHqPlayerSendMessage = (plan: HqPlayerPlaybackControlPlan | null, t: Translate): string => {
  const send = plan?.send ?? null;
  if (!send) {
    return t('connectPage.hqplayer.sendState.notSent');
  }
  if (send.state === 'sent') {
    return t('connectPage.hqplayer.sendState.sent', { ms: send.elapsedMs });
  }
  if (send.state === 'prepared') {
    return t('connectPage.hqplayer.sendState.prepared');
  }
  const reason = send.reason ? t(hqPlayerSendReasonLabel[send.reason]) : send.message;
  return `${send.state === 'failed' ? t('connectPage.hqplayer.sendState.failed') : t('connectPage.hqplayer.sendState.notSent')} · ${reason ?? t('connectPage.hqplayer.sendState.unknownReason')}`;
};

const formatHqPlayerProduct = (
  controlInfo: HqPlayerConnectionTestResult['controlInfo'] | HqPlayerStatus['controlInfo'] | null | undefined,
  t: Translate,
): string =>
  controlInfo?.product
    ? [controlInfo.product, controlInfo.version].filter(Boolean).join(' ')
    : t('connectPage.common.pendingCheck');

const formatHqPlayerEngine = (
  controlInfo: HqPlayerConnectionTestResult['controlInfo'] | HqPlayerStatus['controlInfo'] | null | undefined,
  t: Translate,
): string =>
  controlInfo?.engine ?? controlInfo?.platform ?? t('connectPage.common.pendingCheck');

const formatHqPlayerRemotePosition = (status: HqPlayerRemotePlaybackStatus | null, t: Translate): string => {
  if (!status) {
    return t('connectPage.common.pendingCheck');
  }
  const position = status.positionSeconds ?? 0;
  const duration = status.durationSeconds ?? 0;
  return `${t(hqPlayerRemoteStateLabel[status.state])} · ${formatTime(position)} / ${formatTime(duration)}`;
};

const formatHqPlayerSignal = (status: HqPlayerRemotePlaybackStatus | null, t: Translate): string => {
  if (!status) {
    return t('connectPage.common.pendingCheck');
  }
  const format = status.activeRate && status.activeBits && status.activeChannels
    ? `${status.activeRate}Hz / ${status.activeBits}bit / ${status.activeChannels}ch`
    : t('connectPage.hqplayer.signal.pendingFormat');
  const dsp = [status.activeMode, status.activeFilter, status.activeShaper].filter(Boolean).join(' · ');
  return dsp ? `${format} · ${dsp}` : format;
};

const formatTimestamp = (value: string | null, t: Translate): string => {
  if (!value) {
    return t('connectPage.common.notChecked');
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const hqPlayerTone = (state: HqPlayerStatus['state'], enabled: boolean, live: boolean): HqTone => {
  if (state === 'unavailable') {
    return 'error';
  }
  if (!enabled || state === 'disabled' || state === 'not-configured') {
    return 'off';
  }
  if (live) {
    return 'live';
  }
  return 'listen';
};

export const ConnectHqPlayerWorkspace = ({
  draft,
  effectiveDraft,
  status,
  testResult,
  lastHandoff,
  lastControl,
  currentPlayable,
  currentCover,
  busy,
  onToggleEnabled,
  onPatchDraft,
}: ConnectHqPlayerWorkspaceProps): JSX.Element => {
  const { t } = useI18n();
  const state: HqPlayerStatus['state'] =
    status?.state ?? (draft.enabled ? (effectiveDraft.port ? 'unavailable' : 'not-configured') : 'disabled');
  const controlPlan = lastControl ?? lastHandoff?.control ?? null;
  const controlInfo = testResult?.controlInfo ?? status?.controlInfo ?? null;
  const playbackStatus = testResult?.playbackStatus ?? status?.playbackStatus ?? null;
  const isRemote = effectiveDraft.connectionMode === 'remote';
  const live = playbackStatus?.state === 'playing' || playbackStatus?.state === 'paused';
  const tone = hqPlayerTone(state, draft.enabled, live);
  const endpointLabel = formatHqEndpoint({
    host: status?.endpoint.host ?? effectiveDraft.host,
    port: status?.endpoint.port ?? effectiveDraft.port,
  }, t);
  const productLabel = formatHqPlayerProduct(controlInfo, t);
  const engineLabel = formatHqPlayerEngine(controlInfo, t);
  const remotePositionLabel = formatHqPlayerRemotePosition(playbackStatus, t);
  const signalLabel = formatHqPlayerSignal(playbackStatus, t);
  const durationSeconds = playbackStatus?.durationSeconds ?? 0;
  const progressPercent =
    durationSeconds > 0
      ? Math.min(100, Math.max(0, ((playbackStatus?.positionSeconds ?? 0) / durationSeconds) * 100))
      : 0;
  const mediaServerLabel = lastHandoff?.source?.mediaServer
    ? `${lastHandoff.source.mediaServer.publicHost ?? 'unknown'}:${lastHandoff.source.mediaServer.port ?? 'auto'}`
    : null;
  const title = controlPlan?.metadata?.title ?? currentPlayable?.title ?? t('connectPage.hqplayer.waitingTitle');
  const subtitle = [
    controlPlan?.metadata?.artist ?? currentPlayable?.artist ?? t('miniPlayer.artist.unknown'),
    controlPlan?.metadata?.album ?? currentPlayable?.album,
  ].filter(Boolean).join(' / ');
  const heading = controlInfo?.name || productLabel !== t('connectPage.common.pendingCheck')
    ? (controlInfo?.name ?? productLabel)
    : t('connectPage.hqplayer.localDesktop');
  const planLines = [
    `${t('connectPage.hqplayer.field.handoff')} · ${lastHandoff ? (lastHandoff.reason ? t(hqPlayerHandoffReasonLabel[lastHandoff.reason]) : lastHandoff.state) : t('connectPage.common.none')}`,
    `${t('connectPage.hqplayer.field.control')} · ${controlPlan ? `${controlPlan.action} · ${controlPlan.transport}` : t('connectPage.common.none')}`,
    `${t('connectPage.hqplayer.field.send')} · ${formatHqPlayerSendMessage(controlPlan, t)}`,
    `${t('connectPage.hqplayer.field.source')} · ${
      controlPlan?.source
        ? `${t(hqPlayerExposureLabel[controlPlan.source.exposure])} · ${controlPlan.source.mimeType ?? 'audio'}`
        : t('connectPage.common.none')
    }`,
    mediaServerLabel ? `${t('connectPage.hqplayer.field.mediaUrl')} · ${mediaServerLabel}` : null,
    `${t('connectPage.hqplayer.field.track')} · ${controlPlan?.metadata?.title ?? currentPlayable?.title ?? t('connectPage.hqplayer.noCurrentTrack')}`,
    `${t('connectPage.hqplayer.field.headers')} · ${controlPlan?.source?.hasHeaders ? t('connectPage.hqplayer.headersRequireMediaServer') : t('connectPage.hqplayer.headersNotExposed')}`,
  ].filter((line): line is string => Boolean(line));

  return (
    <div className="connect-hqp-workspace" aria-label={t('connectPage.hqplayer.aria')}>
      <section className="connect-hqp-hero" data-on={draft.enabled ? 'true' : 'false'} data-tone={tone}>
        <div className="connect-hqp-hero__top">
          <div className="connect-hqp-hero__copy">
            <div className="connect-hqp-hero__meta">
              <span>{t('connectPage.hqplayer.kicker')}</span>
              <b data-tone={tone}>{t(hqPlayerStateLabel[state])}</b>
            </div>
            <h2>{heading}</h2>
            <p>{endpointLabel}</p>
          </div>
          <button
            className="connect-power"
            data-on={draft.enabled ? 'true' : 'false'}
            type="button"
            onClick={onToggleEnabled}
            disabled={busy === 'settings'}
          >
            {busy === 'settings' ? <Loader2 className="spinning-icon" size={16} /> : <Power size={16} />}
            {draft.enabled ? t('connectPage.hqplayer.disable') : t('connectPage.hqplayer.enable')}
          </button>
        </div>

        {live ? (
          <div className="connect-hqp-now">
            <div className="connect-hqp-now__art" data-empty={!currentCover}>
              {currentCover ? <img alt="" src={currentCover} /> : <AudioLines size={22} />}
            </div>
            <div className="connect-hqp-now__copy">
              <span>{t(hqPlayerRemoteStateLabel[playbackStatus?.state ?? 'unknown'])}</span>
              <h3>{title}</h3>
              <p>{subtitle}</p>
              <div className="connect-progress" aria-label={t('connectPage.hqplayer.progressAria')}>
                <span style={{ width: `${progressPercent}%` }} />
              </div>
              <small>{`${formatTime(playbackStatus?.positionSeconds ?? 0)} / ${formatTime(durationSeconds)} · ${signalLabel}`}</small>
            </div>
          </div>
        ) : (
          <p className="connect-hqp-hint">
            {draft.enabled ? t('connectPage.hqplayer.listeningHint') : t('connectPage.hqplayer.offlineHint')}
          </p>
        )}

        <div className="connect-hqp-metrics">
          <div>
            <em>{t('connectPage.hqplayer.field.product')}</em>
            <strong title={productLabel}>{productLabel}</strong>
          </div>
          <div>
            <em>{t('connectPage.hqplayer.field.engine')}</em>
            <strong title={engineLabel}>{engineLabel}</strong>
          </div>
          <div>
            <em>{t('connectPage.hqplayer.remoteStatus')}</em>
            <strong title={remotePositionLabel}>{remotePositionLabel}</strong>
          </div>
          <div>
            <em>{t('connectPage.hqplayer.testResult')}</em>
            <strong title={testResult ? (testResult.ok ? t('connectPage.hqplayer.testAvailable', { ms: testResult.elapsedMs }) : testResult.error ?? t('common.unavailable')) : t('connectPage.common.pendingCheck')}>
              {testResult
                ? (testResult.ok ? t('connectPage.hqplayer.testAvailable', { ms: testResult.elapsedMs }) : testResult.error ?? t('common.unavailable'))
                : t('connectPage.common.pendingCheck')}
            </strong>
          </div>
        </div>
      </section>

      <section className="connect-hqp-board" aria-label={t('connectPage.hqplayer.modeAria')}>
        <div className="connect-hqp-block">
          <span>{t('connectPage.hqplayer.modeAria')}</span>
          <div className="connect-hqp-segments" aria-label={t('connectPage.hqplayer.modeAria')}>
            {hqPlayerConnectionModes.map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={effectiveDraft.connectionMode === mode}
                disabled={busy !== null}
                onClick={() => onPatchDraft({
                  connectionMode: mode,
                  host: mode === 'localDesktop' ? hqPlayerLocalHost : draft.host,
                  port: effectiveDraft.port,
                })}
              >
                {t(hqPlayerModeLabel[mode])}
              </button>
            ))}
          </div>
        </div>

        {isRemote ? (
          <div className="connect-hqp-fields">
            <label className="connect-hqp-field">
              <span>{t('connectPage.hqplayer.field.host')}</span>
              <input
                type="text"
                value={effectiveDraft.host}
                onChange={(event) => onPatchDraft({ host: event.currentTarget.value })}
              />
            </label>
            <label className="connect-hqp-field">
              <span>{t('connectPage.hqplayer.controlPort')}</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={effectiveDraft.port ?? ''}
                onChange={(event) => onPatchDraft({ port: parsePort(event.currentTarget.value) })}
              />
            </label>
          </div>
        ) : null}

        <div className="connect-hqp-block">
          <span>{t('connectPage.hqplayer.backendAria')}</span>
          <div className="connect-hqp-segments" data-cols="3" aria-label={t('connectPage.hqplayer.backendAria')}>
            {hqPlayerDefaultBackends.map((backend) => (
              <button
                key={backend}
                type="button"
                aria-pressed={effectiveDraft.defaultPlaybackBackend === backend}
                disabled={busy !== null}
                onClick={() => onPatchDraft({ defaultPlaybackBackend: backend })}
              >
                {t(hqPlayerBackendLabel[backend])}
              </button>
            ))}
          </div>
        </div>

        <div className="connect-hqp-option">
          <div>
            <strong>{t('connectPage.hqplayer.mediaServer')}</strong>
            <small>{isRemote ? t('connectPage.hqplayer.remoteModeHint') : t('connectPage.hqplayer.localModeHint')}</small>
          </div>
          <div className="settings-inline-toggle">
            <button
              aria-label={t('connectPage.hqplayer.mediaServerAria')}
              aria-pressed={draft.mediaServerEnabled}
              className={`toggle-btn ${draft.mediaServerEnabled ? 'active' : ''}`}
              type="button"
              onClick={() => onPatchDraft({ mediaServerEnabled: !draft.mediaServerEnabled })}
            >
              <span />
            </button>
          </div>
        </div>

        <details className="connect-hqp-advanced">
          <summary>{t('connectPage.hqplayer.advanced')}</summary>
          <div className="connect-hqp-fields">
            {!isRemote ? (
              <>
                <label className="connect-hqp-field">
                  <span>{t('connectPage.hqplayer.field.host')}</span>
                  <input
                    type="text"
                    value={effectiveDraft.host}
                    onChange={(event) => onPatchDraft({ host: event.currentTarget.value })}
                  />
                </label>
                <label className="connect-hqp-field">
                  <span>{t('connectPage.hqplayer.controlPort')}</span>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={effectiveDraft.port ?? ''}
                    onChange={(event) => onPatchDraft({ port: parsePort(event.currentTarget.value) })}
                  />
                </label>
              </>
            ) : null}
            <label className="connect-hqp-field">
              <span>{t('connectPage.hqplayer.mediaPort')}</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={draft.mediaServerPort ?? ''}
                onChange={(event) => onPatchDraft({ mediaServerPort: parsePort(event.currentTarget.value) })}
              />
            </label>
            <label className="connect-hqp-field connect-hqp-field--wide">
              <span>{t('connectPage.hqplayer.field.profile')}</span>
              <input
                type="text"
                value={draft.profileName ?? ''}
                onChange={(event) => onPatchDraft({ profileName: event.currentTarget.value.trim() || null })}
              />
            </label>
            <div className="connect-hqp-field">
              <span>{t('connectPage.hqplayer.lastChecked')}</span>
              <strong>{formatTimestamp(status?.lastCheckedAt ?? null, t)}</strong>
            </div>
          </div>
        </details>
      </section>

      <details className="connect-hqp-plan" aria-label={t('connectPage.hqplayer.recentPlan')}>
        <summary>{t('connectPage.hqplayer.debugTitle')}</summary>
        <div className="connect-hqp-plan__body">
          {planLines.length > 0
            ? planLines.map((line) => <code key={line}>{line}</code>)
            : <small>{t('connectPage.hqplayer.debugNoneYet')}</small>}
        </div>
      </details>
    </div>
  );
};
