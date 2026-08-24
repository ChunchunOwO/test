import { useCallback, useEffect, useRef, useState } from 'react';
import { Album, AudioLines, BadgeCheck, Check, ChevronDown, Clock3, EyeOff, FileAudio, Gauge, LockKeyhole, Music2, Radio, RefreshCw, ShieldCheck, Shuffle, Tags, UserRound, Waves } from 'lucide-react';
import type { AppLocale, AppSettings, SteamRichPresenceMode, SteamRichPresencePreset } from '../../../../shared/types/appSettings';
import type { SteamStatus } from '../../../../shared/types/steam';
import { getSteamBridge } from '../../../utils/echoBridge';
import './steam-rich-presence-settings.css';

type PresenceCopy = {
  title: string;
  description: string;
  off: string;
  basic: string;
  detailed: string;
  offNote: string;
  basicNote: string;
  detailedNote: string;
  hiddenPreview: string;
  noPreview: string;
  titleField: string;
  artistField: string;
  albumField: string;
  progressField: string;
  genreField: string;
  genreFieldNote: string;
  playbackOrderField: string;
  playbackOrderFieldNote: string;
  bpmField: string;
  bpmFieldNote: string;
  qualityField: string;
  qualityFieldNote: string;
  formatField: string;
  formatFieldNote: string;
  bitPerfectField: string;
  bitPerfectFieldNote: string;
  alwaysIncluded: string;
  optional: string;
  connected: string;
  disconnected: string;
  checking: string;
  waiting: string;
  disabled: string;
  failed: string;
  applying: string;
  refresh: string;
  retryNote: string;
  instantSave: string;
  updatingPreview: string;
  selectedFields: string;
  basicPrivacyTitle: string;
  basicPrivacyNote: string;
  offPrivacyTitle: string;
  offPrivacyNote: string;
  presets: string;
  musicPreset: string;
  musicPresetNote: string;
  minimalPreset: string;
  minimalPresetNote: string;
  privacyPreset: string;
  privacyPresetNote: string;
  devicePrivacy: string;
  trackGroup: string;
  flavorGroup: string;
  audioGroup: string;
  expandDetails: string;
  collapseDetails: string;
};

