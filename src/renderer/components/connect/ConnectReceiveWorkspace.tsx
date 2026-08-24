import { Loader2, Power } from 'lucide-react';
import type { AirPlayReceiverProtocol } from '../../../shared/types/appSettings';
import type { AirPlayReceiverStatus, ConnectReceiverDebugEvent, ConnectReceiverStatus } from '../../../shared/types/connect';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/locales';
import {
  ConnectReceiveFacts,
  ConnectReceiveGuide,
  ConnectReceiveLog,
  ConnectReceiveNowPlaying,
  type ReceiveTone,
} from './ConnectReceivePrimitives';

type ConnectReceiveWorkspaceProps = {
  receiverStatus: ConnectReceiverStatus;
  airPlayReceiverStatus: AirPlayReceiverStatus;
  airPlayReceiverProtocol: AirPlayReceiverProtocol;
  airPlayDebugText: string;
  copiedAirPlayDebug: boolean;
  isReceiverBusy: boolean;
  isAirPlayReceiverBusy: boolean;
  onToggleReceiver: () => void;
  onStopReceiver: () => void;
  onToggleAirPlay: () => void;
  onStopAirPlay: () => void;
  onSetAirPlayProtocol: (protocol: AirPlayReceiverProtocol) => void;
  onCopyAirPlayDebug: () => void;
};

const airPlayReceiverProtocols: AirPlayReceiverProtocol[] = ['airplay1', 'airplay2'];

const receiverStateLabel: Record<ConnectReceiverStatus['state'], TranslationKey> = {
  disabled: 'connectPage.receiver.state.disabled',
  idle: 'connectPage.receiver.state.idle',
  ready: 'connectPage.receiver.state.ready',
  loading: 'connectPage.receiver.state.loading',
  playing: 'connectPage.receiver.state.playing',
  paused: 'connectPage.state.paused',
  stopped: 'connectPage.state.stopped',
  error: 'connectPage.state.error',
};

const airPlayStateLabel: Record<AirPlayReceiverStatus['state'], TranslationKey> = {
  disabled: 'connectPage.receiver.state.disabled',
  unavailable: 'connectPage.airplay.state.unavailable',
  idle: 'connectPage.airplay.state.idle',
  starting: 'connectPage.airplay.state.starting',
  ready: 'connectPage.deviceState.connected',
  playing: 'connectPage.airplay.state.playing',
  paused: 'connectPage.state.paused',
  stopped: 'connectPage.state.stopped',
  error: 'connectPage.state.error',
};

const formatTime = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = String(safe % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
};

const formatReceiverAddress = (value: string): string => {
  try {
    const url = new URL(value);
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return value;
  }
};

const formatReceiverDebugEvent = (event: ConnectReceiverDebugEvent): string => {
  const statusCode = event.statusCode === null ? '-' : String(event.statusCode);
  return [
    new Date(event.at).toLocaleTimeString(),
    event.remoteAddress ?? '-',
    event.method,
    event.path,
    event.action ? `#${event.action}` : '#-',
    statusCode,
    event.message ?? '',
  ].filter(Boolean).join(' ');
};

const receiverTone = (status: ConnectReceiverStatus): ReceiveTone => {
  if (status.state === 'error') {
    return 'error';
  }
  if (!status.enabled) {
    return 'off';
  }
  if (status.currentUri || status.state === 'playing' || status.state === 'ready' || status.state === 'loading') {
    return 'live';
  }
  return 'listen';
};

const airPlayTone = (status: AirPlayReceiverStatus): ReceiveTone => {
  if (status.state === 'error' || status.state === 'unavailable') {
    return status.state === 'error' ? 'error' : 'off';
  }
  if (!status.enabled) {
    return 'off';
  }
  if (status.currentSourceId || status.state === 'playing' || status.state === 'ready' || status.state === 'starting') {
    return 'live';
  }
  return 'listen';
};

