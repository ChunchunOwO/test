import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ClipboardPaste, Loader2, Play, Plus, Radio, Square, Trash2 } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider';

export type RadioStation = {
  id: string;
  name: string;
  url: string;
  coverUrl?: string;
  videoUrl?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  lastPlayedAt: string | null;
};

type RadioMarqueeTextProps = {
  as?: 'small' | 'span';
  className: string;
  text: string;
  title?: string;
};

const RadioMarqueeText = ({ as = 'span', className, text, title }: RadioMarqueeTextProps): JSX.Element => {
  const outerRef = useRef<HTMLElement | null>(null);
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const [shift, setShift] = useState(0);
  const setOuterRef = useCallback((node: HTMLElement | null): void => {
    outerRef.current = node;
  }, []);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) {
      return undefined;
    }

    const updateShift = (): void => {
      setShift(Math.max(0, inner.scrollWidth - outer.clientWidth));
    };

    updateShift();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateShift);
    resizeObserver?.observe(outer);
    resizeObserver?.observe(inner);
    window.addEventListener('resize', updateShift);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateShift);
    };
  }, [text]);

  const style = shift > 0
    ? ({
        '--connect-radio-marquee-shift': `${shift}px`,
        '--connect-radio-marquee-duration': `${Math.min(14, Math.max(5, shift / 20)).toFixed(1)}s`,
      } as CSSProperties)
    : undefined;
  const content = <span className="connect-radio-marquee__inner" ref={innerRef}>{text}</span>;
  const props = {
    className: `connect-radio-marquee ${className}`,
    'data-marquee': shift > 0 ? 'true' : undefined,
    ref: setOuterRef,
    style,
    title: title ?? text,
  };

  return as === 'small' ? <small {...props}>{content}</small> : <span {...props}>{content}</span>;
};

type ConnectRadioWorkspaceProps = {
  stations: RadioStation[];
  activeStationId: string | null;
  isRadioActive: boolean;
  isBusy: boolean;
  nameDraft: string;
  urlDraft: string;
  formatLastPlayed: (value: string | null) => string;
  onNameDraftChange: (value: string) => void;
  onUrlDraftChange: (value: string) => void;
  onSaveDraft: () => void;
  onPlayDraft: () => void | Promise<void>;
  onPlayClipboard: () => void | Promise<void>;
  onStop: () => void | Promise<void>;
  onPlayStation: (station: RadioStation) => void | Promise<void>;
  onRemoveStation: (stationId: string) => void;
};