const copyByLocale: Record<AppLocale, PresenceCopy> = {
  'zh-CN': {
    title: 'Steam 动态状态', description: '精确控制好友看到的播放状态。所有变更立即保存。', off: '关闭', basic: '基础', detailed: '详细',
    offNote: '不向 Steam 发布 ECHO 动态。', basicNote: '只显示正在使用 ECHO，不公开曲目信息。', detailedNote: '显示歌名和艺人，并可加入专辑与播放进度。',
    hiddenPreview: 'Rich Presence 已关闭', noPreview: '等待第一条播放状态', titleField: '歌名', artistField: '艺人', albumField: '专辑', progressField: '播放进度', genreField: '曲风', genreFieldNote: '曲库标签里的第一个曲风', playbackOrderField: '随机 / 循环', playbackOrderFieldNote: '正在随机或单曲循环时显示',
    alwaysIncluded: '始终包含', optional: '可选', connected: 'Steamworks 已连接', disconnected: 'Steamworks 未连接', checking: '正在检查 Steamworks', waiting: '等待发布', disabled: '已关闭', failed: '写入失败', applying: '正在应用',
    refresh: '刷新状态', retryNote: '将在下一次播放状态变化时自动重试。', instantSave: '设置会立即同步到主进程。', updatingPreview: '正在更新提交文本...', selectedFields: '已选择 {count} / {total}',
    basicPrivacyTitle: '仅公开 ECHO 活动', basicPrivacyNote: '不会公开歌名、艺人、专辑或播放进度。', offPrivacyTitle: '完全停止发布', offPrivacyNote: '不会向 Steam 发布任何 ECHO 播放活动。',
    presets: '显示预设', musicPreset: '音乐', musicPresetNote: '完整曲目信息', minimalPreset: '极简', minimalPresetNote: '只显示歌名艺人', privacyPreset: '隐私', privacyPresetNote: '隐藏全部元数据',
    devicePrivacy: '永不显示设备名称、设备 ID 或本地路径。',
    bpmField: 'BPM', bpmFieldNote: '曲库中的每分钟节拍数', qualityField: '歌曲质量', qualityFieldNote: '位深或码率 / 源采样率', formatField: '文件格式', formatFieldNote: '当前音频编码格式', bitPerfectField: 'Bit-Perfect', bitPerfectFieldNote: 'Audio Core 判定当前链路满足时显示',
    trackGroup: '曲目', flavorGroup: '氛围', audioGroup: '音频', expandDetails: '展开 Rich Presence 详情', collapseDetails: '收起 Rich Presence 详情',
  },
  'zh-TW': {
    title: 'Steam 動態狀態', description: '精確控制好友看到的播放狀態。所有變更立即儲存。', off: '關閉', basic: '基本', detailed: '詳細',
    offNote: '不向 Steam 發佈 ECHO 動態。', basicNote: '只顯示正在使用 ECHO，不公開曲目資訊。', detailedNote: '顯示歌名和藝人，並可加入專輯與播放進度。',
    hiddenPreview: 'Rich Presence 已關閉', noPreview: '等待第一條播放狀態', titleField: '歌名', artistField: '藝人', albumField: '專輯', progressField: '播放進度', genreField: '曲風', genreFieldNote: '曲庫標籤裡的第一個曲風', playbackOrderField: '隨機 / 循環', playbackOrderFieldNote: '正在隨機或單曲循環時顯示',
    alwaysIncluded: '始終包含', optional: '可選', connected: 'Steamworks 已連線', disconnected: 'Steamworks 未連線', checking: '正在檢查 Steamworks', waiting: '等待發佈', disabled: '已關閉', failed: '寫入失敗', applying: '正在套用',
    refresh: '重新整理狀態', retryNote: '將在下一次播放狀態變更時自動重試。', instantSave: '設定會立即同步到主程序。', updatingPreview: '正在更新提交文字...', selectedFields: '已選擇 {count} / {total}',
    basicPrivacyTitle: '僅公開 ECHO 活動', basicPrivacyNote: '不會公開歌名、藝人、專輯或播放進度。', offPrivacyTitle: '完全停止發佈', offPrivacyNote: '不會向 Steam 發佈任何 ECHO 播放活動。',
    presets: '顯示預設', musicPreset: '音樂', musicPresetNote: '完整曲目資訊', minimalPreset: '極簡', minimalPresetNote: '只顯示歌名藝人', privacyPreset: '隱私', privacyPresetNote: '隱藏全部中繼資料',
    devicePrivacy: '永不顯示裝置名稱、裝置 ID 或本機路徑。',
    bpmField: 'BPM', bpmFieldNote: '曲庫中的每分鐘節拍數', qualityField: '歌曲品質', qualityFieldNote: '位元深度或位元率 / 音源取樣率', formatField: '檔案格式', formatFieldNote: '目前音訊編碼格式', bitPerfectField: 'Bit-Perfect', bitPerfectFieldNote: 'Audio Core 判定目前鏈路符合時顯示',
    trackGroup: '曲目', flavorGroup: '氛圍', audioGroup: '音訊', expandDetails: '展開 Rich Presence 詳情', collapseDetails: '收起 Rich Presence 詳情',
  },
  'ja-JP': {
    title: 'Steam リッチプレゼンス', description: 'フレンドに表示する再生状態を細かく設定します。変更はすぐに保存されます。', off: 'オフ', basic: '基本', detailed: '詳細',
    offNote: 'ECHO の状態を Steam に公開しません。', basicNote: 'ECHO の使用中のみ表示し、曲情報は公開しません。', detailedNote: '曲名とアーティストを表示し、アルバムと再生位置も追加できます。',
    hiddenPreview: 'Rich Presence はオフです', noPreview: '最初の再生状態を待っています', titleField: '曲名', artistField: 'アーティスト', albumField: 'アルバム', progressField: '再生位置', genreField: 'ジャンル', genreFieldNote: 'ライブラリタグの最初のジャンル', playbackOrderField: 'シャッフル / リピート', playbackOrderFieldNote: 'シャッフルまたは1曲リピート中に表示',
    alwaysIncluded: '常に含む', optional: '任意', connected: 'Steamworks 接続済み', disconnected: 'Steamworks 未接続', checking: 'Steamworks を確認中', waiting: '公開待ち', disabled: 'オフ', failed: '書き込み失敗', applying: '適用中',
    refresh: '状態を更新', retryNote: '次の再生状態の変更時に自動で再試行します。', instantSave: '設定はすぐにメインプロセスへ同期されます。', updatingPreview: '送信テキストを更新中...', selectedFields: '{total} 項目中 {count} 項目を選択',
    basicPrivacyTitle: 'ECHO のアクティビティのみ公開', basicPrivacyNote: '曲名、アーティスト、アルバム、再生位置は公開しません。', offPrivacyTitle: '公開を完全に停止', offPrivacyNote: 'ECHO の再生アクティビティを Steam に公開しません。',
    presets: '表示プリセット', musicPreset: 'ミュージック', musicPresetNote: '曲情報をすべて表示', minimalPreset: 'ミニマル', minimalPresetNote: '曲名とアーティストのみ', privacyPreset: 'プライバシー', privacyPresetNote: 'メタデータを非表示',
    devicePrivacy: 'デバイス名、デバイス ID、ローカルパスは表示しません。',
    bpmField: 'BPM', bpmFieldNote: 'ライブラリに保存されたテンポ', qualityField: '音源品質', qualityFieldNote: 'ビット深度またはビットレート / ソースレート', formatField: 'ファイル形式', formatFieldNote: '現在の音声コーデック', bitPerfectField: 'Bit-Perfect', bitPerfectFieldNote: 'Audio Core が現在の経路を適合と判定した場合に表示',
    trackGroup: '曲', flavorGroup: '雰囲気', audioGroup: 'オーディオ', expandDetails: 'Rich Presence の詳細を開く', collapseDetails: 'Rich Presence の詳細を閉じる',
  },
  'en-US': {
    title: 'Steam Rich Presence', description: 'Control exactly what friends see. Every change is saved immediately.', off: 'Off', basic: 'Basic', detailed: 'Detailed',
    offNote: 'Publish no ECHO activity to Steam.', basicNote: 'Show that ECHO is active without sharing track metadata.', detailedNote: 'Show title and artist, with optional album and playback progress.',
    hiddenPreview: 'Rich Presence is off', noPreview: 'Waiting for the first playback status', titleField: 'Title', artistField: 'Artist', albumField: 'Album', progressField: 'Playback progress', genreField: 'Genre', genreFieldNote: 'First genre tag from the library', playbackOrderField: 'Shuffle / Repeat', playbackOrderFieldNote: 'Shown while shuffling or repeating one',
    alwaysIncluded: 'Always included', optional: 'Optional', connected: 'Steamworks connected', disconnected: 'Steamworks not connected', checking: 'Checking Steamworks', waiting: 'Waiting', disabled: 'Disabled', failed: 'Write failed', applying: 'Applying',
    refresh: 'Refresh status', retryNote: 'ECHO will retry on the next playback state change.', instantSave: 'Settings sync to the main process immediately.', updatingPreview: 'Updating the submitted text...', selectedFields: '{count} of {total} selected',
    basicPrivacyTitle: 'Share ECHO activity only', basicPrivacyNote: 'Title, artist, album, and playback progress stay private.', offPrivacyTitle: 'Stop publishing completely', offPrivacyNote: 'No ECHO playback activity is published to Steam.',
    presets: 'Display presets', musicPreset: 'Music', musicPresetNote: 'Full track context', minimalPreset: 'Minimal', minimalPresetNote: 'Title and artist only', privacyPreset: 'Privacy', privacyPresetNote: 'Hide all metadata',
    devicePrivacy: 'Device names, device IDs, and local paths are never shown.',
    bpmField: 'BPM', bpmFieldNote: 'Tempo stored in the library', qualityField: 'Track quality', qualityFieldNote: 'Bit depth or bitrate / source rate', formatField: 'File format', formatFieldNote: 'Current audio codec', bitPerfectField: 'Bit-Perfect', bitPerfectFieldNote: 'Shown when Audio Core confirms the current path',
    trackGroup: 'Track', flavorGroup: 'Atmosphere', audioGroup: 'Audio', expandDetails: 'Expand Rich Presence details', collapseDetails: 'Collapse Rich Presence details',
  },
  'ko-KR': {
    title: 'Steam 리치 프레즌스', description: '친구에게 표시할 재생 상태를 세밀하게 설정합니다. 모든 변경 사항은 즉시 저장됩니다.', off: '끄기', basic: '기본', detailed: '상세',
    offNote: 'ECHO 상태를 Steam에 게시하지 않습니다.', basicNote: '곡 정보 없이 ECHO 사용 중 상태만 표시합니다.', detailedNote: '곡과 아티스트를 표시하고 앨범과 재생 진행률을 추가할 수 있습니다.',
    hiddenPreview: 'Rich Presence 꺼짐', noPreview: '첫 재생 상태 대기 중', titleField: '곡', artistField: '아티스트', albumField: '앨범', progressField: '재생 진행률', genreField: '장르', genreFieldNote: '라이브러리 태그의 첫 장르', playbackOrderField: '셔플 / 반복', playbackOrderFieldNote: '셔플 또는 한 곡 반복 중일 때 표시',
    alwaysIncluded: '항상 포함', optional: '선택', connected: 'Steamworks 연결됨', disconnected: 'Steamworks 연결 안 됨', checking: 'Steamworks 확인 중', waiting: '게시 대기', disabled: '꺼짐', failed: '쓰기 실패', applying: '적용 중',
    refresh: '상태 새로고침', retryNote: '다음 재생 상태 변경 시 자동으로 다시 시도합니다.', instantSave: '설정은 메인 프로세스에 즉시 동기화됩니다.', updatingPreview: '제출 텍스트를 업데이트하는 중...', selectedFields: '{total}개 중 {count}개 선택',
    basicPrivacyTitle: 'ECHO 활동만 공개', basicPrivacyNote: '곡, 아티스트, 앨범, 재생 진행률은 공개하지 않습니다.', offPrivacyTitle: '게시 완전히 중지', offPrivacyNote: 'ECHO 재생 활동을 Steam에 게시하지 않습니다.',
    presets: '표시 프리셋', musicPreset: '음악', musicPresetNote: '전체 곡 정보', minimalPreset: '미니멀', minimalPresetNote: '곡과 아티스트만', privacyPreset: '개인정보', privacyPresetNote: '모든 메타데이터 숨김',
    devicePrivacy: '장치 이름, 장치 ID, 로컬 경로는 표시하지 않습니다.',
    bpmField: 'BPM', bpmFieldNote: '라이브러리에 저장된 템포', qualityField: '곡 품질', qualityFieldNote: '비트 심도 또는 비트레이트 / 소스 레이트', formatField: '파일 형식', formatFieldNote: '현재 오디오 코덱', bitPerfectField: 'Bit-Perfect', bitPerfectFieldNote: 'Audio Core가 현재 경로를 충족한다고 판단할 때 표시',
    trackGroup: '트랙', flavorGroup: '분위기', audioGroup: '오디오', expandDetails: 'Rich Presence 세부 정보 펼치기', collapseDetails: 'Rich Presence 세부 정보 접기',
  },
};

