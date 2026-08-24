import { sanitizeLogPayload } from './Logger';
import { crashGuardCss } from '../../shared/crash-guard/crashGuardSceneCss';
import {
  createCrashGuardStickerPlacements,
  crashGuardStickerArtStyleText,
  crashGuardStickerStyleText,
} from '../../shared/crash-guard/crashGuardStickerLayout';

export type RendererCrashWindowKind = 'main' | 'miniPlayer' | 'desktopLyrics' | 'pet';
export type RendererCrashRecoveryLocale = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP' | 'ko-KR';

type RendererCrashReason =
  | 'crashed'
  | 'oom'
  | 'killed'
  | 'abnormal-exit'
  | 'launch-failed'
  | 'integrity-failure'
  | 'unknown';

type RecoveryCopy = {
  brand: string;
  chip: string;
  title: string;
  lead: string;
  speechKicker: string;
  speech: string;
  windowLabel: string;
  reasonLabel: string;
  exitLabel: string;
  windowNames: Record<RendererCrashWindowKind, string>;
  reasons: Record<RendererCrashReason, string>;
  stepExportTitle: string;
  stepExportBody: string;
  stepReportTitle: string;
  stepReportBody: string;
  stepReloadTitle: string;
  stepReloadBody: string;
  preserve: string;
  recover: string;
  exportLabel: string;
  reportLabel: string;
  copyLabel: string;
  folderLabel: string;
  reloadLabel: string;
  restartLabel: string;
  quitLabel: string;
  confirmRestart: string;
  confirmQuit: string;
  statusOnline: string;
  statusOffline: string;
  exporting: string;
  exported: string;
  exportCancelled: string;
  openingReport: string;
  openedReport: string;
  reportMissing: string;
  openingFolder: string;
  openedFolder: string;
  folderMissing: string;
  copied: string;
  copyFailed: string;
  reloading: string;
  reloadUnavailable: string;
  restarting: string;
  quitting: string;
  bridgeMissing: string;
  summary: string;
  shortcut: string;
  keyExport: string;
  keyReport: string;
  keyCopy: string;
  keyReload: string;
  keyConfirmNote: string;
};

