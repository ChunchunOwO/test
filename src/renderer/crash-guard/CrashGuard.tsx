import React from 'react';
import { translateCurrentLocale } from '../i18n/I18nProvider';
import type { TranslationKey } from '../i18n/locales';
import { crashGuardCss } from './crashGuard.css';
import {
  createCrashGuardStickerPlacements,
  crashGuardStickerArtStyle,
  crashGuardStickerStyle,
} from '../../shared/crash-guard/crashGuardStickerLayout';
import {
  buildCrashClipboardText,
  crashGuardFeedbackUrl,
  crashGuardWindowKey,
  displayCrashOutputPath,
} from './crashGuardHelpers';

const crashT = (key: TranslationKey, options?: Record<string, string | number>): string =>
  translateCurrentLocale(key, options);

const crashGuardCharacterUrl = new URL('../assets/yokko-result-standing-trimmed.png', import.meta.url).href;
const crashGuardBackdropUrl = new URL('../assets/crash-guard-medical-station-background.png', import.meta.url).href;
const crashGuardDecorationUrl = new URL('../assets/crash-guard-medical-stickers.png', import.meta.url).href;

type CrashGuardProps = {
  children: React.ReactNode;
  label: string;
};

type CrashGuardTone = 'idle' | 'busy' | 'ok' | 'warn';
type CrashGuardPending = null | 'restart' | 'quit';

type CrashGuardState = {
  error: Error | null;
  actionMessage: string;
  actionTone: CrashGuardTone;
  busy: boolean;
  pendingAction: CrashGuardPending;
};

type CrashIconName = 'export' | 'report' | 'copy' | 'reload' | 'feedback' | 'restart' | 'quit';

const CrashGuardSealMark = (): JSX.Element => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d="M10 3.5h4v6.5H20.5v4H14V20.5h-4V14H3.5v-4H10V3.5Z" />
  </svg>
);

const CrashGuardIcon = ({ name }: { name: CrashIconName }): JSX.Element => {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'square' as const,
    strokeLinejoin: 'miter' as const,
    'aria-hidden': true as const,
  };

  if (name === 'export') {
    return (
      <svg {...common}>
        <path d="M12 3v12" />
        <path d="M8 11l4 4 4-4" />
        <path d="M5 21h14" />
      </svg>
    );
  }
  if (name === 'report') {
    return (
      <svg {...common}>
        <path d="M7 3h8l5 5v13H7z" />
        <path d="M15 3v5h5" />
        <path d="M10 13h6M10 17h6" />
      </svg>
    );
  }
  if (name === 'copy') {
    return (
      <svg {...common}>
        <path d="M8 8h11v13H8z" />
        <path d="M5 16V3h11" />
      </svg>
    );
  }
  if (name === 'reload') {
    return (
      <svg {...common}>
        <path d="M20 12a8 8 0 1 1-2.2-5.5" />
        <path d="M20 4v6h-6" />
      </svg>
    );
  }
  if (name === 'feedback') {
    return (
      <svg {...common}>
        <path d="M5 6h14v10H8l-3 3z" />
      </svg>
    );
  }
  if (name === 'restart') {
    return (
      <svg {...common}>
        <path d="M9 7H5v4" />
        <path d="M5 11a8 8 0 1 0 2-5.5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3v9" />
      <path d="M7 7.5a7 7 0 1 0 10 0" />
    </svg>
  );
};

type CrashGuardActionButtonProps = {
  disabled?: boolean;
  icon: CrashIconName;
  label: string;
  onClick: () => void;
  pending?: boolean;
  title: string;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
};

const CrashGuardActionButton = ({
  disabled = false,
  icon,
  label,
  onClick,
  pending = false,
  title,
  variant = 'secondary',
}: CrashGuardActionButtonProps): JSX.Element => (
  <button
    type="button"
    className="echo-crash-guard-action"
    onClick={onClick}
    disabled={disabled}
    title={title}
    data-variant={variant}
    data-pending={pending ? 'true' : undefined}
  >
    <CrashGuardIcon name={icon} />
    <span>{label}</span>
  </button>
);

