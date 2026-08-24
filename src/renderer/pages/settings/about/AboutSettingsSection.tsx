import {
  BookOpen,
  Code2,
  Download,
  ExternalLink,
  FileDown,
  FileText,
  FolderOpen,
  Github,
  Globe2,
  Headphones,
  Heart,
  History,
  Info,
  Mail,
  MessageSquare,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Locale, TranslationKey } from '../../../i18n/locales';
import { appEditionLabel } from '../../../../shared/constants/distribution';
import type { AppSettings } from '../../../../shared/types/appSettings';
import type { LastCrashSummary } from '../../../../shared/types/diagnostics';
import type { DataBackupProgress } from '../../../../shared/types/settingsBackup';
import { DiagnosticsAssistantPanel } from '../../../components/settings/DiagnosticsAssistantPanel';
import { SteamStatusPanel } from '../../../components/settings/SteamStatusPanel';
import { SteamListenTogetherProbePanel } from '../../../components/settings/SteamListenTogetherProbePanel';
import {
  ChipButton,
  SettingRow,
  SettingSection,
  SettingSubsectionTitle,
  StatusText,
  ToggleButton,
  type SettingSubsectionTitleProps,
} from '../components/SettingsPrimitives';
import { echoAppIconUrl } from './echoAppIcon';
import {
  afdianSponsorUrl,
  authorEmailUrl,
  bilibiliSpaceUrl,
  bugFeedbackUrl,
  diagnosticsPartnerUrl,
  discordInviteUrl,
  githubReleasesUrl,
  officialWebsiteUrl,
  qqGroupUrl,
  userDocumentationUrl,
} from '../general/generalSettingsModel';
import { settingsLocaleCopy } from '../settingsSubsections';
import type { SettingsNavKey } from '../settingsTypes';

type Translate = (
  key: TranslationKey,
  options?: Record<string, string | number>,
) => string;

type AboutSubsectionKey = 'aboutVersion' | 'generalData' | 'aboutDiagnostics';

export type AboutSettingsSectionProps = {
  activeKey: SettingsNavKey;
  appSettings: AppSettings | null;
  appVersion: string | null;
  backup: {
    busy: 'choose' | 'run' | 'import' | 'open' | null;
    databaseProtectionBusy: boolean;
    directory: string | null;
    enabled: boolean;
    intervalDays: number;
    lastError: string | null;
    lastLabel: string;
    message: string | null;
    nextLabel: string;
    progress: DataBackupProgress | null;
    progressBytesLabel: string | null;
    progressCountLabel: string;
    progressEntryLabel: string;
    progressPercent: number | null;
    progressPhaseLabel: string | null;
    running: boolean;
    settingsBusy: 'export' | 'import' | 'dataPackage' | null;
    settingsMessage: string | null;
  };
  diagnostics: {
    busy: boolean;
    devConsoleMessage: string | null;
    lastCrashSummary: LastCrashSummary | null;
    message: string | null;
  };
  getSubsection: (key: AboutSubsectionKey) => SettingSubsectionTitleProps;
  highlightedSettingId: string | null;
  locale: Locale;
  onChooseDataBackupDirectory: () => void | Promise<void>;
  onDiagnosticsClearSummary: () => void | Promise<void>;
  onDiagnosticsExport: () => void | Promise<void>;
  onDiagnosticsExportZip: () => void | Promise<void>;
  onDiagnosticsOpenAudioCrashReport: () => void | Promise<void>;
  onDiagnosticsOpenCrashReport: () => void | Promise<void>;
  onDiagnosticsOpenDevConsole: () => void | Promise<void>;
  onDiagnosticsOpenFolder: () => void | Promise<void>;
  onExportDataPackage: () => void | Promise<void>;
  onExportSettings: () => void | Promise<void>;
  onImportDataBackup: () => void | Promise<void>;
  onImportSettings: () => void | Promise<void>;
  onOpenContributors: () => void;
  onOpenDataBackupDirectory: () => void | Promise<void>;
  onOpenDataProtectionFolder: () => void | Promise<void>;
  onOpenExternalUrl: (url: string) => void | Promise<void>;
  onPatchAppSettings: (patch: Partial<AppSettings>) => void;
  onRunDataBackupNow: () => void | Promise<void>;
  t: Translate;
};