const preciseCopyByLocale: Record<AppLocale, {
  preview: string;
  fields: string;
  enabled: string;
  disabled: string;
  submitted: string;
  lastSubmitted: string;
}> = {
  'zh-CN': { preview: '当前提交文本', fields: '启用字段', enabled: '已启用', disabled: '未启用', submitted: '已提交', lastSubmitted: '最后提交' },
  'zh-TW': { preview: '目前提交文字', fields: '啟用欄位', enabled: '已啟用', disabled: '未啟用', submitted: '已提交', lastSubmitted: '最後提交' },
  'ja-JP': { preview: '現在の送信テキスト', fields: '有効な項目', enabled: '有効', disabled: '無効', submitted: '送信済み', lastSubmitted: '最終送信' },
  'en-US': { preview: 'Current submitted text', fields: 'Enabled fields', enabled: 'Enabled', disabled: 'Disabled', submitted: 'Submitted', lastSubmitted: 'Last submitted' },
  'ko-KR': { preview: '현재 제출 텍스트', fields: '활성화된 필드', enabled: '활성화됨', disabled: '비활성화됨', submitted: '제출됨', lastSubmitted: '마지막 제출' },
};

const modeOptions: Array<{ mode: SteamRichPresenceMode; icon: typeof EyeOff }> = [
  { mode: 'off', icon: EyeOff },
  { mode: 'basic', icon: Radio },
  { mode: 'detailed', icon: Music2 },
];

