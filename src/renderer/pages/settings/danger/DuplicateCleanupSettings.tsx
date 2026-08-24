import { ChevronDown, Copy, RotateCw, ShieldCheck, Trash2 } from 'lucide-react';
import type { DuplicateTrackCleanupPreview } from '../../../../shared/types/library';
import type { TranslationKey } from '../../../i18n/locales';
import {
  formatDuplicateCleanupTrackQuality,
  formatUpdateBytes,
} from '../diagnostics/settingsDiagnosticsFormat';

type Translate = (
  key: TranslationKey,
  options?: Record<string, string | number>,
) => string;

type DuplicateCleanupSettingsProps = {
  busyAction: 'scan' | 'clean' | null;
  dangerBusy: boolean;
  expanded: boolean;
  message: string | null;
  onApply: () => void;
  onExpandedChange: (expanded: boolean) => void;
  onScan: () => void;
  preview: DuplicateTrackCleanupPreview | null;
  t: Translate;
};

export const DuplicateCleanupSettings = ({
  busyAction,
  dangerBusy,
  expanded,
  message,
  onApply,
  onExpandedChange,
  onScan,
  preview,
  t,
}: DuplicateCleanupSettingsProps): JSX.Element => {
  const notScanned = t('settings.danger.duplicates.meta.notScanned');

  return (
    <div className="danger-card danger-duplicates">
      <header className="danger-card__header">
        <span className="danger-card__icon" aria-hidden="true">
          <Copy size={18} />
        </span>
        <div>
          <h3>{t('settings.danger.duplicates.title')}</h3>
          <p>{t('settings.danger.duplicates.description')}</p>
        </div>
      </header>

      <div className="danger-db__facts">
        <span>
          <em>{t('settings.danger.duplicates.meta.result')}</em>
          <strong>
            {busyAction === 'scan'
              ? t('settings.danger.duplicates.action.scanning')
              : preview
                ? t('settings.danger.duplicates.meta.resultValue', {
                    groups: preview.groups.length,
                    tracks: preview.totalTracksToRemove,
                  })
                : notScanned}
          </strong>
        </span>
        <span>
          <em>{t('settings.danger.duplicates.meta.release')}</em>
          <strong>{preview ? formatUpdateBytes(preview.totalBytesToRemove) : notScanned}</strong>
        </span>
        <span>
          <em>{t('settings.danger.duplicates.meta.scanTime')}</em>
          <strong>
            {preview?.generatedAt
              ? new Date(preview.generatedAt).toLocaleString()
              : notScanned}
          </strong>
        </span>
      </div>

      <div className="danger-db__toolbar">
        <div className="danger-db__tools">
          <button
            className="settings-action-button"
            type="button"
            disabled={busyAction !== null || dangerBusy}
            onClick={onScan}
          >
            <RotateCw className={busyAction === 'scan' ? 'spinning-icon' : undefined} size={15} />
            {busyAction === 'scan'
              ? t('settings.danger.duplicates.action.scanning')
              : t('settings.danger.duplicates.action.scan')}
          </button>
          <button
            className="settings-danger-button"
            type="button"
            disabled={
              busyAction !== null ||
              dangerBusy ||
              !preview ||
              preview.removeTrackIds.length === 0
            }
            onClick={onApply}
          >
            <Trash2 size={15} />
            {busyAction === 'clean'
              ? t('settings.danger.duplicates.action.cleaning')
              : t('settings.danger.duplicates.action.clean')}
          </button>
        </div>
      </div>

      {busyAction ? (
        <div
          className="settings-update-progress settings-duplicate-cleanup-progress"
          role="status"
          aria-live="polite"
        >
          <div className="settings-update-progress-label">
            <strong>
              {busyAction === 'scan'
                ? t('settings.danger.duplicates.progress.scan.title')
                : t('settings.danger.duplicates.progress.clean.title')}
            </strong>
            <span>
              {busyAction === 'scan'
                ? t('settings.danger.duplicates.progress.scan.description')
                : t('settings.danger.duplicates.progress.clean.description')}
            </span>
          </div>
          <div
            className="settings-update-progress-track"
            data-indeterminate="true"
            role="progressbar"
            aria-label={
              busyAction === 'scan'
                ? t('settings.danger.duplicates.progress.scan.aria')
                : t('settings.danger.duplicates.progress.clean.aria')
            }
          >
            <span />
          </div>
        </div>
      ) : null}

      {message ? <p className="settings-inline-note danger-db__note">{message}</p> : null}
      <p className="danger-card__keep danger-db__note">
        <ShieldCheck size={13} aria-hidden="true" />
        <span>{t('settings.danger.duplicates.keep')}</span>
      </p>

      {preview?.groups.length ? (
        <div className="danger-duplicates__preview">
          <button
            aria-expanded={expanded}
            className="settings-library-quality-summary settings-duplicate-cleanup-summary"
            type="button"
            onClick={() => onExpandedChange(!expanded)}
          >
            <span>
              <strong>{t('settings.danger.duplicates.preview.title')}</strong>
              <em>
                {t('settings.danger.duplicates.preview.summary', {
                  groups: preview.groups.length,
                  tracks: preview.totalTracksToRemove,
                })}
              </em>
            </span>
            <ChevronDown className="danger-duplicates__chevron" size={16} />
          </button>
          {expanded ? (
            <div className="settings-library-quality-list">
              {preview.groups.map((group) => (
                <div className="settings-library-quality-row" key={group.id}>
                  <div>
                    <strong>{group.keep.track.title} - {group.keep.track.artist}</strong>
                    <small title={group.keep.track.path}>
                      {t('settings.danger.duplicates.preview.keep', {
                        quality: formatDuplicateCleanupTrackQuality(group.keep),
                        path: group.keep.track.path,
                      })}
                    </small>
                    {group.remove.map((member) => (
                      <small title={member.track.path} key={member.track.id}>
                        {t('settings.danger.duplicates.preview.cleanTrack', {
                          title: member.track.title,
                          artist: member.track.artist,
                          quality: formatDuplicateCleanupTrackQuality(member),
                          path: member.track.path,
                        })}
                      </small>
                    ))}
                  </div>
                  <div className="settings-library-quality-actions">
                    <em>
                      {t('settings.danger.duplicates.preview.cleanCount', {
                        count: group.remove.length,
                      })}
                    </em>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