export const ConnectRadioWorkspace = ({
  stations,
  activeStationId,
  isRadioActive,
  isBusy,
  nameDraft,
  urlDraft,
  formatLastPlayed,
  onNameDraftChange,
  onUrlDraftChange,
  onSaveDraft,
  onPlayDraft,
  onPlayClipboard,
  onStop,
  onPlayStation,
  onRemoveStation,
}: ConnectRadioWorkspaceProps): JSX.Element => {
  const { t } = useI18n();
  const submitDraft = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void onPlayDraft();
  };

  return (
    <section className="connect-workspace connect-radio-panel" aria-label={t('connectPage.radio.aria')}>
      <div className="connect-radio-layout">
        <section className="connect-radio-library" aria-label={t('connectPage.radio.savedAria')}>
          <header className="connect-radio-library__header">
            <div>
              <span>Library</span>
              <strong>{t('connectPage.radio.savedAria')}</strong>
            </div>
            <span className="connect-radio-library__count" title={t('connectPage.radio.savedAria')}>
              {stations.length}
            </span>
          </header>

          <div className="connect-radio-list">
            {stations.length > 0 ? (
              stations.map((station) => {
                const isActive = activeStationId === station.id && isRadioActive;
                return (
                  <article className="connect-radio-row" data-active={isActive ? 'true' : undefined} key={station.id}>
                    <div className="connect-radio-icon" aria-hidden="true">
                      <Radio size={21} />
                      {isActive ? <span /> : null}
                    </div>
                    <div className="connect-radio-copy">
                      <div className="connect-radio-copy__title">
                        <strong>{station.name}</strong>
                        {isActive ? <span>{t('connectPage.radio.state.playing')}</span> : null}
                      </div>
                      {station.description ? <RadioMarqueeText as="small" className="connect-radio-description" text={station.description} /> : null}
                      <RadioMarqueeText className="connect-radio-url" text={station.url} />
                      <small className="connect-radio-last-played">
                        {station.lastPlayedAt
                          ? t('connectPage.radio.lastPlayed', { time: formatLastPlayed(station.lastPlayedAt) })
                          : t('connectPage.radio.neverPlayed')}
                      </small>
                    </div>
                    <div className="connect-radio-actions">
                      <button
                        className="settings-action-button connect-radio-station-play"
                        type="button"
                        aria-label={t('connectPage.radio.playStation', { name: station.name })}
                        title={t('connectPage.radio.playStation', { name: station.name })}
                        disabled={isBusy}
                        onClick={() => void onPlayStation(station)}
                      >
                        {isBusy && isActive ? <Loader2 className="spinning-icon" size={15} /> : <Play size={15} />}
                        <span>{isActive ? t('connectPage.radio.state.playing') : t('connectPage.controls.play')}</span>
                      </button>
                      <button
                        className="icon-button connect-radio-delete"
                        type="button"
                        aria-label={t('connectPage.radio.deleteStation', { name: station.name })}
                        title={t('connectPage.radio.deleteStation', { name: station.name })}
                        onClick={() => onRemoveStation(station.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="connect-radio-empty">
                <Radio size={25} />
                <strong>{t('connectPage.radio.emptyTitle')}</strong>
                <span>{t('connectPage.radio.emptyDescription')}</span>
              </div>
            )}
          </div>
        </section>

        <aside className="connect-radio-composer">
          <form className="connect-radio-form" aria-label={t('connectPage.radio.formAria')} onSubmit={submitDraft}>
            <header className="connect-radio-form__header">
              <span className="connect-radio-form__icon" aria-hidden="true"><Plus size={18} /></span>
              <div>
                <strong className="connect-radio-form-title">{t('connectPage.radio.emptyTitle')}</strong>
                <small>{t('connectPage.header.descriptionRadio')}</small>
              </div>
            </header>

            <label className="connect-radio-field">
              <span>{t('connectPage.radio.name')}</span>
              <input
                type="text"
                value={nameDraft}
                placeholder={t('connectPage.radio.namePlaceholder')}
                onChange={(event) => onNameDraftChange(event.currentTarget.value)}
              />
            </label>
            <label className="connect-radio-field connect-radio-field--url">
              <span>{t('connectPage.radio.streamUrl')}</span>
              <input
                type="url"
                inputMode="url"
                value={urlDraft}
                placeholder="https://example.com/live.mp3"
                onChange={(event) => onUrlDraftChange(event.currentTarget.value)}
              />
            </label>

            <button className="settings-action-button connect-radio-play" type="submit" disabled={isBusy}>
              {isBusy ? <Loader2 className="spinning-icon" size={16} /> : <Play size={16} />}
              {t('connectPage.controls.play')}
            </button>

            <div className="connect-radio-form-actions">
              <button className="settings-action-button" type="button" onClick={onSaveDraft}>
                <Plus size={15} />
                {t('connectPage.radio.save')}
              </button>
              <button className="settings-action-button" type="button" onClick={() => void onPlayClipboard()} disabled={isBusy}>
                <ClipboardPaste size={15} />
                {t('connectPage.radio.playClipboard')}
              </button>
            </div>

            <button className="connect-radio-stop" type="button" onClick={() => void onStop()} disabled={isBusy || !isRadioActive}>
              <Square size={13} />
              {t('connectPage.controls.stop')}
            </button>
          </form>
        </aside>
      </div>
    </section>
  );
};
