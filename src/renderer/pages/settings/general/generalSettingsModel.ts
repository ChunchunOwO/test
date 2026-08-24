import type { DataBackupProgress } from '../../../../shared/types/settingsBackup';
import type { TranslationKey } from '../../../i18n/locales';

export const officialWebsiteUrl = 'https://echonext.moe';
export const userDocumentationUrl = 'https://echonext.moe/zh/docs/';
export const bilibiliSpaceUrl = 'https://space.bilibili.com/25265128';
export const afdianSponsorUrl = 'https://afdian.com/a/echonext';
export const githubReleasesUrl = 'https://github.com/moekotori/echo/releases';
export const qqGroupUrl = 'https://qm.qq.com/q/KrJE8PIqSQ';
export const discordInviteUrl = 'https://discord.gg/g7v4WMRq3K';
export const bugFeedbackUrl = 'https://github.com/Moekotori/ECHO/issues';
export const authorEmailUrl = 'mailto:nyafairy233@gmail.com';
export const diagnosticsPartnerUrl = 'https://www.doubao.com/chat/';

export const dataBackupProgressPhaseLabels: Record<DataBackupProgress['phase'], TranslationKey> = {
  preparing: 'settings.general.dataBackup.progress.preparing',
  snapshot: 'settings.general.dataBackup.progress.snapshot',
  scanning: 'settings.general.dataBackup.progress.scanning',
  writing: 'settings.general.dataBackup.progress.writing',
  finalizing: 'settings.general.dataBackup.progress.finalizing',
  completed: 'settings.general.dataBackup.progress.completed',
  failed: 'settings.general.dataBackup.progress.failed',
};