export const ConnectReceiveWorkspace = ({
  receiverStatus,
  airPlayReceiverStatus,
  airPlayReceiverProtocol,
  airPlayDebugText,
  copiedAirPlayDebug,
  isReceiverBusy,
  isAirPlayReceiverBusy,
  onToggleReceiver,
  onStopReceiver,
  onToggleAirPlay,
  onStopAirPlay,
  onSetAirPlayProtocol,
  onCopyAirPlayDebug,
}: ConnectReceiveWorkspaceProps): JSX.Element => {
  const { t } = useI18n();
  const dlnaActive = Boolean(receiverStatus.currentUri);
  const airPlayActive = Boolean(airPlayReceiverStatus.currentSourceId);
  const dlnaTone = receiverTone(receiverStatus);
  const airTone = airPlayTone(airPlayReceiverStatus);
  const receiverTitle =
    receiverStatus.metadata?.title ??
    (receiverStatus.currentUri ? receiverStatus.currentUri.split(/[?#]/u)[0]?.split(/[\\/]/u).pop() : null) ??
    t('connectPage.receiver.waitingTitle');
  const receiverSubtitle = [
    receiverStatus.metadata?.artist ?? t('miniPlayer.artist.unknown'),
    receiverStatus.metadata?.album,
  ].filter(Boolean).join(' / ');
  const receiverCover = receiverStatus.metadata?.coverHttpUrl || null;
  const receiverProgressPercent =
    receiverStatus.durationSeconds > 0
      ? Math.min(100, Math.max(0, (receiverStatus.positionSeconds / receiverStatus.durationSeconds) * 100))
      : 0;
  const airPlayTitle = airPlayReceiverStatus.metadata?.title ?? t('connectPage.airplay.waitingTitle');
  const airPlaySubtitle = [
    airPlayReceiverStatus.metadata?.artist ?? t('miniPlayer.artist.unknown'),
    airPlayReceiverStatus.metadata?.album,
  ].filter(Boolean).join(' / ');
  const airPlayCover = airPlayReceiverStatus.artworkUrl || airPlayReceiverStatus.metadata?.coverHttpUrl || null;
  const airPlayProgressPercent =
    airPlayReceiverStatus.durationSeconds > 0
      ? Math.min(100, Math.max(0, (airPlayReceiverStatus.positionSeconds / airPlayReceiverStatus.durationSeconds) * 100))
      : 0;
  const networkValue =
    receiverStatus.addresses.length > 0
      ? receiverStatus.addresses.map(formatReceiverAddress).join('  ')
      : receiverStatus.enabled
        ? t('connectPage.receiver.preparing')
        : t('connectPage.receiver.discoveryHint');
  const dlnaSource = receiverStatus.currentClient
    ? t('connectPage.receiver.fromClient', { address: receiverStatus.currentClient.address })
    : t('connectPage.receiver.noClient');
  const airPlaySource = airPlayReceiverStatus.currentClient
    ? t('connectPage.receiver.fromClient', { address: airPlayReceiverStatus.currentClient.address })
    : t('connectPage.airplay.waitingDevice');
  const dlnaEvents = receiverStatus.debugEvents.slice(0, 6).map(formatReceiverDebugEvent);
  const airPlayEvents = airPlayReceiverStatus.debugEvents.slice(0, 6).map(formatReceiverDebugEvent);

  return (
    <div className="connect-workspace connect-receive-workspace">
      <section
        className="connect-receive-lane"
        aria-label={t('connectPage.receiver.aria')}
        data-kind="dlna"
        data-on={receiverStatus.enabled ? 'true' : 'false'}
        data-tone={dlnaTone}
        data-idle={dlnaActive ? 'false' : 'true'}
      >
        <header className="connect-receive-lane__header">
          <div>
            <div className="connect-receive-lane__meta">
              <span>{t('connectPage.receiver.protocol')}</span>
              <b data-tone={dlnaTone}>{t(receiverStateLabel[receiverStatus.state])}</b>
            </div>
            <h2>{t('connectPage.receiver.title')}</h2>
            <p>{receiverStatus.advertisedName}</p>
          </div>
          <button
            className="connect-power"
            data-on={receiverStatus.enabled ? 'true' : 'false'}
            type="button"
            onClick={onToggleReceiver}
            disabled={isReceiverBusy}
          >
            {isReceiverBusy ? <Loader2 className="spinning-icon" size={16} /> : <Power size={16} />}
            {receiverStatus.enabled ? t('connectPage.receiver.disable') : t('connectPage.receiver.enable')}
          </button>
        </header>
        <ConnectReceiveFacts
          rows={[
            { label: t('connectPage.receiver.field.state'), value: t(receiverStateLabel[receiverStatus.state]) },
            { label: t('connectPage.receiver.field.name'), value: receiverStatus.advertisedName },
            { label: t('connectPage.receiver.field.network'), value: networkValue },
            { label: t('connectPage.receiver.field.source'), value: dlnaSource },
          ]}
        />
        {dlnaActive ? (
          <ConnectReceiveNowPlaying
            cover={receiverCover}
            emptyIcon="phone"
            stateLabel={t(receiverStateLabel[receiverStatus.state])}
            title={receiverTitle}
            subtitle={receiverSubtitle}
            progressPercent={receiverProgressPercent}
            progressAria={t('connectPage.receiver.progressAria')}
            positionLabel={`${formatTime(receiverStatus.positionSeconds)} / ${formatTime(receiverStatus.durationSeconds)}`}
            stopLabel={t('connectPage.receiver.stop')}
            stopDisabled={isReceiverBusy || !receiverStatus.currentUri}
            onStop={onStopReceiver}
          />
        ) : (
          <ConnectReceiveGuide
            title={t('connectPage.receiver.guideTitle')}
            steps={[t('connectPage.receiver.guide1'), t('connectPage.receiver.guide2'), t('connectPage.receiver.guide3')]}
            hint={receiverStatus.enabled ? t('connectPage.receiver.listeningHint') : t('connectPage.receiver.offlineHint')}
          />
        )}
        <ConnectReceiveLog
          ariaLabel={t('connectPage.receiver.debugAria')}
          title={t('connectPage.receiver.debugTitle')}
          countLabel={receiverStatus.debugEvents.length > 0 ? t('connectPage.outgoing.recent', { count: receiverStatus.debugEvents.length }) : t('connectPage.receiver.debugEmpty')}
          emptyLabel={t('connectPage.receiver.debugNoneYet')}
          lines={dlnaEvents}
        />
      </section>

      <section
        className="connect-receive-lane"
        aria-label={t('connectPage.airplay.aria')}
        data-kind="airplay"
        data-on={airPlayReceiverStatus.enabled ? 'true' : 'false'}
        data-tone={airTone}
        data-idle={airPlayActive ? 'false' : 'true'}
      >
        <header className="connect-receive-lane__header">
          <div>
            <div className="connect-receive-lane__meta">
              <span>{t('connectPage.airplay.protocolLabel')}</span>
              <b data-tone={airTone}>{t(airPlayStateLabel[airPlayReceiverStatus.state])}</b>
            </div>
            <h2>{t('connectPage.airplay.title')}</h2>
            <p>{airPlayReceiverStatus.advertisedName}</p>
          </div>
          <button
            className="connect-power"
            data-on={airPlayReceiverStatus.enabled ? 'true' : 'false'}
            type="button"
            onClick={onToggleAirPlay}
            disabled={isAirPlayReceiverBusy}
          >
            {isAirPlayReceiverBusy ? <Loader2 className="spinning-icon" size={16} /> : <Power size={16} />}
            {airPlayReceiverStatus.enabled ? t('connectPage.airplay.disable') : t('connectPage.airplay.enable')}
          </button>
        </header>
        <div className="connect-receive-protocols" aria-label={t('connectPage.airplay.protocolAria')}>
          {airPlayReceiverProtocols.map((protocol) => (
            <button
              key={protocol}
              type="button"
              aria-pressed={airPlayReceiverProtocol === protocol}
              disabled={isAirPlayReceiverBusy}
              onClick={() => onSetAirPlayProtocol(protocol)}
            >
              {protocol === 'airplay1' ? t('connectPage.airplay.protocol.airplay1') : t('connectPage.airplay.protocol.airplay2')}
            </button>
          ))}
        </div>
        <ConnectReceiveFacts
          rows={[
            { label: t('connectPage.receiver.field.state'), value: t(airPlayStateLabel[airPlayReceiverStatus.state]) },
            { label: t('connectPage.receiver.field.name'), value: airPlayReceiverStatus.advertisedName },
            {
              label: t('connectPage.airplay.field.protocol'),
              value: airPlayReceiverProtocol === 'airplay2' ? t('connectPage.airplay.protocol.airplay2') : t('connectPage.airplay.protocol.airplay1'),
            },
            {
              label: t('connectPage.airplay.field.backend'),
              value: airPlayReceiverStatus.nativeAvailable ? t('connectPage.airplay.nativeLoaded') : t('connectPage.airplay.nativeRequired'),
            },
            { label: t('connectPage.receiver.field.source'), value: airPlayReceiverStatus.error ? airPlayReceiverStatus.error : airPlaySource },
          ]}
        />
        {airPlayActive ? (
          <ConnectReceiveNowPlaying
            cover={airPlayCover}
            emptyIcon="airplay"
            stateLabel={t(airPlayStateLabel[airPlayReceiverStatus.state])}
            title={airPlayTitle}
            subtitle={airPlaySubtitle}
            progressPercent={airPlayProgressPercent}
            progressAria={t('connectPage.airplay.progressAria')}
            positionLabel={`${formatTime(airPlayReceiverStatus.positionSeconds)} / ${formatTime(airPlayReceiverStatus.durationSeconds)}`}
            stopLabel={t('connectPage.airplay.stop')}
            stopDisabled={isAirPlayReceiverBusy || !airPlayReceiverStatus.currentSourceId}
            onStop={onStopAirPlay}
          />
        ) : (
          <ConnectReceiveGuide
            title={t('connectPage.airplay.guideTitle')}
            steps={[t('connectPage.airplay.guide1'), t('connectPage.airplay.guide2'), t('connectPage.airplay.guide3')]}
            hint={airPlayReceiverStatus.enabled ? t('connectPage.airplay.listeningHint') : t('connectPage.airplay.offlineHint')}
          />
        )}
        <ConnectReceiveLog
          ariaLabel={t('connectPage.airplay.debugAria')}
          title={t('connectPage.airplay.debugTitle')}
          countLabel={airPlayReceiverStatus.debugEvents.length > 0 ? t('connectPage.outgoing.recent', { count: airPlayReceiverStatus.debugEvents.length }) : t('connectPage.receiver.debugEmpty')}
          emptyLabel={t('connectPage.airplay.debugNoneYet')}
          lines={airPlayEvents}
          extras={airPlayActive ? [t('connectPage.airplay.seekHint')] : undefined}
          copyLabel={t('connectPage.airplay.copyDebug')}
          copied={copiedAirPlayDebug}
          copyDisabled={!airPlayDebugText}
          onCopy={onCopyAirPlayDebug}
        />
      </section>
    </div>
  );
};
