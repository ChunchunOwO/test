import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, Globe2, ListMusic, RefreshCw, Sparkles, Timer, Trophy, UserRound, Users } from 'lucide-react';
import type {
  SteamLeaderboardBoardId,
  SteamLeaderboardScope,
  SteamLeaderboardSnapshot,
  SteamLeaderboardStatus,
} from '../../../shared/types/steam';
import { useI18n } from '../../i18n/I18nProvider';
import { settingsLocaleCopy } from '../../pages/settings/settingsSubsections';
import { getSteamBridge } from '../../utils/echoBridge';
import { formatUserFacingError } from '../../utils/userFacingError';
import { leaderboardConsentCopy } from './steamParticipationCopy';
import './steam-leaderboards.css';

const formatListeningTime = (seconds: number, locale: string): string => {
  const hours = Math.floor(Math.max(0, seconds) / 3600);
  const minutes = Math.floor((Math.max(0, seconds) % 3600) / 60);
  if (hours > 0) return `${hours.toLocaleString(locale)}h ${minutes.toString().padStart(2, '0')}m`;
  return `${minutes.toLocaleString(locale)}m`;
};

const visibleSteamPlayerName = (value: string | null): string | null => {
  const trimmed = value?.trim() ?? '';
  return /[\p{L}\p{N}\p{P}\p{S}]/u.test(trimmed) ? trimmed : null;
};

