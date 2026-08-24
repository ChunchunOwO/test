import { Database, Eraser, RotateCcw, ShieldCheck } from 'lucide-react';
import type { TranslationKey } from '../../../i18n/locales';
import { DangerActionCard } from './DangerActionCard';

type Translate = (
  key: TranslationKey,
  options?: Record<string, string | number>,
) => string;

type DangerIrreversibleSettingsProps = {
  busy: boolean;
  onDeleteAllUserData: () => void;
  onDeleteLibraryDatabase: () => void;
  onRebuildEmptyLibrary: () => void;
  t: Translate;
};

export const DangerIrreversibleSettings = ({
  busy,
  onDeleteAllUserData,
  onDeleteLibraryDatabase,
  onRebuildEmptyLibrary,
  t,
}: DangerIrreversibleSettingsProps): JSX.Element => {
  const processingLabel = t('settings.danger.action.processing');
  const keep = t('settings.danger.keepFiles');

  return (
    <div className="danger-action-list">
      <DangerActionCard
        icon={RotateCcw}
        title={t('settings.danger.repair.title')}
        description={t('settings.danger.repair.description')}
        tone="danger"
        action={(
          <button
            className="settings-danger-button"
            type="button"
            disabled={busy}
            onClick={onRebuildEmptyLibrary}
          >
            {busy ? processingLabel : t('settings.danger.repair.action')}
          </button>
        )}
      />
      <DangerActionCard
        icon={Database}
        title={t('settings.danger.deleteDatabase.title')}
        description={t('settings.danger.deleteDatabase.description')}
        tone="danger"
        action={(
          <button
            className="settings-danger-button"
            type="button"
            disabled={busy}
            onClick={onDeleteLibraryDatabase}
          >
            {busy ? processingLabel : t('settings.danger.deleteDatabase.action')}
          </button>
        )}
      />
      <DangerActionCard
        icon={Eraser}
        title={t('settings.danger.deleteAll.title')}
        description={t('settings.danger.deleteAll.description')}
        tone="danger"
        action={(
          <button
            className="settings-danger-button"
            type="button"
            disabled={busy}
            onClick={onDeleteAllUserData}
          >
            {busy ? processingLabel : t('settings.danger.deleteAll.action')}
          </button>
        )}
      />
      <p className="danger-card__keep">
        <ShieldCheck size={13} aria-hidden="true" />
        <span>{keep}</span>
      </p>
    </div>
  );
};
