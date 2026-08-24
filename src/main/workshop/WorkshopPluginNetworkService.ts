import type {
  WorkshopPluginNetworkRequest,
  WorkshopPluginNetworkResponse,
} from '../../shared/types/workshop';
import { fetchWithNetworkProxy } from '../network/networkFetch';
import { readResponseBodyLimited } from '../network/readResponseBodyLimited';
import type { WorkshopPluginService } from './WorkshopPluginService';

const maximumUrlLength = 2_048;
const maximumRequestBodyBytes = 256 * 1024;
const maximumResponseBodyBytes = 1024 * 1024;
const maximumHeaderBytes = 8 * 1024;
const maximumHeaders = 24;
const maximumRedirects = 3;
const maximumConcurrentRequests = 4;
const requestTimeoutMs = 10_000;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const exposedResponseHeaders = new Set([
  'cache-control',
  'content-length',
  'content-type',
  'etag',
  'last-modified',
]);

type WorkshopPluginNetworkPolicyPort = Pick<WorkshopPluginService, 'getRuntimePolicy'>;
type WorkshopPluginNetworkFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const requestHeaderAllowed = (name: string): boolean =>
  name === 'accept'
  || name === 'accept-language'
  || name === 'content-type'
  || name.startsWith('x-');

const normalizeHeaders = (value: unknown): Record<string, string> => {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('network-headers-invalid');
  const entries = Object.entries(value);
  if (entries.length > maximumHeaders) throw new Error('network-headers-too-many');
  const output: Record<string, string> = {};
  let totalBytes = 0;
  for (const [rawName, rawValue] of entries) {
    const name = rawName.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/u.test(name) || !requestHeaderAllowed(name) || typeof rawValue !== 'string') {
      throw new Error('network-header-unsupported');
    }
    const headerValue = rawValue.trim();
    if (/[\r\n]/u.test(headerValue)) throw new Error('network-header-invalid');
    totalBytes += Buffer.byteLength(name, 'utf8') + Buffer.byteLength(headerValue, 'utf8');
    if (totalBytes > maximumHeaderBytes) throw new Error('network-headers-too-large');
    output[name] = headerValue;
  }
  return output;
};

const normalizeUrl = (value: unknown, allowedHosts: ReadonlySet<string>): URL => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximumUrlLength) {
    throw new Error('network-url-invalid');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('network-url-invalid');
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
    throw new Error('network-url-unsupported');
  }
  if (!allowedHosts.has(url.hostname.toLowerCase())) throw new Error('network-host-denied');
  return url;
};

const responseHeaders = (headers: Headers): Record<string, string> => {
  const output: Record<string, string> = {};
  headers.forEach((value, name) => {
    const normalizedName = name.toLowerCase();
    if (exposedResponseHeaders.has(normalizedName) || normalizedName.startsWith('x-')) {
      output[normalizedName] = value.slice(0, 2_048);
    }
  });
  return output;
};

export class WorkshopPluginNetworkService {
  private readonly activeRequests = new Map<string, number>();

  constructor(
    private readonly plugins: WorkshopPluginNetworkPolicyPort,
    private readonly fetcher: WorkshopPluginNetworkFetcher = fetchWithNetworkProxy,
  ) {}

  async request(input: WorkshopPluginNetworkRequest): Promise<WorkshopPluginNetworkResponse> {
    if (!input || typeof input !== 'object') throw new Error('network-request-invalid');
    const policy = await this.plugins.getRuntimePolicy(input.sourceId, input.itemId);
    if (!policy || !policy.permissions.includes('network:request')) throw new Error('network-capability-denied');
    const allowedHosts = new Set(policy.networkHosts.map((host) => host.toLowerCase()));
    if (allowedHosts.size === 0) throw new Error('network-hosts-empty');

    const key = `${input.sourceId}:${input.itemId}`;
    const active = this.activeRequests.get(key) ?? 0;
    if (active >= maximumConcurrentRequests) throw new Error('network-concurrency-exceeded');
    this.activeRequests.set(key, active + 1);

    try {
      const method = input.method === undefined ? 'GET' : input.method;
      if (method !== 'GET' && method !== 'POST') throw new Error('network-method-unsupported');
      let url = normalizeUrl(input.url, allowedHosts);
      let headers = normalizeHeaders(input.headers);
      let body = input.body;
      if (body !== undefined && typeof body !== 'string') throw new Error('network-body-invalid');
      if (method === 'GET' && body !== undefined) throw new Error('network-get-body-unsupported');
      if (body !== undefined && Buffer.byteLength(body, 'utf8') > maximumRequestBodyBytes) {
        throw new Error('network-body-too-large');
      }

      let currentMethod: 'GET' | 'POST' = method;
      for (let redirectCount = 0; redirectCount <= maximumRedirects; redirectCount += 1) {
        const signal = AbortSignal.timeout(requestTimeoutMs);
        const response = await this.fetcher(url, {
          method: currentMethod,
          headers,
          ...(currentMethod === 'POST' && body !== undefined ? { body } : {}),
          redirect: 'manual',
          signal,
        });
        const location = response.headers.get('location');
        if (redirectStatuses.has(response.status) && location) {
          await response.body?.cancel().catch(() => undefined);
          if (redirectCount === maximumRedirects) throw new Error('network-redirect-limit');
          url = normalizeUrl(new URL(location, url).toString(), allowedHosts);
          if (response.status === 303 || ((response.status === 301 || response.status === 302) && currentMethod === 'POST')) {
            currentMethod = 'GET';
            body = undefined;
            const { ['content-type']: _contentType, ...remainingHeaders } = headers;
            headers = remainingHeaders;
          }
          continue;
        }

        const bytes = await readResponseBodyLimited(response, maximumResponseBodyBytes, { signal });
        return {
          url: response.url || url.toString(),
          status: response.status,
          statusText: response.statusText.slice(0, 120),
          ok: response.ok,
          headers: responseHeaders(response.headers),
          body: new TextDecoder().decode(bytes),
        };
      }
      throw new Error('network-redirect-limit');
    } finally {
      const remaining = (this.activeRequests.get(key) ?? 1) - 1;
      if (remaining > 0) this.activeRequests.set(key, remaining);
      else this.activeRequests.delete(key);
    }
  }
}

let boundWorkshopPluginNetworkService: WorkshopPluginNetworkService | null = null;

export const bindWorkshopPluginNetworkService = (service: WorkshopPluginNetworkService): void => {
  boundWorkshopPluginNetworkService = service;
};

export const getWorkshopPluginNetworkService = (): WorkshopPluginNetworkService => {
  if (!boundWorkshopPluginNetworkService) throw new Error('workshop-plugin-network-unavailable');
  return boundWorkshopPluginNetworkService;
};
