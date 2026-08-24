import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clipboard, LogIn, Radio, Send, Unplug, UsersRound } from 'lucide-react';
import type { SteamListenTogetherProbeSnapshot } from '../../../shared/types/steam';
import type { Locale } from '../../i18n/locales';
import { settingsLocaleCopy } from '../../pages/settings/settingsSubsections';
import { getSteamBridge } from '../../utils/echoBridge';
import { formatUserFacingError } from '../../utils/userFacingError';
import './steam-listen-together-probe-panel.css';

const formatNumber = (value: number): string => new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
}).format(value);

export const SteamListenTogetherProbePanel = ({ locale }: { locale: Locale }): JSX.Element | null => {
  const [snapshot, setSnapshot] = useState<SteamListenTogetherProbeSnapshot | null>(null);
  const [lobbyId, setLobbyId] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | 'invite' | 'leave' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copy = useCallback((values: Record<Locale, string>): string =>
    settingsLocaleCopy(locale, values), [locale]);

  const refresh = useCallback(async (): Promise<void> => {
    const bridge = getSteamBridge();
    if (!bridge) return;
    try {
      setSnapshot(await bridge.getListenTogetherProbeStatus());
    } catch (refreshError) {
      setError(formatUserFacingError(refreshError));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!snapshot?.transportRunning) return undefined;
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => window.clearInterval(timer);
  }, [refresh, snapshot?.transportRunning]);

  const run = useCallback(async (
    action: Exclude<typeof busy, null>,
    operation: () => Promise<SteamListenTogetherProbeSnapshot>,
  ): Promise<void> => {
    setBusy(action);
    setError(null);
    try {
      setSnapshot(await operation());
    } catch (operationError) {
      setError(formatUserFacingError(operationError));
    } finally {
      setBusy(null);
    }
  }, []);

  const errorLabel = useMemo(() => {
    if (error) return error;
    if (!snapshot?.lastError) return null;
    const labels: Partial<Record<SteamListenTogetherProbeSnapshot['lastError'] & string, string>> = {
      steam_unavailable: copy({ 'zh-CN': 'Steamworks 尚未连接。', 'zh-TW': 'Steamworks 尚未連線。', 'ja-JP': 'Steamworks に接続されていません。', 'en-US': 'Steamworks is not connected.', 'ko-KR': 'Steamworks가 연결되지 않았습니다.' }),
      invalid_room_id: copy({ 'zh-CN': '房间 ID 无效。', 'zh-TW': '房間 ID 無效。', 'ja-JP': 'ルーム ID が無効です。', 'en-US': 'The room ID is invalid.', 'ko-KR': '방 ID가 올바르지 않습니다.' }),
      incompatible_room: copy({ 'zh-CN': '这不是兼容的一起听测试房间。', 'zh-TW': '這不是相容的一起聽測試房間。', 'ja-JP': '互換性のあるテストルームではありません。', 'en-US': 'This is not a compatible listen-together probe room.', 'ko-KR': '호환되는 함께 듣기 테스트 방이 아닙니다.' }),
      host_left: copy({ 'zh-CN': '房主已离开，测试结束。', 'zh-TW': '房主已離開，測試結束。', 'ja-JP': 'ホストが退出したためテストを終了しました。', 'en-US': 'The host left, so the probe ended.', 'ko-KR': '호스트가 나가 테스트가 종료되었습니다.' }),
      p2p_session_failed: copy({ 'zh-CN': 'Steam P2P 会话连接失败。', 'zh-TW': 'Steam P2P 工作階段連線失敗。', 'ja-JP': 'Steam P2P セッションに接続できませんでした。', 'en-US': 'The Steam P2P session failed.', 'ko-KR': 'Steam P2P 세션 연결에 실패했습니다.' }),
    };
    return labels[snapshot.lastError] ?? snapshot.lastError;
  }, [copy, error, snapshot?.lastError]);

  if (!snapshot?.enabled) return null;

  const bridge = getSteamBridge();
  const connected = snapshot.state === 'connected';
  const roleLabel = snapshot.role === 'host'
    ? copy({ 'zh-CN': '房主', 'zh-TW': '房主', 'ja-JP': 'ホスト', 'en-US': 'Host', 'ko-KR': '호스트' })
    : snapshot.role === 'guest'
      ? copy({ 'zh-CN': '听众', 'zh-TW': '聽眾', 'ja-JP': 'ゲスト', 'en-US': 'Guest', 'ko-KR': '게스트' })
      : copy({ 'zh-CN': '未加入', 'zh-TW': '未加入', 'ja-JP': '未参加', 'en-US': 'Not joined', 'ko-KR': '참여 안 함' });

  return (
    <section className="steam-listen-probe" aria-label="Steam listen-together transport probe">
      <header className="steam-listen-probe__header">
        <span><Radio size={17} /><strong>{copy({ 'zh-CN': '一起听传输实验', 'zh-TW': '一起聽傳輸實驗', 'ja-JP': '一緒に聴く通信テスト', 'en-US': 'Listen-together transport probe', 'ko-KR': '함께 듣기 전송 테스트' })}</strong></span>
        <small>{roleLabel}</small>
      </header>
      <p className="settings-inline-note">
        {copy({
          'zh-CN': `只发送约 ${snapshot.targetKbps} kbps 的合成测试包，不发送歌曲、标签或本地路径。`,
          'zh-TW': `只傳送約 ${snapshot.targetKbps} kbps 的合成測試封包，不傳送歌曲、標籤或本機路徑。`,
          'ja-JP': `約 ${snapshot.targetKbps} kbps の合成テストパケットのみ送信し、曲、タグ、ローカルパスは送信しません。`,
          'en-US': `Sends only ~${snapshot.targetKbps} kbps of synthetic probe packets—never songs, tags, or local paths.`,
          'ko-KR': `약 ${snapshot.targetKbps} kbps의 합성 테스트 패킷만 전송하며 곡, 태그, 로컬 경로는 보내지 않습니다.`,
        })}
      </p>

      {connected ? (
        <>
          <div className="settings-status-grid steam-listen-probe__metrics" aria-live="polite">
            <span><em>Lobby ID</em><strong>{snapshot.lobbyId ?? 'N/A'}</strong></span>
            <span><em>{copy({ 'zh-CN': '成员', 'zh-TW': '成員', 'ja-JP': 'メンバー', 'en-US': 'Members', 'ko-KR': '멤버' })}</em><strong>{snapshot.memberCount} / 2</strong></span>
            <span><em>{copy({ 'zh-CN': '接收速率', 'zh-TW': '接收速率', 'ja-JP': '受信速度', 'en-US': 'Receive rate', 'ko-KR': '수신 속도' })}</em><strong>{formatNumber(snapshot.receivedKbps)} kbps</strong></span>
            <span><em>RTT</em><strong>{snapshot.averageRttMs === null ? 'N/A' : `${formatNumber(snapshot.averageRttMs)} ms`}</strong></span>
            <span><em>{copy({ 'zh-CN': '估算丢包', 'zh-TW': '估算遺失', 'ja-JP': '推定損失', 'en-US': 'Estimated loss', 'ko-KR': '예상 손실' })}</em><strong>{formatNumber(snapshot.estimatedLossPercent)}%</strong></span>
            <span><em>{copy({ 'zh-CN': '发送失败', 'zh-TW': '傳送失敗', 'ja-JP': '送信失敗', 'en-US': 'Send failures', 'ko-KR': '전송 실패' })}</em><strong>{snapshot.sendFailures}</strong></span>
          </div>
          <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions steam-listen-probe__actions">
            {snapshot.role === 'host' ? (
              <button className="settings-action-button" type="button" disabled={busy !== null} onClick={() => bridge && void run('invite', () => bridge.openListenTogetherProbeInvite())}>
                <Send size={15} />{copy({ 'zh-CN': '邀请 Steam 好友', 'zh-TW': '邀請 Steam 好友', 'ja-JP': 'Steam フレンドを招待', 'en-US': 'Invite Steam friend', 'ko-KR': 'Steam 친구 초대' })}
              </button>
            ) : null}
            {snapshot.lobbyId ? (
              <button className="settings-action-button" type="button" onClick={() => void window.navigator.clipboard?.writeText(snapshot.lobbyId ?? '')}>
                <Clipboard size={15} />{copy({ 'zh-CN': '复制房间 ID', 'zh-TW': '複製房間 ID', 'ja-JP': 'ルーム ID をコピー', 'en-US': 'Copy room ID', 'ko-KR': '방 ID 복사' })}
              </button>
            ) : null}
            <button className="settings-action-button is-danger" type="button" disabled={busy !== null} onClick={() => bridge && void run('leave', () => bridge.leaveListenTogetherProbeRoom())}>
              <Unplug size={15} />{copy({ 'zh-CN': '结束测试', 'zh-TW': '結束測試', 'ja-JP': 'テスト終了', 'en-US': 'End probe', 'ko-KR': '테스트 종료' })}
            </button>
          </div>
        </>
      ) : (
        <div className="steam-listen-probe__join">
          <button className="settings-action-button" type="button" disabled={busy !== null || !snapshot.available} onClick={() => bridge && void run('create', () => bridge.createListenTogetherProbeRoom())}>
            <UsersRound size={15} />{busy === 'create' ? '...' : copy({ 'zh-CN': '创建双人测试房', 'zh-TW': '建立雙人測試房', 'ja-JP': '2人テストルームを作成', 'en-US': 'Create two-person probe', 'ko-KR': '2인 테스트 방 만들기' })}
          </button>
          <div className="steam-listen-probe__join-code">
            <input value={lobbyId} inputMode="numeric" placeholder="Lobby ID" aria-label="Lobby ID" disabled={busy !== null} onChange={(event) => setLobbyId(event.target.value.replace(/\s+/g, ''))} />
            <button className="settings-action-button" type="button" disabled={busy !== null || !snapshot.available || lobbyId.length === 0} onClick={() => bridge && void run('join', () => bridge.joinListenTogetherProbeRoom(lobbyId))}>
              <LogIn size={15} />{busy === 'join' ? '...' : copy({ 'zh-CN': '加入', 'zh-TW': '加入', 'ja-JP': '参加', 'en-US': 'Join', 'ko-KR': '참여' })}
            </button>
          </div>
        </div>
      )}
      {errorLabel ? <p className="steam-listen-probe__error" role="alert">{errorLabel}</p> : null}
    </section>
  );
};
