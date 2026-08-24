import { Cable, Cast, ChevronDown, Eye, EyeOff, Loader2, Pause, Pin, Play, Square, Unplug, Volume2 } from 'lucide-react';
import type { ConnectDevice, ConnectHttpDebugEvent, ConnectSessionStatus } from '../../../shared/types/connect';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/locales';
import { ConnectDeviceSearch, type ConnectDeviceFilter } from './ConnectDeviceSearch';
import { ConnectOutputTrustPanel } from './ConnectOutputTrustPanel';
import {
  StreamerGlyph,
  deviceVisual,
  formatDeviceAddress,
  formatDeviceProduct,
  formatDeviceSupport,
  formatProtocol,
} from './connectDeviceDisplay';

type OutputCommand = 'play' | 'pause' | 'stop' | 'disconnect';

type HiddenDeviceEntry = {
  id: string;
  name: string;
};

type ConnectOutputWorkspaceProps = {
  status: ConnectSessionStatus;
  activeDevice: ConnectDevice | null;
  previewTitle: string;
  previewArtist: string;
  previewAlbum: string | null;
  previewCover: string | null;
  progressPercent: number;
  positionLabel: string;
  volumePercent: number;
  copiedDiagnostics: boolean;
  busy: boolean;
  busyDeviceId: string | null;
  isLocalSourceMissing: boolean;
  isCollapsed: boolean;
  deviceCount: number;
  availableDevices: ConnectDevice[];
  visibleDevices: ConnectDevice[];
  hiddenDevices: HiddenDeviceEntry[];
  pinnedDeviceIds: ReadonlySet<string>;
  deviceQuery: string;
  deviceFilter: ConnectDeviceFilter;
  filterCounts: { all: number; ready: number; active: number; attention: number };
  searchEnabled: boolean;
  onVolumeChange: (value: number) => void;
  onVolumeCommit: (value: number) => void;
  onCommand: (command: OutputCommand) => void;
  onConnect: (device: ConnectDevice) => void;
  onToggleCollapsed: () => void;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: ConnectDeviceFilter) => void;
  onHide: (device: ConnectDevice) => void;
  onRestore: (deviceId: string) => void;
  onRestoreAll: () => void;
  onTogglePin: (deviceId: string) => void;
  onCopyDiagnostics: () => void;
  onRetry: () => void;
  onReturnLocal: () => void;
  onChooseSource: () => void;
};

const stateLabel: Record<ConnectSessionStatus['state'], TranslationKey> = {
  idle: 'connectPage.state.idle',
  discovering: 'connectPage.state.discovering',
  connecting: 'connectPage.state.connecting',
  ready: 'common.ready',
  playing: 'connectPage.state.playing',
  paused: 'connectPage.state.paused',
  stopped: 'connectPage.state.stopped',
  error: 'connectPage.state.error',
  unsupported: 'common.unavailable',
};

const deviceStateLabel: Record<ConnectDevice['state'], TranslationKey> = {
  available: 'connectPage.deviceState.available',
  connecting: 'connectPage.state.connecting',
  connected: 'connectPage.deviceState.connected',
  unavailable: 'connectPage.deviceState.unavailable',
  unsupported: 'connectPage.deviceState.unsupported',
};

const formatOutgoingEvent = (event: ConnectHttpDebugEvent): string =>
  [
    new Date(event.at).toLocaleTimeString(),
    event.remoteAddress ?? '-',
    event.method,
    event.kind,
    event.statusCode ?? '-',
    event.bytes != null ? `${event.bytes}B` : '',
    event.range ?? '',
    event.message ?? '',
  ].filter((part) => part !== '').join(' ');

type Translate = ReturnType<typeof useI18n>['t'];

