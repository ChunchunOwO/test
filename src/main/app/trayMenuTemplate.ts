import type { MenuItemConstructorOptions } from 'electron';
import type { GlobalShortcutAction } from '../../shared/types/globalShortcuts';
import type { SleepTimerAction, SleepTimerStatus } from '../../shared/types/sleepTimer';

export type TrayMenuCallbacks = {
  showMainWindow: () => void;
  hideMainWindow: () => void;
  sendPlaybackCommand: (action: GlobalShortcutAction) => void;
  openAudioSettings: () => void;
  startSleepTimer: (minutes: number, action: SleepTimerAction) => void;
  cancelSleepTimer: () => void;
  quitApp: () => void;
};

export type TrayMenuState = {
  isMainWindowVisible: boolean;
  isUltraLightModeActive: boolean;
  sleepTimer: SleepTimerStatus;
};

const sleepTimerActionLabel: Record<SleepTimerAction, string> = {
  pause: '暂停播放',
  stop: '停止播放',
  quit: '退出 ECHO',
};

/** 格式化毫秒为 MM:SS。 */
export const formatTrayRemainingTime = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const createSleepTimerSubmenu = (
  status: SleepTimerStatus,
  callbacks: TrayMenuCallbacks,
): MenuItemConstructorOptions[] => {
  if (status.isActive) {
    return [
      {
        label: `剩余 ${formatTrayRemainingTime(status.remainingMs)}`,
        enabled: false,
      },
      {
        label: `到期后：${sleepTimerActionLabel[status.action]}`,
        enabled: false,
      },
      { type: 'separator' },
      { label: '取消睡眠定时器', click: callbacks.cancelSleepTimer },
    ];
  }

  const start = (minutes: number, action: SleepTimerAction) => (): void => {
    callbacks.startSleepTimer(minutes, action);
  };

  return [
    { label: '15 分钟后暂停', click: start(15, 'pause') },
    { label: '30 分钟后暂停', click: start(30, 'pause') },
    { label: '60 分钟后暂停', click: start(60, 'pause') },
    { type: 'separator' },
    { label: '30 分钟后停止播放', click: start(30, 'stop') },
    { label: '60 分钟后退出 ECHO', click: start(60, 'quit') },
  ];
};

export const createTrayMenuTemplate = (
  state: TrayMenuState,
  callbacks: TrayMenuCallbacks,
): MenuItemConstructorOptions[] => {
  const command = (action: GlobalShortcutAction) => (): void => {
    callbacks.sendPlaybackCommand(action);
  };
  const mainWindowLabel = state.isUltraLightModeActive
    ? '恢复 ECHO 主界面'
    : state.isMainWindowVisible
      ? '隐藏主界面'
      : '显示主界面';

  return [
    { label: 'ECHO', enabled: false },
    {
      label: mainWindowLabel,
      click: state.isMainWindowVisible && !state.isUltraLightModeActive
        ? callbacks.hideMainWindow
        : callbacks.showMainWindow,
    },
    { type: 'separator' },
    {
      label: '播放控制',
      submenu: [
        { label: '播放 / 暂停', click: command('playPause') },
        { label: '上一首', click: command('previousTrack') },
        { label: '下一首', click: command('nextTrack') },
        { type: 'separator' },
        { label: '后退 10 秒', click: command('seekBackward') },
        { label: '前进 10 秒', click: command('seekForward') },
        { type: 'separator' },
        { label: '喜欢 / 取消喜欢当前歌曲', click: command('toggleCurrentTrackLiked') },
        { label: '打开播放队列', click: command('openPlaybackQueue') },
        { label: '切换随机播放', click: command('toggleShuffle') },
        { label: '切换循环模式', click: command('cycleRepeatMode') },
        { type: 'separator' },
        { label: '停止播放', click: command('stop') },
      ],
    },
    {
      label: '音量与声音',
      submenu: [
        { label: '提高音量', click: command('volumeUp') },
        { label: '降低音量', click: command('volumeDown') },
        { label: '静音 / 取消静音', click: command('toggleMute') },
        { type: 'separator' },
        { label: '音频设置', click: callbacks.openAudioSettings },
      ],
    },
    {
      label: '快捷功能',
      submenu: [
        { label: '打开 / 关闭迷你播放器', click: command('toggleMiniPlayer') },
        { label: '显示 / 隐藏 ECHO 宠物', click: command('togglePet') },
        { label: '显示 / 隐藏桌面歌词', click: command('toggleDesktopLyrics') },
        { type: 'separator' },
        { label: '定位当前歌曲', click: command('locateCurrentTrack') },
        { label: '打开搜索', click: command('openSearch') },
      ],
    },
    {
      label: state.sleepTimer.isActive
        ? `睡眠定时器 · ${formatTrayRemainingTime(state.sleepTimer.remainingMs)}`
        : '睡眠定时器',
      submenu: createSleepTimerSubmenu(state.sleepTimer, callbacks),
    },
    { type: 'separator' },
    { label: '退出 ECHO', click: callbacks.quitApp },
  ];
};
