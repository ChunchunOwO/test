import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Check, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { isImeComposingKeyEvent } from '../../../utils/imeInput';
import type { TranslationKey } from '../../../i18n/locales';
import type { DangerConfirmRequest } from './dangerConfirm';

type Translate = (
  key: TranslationKey,
  options?: Record<string, string | number>,
) => string;

type DangerConfirmDialogProps = {
  request: DangerConfirmRequest;
  t: Translate;
  onCancel: () => void;
};

const closeAnimationMs = 180;

export const DangerConfirmDialog = ({
  onCancel,
  request,
  t,
}: DangerConfirmDialogProps): JSX.Element => {
  const titleId = useId();
  const inputId = 'settings-danger-confirm-word';
  const [typedWord, setTypedWord] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const requiredWord = request.word?.trim() ?? '';
  const hasTypedWord = typedWord.trim().length > 0;
  const canConfirm = requiredWord.length === 0 || typedWord.trim() === requiredWord;
  const matchState = requiredWord.length === 0
    ? 'ready'
    : canConfirm
      ? 'match'
      : hasTypedWord
        ? 'mismatch'
        : 'idle';

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => setIsVisible(true));
    return () => {
      window.cancelAnimationFrame(frameId);
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (requiredWord) {
        inputRef.current?.focus();
        return;
      }
      confirmRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [requiredWord]);

  const closeWithAnimation = useCallback((afterClose: () => void): void => {
    setIsVisible(false);
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(afterClose, closeAnimationMs);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeWithAnimation(onCancel);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeWithAnimation, onCancel]);

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (!isImeComposingKeyEvent(event) && event.key === 'Enter' && canConfirm) {
      closeWithAnimation(request.onConfirm);
    }
  };

  return (
    <div
      className="settings-modal-backdrop danger-confirm-backdrop"
      data-state={isVisible ? 'open' : 'closing'}
      role="presentation"
      onMouseDown={() => closeWithAnimation(onCancel)}
    >
      <section
        className="danger-confirm-dialog"
        data-state={isVisible ? 'open' : 'closing'}
        data-tone={request.tone}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="danger-confirm-dialog__header">
          <span className="danger-confirm-dialog__icon" aria-hidden="true">
            <ShieldAlert size={18} />
          </span>
          <div>
            <h3 id={titleId}>{request.title}</h3>
            <p>{request.message}</p>
          </div>
          <button
            className="settings-icon-button"
            type="button"
            onClick={() => closeWithAnimation(onCancel)}
            aria-label={t('settings.danger.confirm.cancel')}
          >
            <X size={15} />
          </button>
        </header>
        <p className="danger-confirm-dialog__keep">
          <ShieldCheck size={15} aria-hidden="true" />
          <span>{request.keep}</span>
        </p>
        {requiredWord ? (
          <label
            className="settings-danger-confirm-field danger-confirm-dialog__field"
            data-match={matchState}
            htmlFor={inputId}
          >
            <span>{t('settings.danger.confirm.wordLabel', { word: requiredWord })}</span>
            <span className="danger-confirm-dialog__input-wrap">
              <input
                id={inputId}
                ref={inputRef}
                type="text"
                value={typedWord}
                placeholder={requiredWord}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setTypedWord(event.target.value)}
                onKeyDown={handleInputKeyDown}
              />
              {matchState === 'match' ? (
                <em className="danger-confirm-dialog__match" aria-hidden="true">
                  <Check size={14} />
                </em>
              ) : null}
            </span>
          </label>
        ) : null}
        <div className="danger-confirm-dialog__actions">
          <button
            className="settings-action-button"
            type="button"
            onClick={() => closeWithAnimation(onCancel)}
          >
            {t('settings.danger.confirm.cancel')}
          </button>
          <button
            ref={confirmRef}
            className="settings-danger-button"
            type="button"
            data-ready={canConfirm ? 'true' : 'false'}
            disabled={!canConfirm}
            onClick={() => closeWithAnimation(request.onConfirm)}
          >
            {t('settings.danger.confirm.run')}
          </button>
        </div>
      </section>
    </div>
  );
};
