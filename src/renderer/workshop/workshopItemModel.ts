import type { WorkshopContentKind, WorkshopManagerAction, WorkshopManagerItem } from '../../shared/types/workshop';
import { translateFallback } from '../i18n/I18nProvider';
import { matchesSearchText } from '../utils/smartTextSearch';
import { workshopKindLabelKey, workshopStateLabelKey, type WorkshopTranslate } from './workshopI18n';

const fallbackT: WorkshopTranslate = translateFallback;

export type WorkshopItemAction = Exclude<WorkshopManagerAction, 'reconcile' | 'browse'>;
export type WorkshopKindFilter = 'all' | WorkshopContentKind;

export const workshopKindLabels: Record<WorkshopContentKind, string> = {
  theme: fallbackT('workshop.kind.theme'),
  'lyrics-style': fallbackT('workshop.kind.lyricsStyle'),
  'visualizer-preset': fallbackT('workshop.kind.visualizer'),
  'dsp-preset': fallbackT('workshop.kind.dsp'),
  'audio-plugin-profile': fallbackT('workshop.kind.audioPlugin'),
  'plugin-package': fallbackT('workshop.kind.pluginPackage'),
};

export const workshopKindFilters: { id: WorkshopKindFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'theme', label: workshopKindLabels.theme },
  { id: 'lyrics-style', label: workshopKindLabels['lyrics-style'] },
  { id: 'visualizer-preset', label: workshopKindLabels['visualizer-preset'] },
  { id: 'dsp-preset', label: workshopKindLabels['dsp-preset'] },
  { id: 'audio-plugin-profile', label: workshopKindLabels['audio-plugin-profile'] },
  { id: 'plugin-package', label: workshopKindLabels['plugin-package'] },
];

export const workshopStateLabels = {
  'not-ingested': fallbackT('workshop.state.notIngested'),
  detected: fallbackT('workshop.state.detected'),
  downloading: fallbackT('workshop.state.downloading'),
  verified: fallbackT('workshop.state.verified'),
  staged: fallbackT('workshop.state.staged'),
  disabled: fallbackT('workshop.state.disabled'),
  enabled: fallbackT('workshop.state.enabled'),
  quarantined: fallbackT('workshop.state.quarantined'),
  error: fallbackT('workshop.state.error'),
} as const;

export const workshopReconcileLabels = {
  idle: fallbackT('workshop.reconcile.idle'),
  running: fallbackT('workshop.reconcile.running'),
  ready: fallbackT('workshop.reconcile.ready'),
  error: fallbackT('workshop.reconcile.error'),
} as const;

export type WorkshopRowAction = {
  action: WorkshopItemAction;
  label: string;
  primary: boolean;
};

export const resolveWorkshopRowActions = (
  item: WorkshopManagerItem,
  t: WorkshopTranslate = fallbackT,
): WorkshopRowAction[] => {
  const subscription = item.subscription;
  if (subscription?.needsUpdate) {
    return [{ action: 'use', label: t('workshop.action.updateAndContinue'), primary: true }];
  }
  if (item.state === 'not-ingested') {
    return [{
      action: 'use',
      label: item.contentKind === 'plugin-package'
        ? t('workshop.action.import')
        : item.contentKind === 'audio-plugin-profile'
          ? t('workshop.action.enableProfile')
          : t('workshop.action.use'),
      primary: true,
    }];
  }
  if (item.state === 'disabled') {
    return [
      ...(subscription?.installed
        ? [{ action: 'ingest' as const, label: t('workshop.action.syncInstalled'), primary: false }]
        : []),
      ...(item.contentKind === 'plugin-package'
        ? [{ action: 'use' as const, label: t('workshop.action.confirmEnable'), primary: true }]
        : [{
            action: 'use' as const,
            label: item.contentKind === 'theme'
              ? t('workshop.action.enableAndSwitch')
              : item.contentKind === 'audio-plugin-profile'
                ? t('workshop.action.enableProfile')
                : t('workshop.action.use'),
            primary: true,
          }]),
    ];
  }
  if (item.state === 'enabled') {
    const canApply = item.catalogReady && (
      item.contentKind === 'theme' ||
      item.contentKind === 'lyrics-style' ||
      item.contentKind === 'dsp-preset' ||
      item.contentKind === 'visualizer-preset'
    );
    return [
      ...(subscription?.installed
        ? [{ action: 'ingest' as const, label: t('workshop.action.syncInstalled'), primary: false }]
        : []),
      ...(canApply && !item.theme?.active
        ? [{
            action: 'apply' as const,
            label: item.contentKind === 'dsp-preset'
              ? t('workshop.action.applyDsp')
              : item.contentKind === 'theme'
                ? t('workshop.action.switchTheme')
                : t('workshop.action.use'),
            primary: true,
          }]
        : []),
      { action: 'disable', label: t('workshop.action.disable'), primary: !canApply && !item.theme?.active },
    ];
  }
  if (item.state === 'quarantined' || item.state === 'error') {
    return [subscription?.installed
      ? { action: 'ingest', label: t('workshop.action.reverify'), primary: true }
      : { action: 'use', label: t('workshop.action.redownload'), primary: true }];
  }
  return [];
};

