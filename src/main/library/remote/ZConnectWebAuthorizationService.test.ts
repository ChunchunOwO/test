import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionFetchMock = vi.hoisted(() => vi.fn());
const setProxyMock = vi.hoisted(() => vi.fn(async () => undefined));
const setCertificateVerifyProcMock = vi.hoisted(() => vi.fn());
const setPermissionRequestHandlerMock = vi.hoisted(() => vi.fn());
const browserWindowMock = vi.hoisted(() => vi.fn());
const fromPartitionMock = vi.hoisted(() => vi.fn(() => ({
  fetch: sessionFetchMock,
  setProxy: setProxyMock,
  setCertificateVerifyProc: setCertificateVerifyProcMock,
  setPermissionRequestHandler: setPermissionRequestHandlerMock,
})));

vi.mock('electron', () => ({
  BrowserWindow: browserWindowMock,
  session: { fromPartition: fromPartitionMock },
}));

vi.mock('../../app/appSettings', () => ({
  getAppSettings: () => ({ networkProxyMode: 'off' }),
}));

vi.mock('../../network/proxySettings', () => ({
  buildElectronProxyConfig: () => ({ mode: 'direct' }),
}));

import {
  fetchWithZConnectWebAuthorization,
  isZConnectRemoteAccessUrl,
  startZConnectWebAuthorization,
} from './ZConnectWebAuthorizationService';

describe('ZConnect web authorization security boundary', () => {
  beforeEach(() => {
    sessionFetchMock.mockReset();
    setProxyMock.mockClear();
    setCertificateVerifyProcMock.mockClear();
    setPermissionRequestHandlerMock.mockClear();
    browserWindowMock.mockReset();
    fromPartitionMock.mockClear();
  });

  it('accepts only the dedicated HTTPS remote-access host shape', () => {
    expect(isZConnectRemoteAccessUrl('https://remote-access-32769.zconnect.cn/app/')).toBe(true);
    expect(isZConnectRemoteAccessUrl('https://www.zconnect.cn/')).toBe(false);
    expect(isZConnectRemoteAccessUrl('https://remote-access-32769.zconnect.cn.evil.test/')).toBe(false);
    expect(isZConnectRemoteAccessUrl('http://remote-access-32769.zconnect.cn/')).toBe(false);
  });

  it('uses a persistent isolated session and limits certificate bypass to ZConnect date errors', async () => {
    sessionFetchMock.mockResolvedValue(new Response('{}'));

    await fetchWithZConnectWebAuthorization(
      'https://remote-access-32769.zconnect.cn/rest/ping.view',
      { redirect: 'error' },
    );

    expect(fromPartitionMock).toHaveBeenCalledWith('persist:echo-remote-source-zconnect-v1', { cache: true });
    expect(sessionFetchMock).toHaveBeenCalledWith(
      'https://remote-access-32769.zconnect.cn/rest/ping.view',
      { redirect: 'error' },
    );
    const verify = setCertificateVerifyProcMock.mock.calls[0]?.[0] as (
      request: { hostname: string; verificationResult: string; errorCode: number },
      callback: (result: number) => void,
    ) => void;
    const callback = vi.fn();
    verify({ hostname: 'remote-access-32769.zconnect.cn', verificationResult: 'CERT_DATE_INVALID', errorCode: -201 }, callback);
    expect(callback).toHaveBeenLastCalledWith(0);
    verify({ hostname: 'evil.test', verificationResult: 'CERT_DATE_INVALID', errorCode: -201 }, callback);
    expect(callback).toHaveBeenLastCalledWith(-201);
    verify({ hostname: 'remote-access-32769.zconnect.cn', verificationResult: 'CERT_AUTHORITY_INVALID', errorCode: -202 }, callback);
    expect(callback).toHaveBeenLastCalledWith(-202);
  });

  it('fails closed instead of sending an opted-in request to another host', async () => {
    await expect(fetchWithZConnectWebAuthorization('https://example.test/rest/ping.view'))
      .rejects.toThrow('网页授权仅支持');
    expect(sessionFetchMock).not.toHaveBeenCalled();
  });

  it('bounds stalled authorization probes and aborts work when the login window closes', async () => {
    const observedSignals: AbortSignal[] = [];
    sessionFetchMock.mockImplementation((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal) {
        observedSignals.push(signal);
        signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), { once: true });
      }
    }));

    let closedListener: (() => void) | null = null;
    let destroyed = false;
    const loginWindow = {
      webContents: {
        setWindowOpenHandler: vi.fn(),
        on: vi.fn(),
      },
      isDestroyed: () => destroyed,
      close: vi.fn(() => {
        destroyed = true;
        closedListener?.();
      }),
      once: vi.fn((event: string, listener: () => void) => {
        if (event === 'closed') {
          closedListener = listener;
        }
      }),
      loadURL: vi.fn(async () => {
        queueMicrotask(() => loginWindow.close());
      }),
    };
    browserWindowMock.mockImplementationOnce(function BrowserWindowMock() {
      return loginWindow;
    });

    const result = await startZConnectWebAuthorization(
      'https://remote-access-32769.zconnect.cn/',
      null,
      { probeTimeoutMs: 100 },
    );

    expect(result.ok).toBe(false);
    expect(sessionFetchMock).toHaveBeenCalledTimes(2);
    expect(observedSignals).toHaveLength(2);
    expect(observedSignals.every((signal) => signal.aborted)).toBe(true);
  });
});