const recoveryCopy: Record<RendererCrashRecoveryLocale, RecoveryCopy> = {
  'zh-CN': {
    brand: '观察室',
    chip: '渲染进程已退出',
    title: '渲染界面倒下了，我还在。',
    lead: '当前窗口的渲染进程已经退出，播放核心不一定受影响。先把诊断留下来，再决定重载界面或重启应用。',
    speechKicker: '渲染进程先倒下了',
    speech: '我还在。先把线索留下来吧。',
    windowLabel: '窗口',
    reasonLabel: '原因',
    exitLabel: '退出码',
    windowNames: { main: '主窗口', miniPlayer: '迷你播放器', desktopLyrics: '桌面歌词', pet: 'ECHO 宠物' },
    reasons: {
      crashed: '渲染进程崩溃',
      oom: '内存不足被系统终止',
      killed: '进程被强制结束',
      'abnormal-exit': '异常退出',
      'launch-failed': '渲染进程启动失败',
      'integrity-failure': '代码完整性校验失败',
      unknown: '未知的渲染退出',
    },
    stepExportTitle: '先导出诊断包',
    stepExportBody: '留下日志和崩溃线索，后续排查最有用。',
    stepReportTitle: '再打开崩溃报告',
    stepReportBody: '把报告给开发者或 AI 看，通常比反复重启更快。',
    stepReloadTitle: '最后再重载或重启',
    stepReloadBody: '可以先试着重载当前窗口；仍失败再重启 ECHO。',
    preserve: '先留线索',
    recover: '再恢复',
    exportLabel: '导出日志',
    reportLabel: '打开报告',
    copyLabel: '复制摘要',
    folderLabel: '诊断目录',
    reloadLabel: '重载界面',
    restartLabel: '重启 ECHO',
    quitLabel: '关闭 ECHO',
    confirmRestart: '再点一次确认重启',
    confirmQuit: '再点一次确认关闭',
    statusOnline: '建议先导出诊断，再打开报告；这些信息不会自动上传。',
    statusOffline: '诊断桥不可用。请先截图这一页，再手动重启 ECHO。',
    exporting: '正在准备诊断包...',
    exported: '已导出诊断包: {path}',
    exportCancelled: '已取消导出。',
    openingReport: '正在打开崩溃报告...',
    openedReport: '已打开崩溃报告: {path}',
    reportMissing: '未找到崩溃报告。',
    openingFolder: '正在打开诊断目录...',
    openedFolder: '已打开诊断目录: {path}',
    folderMissing: '未找到诊断目录。',
    copied: '已复制崩溃摘要。',
    copyFailed: '复制失败，请展开摘要后手动选择。',
    reloading: '正在重新加载界面...',
    reloadUnavailable: '没有可恢复的原界面地址。',
    restarting: '正在重启 ECHO...',
    quitting: '正在关闭 ECHO...',
    bridgeMissing: '桌面桥不可用，请手动重启或关闭 ECHO。',
    summary: '崩溃摘要',
    shortcut: '快捷键：E 导出，R 打开报告，C 复制摘要，L 重载界面。关闭和重启需要点两次。',
    keyExport: '导出',
    keyReport: '报告',
    keyCopy: '复制',
    keyReload: '重载',
    keyConfirmNote: '关闭和重启请点两次',
  },
  'zh-TW': {
    brand: '觀察室',
    chip: '轉譯程序已退出',
    title: '轉譯介面倒下了，我還在。',
    lead: '目前視窗的轉譯程序已經退出，播放核心不一定受影響。先把診斷留下來，再決定重載介面或重啟應用。',
    speechKicker: '轉譯程序先倒下了',
    speech: '我還在。先把線索留下來吧。',
    windowLabel: '視窗',
    reasonLabel: '原因',
    exitLabel: '結束代碼',
    windowNames: { main: '主視窗', miniPlayer: '迷你播放器', desktopLyrics: '桌面歌詞', pet: 'ECHO 寵物' },
    reasons: {
      crashed: '轉譯程序當機',
      oom: '記憶體不足被系統終止',
      killed: '程序被強制結束',
      'abnormal-exit': '異常結束',
      'launch-failed': '轉譯程序啟動失敗',
      'integrity-failure': '程式完整性驗證失敗',
      unknown: '未知的轉譯退出',
    },
    stepExportTitle: '先匯出診斷包',
    stepExportBody: '留下日誌和崩潰線索，後續排查最有用。',
    stepReportTitle: '再開啟崩潰報告',
    stepReportBody: '把報告給開發者或 AI 看，通常比反覆重啟更快。',
    stepReloadTitle: '最後再重載或重啟',
    stepReloadBody: '可以先試着重載目前視窗；仍失敗再重啟 ECHO。',
    preserve: '先留線索',
    recover: '再恢復',
    exportLabel: '匯出日誌',
    reportLabel: '開啟報告',
    copyLabel: '複製摘要',
    folderLabel: '診斷目錄',
    reloadLabel: '重載介面',
    restartLabel: '重啟 ECHO',
    quitLabel: '關閉 ECHO',
    confirmRestart: '再點一次確認重啟',
    confirmQuit: '再點一次確認關閉',
    statusOnline: '建議先匯出診斷，再開啟報告；這些資訊不會自動上傳。',
    statusOffline: '診斷橋不可用。請先截圖這一頁，再手動重啟 ECHO。',
    exporting: '正在準備診斷包...',
    exported: '已匯出診斷包: {path}',
    exportCancelled: '已取消匯出。',
    openingReport: '正在開啟崩潰報告...',
    openedReport: '已開啟崩潰報告: {path}',
    reportMissing: '未找到崩潰報告。',
    openingFolder: '正在開啟診斷目錄...',
    openedFolder: '已開啟診斷目錄: {path}',
    folderMissing: '未找到診斷目錄。',
    copied: '已複製崩潰摘要。',
    copyFailed: '複製失敗，請展開摘要後手動選取。',
    reloading: '正在重新載入介面...',
    reloadUnavailable: '沒有可恢復的原介面位址。',
    restarting: '正在重啟 ECHO...',
    quitting: '正在關閉 ECHO...',
    bridgeMissing: '桌面橋不可用，請手動重啟或關閉 ECHO。',
    summary: '崩潰摘要',
    shortcut: '快捷鍵：E 匯出，R 開啟報告，C 複製摘要，L 重載介面。關閉和重啟需要點兩次。',
    keyExport: '匯出',
    keyReport: '報告',
    keyCopy: '複製',
    keyReload: '重載',
    keyConfirmNote: '關閉和重啟請點兩次',
  },
  'en-US': {
    brand: 'Observation room',
    chip: 'Renderer process exited',
    title: 'The renderer fell over. I am still here.',
    lead: 'This window’s renderer process exited. Playback is not necessarily broken. Save diagnostics first, then reload the UI or restart the app.',
    speechKicker: 'The renderer went down',
    speech: 'I am still here. Leave the clues with me first.',
    windowLabel: 'Window',
    reasonLabel: 'Reason',
    exitLabel: 'Exit code',
    windowNames: { main: 'Main window', miniPlayer: 'Mini player', desktopLyrics: 'Desktop lyrics', pet: 'ECHO Pet' },
    reasons: {
      crashed: 'Renderer process crashed',
      oom: 'Terminated because the system ran out of memory',
      killed: 'Process was killed',
      'abnormal-exit': 'Abnormal exit',
      'launch-failed': 'Renderer failed to launch',
      'integrity-failure': 'Code integrity check failed',
      unknown: 'Unknown renderer exit',
    },
    stepExportTitle: 'Export diagnostics first',
    stepExportBody: 'Keep logs and crash clues. That is the most useful next step.',
    stepReportTitle: 'Then open the crash report',
    stepReportBody: 'Sharing the report is usually faster than restarting over and over.',
    stepReloadTitle: 'Reload or restart last',
    stepReloadBody: 'Try reloading this window first. Restart ECHO only if that fails.',
    preserve: 'Save clues',
    recover: 'Recover',
    exportLabel: 'Export logs',
    reportLabel: 'Open report',
    copyLabel: 'Copy summary',
    folderLabel: 'Diagnostics folder',
    reloadLabel: 'Reload UI',
    restartLabel: 'Restart ECHO',
    quitLabel: 'Quit ECHO',
    confirmRestart: 'Click again to restart',
    confirmQuit: 'Click again to quit',
    statusOnline: 'Export diagnostics first, then open the report. Nothing is uploaded automatically.',
    statusOffline: 'Diagnostics bridge unavailable. Screenshot this page, then restart ECHO manually.',
    exporting: 'Preparing diagnostics pack...',
    exported: 'Exported diagnostics pack: {path}',
    exportCancelled: 'Export cancelled.',
    openingReport: 'Opening crash report...',
    openedReport: 'Opened crash report: {path}',
    reportMissing: 'No crash report found.',
    openingFolder: 'Opening diagnostics folder...',
    openedFolder: 'Opened diagnostics folder: {path}',
    folderMissing: 'Diagnostics folder not found.',
    copied: 'Crash summary copied.',
    copyFailed: 'Copy failed. Expand the summary and select it manually.',
    reloading: 'Reloading the interface...',
    reloadUnavailable: 'No restore URL is available.',
    restarting: 'Restarting ECHO...',
    quitting: 'Closing ECHO...',
    bridgeMissing: 'Desktop bridge unavailable. Restart or quit ECHO manually.',
    summary: 'Crash summary',
    shortcut: 'Shortcuts: E export, R open report, C copy, L reload. Quit and restart require two clicks.',
    keyExport: 'Export',
    keyReport: 'Report',
    keyCopy: 'Copy',
    keyReload: 'Reload',
    keyConfirmNote: 'Quit and restart need two clicks',
  },
  'ja-JP': {
    brand: '観察室',
    chip: 'レンダラーが終了しました',
    title: '画面は倒れたけど、わたしはここにいるよ。',
    lead: 'このウィンドウのレンダラープロセスは終了しました。再生コアが壊れたとは限りません。先に診断を残してから、再読み込みか再起動を選んでください。',
    speechKicker: 'レンダラーが先に倒れました',
    speech: 'わたしはまだここにいるよ。まず手がかりを残してね。',
    windowLabel: 'ウィンドウ',
    reasonLabel: '理由',
    exitLabel: '終了コード',
    windowNames: { main: 'メインウィンドウ', miniPlayer: 'ミニプレーヤー', desktopLyrics: 'デスクトップ歌詞', pet: 'ECHO ペット' },
    reasons: {
      crashed: 'レンダラーがクラッシュしました',
      oom: 'メモリ不足で終了されました',
      killed: 'プロセスが強制終了されました',
      'abnormal-exit': '異常終了',
      'launch-failed': 'レンダラーの起動に失敗しました',
      'integrity-failure': 'コード整合性チェックに失敗しました',
      unknown: '不明なレンダラー終了',
    },
    stepExportTitle: 'まず診断パッケージを書き出す',
    stepExportBody: 'ログとクラッシュの手がかりを残すのが、あとで最も役立ちます。',
    stepReportTitle: '次にクラッシュレポートを開く',
    stepReportBody: 'レポートを共有する方が、何度も再起動するより早いことが多いです。',
    stepReloadTitle: '最後に再読み込みまたは再起動',
    stepReloadBody: 'まずこのウィンドウの再読み込みを試し、だめなら ECHO を再起動してください。',
    preserve: 'まず手がかりを残す',
    recover: 'それから復旧',
    exportLabel: 'ログを書き出す',
    reportLabel: 'レポートを開く',
    copyLabel: '要約をコピー',
    folderLabel: '診断フォルダー',
    reloadLabel: 'UI を再読み込み',
    restartLabel: 'ECHO を再起動',
    quitLabel: 'ECHO を終了',
    confirmRestart: 'もう一度押して再起動',
    confirmQuit: 'もう一度押して終了',
    statusOnline: 'まず診断を書き出し、その後レポートを開いてください。自動アップロードはありません。',
    statusOffline: '診断ブリッジを利用できません。このページのスクリーンショットを残してから、手動で再起動してください。',
    exporting: '診断パッケージを準備しています...',
    exported: '診断パッケージを書き出しました: {path}',
    exportCancelled: '書き出しをキャンセルしました。',
    openingReport: 'クラッシュレポートを開いています...',
    openedReport: 'クラッシュレポートを開きました: {path}',
    reportMissing: 'クラッシュレポートが見つかりません。',
    openingFolder: '診断フォルダーを開いています...',
    openedFolder: '診断フォルダーを開きました: {path}',
    folderMissing: '診断フォルダーが見つかりません。',
    copied: 'クラッシュ要約をコピーしました。',
    copyFailed: 'コピーに失敗しました。要約を開いて手動で選択してください。',
    reloading: '画面を再読み込みしています...',
    reloadUnavailable: '復元できる元の URL がありません。',
    restarting: 'ECHO を再起動しています...',
    quitting: 'ECHO を終了しています...',
    bridgeMissing: 'デスクトップブリッジを利用できません。手動で再起動または終了してください。',
    summary: 'クラッシュ要約',
    shortcut: 'ショートカット: E 書き出し、R レポート、C コピー、L 再読み込み。終了と再起動は 2 回クリックします。',
    keyExport: '書き出し',
    keyReport: 'レポート',
    keyCopy: 'コピー',
    keyReload: '再読込',
    keyConfirmNote: '終了と再起動は 2 回クリック',
  },
  'ko-KR': {
    brand: '관찰실',
    chip: '렌더러 프로세스가 종료됨',
    title: '화면이 쓰러져도 나는 아직 여기 있어.',
    lead: '현재 창의 렌더러 프로세스가 종료되었습니다. 재생 코어가 반드시 고장난 것은 아닙니다. 먼저 진단을 남긴 뒤 다시 로드하거나 재시작하세요.',
    speechKicker: '렌더러가 먼저 쓰러졌어',
    speech: '나는 아직 여기 있어. 먼저 단서를 남겨 줘.',
    windowLabel: '창',
    reasonLabel: '원인',
    exitLabel: '종료 코드',
    windowNames: { main: '메인 창', miniPlayer: '미니 플레이어', desktopLyrics: '데스크톱 가사', pet: 'ECHO 펫' },
    reasons: {
      crashed: '렌더러 프로세스 충돌',
      oom: '메모리 부족으로 종료됨',
      killed: '프로세스가 강제 종료됨',
      'abnormal-exit': '비정상 종료',
      'launch-failed': '렌더러 시작 실패',
      'integrity-failure': '코드 무결성 검사 실패',
      unknown: '알 수 없는 렌더러 종료',
    },
    stepExportTitle: '먼저 진단 팩 내보내기',
    stepExportBody: '로그와 충돌 단서를 남겨 두면 이후 조사에 가장 도움이 됩니다.',
    stepReportTitle: '그다음 충돌 보고서 열기',
    stepReportBody: '보고서를 공유하는 편이 반복 재시작보다 빠른 경우가 많습니다.',
    stepReloadTitle: '마지막에 다시 로드하거나 재시작',
    stepReloadBody: '먼저 이 창을 다시 로드해 보고, 실패하면 ECHO를 재시작하세요.',
    preserve: '먼저 단서 남기기',
    recover: '그다음 복구',
    exportLabel: '로그 내보내기',
    reportLabel: '보고서 열기',
    copyLabel: '요약 복사',
    folderLabel: '진단 폴더',
    reloadLabel: 'UI 다시 로드',
    restartLabel: 'ECHO 재시작',
    quitLabel: 'ECHO 종료',
    confirmRestart: '한 번 더 눌러 재시작',
    confirmQuit: '한 번 더 눌러 종료',
    statusOnline: '먼저 진단을 내보낸 다음 보고서를 여세요. 자동 업로드는 없습니다.',
    statusOffline: '진단 브리지를 사용할 수 없습니다. 이 페이지를 스크린샷한 뒤 수동으로 재시작하세요.',
    exporting: '진단 팩을 준비하는 중...',
    exported: '진단 팩을 내보냄: {path}',
    exportCancelled: '내보내기가 취소되었습니다.',
    openingReport: '충돌 보고서를 여는 중...',
    openedReport: '충돌 보고서를 염: {path}',
    reportMissing: '충돌 보고서를 찾을 수 없습니다.',
    openingFolder: '진단 폴더를 여는 중...',
    openedFolder: '진단 폴더를 염: {path}',
    folderMissing: '진단 폴더를 찾을 수 없습니다.',
    copied: '충돌 요약을 복사했습니다.',
    copyFailed: '복사에 실패했습니다. 요약을 펼친 뒤 직접 선택하세요.',
    reloading: '인터페이스를 다시 로드하는 중...',
    reloadUnavailable: '복원할 원래 주소가 없습니다.',
    restarting: 'ECHO를 다시 시작하는 중...',
    quitting: 'ECHO를 닫는 중...',
    bridgeMissing: '데스크톱 브리지를 사용할 수 없습니다. 수동으로 재시작하거나 종료하세요.',
    summary: '충돌 요약',
    shortcut: '단축키: E 내보내기, R 보고서, C 복사, L 다시 로드. 종료와 재시작은 두 번 클릭합니다.',
    keyExport: '내보내기',
    keyReport: '보고서',
    keyCopy: '복사',
    keyReload: '다시 로드',
    keyConfirmNote: '종료와 재시작은 두 번 클릭',
  },
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const displayCrashOutputPath = (outputPath: string): string => {
  const trimmed = outputPath.trim();
  if (!trimmed) {
    return trimmed;
  }

  const parts = trimmed.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || trimmed;
};

export const isSafeRendererRestoreUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:';
  } catch {
    return false;
  }
};