const presetOptions: Array<{ preset: SteamRichPresencePreset; icon: typeof Music2 }> = [
  { preset: 'music', icon: Music2 },
  { preset: 'minimal', icon: Waves },
  { preset: 'privacy', icon: ShieldCheck },
];

const PresenceField = ({
  icon: Icon,
  label,
  note,
  pressed = false,
  locked = false,
  disabled = false,
  ariaLabel,
  onClick,
}: {
  icon: typeof Music2;
  label: string;
  note: string;
  pressed?: boolean;
  locked?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  onClick?: () => void;
}): JSX.Element => {
  const body = (
    <>
      <Icon size={17} />
      <span><strong>{label}</strong><small>{note}</small></span>
      {locked ? <LockKeyhole size={14} /> : <span className="steam-presence-field__check">{pressed ? <Check size={14} /> : null}</span>}
    </>
  );
  if (locked) {
    return <div className="steam-presence-field is-fixed">{body}</div>;
  }
  return (
    <button className="steam-presence-field" type="button" aria-label={ariaLabel} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
      {body}
    </button>
  );
};

export const SteamRichPresenceSettings = ({ locale, settings, highlighted, onPatch }: {
  locale: AppLocale;
  settings: AppSettings | null;
  highlighted?: boolean;
  onPatch: (patch: Partial<AppSettings>) => void;
}): JSX.Element => {
  const copy = copyByLocale[locale] ?? copyByLocale['en-US'];
  const preciseCopy = preciseCopyByLocale[locale] ?? preciseCopyByLocale['en-US'];
  const resolvedMode = settings?.steamRichPresenceMode ?? (settings?.steamRichPresenceEnabled === false ? 'off' : 'detailed');
  const resolvedPreset = resolvedMode === 'basic' ? 'privacy' : settings?.steamRichPresencePreset ?? 'music';
  const [mode, setMode] = useState<SteamRichPresenceMode>(resolvedMode);
  const [preset, setPreset] = useState<SteamRichPresencePreset>(resolvedPreset);
  const [showAlbum, setShowAlbum] = useState(settings?.steamRichPresenceShowAlbum !== false);
  const [showProgress, setShowProgress] = useState(settings?.steamRichPresenceShowProgress !== false);
  const [showGenre, setShowGenre] = useState(settings?.steamRichPresenceShowGenre === true);
  const [showPlaybackOrder, setShowPlaybackOrder] = useState(settings?.steamRichPresenceShowPlaybackOrder === true);
  const [showBpm, setShowBpm] = useState(settings?.steamRichPresenceShowBpm === true);
  const [showQuality, setShowQuality] = useState(settings?.steamRichPresenceShowQuality === true);
  const [showFormat, setShowFormat] = useState(settings?.steamRichPresenceShowFormat === true);
  const [showBitPerfect, setShowBitPerfect] = useState(settings?.steamRichPresenceShowBitPerfect === true);
  const [steamStatus, setSteamStatus] = useState<SteamStatus | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState(false);
  const [applying, setApplying] = useState(false);
  const [expanded, setExpanded] = useState(highlighted === true);
  const applyTimerRef = useRef<number | null>(null);
  const diagnosticsRequestRef = useRef(0);

  const refreshDiagnostics = useCallback(async (): Promise<SteamStatus | null> => {
    const requestId = ++diagnosticsRequestRef.current;
    const bridge = getSteamBridge();
    if (!bridge) {
      if (requestId === diagnosticsRequestRef.current) {
        setSteamStatus(null);
        setDiagnosticsLoading(false);
        setDiagnosticsError(true);
      }
      return null;
    }
    setDiagnosticsLoading(true);
    setDiagnosticsError(false);
    try {
      const nextStatus = await bridge.getStatus();
      if (requestId === diagnosticsRequestRef.current) setSteamStatus(nextStatus);
      return nextStatus;
    } catch {
      if (requestId === diagnosticsRequestRef.current) {
        setSteamStatus(null);
        setDiagnosticsError(true);
      }
      return null;
    } finally {
      if (requestId === diagnosticsRequestRef.current) setDiagnosticsLoading(false);
    }
  }, []);

  useEffect(() => setMode(resolvedMode), [resolvedMode]);
  useEffect(() => setPreset(resolvedPreset), [resolvedPreset]);
  useEffect(() => setShowAlbum(settings?.steamRichPresenceShowAlbum !== false), [settings?.steamRichPresenceShowAlbum]);
  useEffect(() => setShowProgress(settings?.steamRichPresenceShowProgress !== false), [settings?.steamRichPresenceShowProgress]);
  useEffect(() => setShowGenre(settings?.steamRichPresenceShowGenre === true), [settings?.steamRichPresenceShowGenre]);
  useEffect(() => setShowPlaybackOrder(settings?.steamRichPresenceShowPlaybackOrder === true), [settings?.steamRichPresenceShowPlaybackOrder]);
  useEffect(() => setShowBpm(settings?.steamRichPresenceShowBpm === true), [settings?.steamRichPresenceShowBpm]);
  useEffect(() => setShowQuality(settings?.steamRichPresenceShowQuality === true), [settings?.steamRichPresenceShowQuality]);
  useEffect(() => setShowFormat(settings?.steamRichPresenceShowFormat === true), [settings?.steamRichPresenceShowFormat]);
  useEffect(() => setShowBitPerfect(settings?.steamRichPresenceShowBitPerfect === true), [settings?.steamRichPresenceShowBitPerfect]);
  useEffect(() => {
    if (highlighted) setExpanded(true);
  }, [highlighted]);
  useEffect(() => {
    void refreshDiagnostics();
    const refreshTimer = window.setInterval(() => void refreshDiagnostics(), 15_000);
    return () => window.clearInterval(refreshTimer);
  }, [refreshDiagnostics]);
  useEffect(() => () => {
    diagnosticsRequestRef.current += 1;
    if (applyTimerRef.current !== null) window.clearTimeout(applyTimerRef.current);
  }, []);

  const applyPatch = useCallback((patch: Partial<AppSettings>): void => {
    onPatch(patch);
    setApplying(true);
    if (applyTimerRef.current !== null) window.clearTimeout(applyTimerRef.current);
    applyTimerRef.current = window.setTimeout(() => {
      void refreshDiagnostics().finally(() => setApplying(false));
    }, 500);
  }, [onPatch, refreshDiagnostics]);

  const handleModeChange = (nextMode: SteamRichPresenceMode): void => {
    setMode(nextMode);
    const nextPreset = nextMode === 'basic' ? 'privacy' : nextMode === 'detailed' && preset === 'privacy' ? 'music' : preset;
    setPreset(nextPreset);
    applyPatch({ steamRichPresenceMode: nextMode, steamRichPresenceEnabled: nextMode !== 'off', steamRichPresencePreset: nextPreset });
  };

  const handlePresetChange = (nextPreset: SteamRichPresencePreset): void => {
    const nextMode: SteamRichPresenceMode = nextPreset === 'privacy' ? 'basic' : 'detailed';
    setPreset(nextPreset);
    setMode(nextMode);
    applyPatch({ steamRichPresencePreset: nextPreset, steamRichPresenceMode: nextMode, steamRichPresenceEnabled: true });
  };

  const toggleAlbum = (): void => {
    const next = !showAlbum;
    setShowAlbum(next);
    applyPatch({ steamRichPresenceShowAlbum: next });
  };

  const toggleProgress = (): void => {
    const next = !showProgress;
    setShowProgress(next);
    applyPatch({ steamRichPresenceShowProgress: next });
  };

  const toggleFlavor = (field: 'genre' | 'playbackOrder'): void => {
    if (field === 'genre') {
      const next = !showGenre;
      setShowGenre(next);
      applyPatch({ steamRichPresenceShowGenre: next });
    } else {
      const next = !showPlaybackOrder;
      setShowPlaybackOrder(next);
      applyPatch({ steamRichPresenceShowPlaybackOrder: next });
    }
  };

  const toggleAudio = (field: 'bpm' | 'quality' | 'format' | 'bitPerfect'): void => {
    if (field === 'bpm') {
      const next = !showBpm;
      setShowBpm(next);
      applyPatch({ steamRichPresenceShowBpm: next });
    } else if (field === 'quality') {
      const next = !showQuality;
      setShowQuality(next);
      applyPatch({ steamRichPresenceShowQuality: next });
    } else if (field === 'format') {
      const next = !showFormat;
      setShowFormat(next);
      applyPatch({ steamRichPresenceShowFormat: next });
    } else {
      const next = !showBitPerfect;
      setShowBitPerfect(next);
      applyPatch({ steamRichPresenceShowBitPerfect: next });
    }
  };

  const publicationState = steamStatus?.richPresence?.publicationState ?? 'waiting';
  const publicationLabel = applying ? copy.applying : publicationState === 'published' ? preciseCopy.submitted : publicationState === 'disabled' ? copy.disabled : publicationState === 'error' ? copy.failed : copy.waiting;
  const displayState = applying ? 'applying' : diagnosticsError ? 'error' : publicationState;
  const connectionLabel = diagnosticsLoading && !steamStatus ? copy.checking : steamStatus?.state === 'ready' ? copy.connected : copy.disconnected;
  const preview = mode === 'off' ? copy.hiddenPreview : applying ? copy.updatingPreview : steamStatus?.richPresence?.preview ?? copy.noPreview;
  const modeNote = mode === 'off' ? copy.offNote : mode === 'basic' ? copy.basicNote : copy.detailedNote;
  const lastPublishedAt = steamStatus?.richPresence?.lastPublishedAt;
  const publishedDate = lastPublishedAt ? new Date(lastPublishedAt) : null;
  const hasValidPublishedDate = publishedDate !== null && Number.isFinite(publishedDate.getTime());
  const selectedFieldCount = 2 + (preset === 'minimal' ? 0 : Number(showAlbum) + Number(showProgress))
    + Number(showGenre) + Number(showPlaybackOrder) + Number(showBpm) + Number(showQuality) + Number(showFormat) + Number(showBitPerfect);
  const totalFieldCount = preset === 'minimal' ? 8 : 10;
  const selectedFieldsLabel = copy.selectedFields.replace('{count}', String(selectedFieldCount)).replace('{total}', String(totalFieldCount));

  return (
    <section className="steam-presence-studio" id="settings-row-steam-presence" data-mode={mode} data-preset={preset} data-search-highlight={highlighted ? 'true' : undefined} aria-label={copy.title}>
      <header className="steam-presence-studio__header">
        <div className="steam-presence-studio__modes" role="group" aria-label={copy.title}>
          {modeOptions.map(({ mode: optionMode, icon: Icon }) => (
            <button key={optionMode} type="button" aria-pressed={mode === optionMode} disabled={!settings} onClick={() => handleModeChange(optionMode)}>
              <Icon size={16} />
              <span>{optionMode === 'off' ? copy.off : optionMode === 'basic' ? copy.basic : copy.detailed}</span>
            </button>
          ))}
        </div>
        <span className="steam-presence-studio__state" data-state={displayState} role="status" aria-live="polite">
          <i aria-hidden="true" />
          {diagnosticsError ? copy.disconnected : publicationLabel}
        </span>
        <button
          className="steam-presence-studio__disclosure"
          type="button"
          aria-controls="steam-presence-studio-details"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? copy.collapseDetails : copy.expandDetails}
          <ChevronDown size={15} aria-hidden="true" />
        </button>
        <p className="steam-presence-studio__mode-note">{modeNote}</p>
      </header>

      {expanded ? <div className="steam-presence-studio__details" id="steam-presence-studio-details">
        {mode !== 'off' ? (
          <div className="steam-presence-presets">
            <div className="steam-presence-presets__heading">{copy.presets}</div>
            <div className="steam-presence-presets__grid" role="group" aria-label={copy.presets}>
              {presetOptions.map(({ preset: optionPreset, icon: Icon }) => {
                const label = optionPreset === 'music' ? copy.musicPreset : optionPreset === 'minimal' ? copy.minimalPreset : copy.privacyPreset;
                const note = optionPreset === 'music' ? copy.musicPresetNote : optionPreset === 'minimal' ? copy.minimalPresetNote : copy.privacyPresetNote;
                return (
                  <button key={optionPreset} type="button" aria-pressed={preset === optionPreset} disabled={!settings} onClick={() => handlePresetChange(optionPreset)}>
                    <Icon size={18} />
                    <span><strong>{label}</strong><small>{note}</small></span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="steam-presence-studio__workspace">
          <div className="steam-presence-preview" data-disabled={mode === 'off' ? 'true' : undefined}>
            <div className="steam-presence-preview__topline">
              <span>{preciseCopy.preview}</span>
              <span>{connectionLabel}</span>
            </div>
            {diagnosticsLoading && !steamStatus && mode !== 'off' ? (
              <div className="steam-presence-preview__skeleton" aria-label={copy.waiting}><span /><span /><span /></div>
            ) : (
              <p className="steam-presence-preview__text" aria-live="polite">{preview}</p>
            )}
            {hasValidPublishedDate && publishedDate ? <time className="steam-presence-preview__time" dateTime={lastPublishedAt ?? undefined}><Clock3 size={13} />{preciseCopy.lastSubmitted}: {publishedDate.toLocaleString(locale)}</time> : null}
            {steamStatus?.richPresence?.lastError ? <p className="steam-presence-preview__error">{copy.retryNote}</p> : null}
          </div>
          <div className="steam-presence-fields">
        <div className="steam-presence-fields__heading">
          <strong>{preciseCopy.fields}</strong>
          <small>
            {mode === 'detailed' ? selectedFieldsLabel : copy.instantSave}
            {mode === 'detailed' ? <i className="steam-presence-fields__meter" aria-hidden="true"><b style={{ width: `${Math.round((selectedFieldCount / totalFieldCount) * 100)}%` }} /></i> : null}
          </small>
        </div>
        {mode === 'detailed' ? (
          <>
            <div className="steam-presence-fields__group">
              <h4>{copy.trackGroup}</h4>
              <div className="steam-presence-fields__grid">
                <PresenceField icon={Music2} label={copy.titleField} note={copy.alwaysIncluded} locked />
                <PresenceField icon={UserRound} label={copy.artistField} note={copy.alwaysIncluded} locked />
                {preset !== 'minimal' ? <PresenceField icon={Album} label={copy.albumField} note={copy.optional} pressed={showAlbum} disabled={!settings} ariaLabel={`${copy.albumField}: ${showAlbum ? preciseCopy.enabled : preciseCopy.disabled}`} onClick={toggleAlbum} /> : null}
                {preset !== 'minimal' ? <PresenceField icon={Clock3} label={copy.progressField} note={copy.optional} pressed={showProgress} disabled={!settings} ariaLabel={`${copy.progressField}: ${showProgress ? preciseCopy.enabled : preciseCopy.disabled}`} onClick={toggleProgress} /> : null}
              </div>
            </div>
            <div className="steam-presence-fields__group">
              <h4>{copy.audioGroup}</h4>
              <div className="steam-presence-fields__grid">
                <PresenceField icon={Gauge} label={copy.bpmField} note={copy.bpmFieldNote} pressed={showBpm} disabled={!settings} ariaLabel={`${copy.bpmField}: ${showBpm ? preciseCopy.enabled : preciseCopy.disabled}`} onClick={() => toggleAudio('bpm')} />
                <PresenceField icon={AudioLines} label={copy.qualityField} note={copy.qualityFieldNote} pressed={showQuality} disabled={!settings} ariaLabel={`${copy.qualityField}: ${showQuality ? preciseCopy.enabled : preciseCopy.disabled}`} onClick={() => toggleAudio('quality')} />
                <PresenceField icon={FileAudio} label={copy.formatField} note={copy.formatFieldNote} pressed={showFormat} disabled={!settings} ariaLabel={`${copy.formatField}: ${showFormat ? preciseCopy.enabled : preciseCopy.disabled}`} onClick={() => toggleAudio('format')} />
                <PresenceField icon={BadgeCheck} label={copy.bitPerfectField} note={copy.bitPerfectFieldNote} pressed={showBitPerfect} disabled={!settings} ariaLabel={`${copy.bitPerfectField}: ${showBitPerfect ? preciseCopy.enabled : preciseCopy.disabled}`} onClick={() => toggleAudio('bitPerfect')} />
              </div>
            </div>
            <div className="steam-presence-fields__group">
              <h4>{copy.flavorGroup}</h4>
              <div className="steam-presence-fields__grid">
                <PresenceField icon={Tags} label={copy.genreField} note={copy.genreFieldNote} pressed={showGenre} disabled={!settings} ariaLabel={`${copy.genreField}: ${showGenre ? preciseCopy.enabled : preciseCopy.disabled}`} onClick={() => toggleFlavor('genre')} />
                <PresenceField icon={Shuffle} label={copy.playbackOrderField} note={copy.playbackOrderFieldNote} pressed={showPlaybackOrder} disabled={!settings} ariaLabel={`${copy.playbackOrderField}: ${showPlaybackOrder ? preciseCopy.enabled : preciseCopy.disabled}`} onClick={() => toggleFlavor('playbackOrder')} />
              </div>
            </div>
          </>
        ) : (
          <div className="steam-presence-fields__privacy" data-mode={mode}>
            <ShieldCheck size={22} />
            <span><strong>{mode === 'basic' ? copy.basicPrivacyTitle : copy.offPrivacyTitle}</strong><small>{mode === 'basic' ? copy.basicPrivacyNote : copy.offPrivacyNote}</small></span>
          </div>
        )}
        <p className="steam-presence-fields__privacy-lock"><ShieldCheck size={13} />{copy.devicePrivacy}</p>
        <div className="steam-presence-fields__footer">
          <small>{copy.instantSave}</small>
          <button className="settings-action-button steam-presence-studio__refresh" type="button" disabled={diagnosticsLoading} onClick={() => void refreshDiagnostics()}>
            <RefreshCw className={diagnosticsLoading ? 'spinning-icon' : undefined} size={15} />{copy.refresh}
          </button>
        </div>
          </div>
        </div>
      </div> : null}
    </section>
  );
};
