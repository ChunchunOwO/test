import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithNetworkProxy, isCertificateDateError } from './networkFetch';

const electronNetFetchMock = vi.hoisted(() => vi.fn());
const electronReadyMock = vi.hoisted(() => vi.fn(() => true));
const certificateSessionFetchMock = vi.hoisted(() => vi.fn());
const certificateSessionSetProxyMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const certificateSessionSetVerifyProcMock = vi.hoisted(() => vi.fn());
const certificateSessionFromPartitionMock = vi.hoisted(() => vi.fn(() => ({
  fetch: certificateSessionFetchMock,
  setProxy: certificateSessionSetProxyMock,
  setCertificateVerifyProc: certificateSessionSetVerifyProcMock,
})));
const zconnectFetchMock = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  app: {
    isReady: electronReadyMock,
  },
  net: {
    fetch: electronNetFetchMock,
  },
  session: {
    fromPartition: certificateSessionFromPartitionMock,
  },
}));

vi.mock('../app/appSettings', () => ({
  getAppSettings: () => ({ networkProxyMode: 'off' }),
}));

vi.mock('./proxySettings', () => ({
  buildElectronProxyConfig: () => ({ mode: 'direct' }),
}));

vi.mock('../library/remote/ZConnectWebAuthorizationService', () => ({
  fetchWithZConnectWebAuthorization: zconnectFetchMock,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  electronReadyMock.mockReset();
  electronReadyMock.mockReturnValue(true);
  electronNetFetchMock.mockReset();
  certificateSessionFetchMock.mockReset();
  certificateSessionSetProxyMock.mockClear();
  certificateSessionSetVerifyProcMock.mockClear();
  certificateSessionFromPartitionMock.mockClear();
  zconnectFetchMock.mockReset();
});

describe('fetchWithNetworkProxy', () => {
  it('delegates opted-in ZConnect requests to the isolated authorized session', async () => {
    vi.stubEnv('VITEST', 'false');
    zconnectFetchMock.mockResolvedValue(new Response('{}'));

    await fetchWithNetworkProxy('https://remote-access-32769.zconnect.cn/rest/ping.view', undefined, {
      zconnectWebSession: true,
    });

    expect(zconnectFetchMock).toHaveBeenCalledWith(
      'https://remote-access-32769.zconnect.cn/rest/ping.view',
      undefined,
    );
    expect(electronNetFetchMock).not.toHaveBeenCalled();
  });
  it('uses an isolated session that accepts only certificate date errors when explicitly requested', async () => {
    vi.stubEnv('VITEST', 'false');
    certificateSessionFetchMock.mockResolvedValue(new Response('{}'));

    await fetchWithNetworkProxy('https://expired.example.test/rest/ping.view', undefined, {
      allowCertificateDateErrors: true,
    });

    expect(certificateSessionFetchMock).toHaveBeenCalledTimes(1);
    expect(electronNetFetchMock).not.toHaveBeenCalled();
    const verify = certificateSessionSetVerifyProcMock.mock.calls[0]?.[0] as (
      request: { verificationResult: string; errorCode: number },
      callback: (result: number) => void,
    ) => void;
    const callback = vi.fn();
    verify({ verificationResult: 'CERT_DATE_INVALID', errorCode: -201 }, callback);
    expect(callback).toHaveBeenLastCalledWith(0);
    verify({ verificationResult: 'CERT_COMMON_NAME_INVALID', errorCode: -200 }, callback);
    expect(callback).toHaveBeenLastCalledWith(-200);
  });

  it('recognizes Chromium certificate date error variants without broadening the bypass', () => {
    expect(isCertificateDateError('net::ERR_CERT_DATE_INVALID', -201)).toBe(true);
    expect(isCertificateDateError('ERR_CERT_DATE_INVALID', 0)).toBe(true);
    expect(isCertificateDateError('CERT_DATE_INVALID', 0)).toBe(true);
    expect(isCertificateDateError('CERT_AUTHORITY_INVALID', -202)).toBe(false);
  });

  it('drops cross-origin Referer before calling Electron net.fetch', async () => {
    vi.stubEnv('VITEST', 'false');
    electronNetFetchMock.mockResolvedValue(new Response('{}'));

    await fetchWithNetworkProxy('https://api.bilibili.com/x/web-interface/view?bvid=BV1echo', {
      headers: {
        Accept: 'application/json',
        Referer: 'https://www.bilibili.com/video/BV1echo',
        'User-Agent': 'ECHO test',
      },
    });

    expect(electronNetFetchMock).toHaveBeenCalledTimes(1);
    const init = electronNetFetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(init.referrer).toBeUndefined();
    expect(init.referrerPolicy).toBeUndefined();
    expect(headers.get('referer')).toBeNull();
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('user-agent')).toBe('ECHO test');
  });

  it('passes same-origin Referer as a referrer option instead of a forbidden header', async () => {
    vi.stubEnv('VITEST', 'false');
    electronNetFetchMock.mockResolvedValue(new Response('{}'));

    await fetchWithNetworkProxy('https://api.bilibili.com/x/web-interface/nav', {
      headers: {
        Referer: 'https://api.bilibili.com/x/web-interface/nav',
      },
    });

    const init = electronNetFetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(init.referrer).toBe('https://api.bilibili.com/x/web-interface/nav');
    expect(init.referrerPolicy).toBe('unsafe-url');
    expect(headers.get('referer')).toBeNull();
  });

  it('drops cross-origin explicit referrer even when no headers are supplied', async () => {
    vi.stubEnv('VITEST', 'false');
    electronNetFetchMock.mockResolvedValue(new Response('{}'));

    await fetchWithNetworkProxy('https://api.bilibili.com/x/web-interface/search/all/v2?keyword=echo', {
      referrer: 'https://search.bilibili.com/all?keyword=echo',
    });

    const init = electronNetFetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.referrer).toBeUndefined();
    expect(init.referrerPolicy).toBeUndefined();
  });

  it('drops invalid header values before Electron net.fetch without leaking sensitive values', async () => {
    vi.stubEnv('VITEST', 'false');
    electronNetFetchMock.mockResolvedValue(new Response('{}'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await fetchWithNetworkProxy('https://api.bilibili.com/x/web-interface/view?bvid=BV1echo', {
      headers: {
        Accept: 'application/json',
        Cookie: 'SESSDATA=存',
        'User-Agent': 'ECHO test',
      },
    });

    const init = electronNetFetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('user-agent')).toBe('ECHO test');
    expect(headers.get('cookie')).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      '[network] Dropped invalid request header(s) before fetch.',
      expect.objectContaining({
        context: 'networkFetch',
        targetHost: 'api.bilibili.com',
        droppedHeaders: [
          expect.objectContaining({
            headerName: 'Cookie',
            reason: 'non_byte_string_header_value',
            sensitive: true,
            codePoint: 23384,
          }),
        ],
      }),
    );
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain('SESSDATA');
  });
});