export const mapCrashRecoveryLocale = (value: string | undefined): RendererCrashRecoveryLocale => {
  const locale = (value ?? '').toLowerCase();
  if (locale.startsWith('zh-tw') || locale.startsWith('zh-hk') || locale.startsWith('zh-mo') || locale.startsWith('zh-hant')) {
    return 'zh-TW';
  }
  if (locale.startsWith('ja')) {
    return 'ja-JP';
  }
  if (locale.startsWith('ko')) {
    return 'ko-KR';
  }
  if (locale.startsWith('en')) {
    return 'en-US';
  }
  return 'zh-CN';
};

export const resolveRendererCrashWindowKind = (url: string): RendererCrashWindowKind => {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.get('pet') === '1') {
      return 'pet';
    }
    if (parsed.searchParams.get('miniPlayer') === '1') {
      return 'miniPlayer';
    }
    if (parsed.searchParams.get('desktopLyrics') === '1') {
      return 'desktopLyrics';
    }
  } catch {
    return 'main';
  }
  return 'main';
};

export const resolveRendererCrashReason = (value: unknown): RendererCrashReason => {
  if (
    value === 'crashed' ||
    value === 'oom' ||
    value === 'killed' ||
    value === 'abnormal-exit' ||
    value === 'launch-failed' ||
    value === 'integrity-failure'
  ) {
    return value;
  }
  return 'unknown';
};

