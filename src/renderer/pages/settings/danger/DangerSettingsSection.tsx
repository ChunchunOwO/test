import { useCallback, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { DuplicateTrackCleanupPreview, LibraryDatabaseProtectionStatus } from '../../../../shared/types/library';
import type { TranslationKey } from '../../../i18n/locales';
import {
  SettingSection,
  SettingSubsectionTitle,
  type SettingSubsectionTitleProps,
} from '../components/SettingsPrimitives';
import type { SettingsSubsectionCopyKey } from '../settingsSubsections';
import type { SettingsNavKey } from '../settingsTypes';
import { DangerConfirmDialog } from './DangerConfirmDialog';
import { DangerIrreversibleSettings } from './DangerIrreversibleSettings';
import { DangerMaintenanceSettings } from './DangerMaintenanceSettings';
import { DatabaseProtectionPanel, type DatabaseProtectionBusyAction } from './DatabaseProtectionPanel';
import { DuplicateCleanupSettings } from './DuplicateCleanupSettings';
import type { DangerConfirmRequest } from './dangerConfirm';
import './danger-settings.css';

type Translate = (
  key: TranslationKey,
  options?: Record<string, string | number>,
) => string;

export type DangerSettingsSectionProps = {
  activeKey: SettingsNavKey;
  dangerBusy: boolean;
  dangerMessage: string | null;
  dataProtectionDisabled: boolean;
  databaseProtectionBusyAction: DatabaseProtectionBusyAction;
  databaseProtectionError: string | null;
  databaseProtectionMessage: string | null;
  databaseProtectionStatus: LibraryDatabaseProtectionStatus | null;
  diagnosticsBusy: boolean;
  duplicateCleanupBusyAction: 'scan' | 'clean' | null;
  duplicateCleanupExpanded: boolean;
  duplicateCleanupMessage: string | null;
  duplicateCleanupPreview: DuplicateTrackCleanupPreview | null;
  getSubsection: (key: SettingsSubsectionCopyKey) => SettingSubsectionTitleProps;
  hardwareAccelerationDisabled: boolean;
  onClearLibraryCache: () => void;
  onCreateSnapshot: () => void;
  onDeleteAllUserData: () => void;
  onDeleteLibraryDatabase: () => void;
  onDiscardQuarantinedTracks: () => void;
  onDuplicateCleanupApply: () => void;
  onDuplicateCleanupExpandedChange: (expanded: boolean) => void;
  onDuplicateCleanupScan: () => void;
  onExportDiagnostics: () => void;
  onHardwareAccelerationToggle: () => void;
  onOpenProtectionFolder: () => void;
  onRebuildEmptyLibrary: () => void;
  onRefreshDatabase: () => void;
  onRelaunchRecovery: () => void;
  onResetDefaultSettings: () => void;
  onRestoreSnapshot: () => void;
  onScrubQuarantined: () => void;
  t: Translate;
};

export const DangerSettingsSection = ({
  activeKey,
  dangerBusy,
  dangerMessage,
  dataProtectionDisabled,
  databaseProtectionBusyAction,
  databaseProtectionError,
  databaseProtectionMessage,
  databaseProtectionStatus,
  diagnosticsBusy,
  duplicateCleanupBusyAction,
  duplicateCleanupExpanded,
  duplicateCleanupMessage,
  duplicateCleanupPreview,
  getSubsection,
  hardwareAccelerationDisabled,
  onClearLibraryCache,
  onCreateSnapshot,
  onDeleteAllUserData,
  onDeleteLibraryDatabase,
  onDiscardQuarantinedTracks,
  onDuplicateCleanupApply,
  onDuplicateCleanupExpandedChange,
  onDuplicateCleanupScan,
  onExportDiagnostics,
  onHardwareAccelerationToggle,
  onOpenProtectionFolder,
  onRebuildEmptyLibrary,
  onRefreshDatabase,
  onRelaunchRecovery,
  onResetDefaultSettings,
  onRestoreSnapshot,
  onScrubQuarantined,
  t,
}: DangerSettingsSectionProps): JSX.Element => {
  const [pendingConfirm, setPendingConfirm] = useState<DangerConfirmRequest | null>(null);
  const keepFiles = t('settings.danger.keepFiles');
  const databaseBusy = databaseProtectionBusyAction !== null || dangerBusy;
  const recommendedAction = databaseProtectionStatus?.recommendedAction ?? 'none';

  const closeConfirm = useCallback(() => {
    setPendingConfirm(null);
  }, []);

  const requestConfirm = useCallback((request: DangerConfirmRequest) => {
    setPendingConfirm({
      ...request,
      onConfirm: () => {
        setPendingConfirm(null);
        request.onConfirm();
      },
    });
  }, []);

  const confirmPrimaryRecovery = (): void => {
    if (recommendedAction === 'scrub-quarantined-database') {
      requestConfirm({
        keep: keepFiles,
        message: t('settings.danger.database.confirm.scrubMessage'),
        onConfirm: onScrubQuarantined,
        title: t('settings.danger.database.action.scrub'),
        tone: 'danger',
        word: t('settings.danger.database.confirm.scrub'),
      });
      return;
    }
    if (recommendedAction === 'rebuild-empty-database') {
      requestConfirm({
        keep: keepFiles,
        message: t('settings.danger.database.confirm.rebuildEmptyMessage'),
        onConfirm: onRebuildEmptyLibrary,
        title: t('settings.danger.database.action.rebuild'),
        tone: 'danger',
        word: t('settings.danger.database.confirm.rebuildEmpty'),
      });
      return;
    }
    requestConfirm({
      keep: keepFiles,
      message: t('settings.danger.database.confirm.restoreMessage'),
      onConfirm: onRestoreSnapshot,
      title: t('settings.danger.database.action.restore'),
      tone: 'danger',
      word: t('settings.danger.database.confirm.restore'),
    });
  };

  return (
    <SettingSection
      activeKey={activeKey}
      icon={Trash2}
      id="danger"
      title={t('settings.nav.danger.label')}
      description={t('settings.nav.danger.description')}
    >
      <aside className="danger-settings__banner">
        <p>{t('settings.danger.intro.body')}</p>
      </aside>

      <SettingSubsectionTitle id="settings-subsection-danger-database" {...getSubsection('dangerRecovery')} />
      <DatabaseProtectionPanel
          busy={databaseBusy}
          busyAction={databaseProtectionBusyAction}
          dataProtectionDisabled={dataProtectionDisabled}
          diagnosticsBusy={diagnosticsBusy}
          error={databaseProtectionError}
          message={databaseProtectionMessage}
          onCreateSnapshot={onCreateSnapshot}
          onDiscardQuarantinedTracks={() => requestConfirm({
            keep: keepFiles,
            message: t('settings.danger.database.confirm.discardMessage'),
            onConfirm: onDiscardQuarantinedTracks,
            title: t('settings.danger.database.action.discard'),
            tone: 'danger',
            word: t('settings.danger.database.confirm.discard'),
          })}
          onExportDiagnostics={onExportDiagnostics}
          onOpenFolder={onOpenProtectionFolder}
          onPrimaryRecovery={confirmPrimaryRecovery}
          onRefresh={onRefreshDatabase}
          onRelaunchRecovery={() => requestConfirm({
            keep: keepFiles,
            message: t('settings.danger.database.confirm.relaunchRecovery'),
            onConfirm: onRelaunchRecovery,
            title: t('settings.danger.database.action.relaunch'),
            tone: 'caution',
          })}
          status={databaseProtectionStatus}
          t={t}
        />

        <SettingSubsectionTitle id="settings-subsection-danger-duplicates" {...getSubsection('dangerDuplicates')} />
        <DuplicateCleanupSettings
          busyAction={duplicateCleanupBusyAction}
          dangerBusy={dangerBusy}
          expanded={duplicateCleanupExpanded}
          message={duplicateCleanupMessage}
          onApply={() => requestConfirm({
            keep: t('settings.danger.duplicates.keep'),
            message: t('settings.danger.duplicates.confirmMessage', {
              tracks: duplicateCleanupPreview?.totalTracksToRemove ?? 0,
            }),
            onConfirm: onDuplicateCleanupApply,
            title: t('settings.danger.duplicates.action.clean'),
            tone: 'danger',
            word: t('settings.danger.duplicates.confirmWord'),
          })}
          onExpandedChange={onDuplicateCleanupExpandedChange}
          onScan={onDuplicateCleanupScan}
          preview={duplicateCleanupPreview}
          t={t}
        />

        <SettingSubsectionTitle id="settings-subsection-danger-maintenance" {...getSubsection('dangerCleanup')} />
        <DangerMaintenanceSettings
          busy={dangerBusy}
          hardwareAccelerationDisabled={hardwareAccelerationDisabled}
          message={dangerMessage}
          onClearLibraryCache={() => requestConfirm({
            keep: keepFiles,
            message: t('settings.danger.clearCache.confirm'),
            onConfirm: onClearLibraryCache,
            title: t('settings.danger.clearCache.title'),
            tone: 'caution',
          })}
          onHardwareAccelerationToggle={() => requestConfirm({
            keep: t('settings.danger.hardwareAcceleration.restartHint'),
            message: t(
              hardwareAccelerationDisabled
                ? 'settings.danger.hardwareAcceleration.confirmEnable'
                : 'settings.danger.hardwareAcceleration.confirmDisable',
            ),
            onConfirm: onHardwareAccelerationToggle,
            title: t('settings.danger.hardwareAcceleration.title'),
            tone: 'caution',
          })}
          onResetDefaultSettings={() => requestConfirm({
            keep: keepFiles,
            message: t('settings.danger.reset.confirm'),
            onConfirm: onResetDefaultSettings,
            title: t('settings.danger.reset.title'),
            tone: 'caution',
          })}
          t={t}
        />

        <SettingSubsectionTitle id="settings-subsection-danger-irreversible" {...getSubsection('dangerIrreversible')} />
        <DangerIrreversibleSettings
          busy={dangerBusy}
          onDeleteAllUserData={() => requestConfirm({
            keep: keepFiles,
            message: t('settings.danger.deleteAll.confirmMessage'),
            onConfirm: onDeleteAllUserData,
            title: t('settings.danger.deleteAll.title'),
            tone: 'danger',
            word: t('settings.danger.deleteAll.confirmWord'),
          })}
          onDeleteLibraryDatabase={() => requestConfirm({
            keep: keepFiles,
            message: t('settings.danger.deleteDatabase.confirmMessage'),
            onConfirm: onDeleteLibraryDatabase,
            title: t('settings.danger.deleteDatabase.title'),
            tone: 'danger',
            word: t('settings.danger.deleteDatabase.confirmWord'),
          })}
          onRebuildEmptyLibrary={() => requestConfirm({
            keep: keepFiles,
            message: t('settings.danger.database.confirm.rebuildEmptyMessage'),
            onConfirm: onRebuildEmptyLibrary,
            title: t('settings.danger.repair.title'),
            tone: 'danger',
            word: t('settings.danger.database.confirm.rebuildEmpty'),
          })}
          t={t}
        />

      {pendingConfirm ? (
        <DangerConfirmDialog
          request={pendingConfirm}
          t={t}
          onCancel={closeConfirm}
        />
      ) : null}
    </SettingSection>
  );
};