export const SteamLeaderboardPanel = (): JSX.Element => {
  const { locale } = useI18n();
  const [status, setStatus] = useState<SteamLeaderboardStatus | null>(null);
  const [snapshot, setSnapshot] = useState<SteamLeaderboardSnapshot | null>(null);
  const [boardId, setBoardId] = useState<SteamLeaderboardBoardId>('listening-time');
  const [scope, setScope] = useState<SteamLeaderboardScope>('around-user');
  const [busy, setBusy] = useState<'toggle' | 'sync' | 'entries' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copy = useCallback((values: Record<string, string>) => settingsLocaleCopy(locale, {
    'zh-CN': values['zh-CN'],
    'zh-TW': values['zh-TW'],
    'ja-JP': values['ja-JP'],
    'en-US': values['en-US'],
    'ko-KR': values['ko-KR'],
  }), [locale]);

  const loadEntries = useCallback(async (
    nextBoardId: SteamLeaderboardBoardId = boardId,
    nextScope: SteamLeaderboardScope = scope,
  ): Promise<void> => {
    const bridge = getSteamBridge();
    if (!bridge) return;
    setBusy('entries');
    setError(null);
    try {
      const nextSnapshot = await bridge.getLeaderboardEntries(nextBoardId, nextScope);
      setSnapshot(nextSnapshot);
      setStatus(nextSnapshot.status);
    } catch (loadError) {
      setError(formatUserFacingError(loadError));
    } finally {
      setBusy(null);
    }
  }, [boardId, scope]);

  useEffect(() => {
    const bridge = getSteamBridge();
    if (!bridge) return;
    let cancelled = false;
    void bridge.getLeaderboardStatus().then((nextStatus) => {
      if (cancelled) return;
      setStatus(nextStatus);
      if (nextStatus.enabled) void loadEntries();
    }).catch((loadError) => {
      if (!cancelled) setError(formatUserFacingError(loadError));
    });
    return () => { cancelled = true; };
  }, [loadEntries]);

  const handleParticipation = useCallback(async (): Promise<void> => {
    const bridge = getSteamBridge();
    if (!bridge || busy) return;
    const enabled = status?.enabled !== true;
    if (enabled && !window.confirm(copy(leaderboardConsentCopy))) return;

    setBusy('toggle');
    setError(null);
    try {
      const nextStatus = await bridge.setLeaderboardsEnabled(enabled);
      setStatus(nextStatus);
      setSnapshot(null);
      if (enabled) await loadEntries();
    } catch (toggleError) {
      setError(formatUserFacingError(toggleError));
    } finally {
      setBusy(null);
    }
  }, [busy, copy, loadEntries, status?.enabled]);

  const handleSync = useCallback(async (): Promise<void> => {
    const bridge = getSteamBridge();
    if (!bridge || busy) return;
    setBusy('sync');
    setError(null);
    try {
      setStatus(await bridge.syncLeaderboards());
      await loadEntries();
    } catch (syncError) {
      setError(formatUserFacingError(syncError));
    } finally {
      setBusy(null);
    }
  }, [busy, loadEntries]);

  const boardOptions = useMemo(() => [
    { id: 'listening-time' as const, icon: Clock3, label: copy({ 'zh-CN': '聆听时长', 'zh-TW': '聆聽時長', 'ja-JP': '再生時間', 'en-US': 'Listening time', 'ko-KR': '감상 시간' }) },
    { id: 'completed-tracks' as const, icon: ListMusic, label: copy({ 'zh-CN': '完播曲目', 'zh-TW': '完整播放曲目', 'ja-JP': '完了トラック', 'en-US': 'Completed tracks', 'ko-KR': '완료 트랙' }) },
    { id: 'listening-streak' as const, icon: CalendarDays, label: copy({ 'zh-CN': '连续聆听', 'zh-TW': '連續聆聽', 'ja-JP': '連続日数', 'en-US': 'Listening streak', 'ko-KR': '연속 감상' }) },
    { id: 'deep-session' as const, icon: Timer, label: copy({ 'zh-CN': '沉浸会话', 'zh-TW': '沉浸工作階段', 'ja-JP': '最長セッション', 'en-US': 'Deep session', 'ko-KR': '몰입 세션' }) },
    { id: 'rediscovered-tracks' as const, icon: Sparkles, label: copy({ 'zh-CN': '重逢旧歌', 'zh-TW': '重逢舊歌', 'ja-JP': '再発見', 'en-US': 'Rediscovered', 'ko-KR': '다시 발견' }) },
  ], [copy]);
  const scopeOptions = useMemo(() => [
    { id: 'global' as const, icon: Globe2, label: copy({ 'zh-CN': '全球', 'zh-TW': '全球', 'ja-JP': 'グローバル', 'en-US': 'Global', 'ko-KR': '전체' }) },
    { id: 'friends' as const, icon: Users, label: copy({ 'zh-CN': '好友', 'zh-TW': '好友', 'ja-JP': 'フレンド', 'en-US': 'Friends', 'ko-KR': '친구' }) },
    { id: 'around-user' as const, icon: UserRound, label: copy({ 'zh-CN': '我的附近', 'zh-TW': '我的附近', 'ja-JP': '自分の周辺', 'en-US': 'Around me', 'ko-KR': '내 주변' }) },
  ], [copy]);

  const selectedBoard = status?.boards.find((board) => board.id === boardId);
  const entries = snapshot?.boardId === boardId && snapshot.scope === scope ? snapshot.entries : [];
  const enabled = status?.enabled === true;
  const formatScore = useCallback((nextBoardId: SteamLeaderboardBoardId, score: number): string => {
    if (nextBoardId === 'listening-time' || nextBoardId === 'deep-session') {
      return formatListeningTime(score, locale);
    }
    if (nextBoardId === 'listening-streak') {
      return copy({
        'zh-CN': `${score.toLocaleString(locale)} 天`,
        'zh-TW': `${score.toLocaleString(locale)} 天`,
        'ja-JP': `${score.toLocaleString(locale)}日`,
        'en-US': `${score.toLocaleString(locale)} days`,
        'ko-KR': `${score.toLocaleString(locale)}일`,
      });
    }
    return score.toLocaleString(locale);
  }, [copy, locale]);
  const formatEntryDetails = useCallback((entry: SteamLeaderboardSnapshot['entries'][number]): string | null => {
    const details = entry.details;
    if (Object.values(details).every((value) => value === 0)) return null;
    if (boardId === 'listening-time') {
      return copy({
        'zh-CN': `${details.listeningSessionCount.toLocaleString(locale)} 次会话 · 深夜 ${formatListeningTime(details.nightListeningSeconds, locale)}`,
        'zh-TW': `${details.listeningSessionCount.toLocaleString(locale)} 次工作階段 · 深夜 ${formatListeningTime(details.nightListeningSeconds, locale)}`,
        'ja-JP': `${details.listeningSessionCount.toLocaleString(locale)}セッション · 深夜 ${formatListeningTime(details.nightListeningSeconds, locale)}`,
        'en-US': `${details.listeningSessionCount.toLocaleString(locale)} sessions · ${formatListeningTime(details.nightListeningSeconds, locale)} after midnight`,
        'ko-KR': `${details.listeningSessionCount.toLocaleString(locale)}개 세션 · 심야 ${formatListeningTime(details.nightListeningSeconds, locale)}`,
      });
    }
    if (boardId === 'completed-tracks') {
      return copy({
        'zh-CN': `重逢 ${details.rediscoveredTrackCount.toLocaleString(locale)} 首 · 短曲 ${details.completedShortUniqueTracks.toLocaleString(locale)} 首`,
        'zh-TW': `重逢 ${details.rediscoveredTrackCount.toLocaleString(locale)} 首 · 短曲 ${details.completedShortUniqueTracks.toLocaleString(locale)} 首`,
        'ja-JP': `再発見 ${details.rediscoveredTrackCount.toLocaleString(locale)}曲 · 短曲 ${details.completedShortUniqueTracks.toLocaleString(locale)}曲`,
        'en-US': `${details.rediscoveredTrackCount.toLocaleString(locale)} rediscovered · ${details.completedShortUniqueTracks.toLocaleString(locale)} short tracks`,
        'ko-KR': `${details.rediscoveredTrackCount.toLocaleString(locale)}곡 재발견 · 짧은 트랙 ${details.completedShortUniqueTracks.toLocaleString(locale)}곡`,
      });
    }
    if (boardId === 'listening-streak') {
      return copy({
        'zh-CN': `${details.completedUniqueTracks.toLocaleString(locale)} 首完播 · ${details.listeningSessionCount.toLocaleString(locale)} 次会话`,
        'zh-TW': `${details.completedUniqueTracks.toLocaleString(locale)} 首完整播放 · ${details.listeningSessionCount.toLocaleString(locale)} 次工作階段`,
        'ja-JP': `${details.completedUniqueTracks.toLocaleString(locale)}曲完了 · ${details.listeningSessionCount.toLocaleString(locale)}セッション`,
        'en-US': `${details.completedUniqueTracks.toLocaleString(locale)} completed · ${details.listeningSessionCount.toLocaleString(locale)} sessions`,
        'ko-KR': `${details.completedUniqueTracks.toLocaleString(locale)}곡 완료 · ${details.listeningSessionCount.toLocaleString(locale)}개 세션`,
      });
    }
    if (boardId === 'deep-session') {
      return copy({
        'zh-CN': `最长连续 ${details.longestListeningStreakDays.toLocaleString(locale)} 天 · 深夜 ${formatListeningTime(details.nightListeningSeconds, locale)}`,
        'zh-TW': `最長連續 ${details.longestListeningStreakDays.toLocaleString(locale)} 天 · 深夜 ${formatListeningTime(details.nightListeningSeconds, locale)}`,
        'ja-JP': `最長連続 ${details.longestListeningStreakDays.toLocaleString(locale)}日 · 深夜 ${formatListeningTime(details.nightListeningSeconds, locale)}`,
        'en-US': `${details.longestListeningStreakDays.toLocaleString(locale)} day streak · ${formatListeningTime(details.nightListeningSeconds, locale)} after midnight`,
        'ko-KR': `최장 연속 ${details.longestListeningStreakDays.toLocaleString(locale)}일 · 심야 ${formatListeningTime(details.nightListeningSeconds, locale)}`,
      });
    }
    return copy({
      'zh-CN': `${details.completedUniqueTracks.toLocaleString(locale)} 首完播 · 最长连续 ${details.longestListeningStreakDays.toLocaleString(locale)} 天`,
      'zh-TW': `${details.completedUniqueTracks.toLocaleString(locale)} 首完整播放 · 最長連續 ${details.longestListeningStreakDays.toLocaleString(locale)} 天`,
      'ja-JP': `${details.completedUniqueTracks.toLocaleString(locale)}曲完了 · 最長連続 ${details.longestListeningStreakDays.toLocaleString(locale)}日`,
      'en-US': `${details.completedUniqueTracks.toLocaleString(locale)} completed · ${details.longestListeningStreakDays.toLocaleString(locale)} day streak`,
      'ko-KR': `${details.completedUniqueTracks.toLocaleString(locale)}곡 완료 · 최장 연속 ${details.longestListeningStreakDays.toLocaleString(locale)}일`,
    });
  }, [boardId, copy, locale]);

  return (
    <section className="steam-leaderboard-panel" aria-label={copy({ 'zh-CN': 'Steam 排行榜', 'zh-TW': 'Steam 排行榜', 'ja-JP': 'Steamランキング', 'en-US': 'Steam leaderboards', 'ko-KR': 'Steam 순위표' })}>
      <header className="steam-leaderboard-header">
        <div className="steam-leaderboard-heading">
          <span className="steam-leaderboard-emblem"><Trophy size={20} /></span>
          <div>
            <small>STEAM COMMUNITY</small>
            <h2>{copy({ 'zh-CN': 'ECHO 聆听排行榜', 'zh-TW': 'ECHO 聆聽排行榜', 'ja-JP': 'ECHO リスニングランキング', 'en-US': 'ECHO listening leaderboards', 'ko-KR': 'ECHO 감상 순위표' })}</h2>
            <p>{copy({
              'zh-CN': '只比较聚合数字；本地曲库内容和路径始终留在你的电脑上。',
              'zh-TW': '只比較彙總數字；本機曲庫內容與路徑始終留在你的電腦上。',
              'ja-JP': '比較するのは集計値のみです。ローカルライブラリとパスはPC内に残ります。',
              'en-US': 'Only aggregate totals are compared. Your library content and paths stay on this PC.',
              'ko-KR': '집계 합계만 비교합니다. 로컬 라이브러리 내용과 경로는 이 PC에 남습니다.',
            })}</p>
          </div>
        </div>
        <div className="steam-leaderboard-actions">
          <button type="button" className={enabled ? 'is-active' : undefined} disabled={busy !== null} onClick={() => void handleParticipation()}>
            {enabled
              ? copy({ 'zh-CN': '已参与', 'zh-TW': '已參與', 'ja-JP': '参加中', 'en-US': 'Participating', 'ko-KR': '참여 중' })
              : copy({ 'zh-CN': '参与排行榜', 'zh-TW': '參與排行榜', 'ja-JP': 'ランキングに参加', 'en-US': 'Join leaderboards', 'ko-KR': '순위표 참여' })}
          </button>
          <button type="button" disabled={!enabled || busy !== null} onClick={() => void handleSync()}>
            <RefreshCw size={15} className={busy ? 'spinning-icon' : undefined} />
            {copy({ 'zh-CN': '同步', 'zh-TW': '同步', 'ja-JP': '同期', 'en-US': 'Sync', 'ko-KR': '동기화' })}
          </button>
        </div>
      </header>

      {enabled ? (
        <>
          <div className="steam-leaderboard-tabs" role="tablist">
            {boardOptions.map(({ id, icon: Icon, label }) => (
              <button key={id} type="button" role="tab" aria-selected={boardId === id} className={boardId === id ? 'is-active' : undefined} onClick={() => {
                setBoardId(id);
                void loadEntries(id, scope);
              }}><Icon size={15} />{label}</button>
            ))}
            <span className="steam-leaderboard-tab-divider" />
            {scopeOptions.map(({ id, icon: Icon, label }) => (
              <button key={id} type="button" role="tab" aria-selected={scope === id} className={scope === id ? 'is-active' : undefined} onClick={() => {
                setScope(id);
                void loadEntries(boardId, id);
              }}><Icon size={15} />{label}</button>
            ))}
          </div>

          <div className="steam-leaderboard-summary">
            <span><small>{copy({ 'zh-CN': '我的成绩', 'zh-TW': '我的成績', 'ja-JP': '自分のスコア', 'en-US': 'My score', 'ko-KR': '내 점수' })}</small><strong>{selectedBoard?.lastSubmittedScore === null || selectedBoard?.lastSubmittedScore === undefined
              ? '—'
              : formatScore(boardId, selectedBoard.lastSubmittedScore)}</strong></span>
            <span><small>{copy({ 'zh-CN': '全球排名', 'zh-TW': '全球排名', 'ja-JP': '世界順位', 'en-US': 'Global rank', 'ko-KR': '전체 순위' })}</small><strong>{selectedBoard?.lastGlobalRank ? `#${selectedBoard.lastGlobalRank.toLocaleString(locale)}` : '—'}</strong></span>
            <span><small>{copy({ 'zh-CN': '上次同步', 'zh-TW': '上次同步', 'ja-JP': '最終同期', 'en-US': 'Last sync', 'ko-KR': '마지막 동기화' })}</small><strong>{status?.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString(locale) : '—'}</strong></span>
          </div>

          <ol className="steam-leaderboard-list" aria-busy={busy === 'entries'}>
            {entries.map((entry) => {
              const detailLine = formatEntryDetails(entry);
              const playerName = visibleSteamPlayerName(entry.playerName) || copy({
                'zh-CN': 'Steam 玩家',
                'zh-TW': 'Steam 玩家',
                'ja-JP': 'Steamプレイヤー',
                'en-US': 'Steam player',
                'ko-KR': 'Steam 플레이어',
              });
              return (
                <li key={`${entry.rank}-${playerName}`} className={entry.isCurrentUser ? 'is-current-user' : undefined}>
                  <strong>#{entry.rank.toLocaleString(locale)}</strong>
                  <div className="steam-leaderboard-player">
                    <span>{playerName}</span>
                    {detailLine ? <small>{detailLine}</small> : null}
                  </div>
                  <em>{formatScore(boardId, entry.score)}</em>
                </li>
              );
            })}
          </ol>
          {!busy && entries.length === 0 ? <p className="steam-leaderboard-empty">{copy({
            'zh-CN': status?.lastError === 'leaderboard_not_found' ? 'Steamworks 中还没有发布对应排行榜。' : '这个范围暂时没有可显示的成绩。',
            'zh-TW': status?.lastError === 'leaderboard_not_found' ? 'Steamworks 中尚未發佈對應排行榜。' : '這個範圍暫時沒有可顯示的成績。',
            'ja-JP': status?.lastError === 'leaderboard_not_found' ? '対応するランキングはSteamworksでまだ公開されていません。' : 'この範囲には表示できるスコアがありません。',
            'en-US': status?.lastError === 'leaderboard_not_found' ? 'The matching leaderboard is not published in Steamworks yet.' : 'No scores are available for this range yet.',
            'ko-KR': status?.lastError === 'leaderboard_not_found' ? '해당 순위표가 아직 Steamworks에 게시되지 않았습니다.' : '이 범위에 표시할 점수가 아직 없습니다.',
          })}</p> : null}
        </>
      ) : (
        <div className="steam-leaderboard-opt-in">
          <strong>{copy({ 'zh-CN': '默认不上传', 'zh-TW': '預設不上傳', 'ja-JP': '初期設定では送信しません', 'en-US': 'Off by default', 'ko-KR': '기본값은 업로드 안 함' })}</strong>
          <span>{copy({
            'zh-CN': '开启后每十分钟最多同步一次，随时可以退出；退出不会删除 Steam 上已有的最高成绩。',
            'zh-TW': '開啟後每十分鐘最多同步一次，隨時可以退出；退出不會刪除 Steam 上既有的最高成績。',
            'ja-JP': '有効化後は最大10分ごとに同期します。いつでも停止できますが、Steam上の最高スコアは削除されません。',
            'en-US': 'When enabled, ECHO syncs at most every ten minutes. You can leave at any time; existing Steam best scores are not deleted.',
            'ko-KR': '활성화하면 최대 10분마다 동기화합니다. 언제든 참여를 중단할 수 있지만 Steam의 기존 최고 점수는 삭제되지 않습니다.',
          })}</span>
        </div>
      )}
      {error ? <p className="steam-leaderboard-error">{error}</p> : null}
    </section>
  );
};