export const formatWorkshopDownloadProgress = (item: WorkshopManagerItem): number | null => {
  const download = item.subscription?.download;
  if (!download || download.totalBytes === '0') {
    return null;
  }
  const downloaded = Number(download.downloadedBytes);
  const total = Number(download.totalBytes);
  if (!Number.isFinite(downloaded) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round((downloaded / total) * 100)));
};

export const workshopItemSearchText = (item: WorkshopManagerItem): string => [
  item.contentId,
  item.itemId,
  item.contentKind,
  item.contentKind ? `${workshopKindLabels[item.contentKind]} ${fallbackT(workshopKindLabelKey(item.contentKind))} theme lyrics visualizer DSP plugin` : '等待读取内容类型 waiting kind',
  item.state,
  `${workshopStateLabels[item.state]} ${fallbackT(workshopStateLabelKey(item.state))}`,
  item.sourceId,
  item.version,
  item.errorCode,
  item.theme?.title,
  item.theme?.description,
  item.theme?.active ? '当前主题 正在使用' : '',
  item.theme?.uiRuntime ? '自定义 UI HTML CSS JavaScript 注入 沙箱' : '',
  item.audioPluginProfile?.title,
  item.audioPluginProfile?.description,
  item.audioPluginProfile?.plugin.name,
  item.audioPluginProfile?.plugin.vendor,
  item.audioPluginProfile?.plugin.classId,
  item.audioPluginProfile?.role === 'instrument' ? 'VST3i 音源 乐器' : item.audioPluginProfile ? 'VST3 效果器' : '',
  item.subscription?.subscribed ? '已订阅' : '',
  item.subscription?.installed ? '已安装' : '',
  item.subscription?.needsUpdate ? '有更新 下载更新' : '',
  item.subscription?.downloading || item.subscription?.downloadPending ? '下载中 等待下载' : '',
  item.enabled && !item.catalogReady ? '不一致 安全修复' : '',
].filter(Boolean).join(' ');

export const matchesWorkshopQuery = (item: WorkshopManagerItem, query: string): boolean => {
  const trimmed = query.trim();
  return !trimmed || matchesSearchText(trimmed, workshopItemSearchText(item));
};

export type WorkshopStateFilter = 'all' | 'attention' | 'enabled' | 'disabled' | 'issue';

export const workshopStateFilters: { id: WorkshopStateFilter; label: string }[] = [
  { id: 'all', label: '全部状态' },
  { id: 'attention', label: '待处理' },
  { id: 'enabled', label: '已启用' },
  { id: 'disabled', label: '已停用' },
  { id: 'issue', label: '异常' },
];

export const workshopItemKey = (item: WorkshopManagerItem): string => `${item.sourceId}:${item.itemId}`;

export const workshopItemHasIssue = (item: WorkshopManagerItem): boolean =>
  item.state === 'quarantined' || item.state === 'error' || (
    item.contentKind !== 'plugin-package' && item.enabled && !item.catalogReady
  );

export const workshopItemNeedsAttention = (item: WorkshopManagerItem): boolean => {
  const subscription = item.subscription;
  return workshopItemHasIssue(item)
    || item.state === 'not-ingested'
    || item.state === 'downloading'
    || item.state === 'detected'
    || item.state === 'verified'
    || item.state === 'staged'
    || Boolean(subscription?.needsUpdate)
    || Boolean(subscription?.downloading)
    || Boolean(subscription?.downloadPending);
};

export const matchesWorkshopStateFilter = (
  item: WorkshopManagerItem,
  filter: WorkshopStateFilter,
): boolean => {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'enabled') {
    return item.state === 'enabled';
  }
  if (filter === 'disabled') {
    return item.state === 'disabled';
  }
  if (filter === 'issue') {
    return workshopItemHasIssue(item);
  }
  return workshopItemNeedsAttention(item);
};