export class CrashGuard extends React.Component<CrashGuardProps, CrashGuardState> {
  state: CrashGuardState = {
    error: null,
    actionMessage: '',
    actionTone: 'idle',
    busy: false,
    pendingAction: null,
  };

  private pendingTimer: number | null = null;
  private readonly stickerPlacements = createCrashGuardStickerPlacements();

  static getDerivedStateFromError(error: Error): Pick<CrashGuardState, 'error' | 'actionMessage' | 'actionTone' | 'busy' | 'pendingAction'> {
    return {
      error,
      actionMessage: '',
      actionTone: 'idle',
      busy: false,
      pendingAction: null,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const reportRendererError = window.echo?.diagnostics?.reportRendererError;
    if (typeof reportRendererError !== 'function') {
      return;
    }

    void reportRendererError({
      message: `React render crashed in ${this.props.label}: ${error.message}`,
      stack: `${error.stack ?? ''}\n\nComponent stack:\n${info.componentStack}`.trim(),
      source: 'error',
      timestamp: new Date().toISOString(),
    }).catch(() => undefined);
  }

  componentDidUpdate(_previousProps: CrashGuardProps, previousState: CrashGuardState): void {
    if (!previousState.error && this.state.error) {
      window.addEventListener('keydown', this.handleKeyDown);
    }
  }

  componentWillUnmount(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    if (this.pendingTimer !== null) {
      window.clearTimeout(this.pendingTimer);
    }
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.state.error || this.state.busy || event.altKey || event.metaKey || event.ctrlKey) {
      return;
    }

    const target = event.target;
    if (target instanceof HTMLElement && target.closest('pre, textarea, input, summary')) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'e') {
      event.preventDefault();
      this.exportDiagnostics();
    } else if (key === 'r') {
      event.preventDefault();
      this.openCrashReport();
    } else if (key === 'c') {
      event.preventDefault();
      void this.copySummary();
    } else if (key === 'l') {
      event.preventDefault();
      this.reloadRenderer();
    }
  };

  private setStatus = (message: string, tone: CrashGuardTone): void => {
    this.setState({ actionMessage: message, actionTone: tone });
  };

  private clearPendingAction = (): void => {
    if (this.pendingTimer !== null) {
      window.clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.setState({ pendingAction: null });
  };

  private armPendingAction = (action: Exclude<CrashGuardPending, null>): void => {
    this.clearPendingAction();
    this.setState({ pendingAction: action });
    this.pendingTimer = window.setTimeout(() => {
      this.setState({ pendingAction: null });
      this.pendingTimer = null;
    }, 4000);
  };

  private runDiagnosticAction = (busyMessage: string, action: () => Promise<string>): void => {
    if (this.state.busy) {
      return;
    }

    this.setState({ busy: true, actionTone: 'busy', actionMessage: busyMessage });
    void action()
      .then((message) => {
        const cancelled = crashT('crashGuard.action.exportCancelled');
        this.setStatus(message, message === cancelled ? 'idle' : 'ok');
      })
      .catch((error) => {
        this.setStatus(error instanceof Error ? error.message : String(error), 'warn');
      })
      .finally(() => {
        this.setState({ busy: false });
      });
  };

  private exportDiagnostics = (): void => {
    this.runDiagnosticAction(crashT('crashGuard.action.exporting'), async () => {
      const outputPath = await window.echo?.diagnostics.exportDiagnosticsZip();
      return outputPath
        ? crashT('crashGuard.action.exported', { path: displayCrashOutputPath(outputPath) })
        : crashT('crashGuard.action.exportCancelled');
    });
  };

  private openCrashReport = (): void => {
    this.runDiagnosticAction(crashT('crashGuard.action.openingReport'), async () => {
      const outputPath = await window.echo?.diagnostics.openCrashReport();
      return outputPath
        ? crashT('crashGuard.action.openedReport', { path: displayCrashOutputPath(outputPath) })
        : crashT('crashGuard.action.reportMissing');
    });
  };

  private copySummary = async (): Promise<void> => {
    if (!this.state.error) {
      return;
    }

    const text = buildCrashClipboardText(this.state.error);
    try {
      await navigator.clipboard.writeText(text);
      this.setStatus(crashT('crashGuard.action.copied'), 'ok');
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : crashT('crashGuard.action.copyFailed'), 'warn');
    }
  };

  private openFeedback = (): void => {
    const openExternalUrl = window.echo?.app?.openExternalUrl;
    if (openExternalUrl) {
      void openExternalUrl(crashGuardFeedbackUrl).catch((error) => {
        this.setStatus(error instanceof Error ? error.message : String(error), 'warn');
      });
      return;
    }

    window.open(crashGuardFeedbackUrl, '_blank', 'noopener,noreferrer');
  };

  private restartApp = (): void => {
    if (this.state.pendingAction !== 'restart') {
      this.armPendingAction('restart');
      this.setStatus(crashT('crashGuard.action.confirmRestart'), 'warn');
      return;
    }

    this.clearPendingAction();
    this.setStatus(crashT('crashGuard.action.restartRequested'), 'busy');
    void window.echo?.diagnostics.relaunchApp().catch((error) => {
      this.setStatus(error instanceof Error ? error.message : String(error), 'warn');
    });
  };

  private quitApp = (): void => {
    if (this.state.pendingAction !== 'quit') {
      this.armPendingAction('quit');
      this.setStatus(crashT('crashGuard.action.confirmQuit'), 'warn');
      return;
    }

    this.clearPendingAction();
    this.setStatus(crashT('crashGuard.action.quitting'), 'busy');
    void window.echo?.app.quit().catch((error) => {
      this.setStatus(error instanceof Error ? error.message : String(error), 'warn');
    });
  };

  private reloadRenderer = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    const diagnosticsAvailable = Boolean(window.echo?.diagnostics);
    const appControlsAvailable = Boolean(window.echo?.app);
    const bridgeOnline = diagnosticsAvailable;
    const statusMessage = this.state.actionMessage
      || (diagnosticsAvailable
        ? crashT('crashGuard.status.defaultOnline')
        : crashT('crashGuard.status.defaultOffline'));
    const steps = [
      {
        title: crashT('crashGuard.step.export.title'),
        description: crashT('crashGuard.step.export.description'),
      },
      {
        title: crashT('crashGuard.step.report.title'),
        description: crashT('crashGuard.step.report.description'),
      },
      {
        title: crashT('crashGuard.step.reload.title'),
        description: crashT('crashGuard.step.reload.description'),
      },
    ];

    return (
      <main className="echo-crash-guard">
        <style>{crashGuardCss}</style>
        <section
          className="echo-crash-guard-stage"
          style={{ backgroundImage: `url(${crashGuardBackdropUrl})` }}
          aria-labelledby="echo-crash-guard-title"
        >
          <article className="echo-crash-guard-chart">
            <span className="echo-crash-guard-chart-clip" aria-hidden="true" />
            <span className="echo-crash-guard-chart-holes" aria-hidden="true" />
            <header className="echo-crash-guard-header">
              <div className="echo-crash-guard-brand">
                <span className="echo-crash-guard-seal" aria-hidden="true">
                  <CrashGuardSealMark />
                </span>
                <div>
                  <p className="echo-crash-guard-eyebrow">ECHO</p>
                  <strong>{crashT('crashGuard.brandTitle')}</strong>
                </div>
              </div>
              <div className="echo-crash-guard-chips">
                <span className="echo-crash-guard-chip" data-online={bridgeOnline ? 'true' : 'false'}>
                  <span className="echo-crash-guard-chip-dot" aria-hidden="true" />
                  {bridgeOnline ? crashT('crashGuard.bridge.online') : crashT('crashGuard.bridge.offline')}
                </span>
              </div>
            </header>
            <p className="echo-crash-guard-kicker">{crashT('crashGuard.sectionLabel')}</p>
            <h1 id="echo-crash-guard-title" className="echo-crash-guard-title">
              {crashT('crashGuard.title')}
            </h1>
            <p className="echo-crash-guard-lead">{crashT('crashGuard.lead')}</p>
            <dl className="echo-crash-guard-facts">
              <div className="echo-crash-guard-fact">
                <dt>{crashT('crashGuard.meta.window')}</dt>
                <dd>{crashT(crashGuardWindowKey(this.props.label))}</dd>
              </div>
              <div className="echo-crash-guard-fact">
                <dt>{crashT('crashGuard.meta.type')}</dt>
                <dd>{crashT('crashGuard.meta.renderError')}</dd>
              </div>
              <div className="echo-crash-guard-fact">
                <dt>{crashT('crashGuard.meta.diagnostics')}</dt>
                <dd>{bridgeOnline ? crashT('crashGuard.bridge.hintOnline') : crashT('crashGuard.bridge.hintOffline')}</dd>
              </div>
            </dl>
            <ol className="echo-crash-guard-steps">
              {steps.map((step, index) => (
                <li key={step.title} className="echo-crash-guard-step" data-step={index + 1}>
                  <span className="echo-crash-guard-step-index">{index + 1}</span>
                  <strong>{step.title}</strong>
                  <span className="echo-crash-guard-step-body">{step.description}</span>
                </li>
              ))}
            </ol>
            <div className="echo-crash-guard-groups">
              <div className="echo-crash-guard-group">
                <span className="echo-crash-guard-group-label">{crashT('crashGuard.group.preserve')}</span>
                <div className="echo-crash-guard-actions">
                  <CrashGuardActionButton
                    icon="export"
                    label={crashT('crashGuard.action.export')}
                    onClick={this.exportDiagnostics}
                    disabled={!diagnosticsAvailable || this.state.busy}
                    title={crashT('crashGuard.action.exportTitle')}
                    variant="primary"
                  />
                  <CrashGuardActionButton
                    icon="report"
                    label={crashT('crashGuard.action.openReport')}
                    onClick={this.openCrashReport}
                    disabled={!diagnosticsAvailable || this.state.busy}
                    title={crashT('crashGuard.action.openReportTitle')}
                  />
                  <CrashGuardActionButton
                    icon="copy"
                    label={crashT('crashGuard.action.copy')}
                    onClick={() => {
                      void this.copySummary();
                    }}
                    title={crashT('crashGuard.action.copyTitle')}
                  />
                </div>
              </div>
              <div className="echo-crash-guard-group">
                <span className="echo-crash-guard-group-label">{crashT('crashGuard.group.recover')}</span>
                <div className="echo-crash-guard-actions">
                  <CrashGuardActionButton
                    icon="reload"
                    label={crashT('crashGuard.action.reload')}
                    onClick={this.reloadRenderer}
                    title={crashT('crashGuard.action.reloadTitle')}
                  />
                  <CrashGuardActionButton
                    icon="feedback"
                    label={crashT('crashGuard.action.feedback')}
                    onClick={this.openFeedback}
                    title={crashT('crashGuard.action.feedbackTitle')}
                  />
                  <CrashGuardActionButton
                    icon="restart"
                    label={this.state.pendingAction === 'restart'
                      ? crashT('crashGuard.action.confirmRestart')
                      : crashT('crashGuard.action.restart')}
                    onClick={this.restartApp}
                    disabled={!diagnosticsAvailable}
                    title={crashT('crashGuard.action.restartTitle')}
                    variant="quiet"
                    pending={this.state.pendingAction === 'restart'}
                  />
                  <CrashGuardActionButton
                    icon="quit"
                    label={this.state.pendingAction === 'quit'
                      ? crashT('crashGuard.action.confirmQuit')
                      : crashT('crashGuard.action.quit')}
                    onClick={this.quitApp}
                    disabled={!appControlsAvailable}
                    title={crashT('crashGuard.action.quitTitle')}
                    variant="danger"
                    pending={this.state.pendingAction === 'quit'}
                  />
                </div>
              </div>
            </div>
            <p className="echo-crash-guard-status" data-tone={this.state.actionTone} aria-live="polite">
              <span className="echo-crash-guard-status-dot" aria-hidden="true" />
              {statusMessage}
            </p>
            <p className="echo-crash-guard-keys" aria-label={crashT('crashGuard.shortcut.hint')}>
              <span><kbd>E</kbd>{crashT('crashGuard.key.export')}</span>
              <span><kbd>R</kbd>{crashT('crashGuard.key.report')}</span>
              <span><kbd>C</kbd>{crashT('crashGuard.key.copy')}</span>
              <span><kbd>L</kbd>{crashT('crashGuard.key.reload')}</span>
            </p>
            <p className="echo-crash-guard-hint">{crashT('crashGuard.key.confirmNote')}</p>
            <details className="echo-crash-guard-details">
              <summary>{crashT('crashGuard.summary')}</summary>
              <pre>{this.state.error.message}</pre>
              <pre>{this.state.error.stack ?? 'No stack available.'}</pre>
            </details>
          </article>
          <aside
            className="echo-crash-guard-rail"
            aria-hidden="true"
            style={{ '--cg-sticker-sprite': `url("${crashGuardDecorationUrl}")` } as React.CSSProperties}
          >
            <span className="echo-crash-guard-floor" />
            {this.stickerPlacements.map((placement) => (
              <span
                key={placement.id}
                className="echo-crash-guard-sticker"
                data-sticker={placement.id}
                data-slot={placement.slotIndex}
                style={crashGuardStickerStyle(placement)}
              >
                <span
                  className="echo-crash-guard-sticker-art"
                  data-motion={placement.motion}
                  style={crashGuardStickerArtStyle(placement)}
                />
              </span>
            ))}
            <div className="echo-crash-guard-rail-monitor">
              <div className="echo-crash-guard-rail-monitor-header">
                <span>ECHO WATCH</span>
                <strong>{crashT('crashGuard.meta.renderError')}</strong>
              </div>
              <span className="echo-crash-guard-rail-signal">
                <i /><i /><i /><i /><i /><i /><i /><i />
              </span>
              <div className="echo-crash-guard-rail-monitor-facts">
                <span>
                  <small>{crashT('crashGuard.meta.window')}</small>
                  <strong>{crashT(crashGuardWindowKey(this.props.label))}</strong>
                </span>
                <span>
                  <small>{crashT('crashGuard.meta.diagnostics')}</small>
                  <strong>
                    {bridgeOnline ? crashT('crashGuard.bridge.online') : crashT('crashGuard.bridge.offline')}
                  </strong>
                </span>
              </div>
            </div>
            <div className="echo-crash-guard-rail-board">
              <div className="echo-crash-guard-rail-board-header">
                <small>ECHO CARE</small>
                <strong>
                  {bridgeOnline ? crashT('crashGuard.bridge.online') : crashT('crashGuard.bridge.offline')}
                </strong>
              </div>
              <ol className="echo-crash-guard-rail-board-list">
                {steps.map((step, index) => (
                  <li key={step.title} className="echo-crash-guard-rail-board-item">
                    <span className="echo-crash-guard-rail-board-index">0{index + 1}</span>
                    <strong>{step.title}</strong>
                  </li>
                ))}
              </ol>
            </div>
            <div className="echo-crash-guard-rail-ticket">
              <span className="echo-crash-guard-rail-ticket-mark">UI</span>
              <span>
                <small>{crashT('crashGuard.meta.type')}</small>
                <strong>{crashT('crashGuard.meta.renderError')}</strong>
                <span>{crashT('crashGuard.step.export.description')}</span>
              </span>
            </div>
            <img
              className="echo-crash-guard-character"
              src={crashGuardCharacterUrl}
              alt=""
              decoding="async"
              fetchPriority="high"
            />
            <span className="echo-crash-guard-rail-message">
              <small>{crashT('crashGuard.rail.kicker')}</small>
              <strong>{crashT('crashGuard.rail.title')}</strong>
            </span>
          </aside>
        </section>
      </main>
    );
  }
}

export const CrashGuardPreviewFailure = (): never => {
  throw new Error('Crash Guard visual preview');
};
