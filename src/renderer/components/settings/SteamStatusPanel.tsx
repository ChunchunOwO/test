import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clipboard, Download, RefreshCw, Upload } from 'lucide-react';
import type { SteamCloudSettingsStatus, SteamStatus } from '../../../shared/types/steam';
import { useI18n } from '../../i18n/I18nProvider';
import { getSteamBridge } from '../../utils/echoBridge';
import { formatUserFacingError } from '../../utils/userFacingError';
import { settingsLocaleCopy } from '../../pages/settings/settingsSubsections';

const emptyValue = 'N/A';

const formatBoolean = (value: boolean | null, yes: string, no: string): string =>
  value === null ? emptyValue : value ? yes : no;

export const formatSteamDiagnostics = (status: SteamStatus): string => [
  'ECHO Steam diagnostics',
  `state=${status.state}`,
  `appId=${status.appId ?? emptyValue}`,
  `appIdSource=${status.appIdSource}`,
  `buildId=${status.appBuildId ?? emptyValue}`,
  `beta=${status.betaName || 'default'}`,
  `subscribed=${status.subscribed ?? emptyValue}`,
  `steamDeck=${status.runningOnSteamDeck ?? emptyValue}`,
  `cloudEnabled=${status.cloudEnabled ?? emptyValue}`,
  `unavailableReason=${status.unavailableReason ?? emptyValue}`,
  `richPresenceMode=${status.richPresence?.mode ?? emptyValue}`,
  `richPresenceState=${status.richPresence?.publicationState ?? emptyValue}`,
  `richPresenceLastPublishedAt=${status.richPresence?.lastPublishedAt ?? emptyValue}`,
  `richPresenceLastError=${status.richPresence?.lastError ?? emptyValue}`,
  `message=${status.message}`,
].join('\n');