export const AboutSettingsSection = ({
  activeKey,
  appSettings,
  appVersion,
  backup,
  diagnostics,
  getSubsection,
  highlightedSettingId,
  locale,
  onChooseDataBackupDirectory,
  onDiagnosticsClearSummary,
  onDiagnosticsExport,
  onDiagnosticsExportZip,
  onDiagnosticsOpenAudioCrashReport,
  onDiagnosticsOpenCrashReport,
  onDiagnosticsOpenDevConsole,
  onDiagnosticsOpenFolder,
  onExportDataPackage,
  onExportSettings,
  onImportDataBackup,
  onImportSettings,
  onOpenContributors,
  onOpenDataBackupDirectory,
  onOpenDataProtectionFolder,
  onOpenExternalUrl,
  onPatchAppSettings,
  onRunDataBackupNow,
  t,
}: AboutSettingsSectionProps): JSX.Element => {
  const copy = (values: Record<Locale, string>): string => settingsLocaleCopy(locale, values);
  const safeModeTitle = copy({
    'zh-CN': '安全模式',
    'zh-TW': '安全模式',
    'ja-JP': 'セーフモード',
    'en-US': 'Safe mode',
    'ko-KR': '안전 모드',
  });
  const communityLinks: Array<{ icon: LucideIcon; url: string; label: string }> = [
    { icon: Globe2, url: officialWebsiteUrl, label: t('settings.about.links.officialWebsite') },
    { icon: BookOpen, url: userDocumentationUrl, label: t('settings.about.links.documentation') },
    { icon: History, url: githubReleasesUrl, label: copy({
      'zh-CN': '更新记录',
      'zh-TW': '更新記錄',
      'ja-JP': '更新履歴',
      'en-US': 'Updates',
      'ko-KR': '업데이트',
    }) },
    { icon: Github, url: bugFeedbackUrl, label: copy({
      'zh-CN': 'BUG反馈',
      'zh-TW': 'BUG回饋',
      'ja-JP': '不具合報告',
      'en-US': 'Report a bug',
      'ko-KR': '버그 제보',
    }) },
    { icon: Mail, url: authorEmailUrl, label: copy({
      'zh-CN': '联系作者',
      'zh-TW': '聯絡作者',
      'ja-JP': '作者に連絡',
      'en-US': 'Contact author',
      'ko-KR': '작성자에게 문의',
    }) },
    { icon: ExternalLink, url: bilibiliSpaceUrl, label: t('settings.about.links.bilibili') },
    { icon: MessageSquare, url: qqGroupUrl, label: copy({
      'zh-CN': 'QQ 群',
      'zh-TW': 'QQ 群',
      'ja-JP': 'QQ',
      'en-US': 'QQ',
      'ko-KR': 'QQ',
    }) },
    { icon: MessageSquare, url: discordInviteUrl, label: 'Discord' },
    { icon: Heart, url: afdianSponsorUrl, label: t('settings.about.updates.action.afdian') },
  ];
  return (
    <SettingSection
      activeKey={activeKey}
      icon={Info}
      id="about"
      title={t('settings.nav.about.label')}
    >
      <SettingSubsectionTitle id="settings-subsection-about-version" {...getSubsection('aboutVersion')} />
      <SettingRow
        id="settings-row-about-version"
        highlighted={highlightedSettingId === 'settings-row-about-version'}
        title={t('settings.about.version.title')}
        description={`${appEditionLabel} · ${copy({
          'zh-CN': '更新由 Steam 管理',
          'zh-TW': '更新由 Steam 管理',
          'ja-JP': '更新は Steam が管理',
          'en-US': 'Updates via Steam',
          'ko-KR': 'Steam에서 업데이트',
        })}`}
      >
        <div className="settings-about-identity">
          <img
            alt=""
            aria-hidden="true"
            className="settings-about-identity-icon"
            decoding="async"
            draggable={false}
            height={40}
            src={echoAppIconUrl}
            width={40}
          />
          <div className="settings-about-identity-copy">
            <strong>ECHO</strong>
            <span>{appVersion ?? t('common.checking')}</span>
          </div>
        </div>
      </SettingRow>
      <SettingRow
        className="setting-row--compact-panel"
        id="settings-row-about-community"
        highlighted={highlightedSettingId === 'settings-row-about-community'}
        title={copy({
          'zh-CN': '社区与支持',
          'zh-TW': '社群與支援',
          'ja-JP': 'コミュニティとサポート',
          'en-US': 'Community And Support',
          'ko-KR': '커뮤니티 및 지원',
        })}
        description={copy({
          'zh-CN': '官网、文档、社区频道和问题反馈。',
          'zh-TW': '官網、文件、社群頻道和問題回饋。',
          'ja-JP': '公式サイト、ドキュメント、コミュニティ、フィードバック。',
          'en-US': 'Website, docs, community channels, and feedback.',
          'ko-KR': '웹사이트, 문서, 커뮤니티 채널 및 피드백.',
        })}
      >
        <nav
          className="settings-chip-row settings-chip-row--left settings-chip-row--actions"
          aria-label={copy({
            'zh-CN': '社区与支持',
            'zh-TW': '社群與支援',
            'ja-JP': 'コミュニティとサポート',
            'en-US': 'Community And Support',
            'ko-KR': '커뮤니티 및 지원',
          })}
        >
          {communityLinks.map((link) => {
            const Icon = link.icon;
            return (
              <button
                className="settings-action-button"
                key={link.url}
                type="button"
                onClick={() => void onOpenExternalUrl(link.url)}
              >
                <Icon size={15} />
                {link.label}
              </button>
            );
          })}
        </nav>
      </SettingRow>
      <SettingRow
        id="settings-row-about-contributors"
        highlighted={highlightedSettingId === 'settings-row-about-contributors'}
        title={copy({
          'zh-CN': '贡献者',
          'zh-TW': '貢獻者',
          'ja-JP': 'コントリビューター',
          'en-US': 'Contributors',
          'ko-KR': '기여자',
        })}
        description={copy({
          'zh-CN': '查看让 ECHO 变得更好的每一位贡献者。',
          'zh-TW': '查看讓 ECHO 變得更好的每一位貢獻者。',
          'ja-JP': 'ECHO をより良くしてくれたすべての人を表示します。',
          'en-US': 'See everyone who helps make ECHO better.',
          'ko-KR': 'ECHO를 더 좋게 만드는 모든 기여자를 확인합니다.',
        })}
      >
        <button className="settings-action-button" type="button" onClick={onOpenContributors}>
          <UsersRound size={15} />
          {copy({
            'zh-CN': '查看贡献者',
            'zh-TW': '查看貢獻者',
            'ja-JP': '一覧を見る',
            'en-US': 'View contributors',
            'ko-KR': '기여자 보기',
          })}
        </button>
      </SettingRow>

      <SettingSubsectionTitle id="settings-subsection-about-data" {...getSubsection('generalData')} />
      <SettingRow
        className="setting-row--compact-panel"
        id="settings-row-settings-export"
        highlighted={highlightedSettingId === 'settings-row-settings-export'}
        title={t('settings.about.settingsExport.title')}
        description={t('settings.about.settingsExport.description')}
      >
        <div className="settings-about-control">
          <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
            <button
              className="settings-action-button"
              type="button"
              disabled={backup.settingsBusy !== null}
              onClick={() => void onExportSettings()}
            >
              <FileDown size={15} />
              {backup.settingsBusy === 'export' ? t('settings.about.settingsExport.action.exporting') : t('settings.about.settingsExport.action.export')}
            </button>
            <button
              className="settings-action-button"
              type="button"
              disabled={backup.settingsBusy !== null}
              onClick={() => void onImportSettings()}
            >
              <FileText size={15} />
              {backup.settingsBusy === 'import' ? t('settings.about.settingsExport.action.importing') : t('settings.about.settingsExport.action.import')}
            </button>
          </div>
          <p className="settings-inline-note">{t('settings.about.settingsExport.note')}</p>
          {backup.settingsMessage ? <p className="settings-inline-note">{backup.settingsMessage}</p> : null}
        </div>
      </SettingRow>
      <SettingRow
        className="setting-row--compact-panel"
        id="settings-row-data-backup"
        highlighted={highlightedSettingId === 'settings-row-data-backup'}
        title={t('settings.general.dataBackup.title')}
        description={t('settings.general.dataBackup.description')}
      >
        <div className="settings-data-backup-panel">
          <div className="settings-data-backup-primary">
            <div className="settings-data-backup-switch">
              <ToggleButton
                active={backup.enabled}
                disabled={!appSettings || !backup.directory || backup.running}
                onClick={() =>
                  onPatchAppSettings({
                    autoDataBackupEnabled: !backup.enabled,
                  })
                }
              />
              <div>
                <strong>{backup.enabled ? t('settings.general.dataBackup.status.enabled') : t('settings.general.dataBackup.status.disabled')}</strong>
                <StatusText tone={backup.enabled ? 'good' : 'muted'}>
                  {backup.directory ? t('settings.general.dataBackup.hint.directoryReady') : t('settings.general.dataBackup.hint.chooseDirectory')}
                </StatusText>
              </div>
            </div>
            <div className="settings-data-backup-frequency" aria-label={t('settings.general.dataBackup.frequency.aria')}>
              {([3, 7, 30] as const).map((days) => (
                <ChipButton
                  active={backup.intervalDays === days}
                  key={days}
                  onClick={() => onPatchAppSettings({ autoDataBackupIntervalDays: days })}
                >
                  {days === 30 ? t('settings.general.dataBackup.frequency.monthly') : t('settings.general.dataBackup.frequency.days', { days })}
                </ChipButton>
              ))}
            </div>
          </div>
          <div className="settings-data-backup-meta">
            <span>
              <em>{t('settings.general.dataBackup.meta.directory')}</em>
              <strong>{backup.directory ?? t('settings.general.dataBackup.meta.notSet')}</strong>
            </span>
            <span>
              <em>{t('settings.general.dataBackup.meta.lastBackup')}</em>
              <strong>{backup.lastLabel}</strong>
            </span>
            <span>
              <em>{t('settings.general.dataBackup.meta.nextRun')}</em>
              <strong>{backup.nextLabel}</strong>
            </span>
          </div>
          {backup.progress ? (
            <div className="settings-data-backup-progress" role="status" aria-live="polite">
              <div className="settings-data-backup-progress-head">
                <strong>{backup.progressPhaseLabel}</strong>
                <span>{backup.progressPercent !== null ? `${backup.progressPercent}%` : t('settings.general.dataBackup.progress.measuring')}</span>
              </div>
              <div
                className="settings-data-backup-progress-track"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={backup.progressPercent ?? undefined}
                aria-label={backup.progressPhaseLabel ?? t('settings.general.dataBackup.title')}
                data-indeterminate={backup.progressPercent === null ? 'true' : undefined}
              >
                <span style={{ width: `${backup.progressPercent ?? 36}%` }} />
              </div>
              <div className="settings-data-backup-progress-detail">
                <span title={backup.progressEntryLabel}>{backup.progressEntryLabel}</span>
                <em>
                  {backup.progressCountLabel}
                  {backup.progressBytesLabel ? ` - ${backup.progressBytesLabel}` : ''}
                </em>
              </div>
            </div>
          ) : null}
          <div className="settings-data-backup-actions">
            <button className="settings-action-button" type="button" disabled={backup.running} onClick={() => void onChooseDataBackupDirectory()}>
              <FolderOpen size={15} />
              {backup.busy === 'choose' ? t('settings.general.dataBackup.action.choosingDirectory') : t('settings.general.dataBackup.action.chooseDirectory')}
            </button>
            <button
              className="settings-action-button"
              type="button"
              disabled={!backup.directory || backup.running}
              onClick={() => void onRunDataBackupNow()}
            >
              <Download size={15} />
              {backup.busy === 'run' ? t('settings.general.dataBackup.action.backingUp') : t('settings.general.dataBackup.action.backupNow')}
            </button>
            <button className="settings-action-button" type="button" disabled={backup.running} onClick={() => void onImportDataBackup()}>
              <FileText size={15} />
              {backup.busy === 'import' ? t('settings.general.dataBackup.action.importingBackup') : t('settings.general.dataBackup.action.importBackup')}
            </button>
            <button
              className="settings-action-button"
              type="button"
              disabled={!backup.directory || backup.running}
              onClick={() => void onOpenDataBackupDirectory()}
            >
              <FolderOpen size={15} />
              {t('settings.general.dataBackup.action.openDirectory')}
            </button>
          </div>
          {backup.lastError ? <StatusText tone="muted">{backup.lastError}</StatusText> : null}
          {backup.message ? <StatusText tone="good">{backup.message}</StatusText> : null}
        </div>
      </SettingRow>
      <SettingRow
        className="setting-row--package-export"
        title={t('settings.general.dataPackage.title')}
        description={t('settings.general.dataPackage.description')}
      >
        <div className="settings-package-export-panel">
          <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
            <button
              className="settings-action-button"
              type="button"
              disabled={backup.settingsBusy !== null}
              onClick={() => void onExportDataPackage()}
            >
              <Download size={15} />
              {backup.settingsBusy === 'dataPackage' ? t('settings.general.dataPackage.action.exporting') : t('settings.general.dataPackage.action.export')}
            </button>
            <button className="settings-action-button" type="button" disabled={backup.databaseProtectionBusy} onClick={() => void onOpenDataProtectionFolder()}>
              <FolderOpen size={15} />
              {t('settings.general.dataPackage.action.recovery')}
            </button>
          </div>
          <p className="settings-inline-note">{t('settings.general.dataPackage.note')}</p>
        </div>
      </SettingRow>

      <SettingSubsectionTitle id="settings-subsection-about-diagnostics" {...getSubsection('aboutDiagnostics')} />
      <SettingRow
        className="setting-row--full setting-row--compact-panel"
        id="settings-row-steam-status"
        highlighted={highlightedSettingId === 'settings-row-steam-status'}
        title="Steamworks"
        description={copy({
          'zh-CN': '查看 Steam 运行时、构建、测试分支、许可和 Cloud 状态，并复制脱敏诊断。',
          'zh-TW': '查看 Steam 執行階段、建置、測試分支、授權和 Cloud 狀態，並複製脫敏診斷。',
          'ja-JP': 'Steam ランタイム、ビルド、ベータ、ライセンス、Cloud の状態を確認します。',
          'en-US': 'Inspect Steam runtime, build, beta, ownership, and Cloud status with privacy-safe diagnostics.',
          'ko-KR': 'Steam 런타임, 빌드, 베타, 라이선스 및 Cloud 상태를 확인합니다.',
        })}
      >
        <SteamStatusPanel />
        <SteamListenTogetherProbePanel locale={locale} />
      </SettingRow>
      <SettingRow
        className="setting-row--full setting-row--compact-panel"
        id="settings-row-safe-mode"
        highlighted={highlightedSettingId === 'settings-row-safe-mode'}
        title={safeModeTitle}
        description={t('settings.about.safeMode.description')}
      >
        <div className="settings-cache-panel settings-cache-panel--diagnostics">
          <div className="settings-status-grid">
            <span>
              <em>{t('settings.about.safeMode.status')}</em>
              <strong>{appSettings?.safeModeEnabled ? t('common.enabled') : t('common.disabled')}</strong>
            </span>
            <span>
              <em>{t('settings.about.safeMode.scope')}</em>
              <strong>{t('settings.about.safeMode.scopeEveryLaunch')}</strong>
            </span>
            <span>
              <em>{t('settings.about.safeMode.startupBehavior')}</em>
              <strong>{t('settings.about.safeMode.diagnosticsOnly')}</strong>
            </span>
            <span>
              <em>{t('settings.about.safeMode.slowStageThreshold')}</em>
              <strong>2000ms</strong>
            </span>
          </div>
          <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
            <div className="settings-inline-toggle">
              <span>{safeModeTitle}</span>
              <ToggleButton
                active={appSettings?.safeModeEnabled === true}
                disabled={!appSettings}
                onClick={() => onPatchAppSettings({ safeModeEnabled: !(appSettings?.safeModeEnabled ?? false) })}
              />
            </div>
            <button className="settings-action-button" type="button" onClick={() => void onDiagnosticsOpenDevConsole()}>
              <Code2 size={15} />
              {t('settings.about.safeMode.action.openConsole')}
            </button>
            <button className="settings-action-button" type="button" disabled={diagnostics.busy} onClick={() => void onDiagnosticsExportZip()}>
              <Download size={15} />
              {diagnostics.busy ? t('settings.about.diagnostics.action.exporting') : t('settings.about.safeMode.action.exportZip')}
            </button>
          </div>
          <p className="settings-inline-note">{t('settings.about.safeMode.note.powerShell')}</p>
          <p className="settings-inline-note">{t('settings.about.safeMode.note.beforeAsk')}</p>
          <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
            <button
              className="settings-action-button"
              type="button"
              onClick={() => void onOpenExternalUrl(diagnosticsPartnerUrl)}
            >
              <ExternalLink size={15} />
              {t('settings.about.safeMode.action.partner')}
            </button>
          </div>
          {diagnostics.devConsoleMessage ? <p className="settings-inline-note">{diagnostics.devConsoleMessage}</p> : null}
          {diagnostics.message ? <p className="settings-inline-note">{diagnostics.message}</p> : null}
        </div>
      </SettingRow>
      <SettingRow
        className="setting-row--full setting-row--compact-panel"
        id="settings-row-diagnostics-assistant"
        highlighted={highlightedSettingId === 'settings-row-diagnostics-assistant'}
        title={t('settings.about.diagnosticsAssistant.title')}
        description={t('settings.about.diagnosticsAssistant.description')}
      >
        <DiagnosticsAssistantPanel lastCrashSummary={diagnostics.lastCrashSummary} />
      </SettingRow>
      <SettingRow
        className="setting-row--full setting-row--compact-panel"
        id="settings-row-diagnostics"
        highlighted={highlightedSettingId === 'settings-row-diagnostics'}
        title={t('settings.about.diagnostics.title')}
        description={t('settings.about.diagnostics.description')}
      >
        <div className="settings-cache-panel settings-cache-panel--diagnostics">
          <div className="settings-status-grid">
            <span>
              <em>{t('settings.about.diagnostics.lastCrash')}</em>
              <strong>{diagnostics.lastCrashSummary ? t('settings.about.diagnostics.detected') : t('settings.about.diagnostics.notDetected')}</strong>
            </span>
            <span>
              <em>{copy({ 'zh-CN': '会话', 'zh-TW': '工作階段', 'ja-JP': 'セッション', 'en-US': 'Session', 'ko-KR': '세션' })}</em>
              <strong>{diagnostics.lastCrashSummary?.sessionId ?? 'n/a'}</strong>
            </span>
            <span>
              <em>{copy({ 'zh-CN': '开始', 'zh-TW': '開始', 'ja-JP': '開始', 'en-US': 'Started', 'ko-KR': '시작' })}</em>
              <strong>{diagnostics.lastCrashSummary?.startedAt ?? 'n/a'}</strong>
            </span>
            <span>
              <em>{copy({ 'zh-CN': '检出', 'zh-TW': '偵測', 'ja-JP': '検出', 'en-US': 'Detected', 'ko-KR': '감지' })}</em>
              <strong>{diagnostics.lastCrashSummary?.detectedAt ?? 'n/a'}</strong>
            </span>
          </div>
          <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
            <button className="settings-action-button" type="button" disabled={diagnostics.busy} onClick={() => void onDiagnosticsExport()}>
              <Download size={15} />
              {diagnostics.busy ? t('settings.about.diagnostics.action.exporting') : t('settings.about.diagnostics.action.exportMarkdown')}
            </button>
            <button className="settings-action-button" type="button" onClick={() => void onDiagnosticsOpenFolder()}>
              <FolderOpen size={15} />
              {t('settings.about.diagnostics.action.openLogs')}
            </button>
            <button className="settings-action-button" type="button" onClick={() => void onDiagnosticsOpenCrashReport()}>
              <FileText size={15} />
              {t('settings.about.diagnostics.action.openCrashReport')}
            </button>
            <button className="settings-action-button" type="button" onClick={() => void onDiagnosticsOpenAudioCrashReport()}>
              <Headphones size={15} />
              {t('settings.about.diagnostics.action.openAudioReport')}
            </button>
            <button className="settings-action-button" type="button" onClick={() => void onDiagnosticsOpenDevConsole()}>
              <Code2 size={15} />
              {t('settings.about.diagnostics.action.openDebugConsole')}
            </button>
            <button
              className="settings-action-button"
              type="button"
              disabled={!diagnostics.lastCrashSummary}
              onClick={() => void onDiagnosticsClearSummary()}
            >
              {t('settings.about.diagnostics.action.clearLastCrash')}
            </button>
          </div>
          {diagnostics.message ? <p className="settings-inline-note">{diagnostics.message}</p> : null}
        </div>
      </SettingRow>
    </SettingSection>
  );
};