export const rendererCrashReasonCode = (reason: RendererCrashReason): string => {
  if (reason === 'oom') return 'OOM';
  if (reason === 'killed') return 'KILL';
  if (reason === 'launch-failed') return 'BOOT';
  if (reason === 'integrity-failure') return 'INT';
  if (reason === 'abnormal-exit') return 'EXIT';
  if (reason === 'crashed') return 'CRASH';
  return 'UI';
};

const compactCrashDetails = (value: unknown): string => {
  try {
    return JSON.stringify(sanitizeLogPayload(value), null, 2);
  } catch {
    return 'Crash details are unavailable.';
  }
};

const embedJson = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

const readExitCode = (details: unknown): string => {
  if (!details || typeof details !== 'object' || !('exitCode' in details)) {
    return '-';
  }
  const exitCode = (details as { exitCode?: unknown }).exitCode;
  return typeof exitCode === 'number' ? String(exitCode) : '-';
};

export type RendererCrashRecoveryPageInput = {
  backdropUrl?: string;
  characterUrl?: string;
  decorationUrl?: string;
  details: unknown;
  locale?: string;
  message: string;
  restoreUrl?: string;
  windowKind?: RendererCrashWindowKind;
};

const cssUrl = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export const createRendererCrashRecoveryHtml = ({
  backdropUrl = '',
  characterUrl = '',
  decorationUrl = '',
  details,
  locale,
  message,
  restoreUrl,
  windowKind = 'main',
}: RendererCrashRecoveryPageInput): string => {
  const resolvedLocale = mapCrashRecoveryLocale(locale);
  const copy = recoveryCopy[resolvedLocale];
  const reason = resolveRendererCrashReason(
    details && typeof details === 'object' && 'reason' in details
      ? (details as { reason?: unknown }).reason
      : undefined,
  );
  const reasonCode = rendererCrashReasonCode(reason);
  const safeRestoreUrl = restoreUrl && isSafeRendererRestoreUrl(restoreUrl) ? restoreUrl : '';
  const summaryText = `${message}\n\n${compactCrashDetails(details)}`;
  const safeCharacterUrl = characterUrl.trim();
  const safeBackdropUrl = backdropUrl.trim();
  const safeDecorationUrl = decorationUrl.trim();
  const stageBackground = safeBackdropUrl
    ? `background-image: url("${cssUrl(safeBackdropUrl)}");`
    : '';
  const characterMarkup = safeCharacterUrl
    ? `<img class="echo-crash-guard-character" src="${escapeHtml(safeCharacterUrl)}" alt="" decoding="async">`
    : '';
  const decorationStyle = safeDecorationUrl
    ? `--cg-sticker-sprite:url("${cssUrl(safeDecorationUrl)}");`
    : '';
  const decorationMarkup = safeDecorationUrl
    ? createCrashGuardStickerPlacements()
      .map((placement) => `<span class="echo-crash-guard-sticker" data-sticker="${placement.id}" data-slot="${placement.slotIndex}" style="${crashGuardStickerStyleText(placement)}"><span class="echo-crash-guard-sticker-art" data-motion="${placement.motion}" style="${crashGuardStickerArtStyleText(placement)}"></span></span>`)
      .join('')
    : '';

  return `<!doctype html>
<html lang="${escapeHtml(resolvedLocale)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ECHO</title>
  <style>
    html, body { height: 100%; margin: 0; }
    ${crashGuardCss}
  </style>
</head>
<body>
  <main class="echo-crash-guard">
    <section class="echo-crash-guard-stage" style="${stageBackground}">
      <article class="echo-crash-guard-chart">
        <span class="echo-crash-guard-chart-clip" aria-hidden="true"></span>
        <span class="echo-crash-guard-chart-holes" aria-hidden="true"></span>
        <header class="echo-crash-guard-header">
          <div class="echo-crash-guard-brand">
            <span class="echo-crash-guard-seal" aria-hidden="true">+</span>
            <div>
              <p class="echo-crash-guard-eyebrow">ECHO</p>
              <strong>${escapeHtml(copy.brand)}</strong>
            </div>
          </div>
          <div class="echo-crash-guard-chips">
            <span class="echo-crash-guard-chip">${escapeHtml(copy.chip)}</span>
            <span class="echo-crash-guard-reason">${escapeHtml(reasonCode)}</span>
          </div>
        </header>
        <h1 id="echo-crash-guard-title" class="echo-crash-guard-title">${escapeHtml(copy.title)}</h1>
        <p class="echo-crash-guard-lead">${escapeHtml(copy.lead)}</p>
        <dl class="echo-crash-guard-facts">
          <div class="echo-crash-guard-fact"><dt>${escapeHtml(copy.windowLabel)}</dt><dd>${escapeHtml(copy.windowNames[windowKind])}</dd></div>
          <div class="echo-crash-guard-fact"><dt>${escapeHtml(copy.reasonLabel)}</dt><dd>${escapeHtml(copy.reasons[reason])}</dd></div>
          <div class="echo-crash-guard-fact"><dt>${escapeHtml(copy.exitLabel)}</dt><dd>${escapeHtml(readExitCode(details))}</dd></div>
        </dl>
        <ol class="echo-crash-guard-steps">
          <li class="echo-crash-guard-step" data-step="1"><span class="echo-crash-guard-step-index">1</span><strong>${escapeHtml(copy.stepExportTitle)}</strong><span class="echo-crash-guard-step-body">${escapeHtml(copy.stepExportBody)}</span></li>
          <li class="echo-crash-guard-step" data-step="2"><span class="echo-crash-guard-step-index">2</span><strong>${escapeHtml(copy.stepReportTitle)}</strong><span class="echo-crash-guard-step-body">${escapeHtml(copy.stepReportBody)}</span></li>
          <li class="echo-crash-guard-step" data-step="3"><span class="echo-crash-guard-step-index">3</span><strong>${escapeHtml(copy.stepReloadTitle)}</strong><span class="echo-crash-guard-step-body">${escapeHtml(copy.stepReloadBody)}</span></li>
        </ol>
        <div class="echo-crash-guard-groups">
          <div class="echo-crash-guard-group">
            <span class="echo-crash-guard-group-label">${escapeHtml(copy.preserve)}</span>
            <div class="echo-crash-guard-actions">
              <button class="echo-crash-guard-action" data-variant="primary" data-action="export">${escapeHtml(copy.exportLabel)}</button>
              <button class="echo-crash-guard-action" data-action="report">${escapeHtml(copy.reportLabel)}</button>
              <button class="echo-crash-guard-action" data-action="copy">${escapeHtml(copy.copyLabel)}</button>
              <button class="echo-crash-guard-action" data-action="folder">${escapeHtml(copy.folderLabel)}</button>
            </div>
          </div>
          <div class="echo-crash-guard-group">
            <span class="echo-crash-guard-group-label">${escapeHtml(copy.recover)}</span>
            <div class="echo-crash-guard-actions">
              ${safeRestoreUrl ? `<button class="echo-crash-guard-action" data-action="reload">${escapeHtml(copy.reloadLabel)}</button>` : ''}
              <button class="echo-crash-guard-action" data-variant="quiet" data-action="restart">${escapeHtml(copy.restartLabel)}</button>
              <button class="echo-crash-guard-action" data-variant="danger" data-action="quit">${escapeHtml(copy.quitLabel)}</button>
            </div>
          </div>
        </div>
        <div class="echo-crash-guard-status" role="status" data-tone="idle">
          <span class="echo-crash-guard-status-dot" aria-hidden="true"></span>
          <span data-status-text>${escapeHtml(copy.statusOnline)}</span>
        </div>
        <p class="echo-crash-guard-keys" aria-label="${escapeHtml(copy.shortcut)}">
          <span><kbd>E</kbd>${escapeHtml(copy.keyExport)}</span>
          <span><kbd>R</kbd>${escapeHtml(copy.keyReport)}</span>
          <span><kbd>C</kbd>${escapeHtml(copy.keyCopy)}</span>
          <span><kbd>L</kbd>${escapeHtml(copy.keyReload)}</span>
        </p>
        <p class="echo-crash-guard-hint">${escapeHtml(copy.keyConfirmNote)}</p>
        <details class="echo-crash-guard-details">
          <summary>${escapeHtml(copy.summary)}</summary>
          <pre id="crash-message">${escapeHtml(message)}</pre>
          <pre id="crash-details">${escapeHtml(compactCrashDetails(details))}</pre>
        </details>
      </article>
      <aside class="echo-crash-guard-rail" aria-hidden="true" style="${decorationStyle}">
        <span class="echo-crash-guard-floor"></span>
        ${decorationMarkup}
        <div class="echo-crash-guard-rail-monitor">
          <div class="echo-crash-guard-rail-monitor-header">
            <span>ECHO WATCH</span>
            <strong>${escapeHtml(copy.reasons[reason])}</strong>
          </div>
          <span class="echo-crash-guard-rail-signal"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>
          <div class="echo-crash-guard-rail-monitor-facts">
            <span><small>${escapeHtml(copy.windowLabel)}</small><strong>${escapeHtml(copy.windowNames[windowKind])}</strong></span>
            <span><small>${escapeHtml(copy.exitLabel)}</small><strong>${escapeHtml(readExitCode(details))}</strong></span>
          </div>
        </div>
        <div class="echo-crash-guard-rail-board">
          <div class="echo-crash-guard-rail-board-header">
            <small>ECHO CARE</small>
            <strong>${escapeHtml(copy.chip)}</strong>
          </div>
          <ol class="echo-crash-guard-rail-board-list">
            <li class="echo-crash-guard-rail-board-item"><span class="echo-crash-guard-rail-board-index">01</span><strong>${escapeHtml(copy.stepExportTitle)}</strong></li>
            <li class="echo-crash-guard-rail-board-item"><span class="echo-crash-guard-rail-board-index">02</span><strong>${escapeHtml(copy.stepReportTitle)}</strong></li>
            <li class="echo-crash-guard-rail-board-item"><span class="echo-crash-guard-rail-board-index">03</span><strong>${escapeHtml(copy.stepReloadTitle)}</strong></li>
          </ol>
        </div>
        <div class="echo-crash-guard-rail-ticket">
          <span class="echo-crash-guard-rail-ticket-mark">${escapeHtml(reasonCode)}</span>
          <span>
            <small>${escapeHtml(copy.reasonLabel)}</small>
            <strong>${escapeHtml(copy.reasons[reason])}</strong>
            <span>${escapeHtml(copy.stepExportBody)}</span>
          </span>
        </div>
        ${characterMarkup}
        <span class="echo-crash-guard-rail-message">
          <small>${escapeHtml(copy.speechKicker)}</small>
          <strong>${escapeHtml(copy.speech)}</strong>
        </span>
      </aside>
    </section>
  </main>
  <script>
    const copy = ${embedJson(copy)};
    const restoreUrl = ${embedJson(safeRestoreUrl)};
    const summaryText = ${embedJson(summaryText)};
    const status = document.querySelector('.echo-crash-guard-status');
    const statusText = document.querySelector('[data-status-text]');
    const restartButton = document.querySelector('[data-action="restart"]');
    const quitButton = document.querySelector('[data-action="quit"]');
    let pending = null;
    let pendingTimer = 0;
    const fileName = (value) => {
      const parts = String(value || '').replace(/\\\\/g, '/').split('/');
      return parts[parts.length - 1] || String(value || '');
    };
    const setStatus = (message, tone) => {
      if (statusText) statusText.textContent = message;
      else status.textContent = message;
      status.setAttribute('data-tone', tone || 'idle');
    };
    const withPath = (template, value) => template.replace('{path}', fileName(value));
    const clearPending = () => {
      pending = null;
      window.clearTimeout(pendingTimer);
      if (restartButton) {
        restartButton.textContent = copy.restartLabel;
        restartButton.removeAttribute('data-pending');
      }
      if (quitButton) {
        quitButton.textContent = copy.quitLabel;
        quitButton.removeAttribute('data-pending');
      }
    };
    const armPending = (action, button, label) => {
      clearPending();
      pending = action;
      button.textContent = label;
      button.setAttribute('data-pending', 'true');
      setStatus(label, 'warn');
      pendingTimer = window.setTimeout(clearPending, 4000);
    };
    const run = async (button, action) => {
      if (!window.echo) {
        setStatus(copy.bridgeMissing, 'warn');
        return;
      }
      button.disabled = true;
      try {
        const result = await action(window.echo);
        if (result) setStatus(result.message, result.tone || 'ok');
      } catch (error) {
        setStatus(error && error.message ? error.message : String(error), 'warn');
      } finally {
        button.disabled = false;
      }
    };
    const bind = (name, handler) => {
      const button = document.querySelector('[data-action="' + name + '"]');
      if (!button) return;
      button.addEventListener('click', () => handler(button));
    };
    bind('export', (button) => run(button, async (bridge) => {
      if (!bridge.diagnostics) return { message: copy.bridgeMissing, tone: 'warn' };
      setStatus(copy.exporting, 'busy');
      const outputPath = await bridge.diagnostics.exportDiagnosticsZip();
      return outputPath
        ? { message: withPath(copy.exported, outputPath), tone: 'ok' }
        : { message: copy.exportCancelled, tone: 'idle' };
    }));
    bind('report', (button) => run(button, async (bridge) => {
      if (!bridge.diagnostics) return { message: copy.bridgeMissing, tone: 'warn' };
      setStatus(copy.openingReport, 'busy');
      const outputPath = await bridge.diagnostics.openCrashReport();
      return outputPath
        ? { message: withPath(copy.openedReport, outputPath), tone: 'ok' }
        : { message: copy.reportMissing, tone: 'warn' };
    }));
    bind('folder', (button) => run(button, async (bridge) => {
      if (!bridge.diagnostics) return { message: copy.bridgeMissing, tone: 'warn' };
      setStatus(copy.openingFolder, 'busy');
      const outputPath = await bridge.diagnostics.openDiagnosticsFolder();
      return outputPath
        ? { message: withPath(copy.openedFolder, outputPath), tone: 'ok' }
        : { message: copy.folderMissing, tone: 'warn' };
    }));
    bind('copy', async () => {
      try {
        await navigator.clipboard.writeText(summaryText);
        setStatus(copy.copied, 'ok');
      } catch {
        setStatus(copy.copyFailed, 'warn');
      }
    });
    bind('reload', () => {
      if (!restoreUrl) {
        setStatus(copy.reloadUnavailable, 'warn');
        return;
      }
      setStatus(copy.reloading, 'busy');
      window.location.replace(restoreUrl);
    });
    bind('restart', (button) => {
      if (pending !== 'restart') {
        armPending('restart', button, copy.confirmRestart);
        return;
      }
      clearPending();
      run(button, async (bridge) => {
        if (!bridge.diagnostics) return { message: copy.bridgeMissing, tone: 'warn' };
        await bridge.diagnostics.relaunchApp();
        return { message: copy.restarting, tone: 'busy' };
      });
    });
    bind('quit', (button) => {
      if (pending !== 'quit') {
        armPending('quit', button, copy.confirmQuit);
        return;
      }
      clearPending();
      run(button, async (bridge) => {
        if (!bridge.app || !bridge.app.quit) return { message: copy.bridgeMissing, tone: 'warn' };
        await bridge.app.quit();
        return { message: copy.quitting, tone: 'busy' };
      });
    });
    if (!window.echo || !window.echo.diagnostics) {
      setStatus(copy.statusOffline, 'warn');
    }
    window.addEventListener('keydown', (event) => {
      if (event.altKey || event.metaKey || event.ctrlKey) return;
      const target = event.target;
      if (target && target.closest && target.closest('pre, textarea, input, summary')) return;
      const key = event.key.toLowerCase();
      const click = (name) => document.querySelector('[data-action="' + name + '"]')?.click();
      if (key === 'e') { event.preventDefault(); click('export'); }
      if (key === 'r') { event.preventDefault(); click('report'); }
      if (key === 'c') { event.preventDefault(); click('copy'); }
      if (key === 'l') { event.preventDefault(); click('reload'); }
    });
  </script>
</body>
</html>`;
};