export const SteamStatusPanel = (): JSX.Element => {
  const { locale } = useI18n();
  const [status, setStatus] = useState<SteamStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<SteamCloudSettingsStatus | null>(null);
  const [cloudAction, setCloudAction] = useState<'upload' | 'download' | null>(null);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);

  const copy = useCallback((values: Record<string, string>) => settingsLocaleCopy(locale, {
    'zh-CN': values['zh-CN'],
    'zh-TW': values['zh-TW'],
    'ja-JP': values['ja-JP'],
    'en-US': values['en-US'],
    'ko-KR': values['ko-KR'],
  }), [locale]);

  const refresh = useCallback(async (silent = false): Promise<void> => {
    const bridge = getSteamBridge();
    if (!silent) {
      setLoading(true);
      setError(null);
      setCopied(false);
    }
    if (!bridge) {
      if (!silent) setStatus(null);
      setError(copy({
        'zh-CN': 'Steam 桥接不可用，请在 ECHO 桌面版中查看。',
        'zh-TW': 'Steam 橋接無法使用，請在 ECHO 桌面版中查看。',
        'ja-JP': 'Steam ブリッジを利用できません。ECHO デスクトップ版で確認してください。',
        'en-US': 'Steam bridge is unavailable. Open ECHO Desktop to inspect it.',
        'ko-KR': 'Steam 브리지를 사용할 수 없습니다. ECHO 데스크톱 앱에서 확인하세요.',
      }));
      if (!silent) setLoading(false);
      return;
    }

    try {
      const [nextStatus, nextCloudStatus] = await Promise.all([
        bridge.getStatus(),
        bridge.getCloudSettingsStatus(),
      ]);
      setStatus(nextStatus);
      setCloudStatus(nextCloudStatus);
    } catch (refreshError) {
      if (!silent) {
        setStatus(null);
        setCloudStatus(null);
      }
      setError(formatUserFacingError(refreshError));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [copy]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const labels = useMemo(() => ({
    yes: copy({ 'zh-CN': '是', 'zh-TW': '是', 'ja-JP': 'はい', 'en-US': 'Yes', 'ko-KR': '예' }),
    no: copy({ 'zh-CN': '否', 'zh-TW': '否', 'ja-JP': 'いいえ', 'en-US': 'No', 'ko-KR': '아니요' }),
    checking: copy({ 'zh-CN': '正在检查', 'zh-TW': '正在檢查', 'ja-JP': '確認中', 'en-US': 'Checking', 'ko-KR': '확인 중' }),
  }), [copy]);

  const stateLabel = status
    ? copy({
        'zh-CN': status.state === 'ready' ? '已连接' : '未就绪',
        'zh-TW': status.state === 'ready' ? '已連線' : '尚未就緒',
        'ja-JP': status.state === 'ready' ? '接続済み' : '準備未完了',
        'en-US': status.state === 'ready' ? 'Connected' : 'Not ready',
        'ko-KR': status.state === 'ready' ? '연결됨' : '준비되지 않음',
      })
    : labels.checking;

  const handleCopy = useCallback(async (): Promise<void> => {
    if (!status || !window.navigator?.clipboard?.writeText) {
      return;
    }
    await window.navigator.clipboard.writeText(formatSteamDiagnostics(status));
    setCopied(true);
  }, [status]);

  const formatCloudTime = useCallback((value: string | null | undefined): string => {
    if (!value) {
      return emptyValue;
    }
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString(locale) : emptyValue;
  }, [locale]);

  const cloudSyncLabel = cloudStatus ? copy({
    'zh-CN': cloudStatus.syncState === 'synced' ? '已同步' : cloudStatus.syncState === 'retrying' ? `自动重试 ${cloudStatus.retryCount}` : cloudStatus.syncState === 'pending' ? '等待上传' : cloudStatus.syncState === 'disabled' ? '已关闭' : cloudStatus.syncState === 'error' ? '同步失败' : '等待同步',
    'zh-TW': cloudStatus.syncState === 'synced' ? '已同步' : cloudStatus.syncState === 'retrying' ? `自動重試 ${cloudStatus.retryCount}` : cloudStatus.syncState === 'pending' ? '等待上傳' : cloudStatus.syncState === 'disabled' ? '已關閉' : cloudStatus.syncState === 'error' ? '同步失敗' : '等待同步',
    'ja-JP': cloudStatus.syncState === 'synced' ? '同期済み' : cloudStatus.syncState === 'retrying' ? `自動再試行 ${cloudStatus.retryCount}` : cloudStatus.syncState === 'pending' ? 'アップロード待ち' : cloudStatus.syncState === 'disabled' ? 'オフ' : cloudStatus.syncState === 'error' ? '同期失敗' : '同期待ち',
    'en-US': cloudStatus.syncState === 'synced' ? 'Synced' : cloudStatus.syncState === 'retrying' ? `Auto retry ${cloudStatus.retryCount}` : cloudStatus.syncState === 'pending' ? 'Upload pending' : cloudStatus.syncState === 'disabled' ? 'Disabled' : cloudStatus.syncState === 'error' ? 'Sync failed' : 'Waiting to sync',
    'ko-KR': cloudStatus.syncState === 'synced' ? '동기화됨' : cloudStatus.syncState === 'retrying' ? `자동 재시도 ${cloudStatus.retryCount}` : cloudStatus.syncState === 'pending' ? '업로드 대기' : cloudStatus.syncState === 'disabled' ? '꺼짐' : cloudStatus.syncState === 'error' ? '동기화 실패' : '동기화 대기',
  }) : labels.checking;

  const handleCloudUpload = useCallback(async (): Promise<void> => {
    const bridge = getSteamBridge();
    if (!bridge) {
      return;
    }
    setCloudAction('upload');
    setCloudMessage(null);
    try {
      const result = await bridge.uploadCloudSettings();
      setCloudStatus(result);
      setCloudMessage(result.uploaded
        ? copy({
            'zh-CN': '可迁移设置已上传到 Steam Cloud。',
            'zh-TW': '可移轉設定已上傳到 Steam Cloud。',
            'ja-JP': '移行可能な設定を Steam Cloud にアップロードしました。',
            'en-US': 'Portable settings were uploaded to Steam Cloud.',
            'ko-KR': '이식 가능한 설정을 Steam Cloud에 업로드했습니다.',
          })
        : `Steam Cloud: ${result.lastError ?? 'write_failed'}`);
    } catch (uploadError) {
      setCloudMessage(formatUserFacingError(uploadError));
    } finally {
      setCloudAction(null);
    }
  }, [copy]);

  const handleCloudDownload = useCallback(async (): Promise<void> => {
    const bridge = getSteamBridge();
    if (!bridge || !window.confirm(copy({
      'zh-CN': '从 Steam Cloud 下载并覆盖这台电脑上的可迁移设置？本机设备、路径和凭据不会被修改。',
      'zh-TW': '從 Steam Cloud 下載並覆蓋此電腦上的可移轉設定？本機裝置、路徑和憑證不會被修改。',
      'ja-JP': 'Steam Cloud から移行可能な設定をダウンロードして上書きしますか？この PC のデバイス、パス、認証情報は変更されません。',
      'en-US': 'Download and replace portable settings from Steam Cloud? Local devices, paths, and credentials will stay unchanged.',
      'ko-KR': 'Steam Cloud에서 이식 가능한 설정을 다운로드해 덮어쓸까요? 이 PC의 장치, 경로 및 자격 증명은 변경되지 않습니다.',
    }))) {
      return;
    }
    setCloudAction('download');
    setCloudMessage(null);
    try {
      const result = await bridge.downloadCloudSettings();
      setCloudStatus(result);
      if (result.applied && result.settings) {
        window.dispatchEvent(new CustomEvent('settings:changed', { detail: result.settings }));
      }
      setCloudMessage(result.applied
        ? copy({
            'zh-CN': 'Steam Cloud 设置已应用；本机专属设置保持不变。',
            'zh-TW': 'Steam Cloud 設定已套用；本機專屬設定保持不變。',
            'ja-JP': 'Steam Cloud の設定を適用しました。PC 固有の設定は保持されています。',
            'en-US': 'Steam Cloud settings were applied; device-local settings were preserved.',
            'ko-KR': 'Steam Cloud 설정을 적용했으며 PC 전용 설정은 유지했습니다.',
          })
        : `Steam Cloud: ${result.lastError ?? 'cloud_file_missing'}`);
    } catch (downloadError) {
      setCloudMessage(formatUserFacingError(downloadError));
    } finally {
      setCloudAction(null);
    }
  }, [copy]);

  return (
    <div className="settings-cache-panel settings-cache-panel--diagnostics">
      <div className="settings-status-grid" aria-live="polite">
        <span><em>Steamworks</em><strong>{loading ? labels.checking : stateLabel}</strong></span>
        <span><em>App ID</em><strong>{status?.appId ?? emptyValue}</strong></span>
        <span><em>Build ID</em><strong>{status?.appBuildId ?? emptyValue}</strong></span>
        <span><em>Beta</em><strong>{status?.betaName || 'default'}</strong></span>
        <span>
          <em>{copy({ 'zh-CN': '拥有许可', 'zh-TW': '擁有授權', 'ja-JP': 'ライセンス', 'en-US': 'Ownership', 'ko-KR': '라이선스' })}</em>
          <strong>{formatBoolean(status?.subscribed ?? null, labels.yes, labels.no)}</strong>
        </span>
        <span>
          <em>Steam Cloud</em>
          <strong>{formatBoolean(status?.cloudEnabled ?? null, labels.yes, labels.no)}</strong>
        </span>
        <span><em>Steam Deck</em><strong>{formatBoolean(status?.runningOnSteamDeck ?? null, labels.yes, labels.no)}</strong></span>
        <span>
          <em>{copy({ 'zh-CN': '状态原因', 'zh-TW': '狀態原因', 'ja-JP': '状態理由', 'en-US': 'Status reason', 'ko-KR': '상태 원인' })}</em>
          <strong>{status?.unavailableReason ?? emptyValue}</strong>
        </span>
        <span>
          <em>{copy({ 'zh-CN': '云端设置', 'zh-TW': '雲端設定', 'ja-JP': 'クラウド設定', 'en-US': 'Cloud settings', 'ko-KR': '클라우드 설정' })}</em>
          <strong>{cloudSyncLabel}</strong>
        </span>
        <span>
          <em>{copy({ 'zh-CN': '最近成功同步', 'zh-TW': '最近成功同步', 'ja-JP': '最終成功同期', 'en-US': 'Last successful sync', 'ko-KR': '마지막 성공 동기화' })}</em>
          <strong>{formatCloudTime(cloudStatus?.lastSucceededAt ?? cloudStatus?.remoteUpdatedAt)}</strong>
        </span>
      </div>
      <p className="settings-inline-note">{error ?? status?.message ?? labels.checking}</p>
      <p className="settings-inline-note">
        {cloudMessage ?? (cloudStatus?.nextRetryAt ? copy({
          'zh-CN': `Steam Cloud 暂时不可用，将在 ${formatCloudTime(cloudStatus.nextRetryAt)} 自动重试。`,
          'zh-TW': `Steam Cloud 暫時無法使用，將於 ${formatCloudTime(cloudStatus.nextRetryAt)} 自動重試。`,
          'ja-JP': `Steam Cloudを一時的に利用できません。${formatCloudTime(cloudStatus.nextRetryAt)} に自動再試行します。`,
          'en-US': `Steam Cloud is temporarily unavailable. ECHO will retry automatically at ${formatCloudTime(cloudStatus.nextRetryAt)}.`,
          'ko-KR': `Steam Cloud를 일시적으로 사용할 수 없습니다. ${formatCloudTime(cloudStatus.nextRetryAt)}에 자동으로 다시 시도합니다.`,
        }) : copy({
          'zh-CN': `自动同步可迁移设置${cloudStatus?.settingsCount ? `（${cloudStatus.settingsCount} 项）` : ''}；设备、路径、凭据和本机服务配置不会上传。`,
          'zh-TW': `自動同步可移轉設定${cloudStatus?.settingsCount ? `（${cloudStatus.settingsCount} 項）` : ''}；裝置、路徑、憑證和本機服務設定不會上傳。`,
          'ja-JP': `移行可能な設定${cloudStatus?.settingsCount ? `（${cloudStatus.settingsCount} 件）` : ''}を自動同期します。デバイス、パス、認証情報、PC 固有のサービス設定はアップロードしません。`,
          'en-US': `Portable settings${cloudStatus?.settingsCount ? ` (${cloudStatus.settingsCount})` : ''} sync automatically. Devices, paths, credentials, and local service endpoints are excluded.`,
          'ko-KR': `이식 가능한 설정${cloudStatus?.settingsCount ? `(${cloudStatus.settingsCount}개)` : ''}을 자동 동기화합니다. 장치, 경로, 자격 증명 및 PC 전용 서비스 설정은 업로드하지 않습니다.`,
        }))}
      </p>
      <p className="settings-inline-note">
        {copy({
          'zh-CN': '复制内容不会包含 Steam 昵称、票据、Cookie、本地路径或其他账号凭据。',
          'zh-TW': '複製內容不會包含 Steam 暱稱、票據、Cookie、本機路徑或其他帳號憑證。',
          'ja-JP': 'コピー内容に Steam 名、チケット、Cookie、ローカルパス、認証情報は含まれません。',
          'en-US': 'Copied diagnostics exclude Steam names, tickets, cookies, local paths, and credentials.',
          'ko-KR': '복사된 진단 정보에는 Steam 이름, 티켓, 쿠키, 로컬 경로 및 인증 정보가 포함되지 않습니다.',
        })}
      </p>
      <div className="settings-chip-row settings-chip-row--left settings-chip-row--actions">
        <button className="settings-action-button" type="button" disabled={loading} onClick={() => void refresh(false)}>
          <RefreshCw className={loading ? 'spinning-icon' : undefined} size={15} />
          {copy({ 'zh-CN': '刷新状态', 'zh-TW': '重新整理狀態', 'ja-JP': '状態を更新', 'en-US': 'Refresh status', 'ko-KR': '상태 새로고침' })}
        </button>
        <button className="settings-action-button" type="button" disabled={!status} onClick={() => void handleCopy()}>
          {copied ? <Check size={15} /> : <Clipboard size={15} />}
          {copied
            ? copy({ 'zh-CN': '已复制', 'zh-TW': '已複製', 'ja-JP': 'コピー済み', 'en-US': 'Copied', 'ko-KR': '복사됨' })
            : copy({ 'zh-CN': '复制脱敏诊断', 'zh-TW': '複製脫敏診斷', 'ja-JP': '診断をコピー', 'en-US': 'Copy safe diagnostics', 'ko-KR': '안전한 진단 복사' })}
        </button>
        <button
          className="settings-action-button"
          type="button"
          disabled={status?.cloudEnabled !== true || cloudAction !== null}
          onClick={() => void handleCloudUpload()}
        >
          <Upload size={15} />
          {cloudAction === 'upload'
            ? copy({ 'zh-CN': '上传中', 'zh-TW': '上傳中', 'ja-JP': 'アップロード中', 'en-US': 'Uploading', 'ko-KR': '업로드 중' })
            : copy({ 'zh-CN': '上传设置', 'zh-TW': '上傳設定', 'ja-JP': '設定をアップロード', 'en-US': 'Upload settings', 'ko-KR': '설정 업로드' })}
        </button>
        <button
          className="settings-action-button"
          type="button"
          disabled={status?.cloudEnabled !== true || cloudStatus?.available !== true || cloudAction !== null}
          onClick={() => void handleCloudDownload()}
        >
          <Download size={15} />
          {cloudAction === 'download'
            ? copy({ 'zh-CN': '应用中', 'zh-TW': '套用中', 'ja-JP': '適用中', 'en-US': 'Applying', 'ko-KR': '적용 중' })
            : copy({ 'zh-CN': '下载并应用', 'zh-TW': '下載並套用', 'ja-JP': 'ダウンロードして適用', 'en-US': 'Download and apply', 'ko-KR': '다운로드 및 적용' })}
        </button>
      </div>
    </div>
  );
};
