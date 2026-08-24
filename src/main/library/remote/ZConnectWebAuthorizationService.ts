import { BrowserWindow, session, type Session } from 'electron';
import { getAppSettings } from '../../app/appSettings';
import { buildElectronProxyConfig } from '../../network/proxySettings';
import type { RemoteWebAuthorizationResult } from '../../../shared/types/remoteSources';

const zconnectSessionPartition = 'persist:echo-remote-source-zconnect-v1';
const zconnectRemoteHostPattern = /^remote-access-\d+\.zconnect\.cn$/iu;
const zconnectNavigationHosts = new Set(['zconnect.cn', 'www.zconnect.cn']);
const authorizationPollIntervalMs = 1_500;
const authorizationProbeTimeoutMs = 10_000;
const maximumAuthorizationProbeBytes = 64 * 1024;

let zconnectSession: Session | null = null;
let configuredProxyKey: string | null = null;
let proxyUpdate: Promise<void> = Promise.resolve();

const isCertificateDateError = (verificationResult: string, errorCode: number): boolean =>
  errorCode === -201
  || verificationResult === 'CERT_DATE_INVALID'
  || verificationResult === 'ERR_CERT_DATE_INVALID'
  || verificationResult === 'net::ERR_CERT_DATE_INVALID';

const isAllowedNavigationHost = (hostname: string): boolean => {
  const normalized = hostname.toLocaleLowerCase();
  return zconnectRemoteHostPattern.test(normalized)
    || zconnectNavigationHosts.has(normalized)
    || normalized.endsWith('.zconnect.cn');
};

const parseZConnectBaseUrl = (value: string): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('请先填写完整的 ZConnect Navidrome 地址。');
  }

  if (
    url.protocol !== 'https:'
    || !zconnectRemoteHostPattern.test(url.hostname)
    || url.username
    || url.password
    || url.port
  ) {
    throw new Error('网页授权仅支持 https://remote-access-数字.zconnect.cn 地址。');
  }

  return new URL(url.origin);
};

export const isZConnectRemoteAccessUrl = (value: string): boolean => {
  try {
    parseZConnectBaseUrl(value);
    return true;
  } catch {
    return false;
  }
};

const getZConnectSession = async (): Promise<Session> => {
  if (!zconnectSession) {
    zconnectSession = session.fromPartition(zconnectSessionPartition, { cache: true });
    zconnectSession.setCertificateVerifyProc((request, callback) => {
      const allowDateError = isAllowedNavigationHost(request.hostname)
        && isCertificateDateError(request.verificationResult, request.errorCode);
      callback(allowDateError ? 0 : request.errorCode);
    });
    zconnectSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  }

  const proxyConfig = buildElectronProxyConfig(getAppSettings());
  const proxyKey = JSON.stringify(proxyConfig);
  if (proxyKey !== configuredProxyKey) {
    configuredProxyKey = proxyKey;
    proxyUpdate = proxyUpdate
      .catch(() => undefined)
      .then(() => zconnectSession?.setProxy(proxyConfig) ?? Promise.resolve());
  }
  await proxyUpdate;
  return zconnectSession;
};

const createProbeDeadline = (
  timeoutMs: number,
  parentSignal?: AbortSignal,
): { signal: AbortSignal; dispose: () => void } => {
  const controller = new AbortController();
  const abortFromParent = (): void => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error('ZConnect authorization probe timed out')), timeoutMs);
  timer.unref?.();
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
  };
};

