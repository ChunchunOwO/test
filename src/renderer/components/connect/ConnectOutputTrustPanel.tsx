import { useEffect, useRef } from 'react';
import { AlertTriangle, Check, CheckCircle2, ClipboardCopy, Loader2, MonitorSpeaker, RotateCcw, X, XCircle } from 'lucide-react';
import type { ConnectDevice, ConnectPreflightResult, ConnectSessionStatus } from '../../../shared/types/connect';
import { useI18n } from '../../i18n/I18nProvider';

type OutputTrustPanelProps = {
  status: ConnectSessionStatus;
  device: ConnectDevice | null;
  copied: boolean;
  busy: boolean;
  onCopyDiagnostics: () => void;
  onRetry: () => void;
  onReturnLocal: () => void;
};

const activeExternalStates = new Set<ConnectSessionStatus['state']>(['ready', 'playing', 'paused', 'stopped']);

export const ConnectOutputTrustPanel = ({
  status,
  device,
  copied,
  busy,
  onCopyDiagnostics,
  onRetry,
  onReturnLocal,
}: OutputTrustPanelProps): JSX.Element => {
  const { t } = useI18n();
  const failed = status.state === 'error' || status.state === 'unsupported';
  const connecting = status.state === 'connecting' || status.state === 'discovering';
  const external = activeExternalStates.has(status.state) && Boolean(status.deviceId);
  const title = failed
    ? t('connectPage.trust.failedTitle')
    : connecting
      ? t('connectPage.trust.connectingTitle', { device: device?.name ?? status.deviceId ?? t('connectPage.trust.device') })
      : external
        ? t('connectPage.trust.externalTitle', { device: device?.name ?? status.deviceId ?? t('connectPage.trust.device') })
        : t('connectPage.trust.localTitle');
  const detail = failed
    ? status.error ?? t('connectPage.trust.failedDetail')
    : connecting
      ? t('connectPage.trust.connectingDetail')
      : external
        ? t('connectPage.trust.externalDetail')
        : t('connectPage.trust.localDetail');

  return (
    <section className="connect-output-trust" data-state={failed ? 'error' : connecting ? 'connecting' : external ? 'external' : 'local'} aria-live="polite">
      <span className="connect-output-trust__icon">
        {failed ? <XCircle size={20} /> : connecting ? <Loader2 className="spinning-icon" size={20} /> : external ? <MonitorSpeaker size={20} /> : <CheckCircle2 size={20} />}
      </span>
      <div className="connect-output-trust__copy">
        <small>{t('connectPage.trust.eyebrow')}</small>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      {failed ? (
        <div className="connect-output-trust__actions">
          <button className="settings-action-button" type="button" disabled={busy || !device} onClick={onRetry}>
            <RotateCcw size={15} />
            {t('connectPage.trust.retry')}
          </button>
          <button className="settings-action-button" type="button" disabled={busy} onClick={onReturnLocal}>
            <MonitorSpeaker size={15} />
            {t('connectPage.trust.returnLocal')}
          </button>
          <button className="settings-action-button" type="button" onClick={onCopyDiagnostics}>
            {copied ? <Check size={15} /> : <ClipboardCopy size={15} />}
            {copied ? t('connectPage.trust.copied') : t('connectPage.trust.copyDiagnostics')}
          </button>
        </div>
      ) : null}
    </section>
  );
};

type PreflightDialogProps = {
  result: ConnectPreflightResult | null;
  checking: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const hasIssue = (result: ConnectPreflightResult, code: ConnectPreflightResult['issues'][number]): boolean => result.issues.includes(code);
const hasWarning = (result: ConnectPreflightResult, code: ConnectPreflightResult['warnings'][number]): boolean => result.warnings.includes(code);

export const ConnectPreflightDialog = ({ result, checking, onCancel, onConfirm }: PreflightDialogProps): JSX.Element => {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
    window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      (dialog?.querySelector<HTMLElement>('[data-connect-autofocus="true"]')
        ?? dialog?.querySelector<HTMLElement>(focusableSelector))?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !checking) {
        onCancel();
        return;
      }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector)];
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [checking, onCancel]);

  const deviceBlocked = result ? hasIssue(result, 'device_unavailable') || hasIssue(result, 'airplay_not_ready') || hasIssue(result, 'hqplayer_unavailable') : false;
  const sourceBlocked = result ? hasIssue(result, 'source_missing') || hasIssue(result, 'source_not_found') : false;
  const transcode = result ? hasWarning(result, 'transcode_required') : false;
  const limitedControls = result ? hasWarning(result, 'limited_controls') : false;

  return (
    <div
      className="connect-preflight-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !checking) onCancel();
      }}
    >
      <section ref={dialogRef} className="connect-preflight-dialog" role="dialog" aria-modal="true" aria-labelledby="connect-preflight-title">
        <header>
          <div>
            <small>{t('connectPage.preflight.eyebrow')}</small>
            <h2 id="connect-preflight-title">{t('connectPage.preflight.title')}</h2>
            <p>{result ? t('connectPage.preflight.description', { device: result.deviceName }) : t('connectPage.preflight.checking')}</p>
          </div>
          <button className="icon-button" type="button" aria-label={t('connectPage.preflight.cancel')} disabled={checking} onClick={onCancel}>
            <X size={17} />
          </button>
        </header>

        {checking || !result ? (
          <div className="connect-preflight-loading">
            <Loader2 className="spinning-icon" size={24} />
            <strong>{t('connectPage.preflight.checking')}</strong>
            <span>{t('connectPage.preflight.checkingHint')}</span>
          </div>
        ) : (
          <div className="connect-preflight-checks">
            <div data-state={deviceBlocked ? 'blocked' : 'pass'}>
              {deviceBlocked ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
              <span><strong>{t('connectPage.preflight.device')}</strong><small>{deviceBlocked ? t('connectPage.preflight.deviceBlocked') : t('connectPage.preflight.deviceReady')}</small></span>
            </div>
            <div data-state={sourceBlocked ? 'blocked' : 'pass'}>
              {sourceBlocked ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
              <span><strong>{t('connectPage.preflight.source')}</strong><small>{sourceBlocked ? t('connectPage.preflight.sourceBlocked') : result.source?.title ?? t('connectPage.preflight.sourceReady')}</small></span>
            </div>
            <div data-state={transcode ? 'warning' : 'pass'}>
              {transcode ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
              <span><strong>{t('connectPage.preflight.delivery')}</strong><small>{transcode ? t('connectPage.preflight.transcode') : result.delivery === 'hqplayer' ? t('connectPage.preflight.hqplayer') : t('connectPage.preflight.direct', { format: result.source?.mimeType ?? t('common.na') })}</small></span>
            </div>
            <div data-state={limitedControls ? 'warning' : 'pass'}>
              {limitedControls ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
              <span><strong>{t('connectPage.preflight.controls')}</strong><small>{limitedControls ? t('connectPage.preflight.controlsLimited') : t('connectPage.preflight.controlsReady')}</small></span>
            </div>
          </div>
        )}

        <footer>
          <button className="settings-action-button" type="button" disabled={checking} onClick={onCancel}>{t('connectPage.preflight.cancel')}</button>
          <button className="settings-action-button connect-preflight-confirm" type="button" disabled={checking || !result?.ready} onClick={onConfirm} data-connect-autofocus={result?.ready ? 'true' : undefined}>
            {t(result?.ready ? 'connectPage.preflight.confirm' : 'connectPage.preflight.blocked')}
          </button>
        </footer>
      </section>
    </div>
  );
};
