import {
  Blocks,
  BookOpen,
  Cable,
  CheckCircle2,
  Database,
  Download,
  Music2,
  Palette,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Waves,
  Wrench,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkshopTranslate } from './workshopI18n';
import '../styles/workshop-guide.css';

interface WorkshopGuideEntryProps {
  onOpenDiscover: () => void;
}

export const WorkshopGuideEntry = ({ onOpenDiscover }: WorkshopGuideEntryProps): JSX.Element => {
  const t = useWorkshopTranslate();
  const [open, setOpen] = useState(false);
  const launchButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      launchButtonRef.current?.focus();
    };
  }, [close, open]);

  return (
    <>
      <aside className="workshop-guide-entry" aria-label={t('workshop.guide.entryAria')}>
        <div className="workshop-guide-entry__heading">
          <BookOpen size={17} aria-hidden="true" />
          <span>{t('workshop.guide.firstTime')}</span>
        </div>
        <ol className="workshop-guide-entry__steps">
          <li><strong>1</strong><span>{t('workshop.guide.step1')}</span></li>
          <li><strong>2</strong><span>{t('workshop.guide.step2')}</span></li>
          <li><strong>3</strong><span>{t('workshop.guide.step3')}</span></li>
        </ol>
        <button
          ref={launchButtonRef}
          className="workshop-guide-entry__open"
          type="button"
          onClick={() => setOpen(true)}
        >
          {t('workshop.guide.open')}
        </button>
      </aside>

      {open ? (
        <div
          className="workshop-guide-dialog__backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              close();
            }
          }}
        >
          <section
            className="workshop-guide-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="workshop-guide-title"
            aria-describedby="workshop-guide-summary"
          >
            <header className="workshop-guide-dialog__header">
              <div>
                <span className="workshop-guide-dialog__eyebrow"><Sparkles size={13} aria-hidden="true" /> {t('workshop.guide.eyebrow')}</span>
                <h2 id="workshop-guide-title">{t('workshop.guide.title')}</h2>
                <p id="workshop-guide-summary">{t('workshop.guide.summary')}</p>
              </div>
              <button ref={closeButtonRef} className="workshop-guide-dialog__close" type="button" aria-label={t('workshop.guide.close')} onClick={close}>
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            <div className="workshop-guide-dialog__body">
              <section className="workshop-guide-dialog__section">
                <h3>{t('workshop.guide.startTitle')}</h3>
                <ol className="workshop-guide-dialog__flow">
                  <li><Search size={18} aria-hidden="true" /><div><strong>{t('workshop.guide.flow.discover.title')}</strong><span>{t('workshop.guide.flow.discover.copy')}</span></div></li>
                  <li><Download size={18} aria-hidden="true" /><div><strong>{t('workshop.guide.flow.subscribe.title')}</strong><span>{t('workshop.guide.flow.subscribe.copy')}</span></div></li>
                  <li><ShieldCheck size={18} aria-hidden="true" /><div><strong>{t('workshop.guide.flow.use.title')}</strong><span>{t('workshop.guide.flow.use.copy')}</span></div></li>
                  <li><CheckCircle2 size={18} aria-hidden="true" /><div><strong>{t('workshop.guide.flow.confirm.title')}</strong><span>{t('workshop.guide.flow.confirm.copy')}</span></div></li>
                </ol>
              </section>

              <section className="workshop-guide-dialog__section">
                <h3>{t('workshop.guide.whereTitle')}</h3>
                <div className="workshop-guide-dialog__kinds">
                  <article><Palette size={18} aria-hidden="true" /><div><strong>{t('workshop.guide.kind.theme.title')}</strong><span>{t('workshop.guide.kind.theme.copy')}</span></div></article>
                  <article><Music2 size={18} aria-hidden="true" /><div><strong>{t('workshop.guide.kind.lyrics.title')}</strong><span>{t('workshop.guide.kind.lyrics.copy')}</span></div></article>
                  <article><Waves size={18} aria-hidden="true" /><div><strong>{t('workshop.guide.kind.visual.title')}</strong><span>{t('workshop.guide.kind.visual.copy')}</span></div></article>
                  <article><SlidersHorizontal size={18} aria-hidden="true" /><div><strong>{t('workshop.guide.kind.dsp.title')}</strong><span>{t('workshop.guide.kind.dsp.copy')}</span></div></article>
                  <article><Cable size={18} aria-hidden="true" /><div><strong>{t('workshop.guide.kind.vst.title')}</strong><span>{t('workshop.guide.kind.vst.copy')}</span></div></article>
                  <article><Blocks size={18} aria-hidden="true" /><div><strong>{t('workshop.guide.kind.plugin.title')}</strong><span>{t('workshop.guide.kind.plugin.copy')}</span></div></article>
                </div>
              </section>

              <section className="workshop-guide-dialog__section">
                <h3>{t('workshop.guide.pluginTitle')}</h3>
                <div className="workshop-guide-dialog__checklist">
                  <div><ShieldCheck size={17} aria-hidden="true" /><span><strong>{t('workshop.guide.plugin.permissions')}</strong>{t('workshop.guide.plugin.permissionsCopy')}</span></div>
                  <div><Blocks size={17} aria-hidden="true" /><span><strong>{t('workshop.guide.plugin.commands')}</strong>{t('workshop.guide.plugin.commandsCopy')}</span></div>
                  <div><Database size={17} aria-hidden="true" /><span><strong>{t('workshop.guide.plugin.lyrics')}</strong>{t('workshop.guide.plugin.lyricsCopy')}</span></div>
                  <div><Music2 size={17} aria-hidden="true" /><span><strong>{t('workshop.guide.plugin.sources')}</strong>{t('workshop.guide.plugin.sourcesCopy')}</span></div>
                  <div><SlidersHorizontal size={17} aria-hidden="true" /><span><strong>{t('workshop.guide.plugin.settings')}</strong>{t('workshop.guide.plugin.settingsCopy')}</span></div>
                  <div><Download size={17} aria-hidden="true" /><span><strong>{t('workshop.guide.plugin.listenTogether')}</strong>{t('workshop.guide.plugin.listenTogetherCopy')}</span></div>
                </div>
              </section>

              <div className="workshop-guide-dialog__columns">
                <section className="workshop-guide-dialog__section">
                  <h3>{t('workshop.guide.statesTitle')}</h3>
                  <dl className="workshop-guide-dialog__states">
                    <div><dt>{t('workshop.guide.state.waitDownload.dt')}</dt><dd>{t('workshop.guide.state.waitDownload.dd')}</dd></div>
                    <div><dt>{t('workshop.guide.state.downloading.dt')}</dt><dd>{t('workshop.guide.state.downloading.dd')}</dd></div>
                    <div><dt>{t('workshop.guide.state.waitImport.dt')}</dt><dd>{t('workshop.guide.state.waitImport.dd')}</dd></div>
                    <div><dt>{t('workshop.guide.state.verified.dt')}</dt><dd>{t('workshop.guide.state.verified.dd')}</dd></div>
                    <div><dt>{t('workshop.guide.state.disabled.dt')}</dt><dd>{t('workshop.guide.state.disabled.dd')}</dd></div>
                    <div><dt>{t('workshop.guide.state.enabled.dt')}</dt><dd>{t('workshop.guide.state.enabled.dd')}</dd></div>
                    <div><dt>{t('workshop.guide.state.quarantined.dt')}</dt><dd>{t('workshop.guide.state.quarantined.dd')}</dd></div>
                    <div><dt>{t('workshop.guide.state.attention.dt')}</dt><dd>{t('workshop.guide.state.attention.dd')}</dd></div>
                  </dl>
                </section>
                <section className="workshop-guide-dialog__section">
                  <h3>{t('workshop.guide.buttonsTitle')}</h3>
                  <dl className="workshop-guide-dialog__states">
                    <div><dt>{t('workshop.guide.button.use.dt')}</dt><dd>{t('workshop.guide.button.use.dd')}</dd></div>
                    <div><dt>{t('workshop.guide.button.sync.dt')}</dt><dd>{t('workshop.guide.button.sync.dd')}</dd></div>
                    <div><dt>{t('workshop.guide.button.apply.dt')}</dt><dd>{t('workshop.guide.button.apply.dd')}</dd></div>
                    <div><dt>{t('workshop.guide.button.disable.dt')}</dt><dd>{t('workshop.guide.button.disable.dd')}</dd></div>
                    <div><dt>{t('workshop.guide.button.reverify.dt')}</dt><dd>{t('workshop.guide.button.reverify.dd')}</dd></div>
                  </dl>
                </section>
              </div>

              <section className="workshop-guide-dialog__section">
                <h3>{t('workshop.guide.updateTitle')}</h3>
                <div className="workshop-guide-dialog__checklist">
                  <div><RefreshCw size={17} aria-hidden="true" /><span><strong>{t('workshop.guide.update.update')}</strong>{t('workshop.guide.update.updateCopy')}</span></div>
                  <div><CheckCircle2 size={17} aria-hidden="true" /><span><strong>{t('workshop.guide.update.pause')}</strong>{t('workshop.guide.update.pauseCopy')}</span></div>
                  <div><Download size={17} aria-hidden="true" /><span><strong>{t('workshop.guide.update.remove')}</strong>{t('workshop.guide.update.removeCopy')}</span></div>
                  <div><Palette size={17} aria-hidden="true" /><span><strong>{t('workshop.guide.update.restore')}</strong>{t('workshop.guide.update.restoreCopy')}</span></div>
                </div>
              </section>

              <aside className="workshop-guide-dialog__safety">
                <Wrench size={18} aria-hidden="true" />
                <div><strong>{t('workshop.guide.safetyTitle')}</strong><span>{t('workshop.guide.safetyCopy')}</span></div>
              </aside>
            </div>

            <footer className="workshop-guide-dialog__footer">
              <button className="workshop-button" type="button" onClick={close}>{t('workshop.guide.gotIt')}</button>
              <button
                className="workshop-button workshop-button--primary"
                type="button"
                onClick={() => {
                  onOpenDiscover();
                  close();
                }}
              >
                {t('workshop.guide.goDiscover')}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
};