const readBoundedResponseText = async (response: Response): Promise<string | null> => {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maximumAuthorizationProbeBytes) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';
  try {
    let chunk = await reader.read();
    while (!chunk.done) {
      const { value } = chunk;
      totalBytes += value.byteLength;
      if (totalBytes > maximumAuthorizationProbeBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      text += decoder.decode(value, { stream: true });
      chunk = await reader.read();
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
};

const isNavidromeSubsonicResponse = async (response: Response): Promise<boolean> => {
  if (!response.ok || !response.headers.get('content-type')?.toLocaleLowerCase().includes('json')) {
    return false;
  }
  try {
    const responseText = await readBoundedResponseText(response);
    if (responseText === null) {
      return false;
    }
    const payload = JSON.parse(responseText) as Record<string, unknown>;
    const envelope = payload['subsonic-response'];
    return Boolean(envelope && typeof envelope === 'object' && !Array.isArray(envelope));
  } catch {
    return false;
  }
};

const probeAuthorization = async (
  loginSession: Session,
  baseUrl: URL,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<boolean> => {
  const probeUrl = new URL('/rest/ping.view', baseUrl);
  probeUrl.searchParams.set('u', 'echo-web-authorization-probe');
  probeUrl.searchParams.set('p', 'wrong');
  probeUrl.searchParams.set('v', '1.16.1');
  probeUrl.searchParams.set('c', 'ECHO');
  probeUrl.searchParams.set('f', 'json');
  const deadline = createProbeDeadline(options.timeoutMs ?? authorizationProbeTimeoutMs, options.signal);
  try {
    const response = await loginSession.fetch(probeUrl.toString(), {
      cache: 'no-store',
      redirect: 'error',
      signal: deadline.signal,
    });
    return isNavidromeSubsonicResponse(response);
  } catch {
    return false;
  } finally {
    deadline.dispose();
  }
};

export const fetchWithZConnectWebAuthorization = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const requestUrl = parseZConnectBaseUrl(input instanceof Request ? input.url : input.toString());
  const originalUrl = new URL(input instanceof Request ? input.url : input.toString());
  if (originalUrl.origin !== requestUrl.origin) {
    throw new Error('ZConnect 网页授权请求被限制在已授权的远程来源域名。');
  }
  const loginSession = await getZConnectSession();
  return loginSession.fetch(originalUrl.toString(), init);
};

export const startZConnectWebAuthorization = async (
  value: string,
  parent: BrowserWindow | null = null,
  options: { probeTimeoutMs?: number } = {},
): Promise<RemoteWebAuthorizationResult> => {
  const baseUrl = parseZConnectBaseUrl(value);
  const loginSession = await getZConnectSession();
  const probeTimeoutMs = Math.max(100, Math.round(options.probeTimeoutMs ?? authorizationProbeTimeoutMs));
  if (await probeAuthorization(loginSession, baseUrl, { timeoutMs: probeTimeoutMs })) {
    return { ok: true, baseUrl: baseUrl.toString(), message: 'ZConnect 网页授权仍然有效。' };
  }

  const loginWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 920,
    minHeight: 620,
    title: 'ECHO · ZConnect 网页授权',
    show: true,
    autoHideMenuBar: true,
    modal: Boolean(parent),
    ...(parent ? { parent } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: loginSession,
    },
  });

  let authorized = false;
  let probing = false;
  const windowLifetime = new AbortController();
  const tryCompleteAuthorization = async (): Promise<void> => {
    if (probing || authorized || loginWindow.isDestroyed()) {
      return;
    }
    probing = true;
    try {
      authorized = await probeAuthorization(loginSession, baseUrl, {
        signal: windowLifetime.signal,
        timeoutMs: probeTimeoutMs,
      });
      if (authorized && !loginWindow.isDestroyed()) {
        loginWindow.close();
      }
    } finally {
      probing = false;
    }
  };

  const allowNavigation = (target: string): boolean => {
    try {
      const url = new URL(target);
      return url.protocol === 'https:' && isAllowedNavigationHost(url.hostname);
    } catch {
      return false;
    }
  };

  loginWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (allowNavigation(url)) {
      void loginWindow.loadURL(url).catch(() => undefined);
    }
    return { action: 'deny' };
  });
  loginWindow.webContents.on('will-navigate', (event, url) => {
    if (!allowNavigation(url)) {
      event.preventDefault();
    }
  });
  loginWindow.webContents.on('did-navigate', () => void tryCompleteAuthorization());
  loginWindow.webContents.on('did-navigate-in-page', () => void tryCompleteAuthorization());

  const poll = setInterval(() => void tryCompleteAuthorization(), authorizationPollIntervalMs);
  const closed = new Promise<void>((resolve) => {
    loginWindow.once('closed', () => {
      clearInterval(poll);
      windowLifetime.abort();
      resolve();
    });
  });

  await loginWindow.loadURL(new URL('/app/', baseUrl).toString()).catch(() => undefined);
  await closed;
  authorized = authorized || await probeAuthorization(loginSession, baseUrl, { timeoutMs: probeTimeoutMs });

  return authorized
    ? { ok: true, baseUrl: baseUrl.toString(), message: 'ZConnect 网页授权完成，ECHO 可以复用此会话连接 Navidrome。' }
    : { ok: false, baseUrl: baseUrl.toString(), message: '没有检测到有效授权。请登录并等待窗口自动关闭。' };
};
