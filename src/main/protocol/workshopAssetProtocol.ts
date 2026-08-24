import { protocol } from 'electron';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { fetchWithNetworkProxy } from '../network/networkFetch';
import { detectWorkshopRasterAssetMime } from '../workshop/WorkshopAssetPolicy';
import { getWorkshopAssetResolver } from '../workshop/WorkshopAssetResolver';
import {
  maxWorkshopPreviewBytes,
  parseWorkshopPreviewSourceUrl,
  sanitizeSteamPreviewUrl,
} from '../workshop/WorkshopSteamPreview';
import { getBoundWorkshopPluginService } from '../workshop/WorkshopPluginService';

const emptyAssetResponse = (): Response =>
  new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });

const workshopUiContentSecurityPolicy = [
  "default-src 'none'",
  'script-src echo-workshop:',
  "style-src echo-workshop: 'unsafe-inline'",
  'img-src echo-workshop: echo-cover: data:',
  'font-src echo-workshop:',
  'connect-src echo-workshop:',
  "media-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const workshopPluginContentSecurityPolicy = [
  "default-src 'none'",
  'script-src echo-workshop:',
  "style-src echo-workshop: 'unsafe-inline'",
  'img-src echo-workshop: echo-cover: data:',
  'font-src echo-workshop:',
  "connect-src 'none'",
  "media-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const serveOwnedAsset = async (url: URL): Promise<Response> => {
  const sourceId = url.searchParams.get('source') ?? '';
  const itemId = url.searchParams.get('item') ?? '';
  const assetPath = url.searchParams.get('path') ?? '';
  const resolver = getWorkshopAssetResolver();
  if (!resolver || !sourceId || !itemId || !assetPath) {
    return emptyAssetResponse();
  }
  const asset = await resolver.resolve(sourceId, itemId, assetPath);
  if (!asset) {
    return emptyAssetResponse();
  }
  return new Response(Readable.toWeb(createReadStream(asset.filePath)) as ReadableStream, {
    status: 200,
    headers: {
      'Content-Type': asset.mimeType,
      'Cache-Control': 'no-store',
    },
  });
};

const serveSteamPreview = async (requestUrl: string): Promise<Response> => {
  const sourceUrl = parseWorkshopPreviewSourceUrl(requestUrl);
  if (!sourceUrl) {
    return emptyAssetResponse();
  }
  const response = await fetchWithNetworkProxy(sourceUrl, { redirect: 'follow' });
  if (!response.ok) {
    return emptyAssetResponse();
  }
  if (!sanitizeSteamPreviewUrl(response.url || sourceUrl)) {
    return emptyAssetResponse();
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxWorkshopPreviewBytes) {
    return emptyAssetResponse();
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > maxWorkshopPreviewBytes) {
    return emptyAssetResponse();
  }
  const mimeType = detectWorkshopRasterAssetMime(bytes);
  if (!mimeType) {
    return emptyAssetResponse();
  }
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': mimeType,
      'Cache-Control': 'no-store',
    },
  });
};

const serveUiRuntime = async (url: URL): Promise<Response> => {
  const segments = url.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
  const [sourceId = '', itemId = '', ...pathSegments] = segments;
  const assetPath = pathSegments.join('/');
  const resolver = getWorkshopAssetResolver();
  if (!resolver || !sourceId || !itemId || !assetPath) {
    return emptyAssetResponse();
  }
  const asset = await resolver.resolveUiRuntime(sourceId, itemId, assetPath);
  if (!asset) {
    return emptyAssetResponse();
  }
  const headers: Record<string, string> = {
    'Content-Type': asset.mimeType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Access-Control-Allow-Origin': '*',
  };
  if (asset.mimeType.startsWith('text/html')) {
    headers['Content-Security-Policy'] = workshopUiContentSecurityPolicy;
  }
  return new Response(Readable.toWeb(createReadStream(asset.filePath)) as ReadableStream, {
    status: 200,
    headers,
  });
};

const servePluginAsset = async (url: URL): Promise<Response> => {
  const segments = url.pathname.split('/').filter(Boolean).map((segment) => decodeURIComponent(segment));
  const [sourceId = '', itemId = '', ...pathSegments] = segments;
  const assetPath = pathSegments.join('/');
  const service = getBoundWorkshopPluginService();
  if (!service || !sourceId || !itemId || !assetPath) return emptyAssetResponse();
  const asset = await service.resolveAsset(sourceId, itemId, assetPath);
  if (!asset) return emptyAssetResponse();
  const headers: Record<string, string> = {
    'Content-Type': asset.mimeType,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Access-Control-Allow-Origin': '*',
  };
  if (asset.mimeType.startsWith('text/html')) {
    headers['Content-Security-Policy'] = workshopPluginContentSecurityPolicy;
  }
  return new Response(asset.body, { status: 200, headers });
};

export const registerWorkshopAssetProtocolHandler = (
  target: Pick<Electron.Protocol, 'handle'> = protocol,
): void => {
  target.handle('echo-workshop', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname === 'asset') {
        return await serveOwnedAsset(url);
      }
      if (url.hostname === 'preview') {
        return await serveSteamPreview(request.url);
      }
      if (url.hostname === 'ui') {
        return await serveUiRuntime(url);
      }
      if (url.hostname === 'plugin') {
        return await servePluginAsset(url);
      }
      return emptyAssetResponse();
    } catch {
      return emptyAssetResponse();
    }
  });
};
