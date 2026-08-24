import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Headphones, LogOut, RefreshCw, Send, Sparkles, Users } from 'lucide-react';
import type {
  SteamListenTogetherReactionId,
  SteamListenTogetherSnapshot,
} from '../../../../shared/types/steam';
import { useI18n } from '../../../i18n/I18nProvider';
import { getSteamBridge } from '../../../utils/echoBridge';
import { formatUserFacingError } from '../../../utils/userFacingError';
import { settingsLocaleCopy } from '../settingsSubsections';
import './steam-listen-together-settings.css';

type LocaleCopy = Record<'zh-CN' | 'zh-TW' | 'ja-JP' | 'en-US' | 'ko-KR', string>;
type Operation = 'create' | 'join' | 'invite' | 'leave' | 'sync' | 'reaction' | null;

const reactionOptions: Array<{ id: SteamListenTogetherReactionId; emoji: string }> = [
  { id: 'heart', emoji: '💗' },
  { id: 'fire', emoji: '🔥' },
  { id: 'headphones', emoji: '🎧' },
  { id: 'sparkles', emoji: '✨' },
];

const formatClock = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
};

export const SteamListenTogetherSettings = ({ highlighted = false }: { highlighted?: boolean }): JSX.Element => {
  const { locale } = useI18n();
  const [snapshot, setSnapshot] = useState<SteamListenTogetherSnapshot | null>(null);
  const [busy, setBusy] = useState<Operation>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [lobbyId, setLobbyId] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = useCallback((values: LocaleCopy): string => settingsLocaleCopy(locale, values), [locale]);

  const refresh = useCallback(async (): Promise<void> => {
    const bridge = getSteamBridge();
    if (!bridge) return;
    try {
      setSnapshot(await bridge.getListenTogetherStatus());
    } catch (refreshError) {
      setError(formatUserFacingError(refreshError));
    }
  }, []);

  useEffect(() => {
    let active = true;
    void refresh();
    const timer = window.setInterval(() => {
      if (!active) return;
      void getSteamBridge()?.getListenTogetherStatus().then((next) => {
        if (active) setSnapshot(next);
      }).catch(() => undefined);
    }, 1_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refresh]);

  const run = useCallback(async (
    operation: Exclude<Operation, null>,
    task: () => Promise<SteamListenTogetherSnapshot>,
  ): Promise<void> => {
    if (busy) return;
    setBusy(operation);
    setError(null);
    try {
      setSnapshot(await task());
    } catch (operationError) {
      setError(formatUserFacingError(operationError));
    } finally {
      setBusy(null);
    }
  }, [busy]);

  const bridge = getSteamBridge();
  const connected = snapshot?.state === 'connected';
  const playback = snapshot?.playback;
  const progress = playback && playback.durationSeconds > 0
    ? Math.min(100, Math.max(0, (playback.positionSeconds / playback.durationSeconds) * 100))
    : 0;
  const statusLabel = useMemo(() => {
    if (!bridge || snapshot?.available === false) return copy({ 'zh-CN': '需通过 Steam 启动', 'zh-TW': '需透過 Steam 啟動', 'ja-JP': 'Steamから起動が必要', 'en-US': 'Launch through Steam', 'ko-KR': 'Steam에서 실행 필요' });
    if (!snapshot) return copy({ 'zh-CN': '正在检查', 'zh-TW': '正在檢查', 'ja-JP': '確認中', 'en-US': 'Checking', 'ko-KR': '확인 중' });
    if (!connected) return copy({ 'zh-CN': '未加入房间', 'zh-TW': '未加入房間', 'ja-JP': 'ルーム未参加', 'en-US': 'Not in a room', 'ko-KR': '방에 참여하지 않음' });
    if (snapshot.role === 'host') return copy({ 'zh-CN': '你是房主', 'zh-TW': '你是房主', 'ja-JP': 'ホスト', 'en-US': 'You are the host', 'ko-KR': '호스트' });
    if (snapshot.syncState === 'synced') return copy({ 'zh-CN': '已与房主同步', 'zh-TW': '已與房主同步', 'ja-JP': 'ホストと同期済み', 'en-US': 'Synced with host', 'ko-KR': '호스트와 동기화됨' });
    if (snapshot.syncState === 'waiting-for-track') return copy({ 'zh-CN': '本地没有匹配歌曲', 'zh-TW': '本機沒有相符歌曲', 'ja-JP': '一致するローカル曲なし', 'en-US': 'No local match', 'ko-KR': '일치하는 로컬 곡 없음' });
    if (snapshot.syncState === 'error') return copy({ 'zh-CN': '同步需要重试', 'zh-TW': '同步需要重試', 'ja-JP': '同期の再試行が必要', 'en-US': 'Sync needs retry', 'ko-KR': '동기화 재시도 필요' });
    return copy({ 'zh-CN': '正在同步', 'zh-TW': '正在同步', 'ja-JP': '同期中', 'en-US': 'Syncing', 'ko-KR': '동기화 중' });
  }, [bridge, connected, copy, snapshot]);

  const copyLobbyId = useCallback(async (): Promise<void> => {
    if (!snapshot?.lobbyId) return;
    await navigator.clipboard.writeText(snapshot.lobbyId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }, [snapshot?.lobbyId]);

  const title = copy({ 'zh-CN': 'Steam 好友一起听', 'zh-TW': 'Steam 好友一起聽', 'ja-JP': 'Steam フレンドと一緒に聴く', 'en-US': 'Listen Together with Steam friends', 'ko-KR': 'Steam 친구와 함께 듣기' });
  const description = copy({
    'zh-CN': '同步房主的播放、暂停、进度和切歌；每个人播放自己曲库中的匹配文件。',
    'zh-TW': '同步房主的播放、暫停、進度與切歌；每個人播放自己曲庫中的相符檔案。',
    'ja-JP': 'ホストの再生・一時停止・位置・曲変更を同期し、各自のライブラリにある一致曲を再生します。',
    'en-US': 'Sync the host’s play, pause, position, and track changes using each listener’s matching local file.',
    'ko-KR': '호스트의 재생, 일시 정지, 위치와 곡 변경을 동기화하고 각자의 일치하는 로컬 파일을 재생합니다.',
  });

  return (
    <section className="steam-listen-together" id="settings-row-steam-listen-together" data-connected={connected ? 'true' : undefined} data-search-highlight={highlighted ? 'true' : undefined} aria-label={title}>
      <div className="steam-listen-together__topline">
        <span className="steam-listen-together__icon"><Users size={18} /></span>
        <div className="steam-listen-together__copy"><h3>{title}</h3><p>{description}</p></div>
        <span className="steam-listen-together__status" data-state={snapshot?.syncState ?? 'not-in-room'}><i />{statusLabel}</span>
        {!connected ? (
          <div className="steam-listen-together__actions">
            <button type="button" disabled={!bridge || snapshot?.available === false || busy !== null} onClick={() => bridge && void run('create', () => bridge.createListenTogetherRoom())}>
              <Users size={14} />{copy({ 'zh-CN': '创建房间', 'zh-TW': '建立房間', 'ja-JP': 'ルーム作成', 'en-US': 'Create room', 'ko-KR': '방 만들기' })}
            </button>
            <button type="button" disabled={!bridge || snapshot?.available === false || busy !== null} onClick={() => setJoinOpen((open) => !open)}>
              <Send size={14} />{copy({ 'zh-CN': '加入', 'zh-TW': '加入', 'ja-JP': '参加', 'en-US': 'Join', 'ko-KR': '참여' })}
            </button>
          </div>
        ) : (
          <div className="steam-listen-together__actions">
            {snapshot?.role === 'host' ? <button type="button" disabled={busy !== null} onClick={() => bridge && void run('invite', () => bridge.openListenTogetherInvite())}><Send size={14} />{copy({ 'zh-CN': '邀请好友', 'zh-TW': '邀請好友', 'ja-JP': '招待', 'en-US': 'Invite', 'ko-KR': '초대' })}</button> : null}
            <button type="button" disabled={busy !== null} onClick={() => bridge && void run('leave', () => bridge.leaveListenTogetherRoom())}><LogOut size={14} />{copy({ 'zh-CN': '离开', 'zh-TW': '離開', 'ja-JP': '退出', 'en-US': 'Leave', 'ko-KR': '나가기' })}</button>
          </div>
        )}
      </div>

      {joinOpen && !connected ? (
        <form className="steam-listen-together__join" onSubmit={(event) => {
          event.preventDefault();
          if (bridge && lobbyId.trim()) void run('join', () => bridge.joinListenTogetherRoom(lobbyId.trim()));
        }}>
          <input value={lobbyId} inputMode="numeric" placeholder={copy({ 'zh-CN': '粘贴 Lobby ID', 'zh-TW': '貼上 Lobby ID', 'ja-JP': 'Lobby IDを貼り付け', 'en-US': 'Paste Lobby ID', 'ko-KR': 'Lobby ID 붙여넣기' })} onChange={(event) => setLobbyId(event.currentTarget.value.replace(/\D/gu, '').slice(0, 20))} />
          <button type="submit" disabled={!lobbyId.trim() || busy !== null}>{copy({ 'zh-CN': '连接', 'zh-TW': '連線', 'ja-JP': '接続', 'en-US': 'Connect', 'ko-KR': '연결' })}</button>
        </form>
      ) : null}

      {connected ? (
        <div className="steam-listen-together__session">
          <div className="steam-listen-together__now">
            <Headphones size={17} />
            <div>
              <strong>{playback?.track?.title ?? copy({ 'zh-CN': '等待房主播放', 'zh-TW': '等待房主播放', 'ja-JP': 'ホストの再生待ち', 'en-US': 'Waiting for the host', 'ko-KR': '호스트 재생 대기 중' })}</strong>
              <span>{[playback?.track?.artist, playback?.track?.album].filter(Boolean).join(' · ') || copy({ 'zh-CN': '房间已连接', 'zh-TW': '房間已連線', 'ja-JP': 'ルーム接続済み', 'en-US': 'Room connected', 'ko-KR': '방 연결됨' })}</span>
            </div>
            <time>{formatClock(playback?.positionSeconds ?? 0)} / {formatClock(playback?.durationSeconds ?? 0)}</time>
            <span className="steam-listen-together__members"><Users size={13} />{snapshot?.memberCount ?? 0}/{snapshot?.memberLimit ?? 4}</span>
          </div>
          <span className="steam-listen-together__progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></span>
          <div className="steam-listen-together__toolbar">
            <button className="steam-listen-together__room-code" type="button" onClick={() => void copyLobbyId()} title={snapshot?.lobbyId ?? undefined}><Copy size={13} />{copied ? copy({ 'zh-CN': '已复制', 'zh-TW': '已複製', 'ja-JP': 'コピー済み', 'en-US': 'Copied', 'ko-KR': '복사됨' }) : `Lobby ${snapshot?.lobbyId?.slice(-6) ?? ''}`}</button>
            <span className="steam-listen-together__privacy">{copy({ 'zh-CN': '仅同步控制与清理后的歌曲信息，不传输音频或路径。', 'zh-TW': '僅同步控制與清理後的歌曲資訊，不傳輸音訊或路徑。', 'ja-JP': '操作と整理済み曲情報のみ同期し、音声やパスは送信しません。', 'en-US': 'Controls and sanitized track info only; no audio or paths are sent.', 'ko-KR': '제어와 정리된 곡 정보만 동기화하며 오디오나 경로는 전송하지 않습니다.' })}</span>
            {snapshot?.role === 'guest' && (snapshot.syncState === 'waiting-for-track' || snapshot.syncState === 'error') ? <button type="button" disabled={busy !== null} onClick={() => bridge && void run('sync', () => bridge.requestListenTogetherSync())}><RefreshCw size={13} />{copy({ 'zh-CN': '重新匹配', 'zh-TW': '重新配對', 'ja-JP': '再照合', 'en-US': 'Retry match', 'ko-KR': '다시 일치' })}</button> : null}
            <div className="steam-listen-together__reactions" aria-label={copy({ 'zh-CN': '发送表情', 'zh-TW': '傳送表情', 'ja-JP': 'リアクション送信', 'en-US': 'Send a reaction', 'ko-KR': '반응 보내기' })}>
              {reactionOptions.map((option) => <button key={option.id} type="button" disabled={busy !== null} aria-label={option.id} onClick={() => bridge && void run('reaction', () => bridge.sendListenTogetherReaction(option.id))}>{option.emoji}</button>)}
            </div>
          </div>
          {snapshot?.recentReactions.length ? <div className="steam-listen-together__reaction-feed" aria-live="polite"><Sparkles size={13} />{snapshot.recentReactions.slice(-4).map((reaction) => <span key={reaction.id}>{reactionOptions.find((item) => item.id === reaction.reaction)?.emoji} {reaction.senderName}</span>)}</div> : null}
        </div>
      ) : null}
      {error ? <p className="steam-listen-together__error" role="alert">{error}</p> : null}
    </section>
  );
};
