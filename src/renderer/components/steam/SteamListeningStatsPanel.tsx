import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, ShieldCheck } from 'lucide-react';
import { nextSteamListeningStatsMilestone } from '../../../shared/constants/steamListeningStats';
import type { SteamListeningStatId, SteamListeningStatsStatus } from '../../../shared/types/steam';
import { useI18n } from '../../i18n/I18nProvider';
import { settingsLocaleCopy } from '../../pages/settings/settingsSubsections';
import { getSteamBridge } from '../../utils/echoBridge';
import { formatUserFacingError } from '../../utils/userFacingError';
import { extendedStatsConsentCopy } from './steamParticipationCopy';
import './steam-listening-stats.css';

type LocaleCopy = Record<'zh-CN' | 'zh-TW' | 'ja-JP' | 'en-US' | 'ko-KR', string>;

const statLabels: Record<SteamListeningStatId, LocaleCopy> = {
  'listening-minutes': { 'zh-CN': '总聆听时间', 'zh-TW': '總聆聽時間', 'ja-JP': '総再生時間', 'en-US': 'Total listening', 'ko-KR': '총 감상 시간' },
  'completed-plays': { 'zh-CN': '完整播放次数', 'zh-TW': '完整播放次數', 'ja-JP': '完了した再生', 'en-US': 'Completed plays', 'ko-KR': '완료 재생' },
  'unique-tracks': { 'zh-CN': '听完的不同歌曲', 'zh-TW': '聽完的不同歌曲', 'ja-JP': '完了した曲', 'en-US': 'Unique tracks completed', 'ko-KR': '완료한 고유 트랙' },
  'longest-streak-days': { 'zh-CN': '最长连续聆听', 'zh-TW': '最長連續聆聽', 'ja-JP': '最長連続日数', 'en-US': 'Longest streak', 'ko-KR': '최장 연속 감상' },
  'night-minutes': { 'zh-CN': '深夜聆听时间', 'zh-TW': '深夜聆聽時間', 'ja-JP': '深夜の再生時間', 'en-US': 'Night listening', 'ko-KR': '심야 감상 시간' },
  'longest-session-minutes': { 'zh-CN': '最长单次聆听', 'zh-TW': '最長單次聆聽', 'ja-JP': '最長セッション', 'en-US': 'Longest session', 'ko-KR': '최장 세션' },
  'rediscovered-tracks': { 'zh-CN': '重逢旧歌', 'zh-TW': '重逢舊歌', 'ja-JP': '再発見した曲', 'en-US': 'Rediscovered tracks', 'ko-KR': '다시 발견한 트랙' },
  'completed-albums': { 'zh-CN': '探索过的专辑', 'zh-TW': '探索過的專輯', 'ja-JP': '再生したアルバム', 'en-US': 'Albums explored', 'ko-KR': '감상한 앨범' },
};

