import { RotateCcw, Trash2, Zap } from 'lucide-react';
import type { TranslationKey } from '../../../i18n/locales';
import { StatusText, ToggleButton } from '../components/SettingsPrimitives';
import { DangerActionCard } from './DangerActionCard';

type Translate = (
  key: TranslationKey,
  options?: Record<string, string | number>,
) => string;

type DangerMaintenanceSettingsProps = {
  busy: boolean;
  hardwareAccelerationDisabled: boolean;
  message: string | null;
  onClearLibraryCache: () => void;
  onHardwareAccelerationToggle: () => void;
  onResetDefaultSettings: () => void;
  t: Translate;
};

export const DangerMaintenanceSettings = ({
  busy,
  hardwareAccelerationDisabled,
  message,
  onClearLibraryCache,
  onHardwareAccelerationToggle,
  onResetDefaultSettings,
  t,
}: DangerMaintenanceSettingsProps): JSX.Element => {
  const processingLabel = t('settings.danger.action.processing');

  return (
    <div className="danger-action-list">
      <DangerActionCard
        icon={Trash2}
        title={t('settings.danger.clearCache.title')}
        description={t('settings.danger.clearCache.description')}
        tone="caution"
        action={(
          <button
            className="settings-danger-button"
            type="button"
            disabled={busy}
            onClick={onClearLibraryCache}
          >
            {busy ? processingLabel : t('settings.danger.clearCache.action')}
          </button>
        )}
      />
      <DangerActionCard
        icon={Zap}
        title={t('settings.danger.hardwareAcceleration.title')}
        description={t('settings.danger.hardwareAcceleration.description')}
        tone={hardwareAccelerationDisabled ? 'caution' : 'neutral'}
        action={(
          <div className="danger-action-card__toggle">
            <StatusText tone={hardwareAccelerationDisabled ? 'muted' : 'good'}>
              {hardwareAccelerationDisabled
                ? t('settings.danger.hardwareAcceleration.status.disabled')
                : t('settings.danger.hardwareAcceleration.status.enabled')}
            </StatusText>
            <ToggleButton
              active={!hardwareAccelerationDisabled}
              ariaLabel={t('settings.danger.hardwareAcceleration.title')}
              disabled={busy}
              onClick={onHardwareAccelerationToggle}
            />
          </div>
        )}
      />
      <DangerActionCard
        icon={RotateCcw}
        title={t('settings.danger.reset.title')}
        description={t('settings.danger.reset.description')}
        tone="caution"
        action={(
          <button
            className="settings-danger-button"
            type="button"
            disabled={busy}
            onClick={onResetDefaultSettings}
          >
            {busy ? processingLabel : t('settings.danger.reset.action')}
          </button>
        )}
      />
      {message ? <p className="settings-inline-note">{message}</p> : null}
    </div>
  );
};
