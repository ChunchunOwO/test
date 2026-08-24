import { Activity, Clock3, Link2, RadioTower, RefreshCw, Unplug } from 'lucide-react';
import type { LastFmStatus } from '../../../../shared/types/lastfm';
import { useI18n } from '../../../i18n/I18nProvider';
import { StatusText, ToggleButton } from '../components/SettingsPrimitives';
import './lastfm-integration-panel.css';

type LastFmIntegrationPanelProps = {
  available: boolean;
  highlighted: boolean;
  status: LastFmStatus | null;
  onCompleteAuth: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onNowPlayingToggle: () => void;
  onRefresh: () => void;
  onScrobbleToggle: () => void;
  onToggle: () => void;
};

const formatTimestamp = (value: string | null | undefined, fallback: string): string => {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : fallback;
};

export const LastFmIntegrationPanel = ({
  available,
  highlighted,
  status,
  onCompleteAuth,
  onConnect,
  onDisconnect,
  onNowPlayingToggle,
  onRefresh,
  onScrobbleToggle,
  onToggle,
}: LastFmIntegrationPanelProps): JSX.Element => {
  const { t } = useI18n();
  const never = t('settings.integrations.lastfm.never');
  const statusLabel = !status?.enabled
    ? t('common.disabled')
    : status.connected
      ? t('settings.integrations.lastfm.status.connected', { username: status.username ?? '' }).trim()
      : status.authPending
        ? t('settings.integrations.lastfm.status.pending')
        : status.lastError
          ? t('settings.integrations.lastfm.status.error', { error: status.lastError })
          : t('settings.integrations.lastfm.status.notConnected');
  const activeTrackLabel = status?.activeTrack
    ? t('settings.integrations.lastfm.activeProgress', {
        artist: status.activeTrack.artist,
        title: status.activeTrack.title,
        played: status.activeTrack.playedSeconds,
        threshold: status.activeTrack.thresholdSeconds,
      })
    : t('settings.integrations.lastfm.noActiveTrack');

  return (
    <section
      className="lastfm-integration-panel"
      id="settings-row-lastfm"
      data-search-highlight={highlighted ? 'true' : undefined}
      aria-labelledby="lastfm-integration-title"
    >
      <header className="lastfm-integration-panel__header">
        <span className="lastfm-integration-panel__icon" aria-hidden="true">
          <RadioTower size={20} />
        </span>
        <div className="lastfm-integration-panel__title">
          <h3 id="lastfm-integration-title">{t('settings.integrations.lastfm.title')}</h3>
          <p>{t('settings.integrations.lastfm.description')}</p>
        </div>
        <StatusText tone={status?.enabled ? 'good' : 'muted'}>{statusLabel}</StatusText>
        <ToggleButton
          active={status?.enabled ?? false}
          ariaLabel={t('settings.integrations.lastfm.title')}
          disabled={!available}
          onClick={onToggle}
        />
      </header>

      <div className="lastfm-integration-panel__body">
        <div className="lastfm-integration-panel__connection">
          <div>
            <span className="lastfm-integration-panel__section-icon" aria-hidden="true"><Link2 size={16} /></span>
            <div>
              <h4>{t('settings.integrations.lastfm.connection.title')}</h4>
              <p>{t('settings.integrations.lastfm.connection.description.browser')}</p>
            </div>
          </div>
          <div className="lastfm-integration-panel__actions">
            {!status?.connected ? (
              <button className="settings-action-button lastfm-integration-panel__primary" type="button" onClick={onConnect}>
                {t('settings.integrations.lastfm.action.connect')}
              </button>
            ) : null}
            {status?.authPending ? (
              <button className="settings-action-button" type="button" onClick={onCompleteAuth}>
                {t('settings.integrations.lastfm.action.completeAuth')}
              </button>
            ) : null}
            <button className="settings-action-button" type="button" onClick={onRefresh}>
              <RefreshCw size={14} />
              {t('settings.integrations.lastfm.action.refresh')}
            </button>
            {status?.connected ? (
              <button className="settings-action-button" type="button" onClick={onDisconnect}>
                <Unplug size={14} />
                {t('settings.integrations.lastfm.action.disconnect')}
              </button>
            ) : null}
          </div>
        </div>

        <dl className="lastfm-integration-panel__metrics">
          <div>
            <dt>{t('settings.integrations.lastfm.lastNowPlaying')}</dt>
            <dd>{formatTimestamp(status?.lastNowPlayingAt, never)}</dd>
          </div>
          <div>
            <dt>{t('settings.integrations.lastfm.lastScrobble')}</dt>
            <dd>{formatTimestamp(status?.lastScrobbleAt, never)}</dd>
          </div>
          <div>
            <dt>{t('settings.integrations.lastfm.activeTrack')}</dt>
            <dd title={activeTrackLabel}>{activeTrackLabel}</dd>
          </div>
          <div>
            <dt>{t('settings.integrations.lastfm.statusLabel')}</dt>
            <dd>{statusLabel}</dd>
          </div>
        </dl>

        <div className="lastfm-integration-panel__features">
          <div>
            <span className="lastfm-integration-panel__feature-icon" aria-hidden="true"><Activity size={17} /></span>
            <div>
              <h4>{t('settings.integrations.lastfm.nowPlaying.title')}</h4>
              <p>{t('settings.integrations.lastfm.nowPlaying.description')}</p>
            </div>
            <ToggleButton
              active={status?.nowPlayingEnabled ?? true}
              ariaLabel={t('settings.integrations.lastfm.nowPlaying.title')}
              disabled={!status}
              onClick={onNowPlayingToggle}
            />
          </div>
          <div>
            <span className="lastfm-integration-panel__feature-icon" aria-hidden="true"><Clock3 size={17} /></span>
            <div>
              <h4>{t('settings.integrations.lastfm.scrobbling.title')}</h4>
              <p>{t('settings.integrations.lastfm.scrobbling.description')}</p>
            </div>
            <ToggleButton
              active={status?.scrobbleEnabled ?? true}
              ariaLabel={t('settings.integrations.lastfm.scrobbling.title')}
              disabled={!status}
              onClick={onScrobbleToggle}
            />
          </div>
        </div>
      </div>
    </section>
  );
};