export const SteamListeningStatsPanel = (): JSX.Element => {
  const { locale } = useI18n();
  const [status, setStatus] = useState<SteamListeningStatsStatus | null>(null);
  const [busy, setBusy] = useState<'toggle' | 'sync' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copy = useCallback((values: LocaleCopy) => settingsLocaleCopy(locale, values), [locale]);

  useEffect(() => {
    const bridge = getSteamBridge();
    if (!bridge) return;
    let cancelled = false;
    const refreshStatus = (synchronize: boolean): void => {
      const request = synchronize ? bridge.syncListeningStats() : bridge.getListeningStatsStatus();
      void request.then((nextStatus) => {
        if (!cancelled) setStatus(nextStatus);
      }).catch((loadError) => {
        if (!cancelled) setError(formatUserFacingError(loadError));
      });
    };
    refreshStatus(true);
    const timer = window.setInterval(() => refreshStatus(false), 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const handleToggle = useCallback(async (): Promise<void> => {
    const bridge = getSteamBridge();
    if (!bridge || busy) return;
    const enabled = status?.enabled !== true;
    if (enabled && !window.confirm(copy(extendedStatsConsentCopy))) return;

    setBusy('toggle');
    setError(null);
    try {
      setStatus(await bridge.setListeningStatsEnabled(enabled));
    } catch (toggleError) {
      setError(formatUserFacingError(toggleError));
    } finally {
      setBusy(null);
    }
  }, [busy, copy, status?.enabled]);

  const handleSync = useCallback(async (): Promise<void> => {
    const bridge = getSteamBridge();
    if (!bridge || busy) return;
    setBusy('sync');
    setError(null);
    try {
      setStatus(await bridge.syncListeningStats());
    } catch (syncError) {
      setError(formatUserFacingError(syncError));
    } finally {
      setBusy(null);
    }
  }, [busy]);

  const errorMessage = useMemo(() => {
    if (!status?.lastError) return null;
    if (status.lastError === 'stats_not_published') return copy({
      'zh-CN': 'Steamworks 中还没有完整发布当前同步范围所需的统计定义。', 'zh-TW': 'Steamworks 中尚未完整發佈目前同步範圍所需的統計定義。', 'ja-JP': '現在の同期範囲に必要な統計定義がSteamworksでまだすべて公開されていません。', 'en-US': 'The stat definitions required for the current sync scope are not fully published in Steamworks yet.', 'ko-KR': '현재 동기화 범위에 필요한 통계 정의가 Steamworks에 아직 모두 게시되지 않았습니다.',
    });
    if (status.lastError === 'steam_unavailable') return copy({
      'zh-CN': 'Steam 客户端当前不可用。', 'zh-TW': 'Steam 用戶端目前無法使用。', 'ja-JP': 'Steamクライアントを利用できません。', 'en-US': 'The Steam client is unavailable.', 'ko-KR': 'Steam 클라이언트를 사용할 수 없습니다.',
    });
    if (status.lastError === 'store_failed' && status.pendingStore) return copy({
      'zh-CN': '数值已经写入 Steam 内存，持久保存暂时失败；下次同步会强制重试保存。', 'zh-TW': '數值已寫入 Steam 記憶體，持久儲存暫時失敗；下次同步會強制重試儲存。', 'ja-JP': '値はSteamメモリに反映されましたが、永続保存に失敗しました。次回の同期で保存を再試行します。', 'en-US': 'Values reached Steam memory, but persistent storage failed. The next sync will force another store attempt.', 'ko-KR': '값은 Steam 메모리에 반영되었지만 영구 저장에 실패했습니다. 다음 동기화에서 저장을 강제로 다시 시도합니다.',
    });
    return copy({
      'zh-CN': '这次同步没有成功，ECHO 会在下次同步时重试。', 'zh-TW': '這次同步未成功，ECHO 會在下次同步時重試。', 'ja-JP': '同期に失敗しました。次回の同期で再試行します。', 'en-US': 'This sync did not complete; ECHO will retry next time.', 'ko-KR': '이번 동기화가 완료되지 않았습니다. 다음 동기화 때 다시 시도합니다.',
    });
  }, [copy, status?.lastError, status?.pendingStore]);

  const formatValue = useCallback((value: number | null, unit: SteamListeningStatsStatus['stats'][number]['unit']): string => {
    if (value === null) return '—';
    if (unit === 'minutes') {
      const hours = Math.floor(value / 60);
      const minutes = value % 60;
      return hours > 0 ? `${hours.toLocaleString(locale)}h ${minutes.toString().padStart(2, '0')}m` : `${minutes.toLocaleString(locale)}m`;
    }
    if (unit === 'days') return copy({
      'zh-CN': `${value.toLocaleString(locale)} 天`, 'zh-TW': `${value.toLocaleString(locale)} 天`, 'ja-JP': `${value.toLocaleString(locale)}日`, 'en-US': `${value.toLocaleString(locale)} days`, 'ko-KR': `${value.toLocaleString(locale)}일`,
    });
    return value.toLocaleString(locale);
  }, [copy, locale]);

  const enabled = status?.enabled === true;
  const visibleStats = status?.stats.filter((stat) => enabled || stat.syncPolicy === 'achievement') ?? [];
  const syncSummary = status ? (() => {
    if (status.syncState === 'retrying' && status.nextRetryAt) return copy({
      'zh-CN': `同步失败，${new Date(status.nextRetryAt).toLocaleTimeString(locale)} 自动重试`, 'zh-TW': `同步失敗，${new Date(status.nextRetryAt).toLocaleTimeString(locale)} 自動重試`, 'ja-JP': `同期失敗。${new Date(status.nextRetryAt).toLocaleTimeString(locale)} に再試行`, 'en-US': `Sync failed; retrying at ${new Date(status.nextRetryAt).toLocaleTimeString(locale)}`, 'ko-KR': `동기화 실패. ${new Date(status.nextRetryAt).toLocaleTimeString(locale)}에 재시도`,
    });
    if (status.syncState === 'syncing') return copy({ 'zh-CN': '正在读取 Steam 账号进度…', 'zh-TW': '正在讀取 Steam 帳戶進度…', 'ja-JP': 'Steamアカウントの進捗を読み込み中…', 'en-US': 'Reading Steam account progress…', 'ko-KR': 'Steam 계정 진행 상황을 읽는 중…' });
    if (status.pendingCount > 0) return copy({ 'zh-CN': `还有 ${status.pendingCount} 项等待写入 Steam`, 'zh-TW': `還有 ${status.pendingCount} 項等待寫入 Steam`, 'ja-JP': `${status.pendingCount}件がSteamへの保存待ち`, 'en-US': `${status.pendingCount} values waiting for Steam`, 'ko-KR': `${status.pendingCount}개 값이 Steam 저장 대기 중` });
    if (status.lastSyncedAt) return copy({
      'zh-CN': `Steam 账号已同步 · ${new Date(status.lastSyncedAt).toLocaleString(locale)}`, 'zh-TW': `Steam 帳戶已同步 · ${new Date(status.lastSyncedAt).toLocaleString(locale)}`, 'ja-JP': `Steamアカウント同期済み · ${new Date(status.lastSyncedAt).toLocaleString(locale)}`, 'en-US': `Steam account synced · ${new Date(status.lastSyncedAt).toLocaleString(locale)}`, 'ko-KR': `Steam 계정 동기화됨 · ${new Date(status.lastSyncedAt).toLocaleString(locale)}`,
    });
    return copy({ 'zh-CN': '等待首次 Steam 同步', 'zh-TW': '等待首次 Steam 同步', 'ja-JP': '最初のSteam同期を待機中', 'en-US': 'Waiting for the first Steam sync', 'ko-KR': '첫 Steam 동기화 대기 중' });
  })() : null;
  return (
    <section className="steam-listening-stats-panel" aria-label={copy({ 'zh-CN': 'Steam 聆听统计', 'zh-TW': 'Steam 聆聽統計', 'ja-JP': 'Steam再生統計', 'en-US': 'Steam listening stats', 'ko-KR': 'Steam 감상 통계' })}>
      <div className="steam-listening-stats-header">
        <div>
          <span><BarChart3 size={18} /> Steam Stats</span>
          <h2>{copy({ 'zh-CN': '把进度留在 Steam', 'zh-TW': '將進度留在 Steam', 'ja-JP': '進捗をSteamに保存', 'en-US': 'Keep your progress on Steam', 'ko-KR': '진행도를 Steam에 보관' })}</h2>
          <p>{copy({ 'zh-CN': '累计进度通过 Steam 账号同步，换电脑后自动恢复；扩展统计仍由你决定是否开启。', 'zh-TW': '累計進度會透過 Steam 帳戶同步，換電腦後自動還原；擴充統計仍由你決定是否開啟。', 'ja-JP': '累積進捗はSteamアカウント経由で同期され、別のPCでも自動復元されます。拡張統計は任意です。', 'en-US': 'Cumulative progress syncs through your Steam account and restores on another PC; extended stats remain optional.', 'ko-KR': '누적 진행도는 Steam 계정으로 동기화되어 다른 PC에서도 자동 복원되며 확장 통계는 선택 사항입니다.' })}</p>
        </div>
        <div className="steam-listening-stats-actions">
          <button className="primary" type="button" disabled={busy !== null} onClick={() => void handleSync()}><RefreshCw size={15} className={busy === 'sync' ? 'spinning-icon' : undefined} />{copy({ 'zh-CN': '立即同步进度', 'zh-TW': '立即同步進度', 'ja-JP': '進捗を今すぐ同期', 'en-US': 'Sync progress now', 'ko-KR': '지금 진행도 동기화' })}</button>
          <button className="secondary" type="button" disabled={busy !== null} onClick={() => void handleToggle()}>{enabled ? copy({ 'zh-CN': '关闭扩展统计', 'zh-TW': '關閉擴充統計', 'ja-JP': '拡張統計を停止', 'en-US': 'Disable extended stats', 'ko-KR': '확장 통계 끄기' }) : copy({ 'zh-CN': '开启扩展统计', 'zh-TW': '開啟擴充統計', 'ja-JP': '拡張統計を有効化', 'en-US': 'Enable extended stats', 'ko-KR': '확장 통계 켜기' })}</button>
        </div>
      </div>

      <div className="steam-listening-stats-grid">
          {visibleStats.map((stat) => {
            const progressValue = Math.max(stat.localValue, stat.steamValue ?? 0);
            const target = nextSteamListeningStatsMilestone(stat.id, progressValue);
            const progressPercent = target === null ? 100 : Math.min(100, (progressValue / target) * 100);
            return (
              <div key={stat.id}>
                <span>{copy(statLabels[stat.id])}</span>
                <strong>{formatValue(progressValue, stat.unit)}</strong>
                <small>{stat.steamValue === null ? copy({ 'zh-CN': '尚未写入 Steam', 'zh-TW': '尚未寫入 Steam', 'ja-JP': 'Steamには未保存', 'en-US': 'Not stored on Steam yet', 'ko-KR': '아직 Steam에 저장되지 않음' }) : copy({ 'zh-CN': `Steam：${formatValue(stat.steamValue, stat.unit)}`, 'zh-TW': `Steam：${formatValue(stat.steamValue, stat.unit)}`, 'ja-JP': `Steam：${formatValue(stat.steamValue, stat.unit)}`, 'en-US': `Steam: ${formatValue(stat.steamValue, stat.unit)}`, 'ko-KR': `Steam: ${formatValue(stat.steamValue, stat.unit)}` })}</small>
                {target !== null ? (
                  <div className="steam-listening-stats-progress">
                    <div aria-label={copy({ 'zh-CN': `${copy(statLabels[stat.id])}成就进度`, 'zh-TW': `${copy(statLabels[stat.id])}成就進度`, 'ja-JP': `${copy(statLabels[stat.id])}の実績進捗`, 'en-US': `${copy(statLabels[stat.id])} achievement progress`, 'ko-KR': `${copy(statLabels[stat.id])} 도전 과제 진행도` })} aria-valuemax={target} aria-valuemin={0} aria-valuenow={Math.min(progressValue, target)} role="progressbar"><i style={{ width: `${progressPercent}%` }} /></div>
                    <small>{`${formatValue(progressValue, stat.unit)} / ${formatValue(target, stat.unit)}`}</small>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      {!enabled ? <div className="steam-listening-stats-opt-in"><ShieldCheck size={20} /><div><strong>{copy({ 'zh-CN': '扩展统计已关闭', 'zh-TW': '擴充統計已關閉', 'ja-JP': '拡張統計はオフ', 'en-US': 'Extended stats are off', 'ko-KR': '확장 통계 꺼짐' })}</strong><span>{copy({ 'zh-CN': '最长单次聆听和重逢旧歌不会上传；关闭扩展统计不影响上方的 Steam 成就进度。', 'zh-TW': '最長單次聆聽與重逢舊歌不會上傳；關閉擴充統計不影響上方的 Steam 成就進度。', 'ja-JP': '最長セッションと再発見した曲は送信されません。拡張統計をオフにしても上のSteam実績進捗には影響しません。', 'en-US': 'Longest session and rediscovered tracks are not uploaded. Keeping extended stats off does not stop the Steam achievement progress shown above.', 'ko-KR': '최장 세션과 다시 발견한 트랙은 업로드되지 않습니다. 확장 통계를 꺼도 위 Steam 도전 과제 진행도에는 영향을 주지 않습니다.' })}</span></div></div> : null}
      {syncSummary ? <p className="steam-listening-stats-footnote" data-state={status?.syncState}>{syncSummary}</p> : null}
      {errorMessage || error ? <p className="steam-listening-stats-error">{errorMessage ?? error}</p> : null}
    </section>
  );
};
