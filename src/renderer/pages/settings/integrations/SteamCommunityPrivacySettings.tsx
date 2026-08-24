import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Cloud, RefreshCw, ShieldCheck, Trophy } from 'lucide-react';
import type { SteamCloudSettingsStatus, SteamLeaderboardStatus, SteamListeningStatsStatus } from '../../../../shared/types/steam';
import { leaderboardConsentCopy, extendedStatsConsentCopy } from '../../../components/steam/steamParticipationCopy';
import { useI18n } from '../../../i18n/I18nProvider';
import { getSteamBridge } from '../../../utils/echoBridge';
import { formatUserFacingError } from '../../../utils/userFacingError';
import { StatusText, ToggleButton } from '../components/SettingsPrimitives';
import { settingsLocaleCopy } from '../settingsSubsections';
import './steam-community-privacy-settings.css';

type LocaleCopy = Record<'zh-CN' | 'zh-TW' | 'ja-JP' | 'en-US' | 'ko-KR', string>;

type SteamCommunityPrivacySettingsProps = {
  highlightedSettingId?: string | null;
};

export const SteamCommunityPrivacySettings = ({ highlightedSettingId }: SteamCommunityPrivacySettingsProps): JSX.Element => {
  const { locale } = useI18n();
  const [statsStatus, setStatsStatus] = useState<SteamListeningStatsStatus | null>(null);
  const [cloudStatus, setCloudStatus] = useState<SteamCloudSettingsStatus | null>(null);
  const [leaderboardStatus, setLeaderboardStatus] = useState<SteamLeaderboardStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'stats' | 'stats-sync' | 'leaderboards' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copy = useCallback((values: LocaleCopy): string => settingsLocaleCopy(locale, values), [locale]);

  useEffect(() => {
    const bridge = getSteamBridge();
    if (!bridge) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const refreshStatuses = (synchronize: boolean): void => {
      const statsRequest = synchronize ? bridge.syncListeningStats() : bridge.getListeningStatsStatus();
      void Promise.allSettled([statsRequest, bridge.getCloudSettingsStatus(), bridge.getLeaderboardStatus()])
      .then(([statsResult, cloudResult, leaderboardResult]) => {
        if (cancelled) return;
        if (statsResult.status === 'fulfilled') setStatsStatus(statsResult.value);
        if (cloudResult.status === 'fulfilled') setCloudStatus(cloudResult.value);
        if (leaderboardResult.status === 'fulfilled') setLeaderboardStatus(leaderboardResult.value);
        const failedResult = statsResult.status === 'rejected' ? statsResult : cloudResult.status === 'rejected' ? cloudResult : leaderboardResult.status === 'rejected' ? leaderboardResult : null;
        if (failedResult) setError(formatUserFacingError(failedResult.reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    };
    refreshStatuses(true);
    const timer = window.setInterval(() => refreshStatuses(false), 10_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const syncStats = useCallback(async (): Promise<void> => {
    const bridge = getSteamBridge();
    if (!bridge || busy) return;
    setBusy('stats-sync');
    setError(null);
    try {
      setStatsStatus(await bridge.syncListeningStats());
    } catch (syncError) {
      setError(formatUserFacingError(syncError));
    } finally {
      setBusy(null);
    }
  }, [busy]);

  const toggleExtendedStats = useCallback(async (): Promise<void> => {
    const bridge = getSteamBridge();
    if (!bridge || busy) return;
    const enabled = statsStatus?.enabled !== true;
    if (enabled && !window.confirm(copy(extendedStatsConsentCopy))) return;

    setBusy('stats');
    setError(null);
    try {
      setStatsStatus(await bridge.setListeningStatsEnabled(enabled));
    } catch (toggleError) {
      setError(formatUserFacingError(toggleError));
    } finally {
      setBusy(null);
    }
  }, [busy, copy, statsStatus?.enabled]);

  const toggleLeaderboards = useCallback(async (): Promise<void> => {
    const bridge = getSteamBridge();
    if (!bridge || busy) return;
    const enabled = leaderboardStatus?.enabled !== true;
    if (enabled && !window.confirm(copy(leaderboardConsentCopy))) return;

    setBusy('leaderboards');
    setError(null);
    try {
      setLeaderboardStatus(await bridge.setLeaderboardsEnabled(enabled));
    } catch (toggleError) {
      setError(formatUserFacingError(toggleError));
    } finally {
      setBusy(null);
    }
  }, [busy, copy, leaderboardStatus?.enabled]);

  const enabledLabel = copy({ 'zh-CN': '已开启', 'zh-TW': '已開啟', 'ja-JP': 'オン', 'en-US': 'Enabled', 'ko-KR': '켜짐' });
  const disabledLabel = copy({ 'zh-CN': '已关闭', 'zh-TW': '已關閉', 'ja-JP': 'オフ', 'en-US': 'Disabled', 'ko-KR': '꺼짐' });
  const checkingLabel = copy({ 'zh-CN': '正在检查', 'zh-TW': '正在檢查', 'ja-JP': '確認中', 'en-US': 'Checking', 'ko-KR': '확인 중' });
  const unavailableLabel = copy({ 'zh-CN': '需通过 Steam 启动', 'zh-TW': '需透過 Steam 啟動', 'ja-JP': 'Steamから起動が必要', 'en-US': 'Launch through Steam', 'ko-KR': 'Steam에서 실행 필요' });
  const statusLabel = (enabled: boolean | undefined): string => loading ? checkingLabel : enabled === undefined ? unavailableLabel : enabled ? enabledLabel : disabledLabel;
  const progressSyncLabel = statsStatus?.syncState === 'retrying'
    ? copy({ 'zh-CN': `重试 ${statsStatus.retryCount} · ${statsStatus.pendingCount} 项待同步`, 'zh-TW': `重試 ${statsStatus.retryCount} · ${statsStatus.pendingCount} 項待同步`, 'ja-JP': `再試行 ${statsStatus.retryCount} · ${statsStatus.pendingCount}件待機`, 'en-US': `Retry ${statsStatus.retryCount} · ${statsStatus.pendingCount} pending`, 'ko-KR': `재시도 ${statsStatus.retryCount} · ${statsStatus.pendingCount}개 대기` })
    : statsStatus?.syncState === 'synced'
      ? copy({ 'zh-CN': 'Steam 账号已同步', 'zh-TW': 'Steam 帳戶已同步', 'ja-JP': 'Steamアカウント同期済み', 'en-US': 'Steam account synced', 'ko-KR': 'Steam 계정 동기화됨' })
      : statsStatus?.syncState === 'syncing'
        ? copy({ 'zh-CN': '同步中', 'zh-TW': '同步中', 'ja-JP': '同期中', 'en-US': 'Syncing', 'ko-KR': '동기화 중' })
        : statsStatus?.lastError
          ? copy({ 'zh-CN': '同步失败', 'zh-TW': '同步失敗', 'ja-JP': '同期失敗', 'en-US': 'Sync failed', 'ko-KR': '동기화 실패' })
          : checkingLabel;
  const cloudSyncLabel = cloudStatus?.syncState === 'synced'
    ? copy({ 'zh-CN': '便携设置已同步', 'zh-TW': '可移轉設定已同步', 'ja-JP': '移行設定は同期済み', 'en-US': 'Portable settings synced', 'ko-KR': '이식 설정 동기화됨' })
    : cloudStatus?.syncState === 'retrying'
      ? copy({ 'zh-CN': `自动重试 ${cloudStatus.retryCount}`, 'zh-TW': `自動重試 ${cloudStatus.retryCount}`, 'ja-JP': `自動再試行 ${cloudStatus.retryCount}`, 'en-US': `Auto retry ${cloudStatus.retryCount}`, 'ko-KR': `자동 재시도 ${cloudStatus.retryCount}` })
      : cloudStatus?.syncState === 'pending'
        ? copy({ 'zh-CN': '等待上传', 'zh-TW': '等待上傳', 'ja-JP': 'アップロード待ち', 'en-US': 'Upload pending', 'ko-KR': '업로드 대기' })
        : cloudStatus?.syncState === 'disabled'
          ? copy({ 'zh-CN': 'Steam Cloud 已关闭', 'zh-TW': 'Steam Cloud 已關閉', 'ja-JP': 'Steam Cloudはオフ', 'en-US': 'Steam Cloud disabled', 'ko-KR': 'Steam Cloud 꺼짐' })
          : cloudStatus?.lastError
            ? copy({ 'zh-CN': '云同步失败', 'zh-TW': '雲端同步失敗', 'ja-JP': 'クラウド同期失敗', 'en-US': 'Cloud sync failed', 'ko-KR': '클라우드 동기화 실패' })
            : checkingLabel;

  return (
    <section
      className="steam-community-settings"
      aria-label={copy({ 'zh-CN': 'Steam 成就、统计与社区', 'zh-TW': 'Steam 成就、統計與社群', 'ja-JP': 'Steam実績・統計・コミュニティ', 'en-US': 'Steam achievements, stats, and community', 'ko-KR': 'Steam 도전 과제, 통계 및 커뮤니티' })}
    >
      <div className="steam-community-settings__grid">
        <article className="steam-community-card" id="settings-row-steam-achievement-progress" data-search-highlight={highlightedSettingId === 'settings-row-steam-achievement-progress' ? 'true' : undefined}>
          <span className="steam-community-card__icon is-achievement"><ShieldCheck size={17} /></span>
          <div className="steam-community-card__copy">
            <h3>{copy({ 'zh-CN': '成就进度', 'zh-TW': '成就進度', 'ja-JP': '実績進捗', 'en-US': 'Achievement progress', 'ko-KR': '도전 과제 진행도' })}</h3>
            <p>{copy({ 'zh-CN': '六项整数累计，不含曲名、路径或设备。', 'zh-TW': '六項整數累計，不含歌曲名稱、路徑或裝置。', 'ja-JP': '曲名、パス、デバイスを含まない6つの整数累積値。', 'en-US': 'Six integer totals; no track names, paths, or devices.', 'ko-KR': '곡명, 경로 또는 장치가 없는 정수 누적값 6개.' })}</p>
          </div>
          <div className="steam-community-card__action">
            <StatusText tone={statsStatus?.syncState === 'synced' ? 'good' : 'muted'}>{progressSyncLabel}</StatusText>
            <button className="steam-community-card__sync" type="button" aria-label={copy({ 'zh-CN': '立即同步 Steam 成就进度', 'zh-TW': '立即同步 Steam 成就進度', 'ja-JP': 'Steam実績進捗を今すぐ同期', 'en-US': 'Sync Steam achievement progress now', 'ko-KR': 'Steam 도전 과제 진행도 지금 동기화' })} disabled={loading || busy !== null || !getSteamBridge()} onClick={() => void syncStats()}>
              <RefreshCw size={13} className={busy === 'stats-sync' ? 'spinning-icon' : undefined} />
            </button>
          </div>
        </article>
        <article className="steam-community-card" id="settings-row-steam-extended-stats" data-search-highlight={highlightedSettingId === 'settings-row-steam-extended-stats' ? 'true' : undefined}>
          <span className="steam-community-card__icon is-stats"><BarChart3 size={17} /></span>
          <div className="steam-community-card__copy">
            <h3>{copy({ 'zh-CN': '扩展个人统计', 'zh-TW': '擴充個人統計', 'ja-JP': '拡張個人統計', 'en-US': 'Extended personal stats', 'ko-KR': '확장 개인 통계' })}</h3>
            <p>{copy({ 'zh-CN': '最长会话与重逢旧歌，默认开启。', 'zh-TW': '最長工作階段與重逢舊歌，預設開啟。', 'ja-JP': '最長セッションと再発見した曲。既定でオン。', 'en-US': 'Longest session and rediscovered tracks; on by default.', 'ko-KR': '최장 세션과 다시 발견한 트랙. 기본으로 켜짐.' })}</p>
          </div>
          <div className="steam-community-card__action">
            <StatusText tone={statsStatus?.enabled ? 'good' : 'muted'}>{statusLabel(statsStatus?.enabled)}</StatusText>
            <ToggleButton
              active={statsStatus?.enabled === true}
              ariaLabel={copy({ 'zh-CN': '切换 Steam 扩展个人统计', 'zh-TW': '切換 Steam 擴充個人統計', 'ja-JP': 'Steam拡張個人統計を切り替え', 'en-US': 'Toggle Steam extended personal stats', 'ko-KR': 'Steam 확장 개인 통계 전환' })}
              disabled={loading || busy !== null || !getSteamBridge()}
              onClick={() => void toggleExtendedStats()}
            />
          </div>
        </article>
        <article className="steam-community-card">
          <span className="steam-community-card__icon is-cloud"><Cloud size={17} /></span>
          <div className="steam-community-card__copy">
            <h3>{copy({ 'zh-CN': '便携设置云同步', 'zh-TW': '可移轉設定雲端同步', 'ja-JP': '移行設定のクラウド同期', 'en-US': 'Portable settings cloud sync', 'ko-KR': '이식 설정 클라우드 동기화' })}</h3>
            <p>{copy({ 'zh-CN': '主题与界面偏好；不上传设备、路径或凭据。', 'zh-TW': '主題與介面偏好；不上傳裝置、路徑或憑證。', 'ja-JP': 'テーマとUI設定のみ。デバイス、パス、認証情報は除外。', 'en-US': 'Theme and UI preferences; no devices, paths, or credentials.', 'ko-KR': '테마 및 UI 설정만. 장치, 경로, 자격 증명 제외.' })}</p>
          </div>
          <StatusText tone={cloudStatus?.syncState === 'synced' ? 'good' : 'muted'}>{cloudSyncLabel}</StatusText>
        </article>
        <article className="steam-community-card" id="settings-row-steam-leaderboards" data-search-highlight={highlightedSettingId === 'settings-row-steam-leaderboards' ? 'true' : undefined}>
          <span className="steam-community-card__icon is-leaderboard"><Trophy size={17} /></span>
          <div className="steam-community-card__copy">
            <h3>{copy({ 'zh-CN': '聆听排行榜', 'zh-TW': '聆聽排行榜', 'ja-JP': 'リスニングランキング', 'en-US': 'Listening leaderboards', 'ko-KR': '감상 순위표' })}</h3>
            <p>{copy({ 'zh-CN': '账号关联的聚合成绩，加入前确认。', 'zh-TW': '帳號關聯的彙總成績，加入前確認。', 'ja-JP': 'アカウント連携の集計スコア。参加前に確認。', 'en-US': 'Account-linked aggregate scores; confirm before joining.', 'ko-KR': '계정 연결 집계 점수. 참여 전 확인.' })}</p>
          </div>
          <div className="steam-community-card__action">
            <StatusText tone={leaderboardStatus?.enabled ? 'good' : 'muted'}>{statusLabel(leaderboardStatus?.enabled)}</StatusText>
            <ToggleButton
              active={leaderboardStatus?.enabled === true}
              ariaLabel={copy({ 'zh-CN': '切换 Steam 聆听排行榜', 'zh-TW': '切換 Steam 聆聽排行榜', 'ja-JP': 'Steamリスニングランキングを切り替え', 'en-US': 'Toggle Steam listening leaderboards', 'ko-KR': 'Steam 감상 순위표 전환' })}
              disabled={loading || busy !== null || !getSteamBridge()}
              onClick={() => void toggleLeaderboards()}
            />
          </div>
        </article>
      </div>
      {error ? <p className="steam-community-settings__error" role="alert">{error}</p> : null}
    </section>
  );
};
