import { Check, KeyRound } from 'lucide-react';

type ZConnectAuthorizationControlProps = {
  baseUrl: string;
  authorized: boolean;
  busy: boolean;
  onAuthorize: () => void;
};

const zconnectRemoteUrlPattern = /^https:\/\/remote-access-\d+\.zconnect\.cn(?:[/:?#]|$)/iu;

export const ZConnectAuthorizationControl = ({
  baseUrl,
  authorized,
  busy,
  onAuthorize,
}: ZConnectAuthorizationControlProps): JSX.Element | null => {
  if (!zconnectRemoteUrlPattern.test(baseUrl.trim())) {
    return null;
  }

  return (
    <button
      type="button"
      className="remote-connection-advanced-toggle remote-connection-field--wide"
      aria-pressed={authorized}
      disabled={busy}
      onClick={onAuthorize}
    >
      <KeyRound size={15} />
      <span>
        <strong>{busy ? '等待 ZConnect 网页授权' : authorized ? 'ZConnect 网页已授权' : '授权 ZConnect 网页访问'}</strong>
        <small>在独立窗口登录；ECHO 只复用专用会话，不保存或读取你的 ZConnect 密码。</small>
      </span>
      <Check size={16} aria-hidden="true" opacity={authorized ? 1 : 0.2} />
    </button>
  );
};