export const compareWorkshopItems = (left: WorkshopManagerItem, right: WorkshopManagerItem): number => {
  const rank = (item: WorkshopManagerItem): number => {
    if (workshopItemHasIssue(item)) {
      return 0;
    }
    if (item.subscription?.downloading || item.state === 'downloading' || item.subscription?.downloadPending) {
      return 1;
    }
    if (item.subscription?.needsUpdate || item.state === 'not-ingested' || item.state === 'staged') {
      return 2;
    }
    if (item.state === 'disabled') {
      return 3;
    }
    if (item.state === 'enabled') {
      return 4;
    }
    return 5;
  };
  const ranked = rank(left) - rank(right);
  if (ranked !== 0) {
    return ranked;
  }
  return (left.contentId ?? left.itemId).localeCompare(right.contentId ?? right.itemId, 'zh');
};

export const formatWorkshopBytes = (value: string | null | undefined): string | null => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) {
    return null;
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
};

export const workshopActionSuccessCopy: Record<WorkshopItemAction, string> = {
  download: fallbackT('workshop.notice.download'),
  ingest: fallbackT('workshop.notice.done'),
  enable: fallbackT('workshop.notice.done'),
  disable: fallbackT('workshop.notice.disabled'),
  apply: fallbackT('workshop.notice.applied'),
  use: fallbackT('workshop.notice.started'),
  subscribe: fallbackT('workshop.notice.subscribed'),
  unsubscribe: fallbackT('workshop.notice.unsubscribed'),
  'open-in-steam': fallbackT('workshop.notice.openedSteam'),
};

export const describeWorkshopTheme = (
  item: WorkshopManagerItem,
  t: WorkshopTranslate = fallbackT,
): string[] => {
  const theme = item.theme;
  if (!theme) {
    return [];
  }
  const colorMode = theme.colorModes.length === 2
    ? t('workshop.theme.dualMode')
    : theme.colorModes[0] === 'light'
      ? t('workshop.theme.lightMode')
      : t('workshop.theme.darkMode');
  const skin = theme.skin;
  return [
    colorMode,
    theme.uiRuntime ? t('workshop.theme.uiInject') : null,
    skin?.mode === 'shell' ? t('workshop.theme.fullShell') : skin ? t('workshop.theme.skin') : t('workshop.theme.colors'),
    skin ? t('workshop.theme.localAssets', { count: skin.assetCount }) : null,
    skin?.layout.playerStyle === 'hero' ? t('workshop.theme.heroPlayer') : null,
    skin?.layout.sidebarPosition === 'right' ? t('workshop.theme.rightSidebar') : null,
  ].filter((value): value is string => Boolean(value));
};

export const workshopUseDownloadStartedCopy = fallbackT('workshop.notice.downloadContinue');
export const workshopPluginImportedCopy = fallbackT('workshop.notice.pluginImported');
export const workshopSubscribeNextStepCopy = fallbackT('workshop.notice.subscribeNext');

export const formatWorkshopActionNotice = (
  action: WorkshopItemAction,
  item: Pick<WorkshopManagerItem, 'contentId' | 'itemId' | 'contentKind'>,
  reason: string | null,
  t: WorkshopTranslate = fallbackT,
): string => {
  const title = item.contentId ?? `Workshop #${item.itemId}`;
  const titled = (message: string): string => t('workshop.notice.titled', { title, message });
  if (action === 'use' && reason === 'download-started') {
    return titled(t('workshop.notice.downloadContinue'));
  }
  if (action === 'use' && reason === 'dependency-subscriptions-started') {
    return titled(t('workshop.notice.dependencyStarted'));
  }
  if (action === 'use' && item.contentKind === 'plugin-package') {
    return titled(t('workshop.notice.pluginImported'));
  }
  if (action === 'use' && item.contentKind === 'audio-plugin-profile') {
    return titled(t('workshop.notice.profileEnabled'));
  }
  if (action === 'subscribe') {
    return titled(t('workshop.notice.subscribeNext'));
  }
  return titled(workshopActionSuccessCopyFor(action, t));
};

const workshopActionSuccessCopyFor = (action: WorkshopItemAction, t: WorkshopTranslate): string => {
  switch (action) {
    case 'download':
      return t('workshop.notice.download');
    case 'disable':
      return t('workshop.notice.disabled');
    case 'apply':
      return t('workshop.notice.applied');
    case 'use':
      return t('workshop.notice.started');
    case 'subscribe':
      return t('workshop.notice.subscribed');
    case 'unsubscribe':
      return t('workshop.notice.unsubscribed');
    case 'open-in-steam':
      return t('workshop.notice.openedSteam');
    default:
      return t('workshop.notice.done');
  }
};

export const isWorkshopTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};
