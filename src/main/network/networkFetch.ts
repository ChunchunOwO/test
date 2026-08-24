import { createSafeFetchHeaders } from './safeFetchHeaders';

export type NetworkFetchSecurityOptions = {
  allowCertificateDateErrors?: boolean;
  zconnectWebSession?: boolean;
};

let certificateDateBypassSession: import('electron').Session | null = null;
let certificateDateBypassProxyKey: string | null = null;
let certificateDateBypassProxyUpdate: Promise<void> = Promise.resolve();

export const isCertificateDateError = (verificationResult: string, errorCode: number): boolean =>
  errorCode === -201
  || verificationResult === 'CERT_DATE_INVALID'
  || verificationResult === 'ERR_CERT_DATE_INVALID'
  || verificationResult === 'net::ERR_CERT_DATE_INVALID';

const normalizeReferrer = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
};

const sameOriginReferrer = (input: RequestInfo | URL, referrer: string): string | null => {
  try {
    const requestUrl = new URL(input instanceof Request ? input.url : input.toString());
    const referrerUrl = new URL(referrer);
    return requestUrl.origin === referrerUrl.origin ? referrerUrl.toString() : null;
  } catch {
    return null;
  }
};

const initForElectronNetFetch = (input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined => {
  if (!init) {
    return init;
  }

  const headers = createSafeFetchHeaders(init.headers, {
    context: 'networkFetch:electron-net',
    targetHost: targetHostFromInput(input),
  });
  const headerReferrer = normalizeReferrer(headers.get('referer') ?? headers.get('referrer'));
  const explicitReferrer = normalizeReferrer(typeof init.referrer === 'string' ? init.referrer : null);
  const referrer = explicitReferrer
    ? sameOriginReferrer(input, explicitReferrer)
    : headerReferrer
      ? sameOriginReferrer(input, headerReferrer)
      : null;
  headers.delete('referer');
  headers.delete('referrer');

  const nextInit: RequestInit = {
    ...init,
    headers,
  };

  delete nextInit.referrer;
  delete nextInit.referrerPolicy;

  if (referrer) {
    nextInit.referrer = referrer;
    nextInit.referrerPolicy = init.referrerPolicy ?? 'unsafe-url';
  }

  return nextInit;
};

const targetHostFromInput = (input: RequestInfo | URL): string | null => {
  try {
    return new URL(input instanceof Request ? input.url : input.toString()).host;
  } catch {
    return null;
  }
};

const initWithSafeHeaders = (input: RequestInfo | URL, init?: RequestInit): RequestInit | undefined => {
  if (!init) {
    return init;
  }

  return {
    ...init,
    headers: createSafeFetchHeaders(init.headers, {
      context: 'networkFetch',
      targetHost: targetHostFromInput(input),
    }),
  };
};

const getCertificateDateBypassSession = async (): Promise<import('electron').Session | null> => {
  try {
    const electron = await import('electron');
    if (!electron.app?.isReady?.() || !electron.session?.fromPartition) {
      return null;
    }

    if (!certificateDateBypassSession) {
      certificateDateBypassSession = electron.session.fromPartition('echo-remote-source-certificate-date-bypass', {
        cache: false,
      });
      certificateDateBypassSession.setCertificateVerifyProc((request, callback) => {
        callback(isCertificateDateError(request.verificationResult, request.errorCode) ? 0 : request.errorCode);
      });
    }

    const [{ getAppSettings }, { buildElectronProxyConfig }] = await Promise.all([
      import('../app/appSettings'),
      import('./proxySettings'),
    ]);
    const proxyConfig = buildElectronProxyConfig(getAppSettings());
    const proxyKey = JSON.stringify(proxyConfig);
    if (proxyKey !== certificateDateBypassProxyKey) {
      certificateDateBypassProxyKey = proxyKey;
      certificateDateBypassProxyUpdate = certificateDateBypassProxyUpdate
        .catch(() => undefined)
        .then(() => certificateDateBypassSession?.setProxy(proxyConfig) ?? Promise.resolve());
    }
    await certificateDateBypassProxyUpdate;
    return certificateDateBypassSession;
  } catch {
    return null;
  }
};

export const fetchWithNetworkProxy = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  securityOptions: NetworkFetchSecurityOptions = {},
): Promise<Response> => {
  const requestInput = input instanceof URL ? input.toString() : input;
  const safeInit = initWithSafeHeaders(requestInput, init);

  if (process.env.VITEST === 'true') {
    return fetch(requestInput, safeInit);
  }

  try {
    const electron = await import('electron');
    if (electron.app?.isReady?.() && electron.net?.fetch) {
      const electronInit = initForElectronNetFetch(requestInput, safeInit);
      if (securityOptions.zconnectWebSession) {
        const { fetchWithZConnectWebAuthorization } = await import('../library/remote/ZConnectWebAuthorizationService');
        return fetchWithZConnectWebAuthorization(requestInput, electronInit);
      }
      if (securityOptions.allowCertificateDateErrors) {
        const bypassSession = await getCertificateDateBypassSession();
        if (bypassSession) {
          return bypassSession.fetch(requestInput, electronInit);
        }
      }
      return electron.net.fetch(requestInput, electronInit);
    }
  } catch {
    // Fall back to Node fetch when Electron net is unavailable, such as in unit tests.
  }

  return fetch(requestInput, safeInit);
};