const formatLastSeen = (value: string | null, t: Translate): string => {
  if (!value) {
    return t('connectPage.devices.discoveryPending');
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : t('connectPage.devices.lastSeen', { time: date.toLocaleString() });
};

export const ConnectOutputWorkspace = ({
  status,
  activeDevice,
  previewTitle,
  previewArtist,
  previewAlbum,
  previewCover,
  progressPercent,
  positionLabel,
  volumePercent,
  copiedDiagnostics,
  busy,
  busyDeviceId,
  isLocalSourceMissing,
  isCollapsed,
  deviceCount,
  availableDevices,
  visibleDevices,
  hiddenDevices,
  pinnedDeviceIds,
  deviceQuery,
  deviceFilter,
  filterCounts,
  searchEnabled,
  onVolumeChange,
  onVolumeCommit,
  onCommand,
  onConnect,
  onToggleCollapsed,
  onQueryChange,
  onFilterChange,
  onHide,
  onRestore,
  onRestoreAll,
  onTogglePin,
  onCopyDiagnostics,
  onRetry,
  onReturnLocal,
  onChooseSource,
}: ConnectOutputWorkspaceProps): JSX.Element => {
  const { t } = useI18n();
  const connected = Boolean(status.deviceId);
  const failed = status.state === 'error' || status.state === 'unsupported';
  const capabilities = activeDevice?.capabilities ?? null;
  const outgoingHttpEvents = status.httpEvents ?? [];
  const activeTargetLabel = activeDevice
    ? `${formatProtocol(activeDevice)} · ${activeDevice.name}`
    : status.deviceId
      ? status.deviceId
      : t('connectPage.nowPlaying.noOutput');
  const activeDeviceInfoLabel = activeDevice
    ? `${formatDeviceProduct(activeDevice, t)} · ${formatDeviceAddress(activeDevice, t)}`
    : t('connectPage.nowPlaying.chooseDevice');
  const activeMediaInfoLabel = [
    status.metadata?.coverHttpUrl ? t('connectPage.nowPlaying.coverReady') : t('connectPage.nowPlaying.coverWaiting'),
    status.latencyMs != null ? t('connectPage.nowPlaying.latency', { ms: status.latencyMs }) : null,
    activeDevice?.protocol === 'dlna' ? t('connectPage.nowPlaying.dlnaPolling') : null,
  ].filter(Boolean).join(' · ');
  const streamerCount = availableDevices.filter((device) => device.protocol === 'dlna').length;
  const stageTone = failed ? 'error' : connected ? 'live' : 'local';
  const emptyCopy = availableDevices.length > 0
    ? { title: t('connectPage.devices.searchEmpty'), hint: t('connectPage.devices.searchEmptyHint') }
    : deviceCount > 0
      ? { title: t('connectPage.devices.allHidden'), hint: t('connectPage.devices.restoreHint') }
      : { title: t('connectPage.devices.empty'), hint: t('connectPage.devices.emptyHint') };

  return (
    <section
      className="connect-workspace connect-workspace--output connect-output-workspace"
      data-tone={stageTone}
      data-on={connected ? 'true' : 'false'}
      aria-label={t('connectPage.devices.aria')}
    >
      <section className="connect-output-hero" data-tone={stageTone} data-on={connected ? 'true' : 'false'}>
        <header className="connect-output-hero__head">
          <span className="connect-output-hero__kicker">{t('connectPage.output.guideTitle')}</span>
          <ConnectOutputTrustPanel
            status={status}
            device={activeDevice}
            copied={copiedDiagnostics}
            busy={busy}
            onCopyDiagnostics={onCopyDiagnostics}
            onRetry={onRetry}
            onReturnLocal={onReturnLocal}
          />
        </header>

        <section className="connect-output-hero__stage" aria-label={t('connectPage.nowPlaying.aria')}>
          <div className="connect-output-hero__artwell">
            <div className="connect-output-hero__art" data-empty={!previewCover}>
              {previewCover ? <img alt="" src={previewCover} /> : <Cast size={28} />}
            </div>
          </div>

          <div className="connect-output-hero__copy">
            <span className="connect-output-hero__state">{t(stateLabel[status.state])}</span>
            <h2>{previewTitle}</h2>
            <p>{previewAlbum ? `${previewArtist} / ${previewAlbum}` : previewArtist}</p>
            {connected ? (
              <div className="connect-output-hero__facts" aria-label={t('connectPage.nowPlaying.infoAria')}>
                <small>{activeTargetLabel}</small>
                <small>{activeDeviceInfoLabel}</small>
                <small>{activeMediaInfoLabel || t('connectPage.nowPlaying.infoWaiting')}</small>
              </div>
            ) : (
              <small className="connect-output-hero__note" aria-label={t('connectPage.nowPlaying.infoAria')}>{t('connectPage.output.localHint')}</small>
            )}
            {connected && !failed ? <em className="connect-output-hero__hint">{t('connectPage.output.liveHint')}</em> : null}

            <div className="connect-output-deck">
              <div className="connect-controls connect-output-hero__controls" aria-label={t('connectPage.controls.aria')}>
                <button className="icon-button" type="button" aria-label={t('connectPage.controls.play')} title={t('connectPage.controls.play')} onClick={() => onCommand('play')} disabled={busy || !status.deviceId || capabilities?.canPlay !== true}>
                  <Play size={17} />
                </button>
                <button className="icon-button" type="button" aria-label={t('connectPage.controls.pause')} title={t('connectPage.controls.pause')} onClick={() => onCommand('pause')} disabled={busy || !status.deviceId || capabilities?.canPause !== true}>
                  <Pause size={17} />
                </button>
                <button className="icon-button" type="button" aria-label={t('connectPage.controls.stop')} title={t('connectPage.controls.stop')} onClick={() => onCommand('stop')} disabled={busy || !status.deviceId || capabilities?.canStop !== true}>
                  <Square size={16} />
                </button>
                <button className="icon-button" type="button" aria-label={t('connectPage.controls.disconnect')} title={t('connectPage.controls.disconnect')} onClick={() => onCommand('disconnect')} disabled={busy || !status.deviceId}>
                  <Unplug size={17} />
                </button>
                <label className="connect-volume">
                  <Volume2 size={16} />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volumePercent}
                    onChange={(event) => onVolumeChange(Number(event.currentTarget.value))}
                    onMouseUp={() => onVolumeCommit(volumePercent)}
                    onKeyUp={(event) => {
                      if (event.key === 'Enter') {
                        onVolumeCommit(volumePercent);
                      }
                    }}
                    disabled={capabilities?.canSetVolume !== true}
                    aria-label={t('connectPage.controls.volume')}
                  />
                </label>
              </div>
              <div className="connect-now-transport connect-output-hero__meter">
                <div className="connect-progress" aria-label={t('connectPage.nowPlaying.progressAria')}>
                  <span style={{ width: `${progressPercent}%` }} />
                </div>
                <small>{positionLabel}</small>
              </div>
            </div>
          </div>
        </section>
      </section>

      <section className="connect-device-section connect-output-room" aria-labelledby="connect-device-section-title">
        <div className="connect-section-title connect-output-room__title">
          <div>
            <span>{t('connectPage.devices.kicker')}</span>
            <h2 id="connect-device-section-title">{t('connectPage.devices.title')}</h2>
            <small>
              {t('connectPage.devices.summary', {
                streamers: streamerCount,
                entries: availableDevices.length,
                hidden: hiddenDevices.length,
              })}
            </small>
          </div>
          <div className="connect-section-actions">
            <button
              className="icon-button connect-collapse-button"
              type="button"
              aria-label={isCollapsed ? t('connectPage.devices.expand') : t('connectPage.devices.collapse')}
              title={isCollapsed ? t('connectPage.devices.expand') : t('connectPage.devices.collapse')}
              aria-controls="connect-device-section-content"
              aria-expanded={!isCollapsed}
              onClick={onToggleCollapsed}
            >
              <ChevronDown aria-hidden="true" size={16} />
            </button>
          </div>
        </div>

        {!isCollapsed ? (
          <div id="connect-device-section-content" className="connect-device-section__content connect-output-room__body">
            {isLocalSourceMissing ? (
              <div id="connect-device-source-prerequisite" className="connect-device-prerequisite" role="status">
                <Play aria-hidden="true" size={16} />
                <span>
                  <strong>{t(status.deviceId ? 'connectPage.devices.switchSourceRequired' : 'connectPage.devices.sourceRequired')}</strong>
                  <small>{t(status.deviceId ? 'connectPage.devices.switchSourceRequiredHint' : 'connectPage.devices.sourceRequiredHint')}</small>
                </span>
                <button className="settings-action-button" type="button" onClick={onChooseSource}>
                  {t('connectPage.devices.chooseSource')}
                </button>
              </div>
            ) : null}

            <ConnectDeviceSearch
              clearLabel={t('connectPage.devices.clearSearch')}
              enabled={searchEnabled}
              filterAriaLabel={t('connectPage.devices.filterAria')}
              filters={[
                { id: 'all', label: t('connectPage.devices.filterAll'), count: filterCounts.all },
                { id: 'ready', label: t('connectPage.devices.filterReady'), count: filterCounts.ready },
                { id: 'active', label: t('connectPage.devices.filterActive'), count: filterCounts.active },
                { id: 'attention', label: t('connectPage.devices.filterAttention'), count: filterCounts.attention },
              ]}
              inputLabel={t('connectPage.devices.searchInput')}
              listId="connect-device-list"
              onFilterChange={onFilterChange}
              onQueryChange={onQueryChange}
              placeholder={t('connectPage.devices.searchPlaceholder')}
              query={deviceQuery}
              matchCount={deviceQuery.trim() ? `${visibleDevices.length} / ${availableDevices.length}` : null}
              resultLabel={t('connectPage.devices.searchResults', { visible: visibleDevices.length, total: availableDevices.length })}
              selectedFilter={deviceFilter}
            />

            {hiddenDevices.length > 0 ? (
              <div className="connect-hidden-devices" role="group" aria-label={t('connectPage.devices.hiddenAria')}>
                <div>
                  <EyeOff size={15} />
                  <span>{t('connectPage.devices.hiddenTitle')}</span>
                </div>
                <div className="connect-hidden-device-actions">
                  {hiddenDevices.map((device) => (
                    <button key={device.id} className="settings-action-button" type="button" onClick={() => onRestore(device.id)}>
                      <Eye size={14} />
                      {device.name}
                    </button>
                  ))}
                  <button className="settings-action-button" type="button" onClick={onRestoreAll}>
                    {t('connectPage.devices.restoreAll')}
                  </button>
                </div>
              </div>
            ) : null}

            <div id="connect-device-list" className="connect-device-list connect-output-grid">
              {visibleDevices.length === 0 ? (
                <div className="connect-device-empty">
                  <StreamerGlyph />
                  <strong>{emptyCopy.title}</strong>
                  <span>{emptyCopy.hint}</span>
                </div>
              ) : visibleDevices.map((device) => {
                const isActive = device.id === status.deviceId;
                const isBusy = busyDeviceId === device.id;
                const isPinned = pinnedDeviceIds.has(device.id);
                const connectDisabled = device.state === 'unsupported' || device.state === 'unavailable' || isBusy || isLocalSourceMissing;
                const deviceProduct = formatDeviceProduct(device, t);
                const deviceAddress = formatDeviceAddress(device, t);
                const deviceSupport = formatDeviceSupport(device, t);
                const visual = deviceVisual(device);
                const deviceHeadingId = `connect-device-${device.id.replace(/[^a-zA-Z0-9_-]/gu, '-')}`;
                return (
                  <article
                    className="connect-device-row connect-output-card"
                    aria-current={isActive ? 'true' : undefined}
                    aria-labelledby={deviceHeadingId}
                    data-active={isActive ? 'true' : undefined}
                    data-pinned={isPinned ? 'true' : undefined}
                    key={device.id}
                  >
                    <div className="connect-output-card__top">
                      <div className="connect-device-icon" data-protocol={device.protocol} data-tone={visual.tone}>
                        {visual.icon}
                      </div>
                      <div className="connect-output-card__identity">
                        <h3 id={deviceHeadingId}>{device.name}</h3>
                        <span>{formatProtocol(device)} · {deviceProduct}</span>
                        <small className="connect-device-address">{deviceAddress}</small>
                      </div>
                      <div className="connect-output-card__tools">
                        <button
                          className="icon-button connect-device-pin-button"
                          type="button"
                          aria-label={t(isPinned ? 'connectPage.devices.unpin' : 'connectPage.devices.pin', { name: device.name })}
                          aria-pressed={isPinned}
                          title={t(isPinned ? 'connectPage.devices.unpin' : 'connectPage.devices.pin', { name: device.name })}
                          onClick={() => onTogglePin(device.id)}
                        >
                          <Pin aria-hidden="true" fill={isPinned ? 'currentColor' : 'none'} size={15} />
                        </button>
                        <button
                          className="icon-button connect-device-hide-button"
                          type="button"
                          aria-label={t('connectPage.devices.hide', { name: device.name })}
                          title={t('connectPage.devices.hide', { name: device.name })}
                          disabled={isActive || isBusy}
                          onClick={() => onHide(device)}
                        >
                          <EyeOff aria-hidden="true" size={15} />
                        </button>
                      </div>
                    </div>

                    <details className="connect-device-details">
                      <summary>{t('connectPage.devices.details')}</summary>
                      <div className="connect-device-facts" aria-label={t('connectPage.devices.deviceInfoAria', { name: device.name })}>
                        <small>{deviceSupport}</small>
                        <small>{formatLastSeen(device.lastSeenAt, t)}</small>
                      </div>
                    </details>
                    {device.unsupportedReason ? <small className="connect-output-card__warning">{device.unsupportedReason}</small> : null}

                    <div className="connect-output-card__foot">
                      <div className="connect-device-meta">
                        <span data-state={device.state}>{t(isActive ? stateLabel[status.state] : deviceStateLabel[device.state])}</span>
                        <small>{visual.labelKey ? t(visual.labelKey) : visual.label}</small>
                      </div>
                      <div className="connect-device-actions">
                        <button
                          className="settings-action-button connect-output-card__connect"
                          type="button"
                          aria-describedby={!isActive && isLocalSourceMissing ? 'connect-device-source-prerequisite' : undefined}
                          disabled={isActive ? busy : connectDisabled}
                          onClick={() => isActive ? onCommand('disconnect') : onConnect(device)}
                        >
                          {isActive
                            ? <Unplug size={15} />
                            : isBusy
                              ? <Loader2 className="spinning-icon" size={15} />
                              : device.protocol === 'hqplayer'
                                ? <Cable size={15} />
                                : <Cast size={15} />}
                          {isActive ? t('connectPage.devices.disconnect') : t('connectPage.devices.connect')}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <details
              className="connect-receiver-debug connect-outgoing-debug connect-output-log"
              data-empty={outgoingHttpEvents.length === 0 ? 'true' : undefined}
              aria-label={t('connectPage.outgoing.aria')}
            >
              <summary>
                <span>{t('connectPage.outgoing.title')}</span>
                <small>{outgoingHttpEvents.length > 0 ? t('connectPage.outgoing.recent', { count: outgoingHttpEvents.length }) : t('connectPage.outgoing.empty')}</small>
              </summary>
              <div className="connect-receiver-debug__items">
                {outgoingHttpEvents.length > 0 ? (
                  outgoingHttpEvents.slice(0, 8).map((event) => (
                    <code key={event.id}>{formatOutgoingEvent(event)}</code>
                  ))
                ) : (
                  <small>{t('connectPage.outgoing.note')}</small>
                )}
              </div>
            </details>
          </div>
        ) : null}
      </section>
    </section>
  );
};
