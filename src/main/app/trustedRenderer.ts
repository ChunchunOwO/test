import { fileURLToPath } from 'node:url';
import type { IpcMainInvokeEvent } from 'electron';
import { getMainWindow, getTrustedMainWindowUrl } from './windowManager';

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const normalizeFilePath = (url: URL): string | null => {
  try {
    const path = fileURLToPath(url);
    return process.platform === 'win32' ? path.toLocaleLowerCase() : path;
  } catch {
    return null;
  }
};

export const isTrustedRendererUrl = (candidateValue: string, trustedValue: string | null): boolean => {
  if (!trustedValue) {
    return false;
  }

  const candidate = parseUrl(candidateValue);
  const trusted = parseUrl(trustedValue);
  if (!candidate || !trusted || candidate.protocol !== trusted.protocol) {
    return false;
  }

  if (trusted.protocol === 'file:') {
    const candidatePath = normalizeFilePath(candidate);
    const trustedPath = normalizeFilePath(trusted);
    return candidatePath !== null && trustedPath !== null && candidatePath === trustedPath;
  }

  if (trusted.protocol === 'http:' || trusted.protocol === 'https:') {
    return candidate.origin === trusted.origin;
  }

  return false;
};

export const isAllowedExternalUrl = (value: string): boolean => {
  const url = parseUrl(value);
  return url?.protocol === 'http:' || url?.protocol === 'https:';
};

const workshopFrameScope = (value: string): string | null => {
  const url = parseUrl(value);
  if (url?.protocol !== 'echo-workshop:' || (url.hostname !== 'ui' && url.hostname !== 'plugin')) {
    return null;
  }
  const [sourceId, itemId] = url.pathname.split('/').filter(Boolean);
  return sourceId && itemId ? `${url.hostname}:${sourceId}:${itemId}` : null;
};

export const isWorkshopFrameUrl = (value: string): boolean => workshopFrameScope(value) !== null;

export const isAllowedWorkshopFrameNavigation = (currentValue: string, destinationValue: string): boolean => {
  const destinationScope = workshopFrameScope(destinationValue);
  if (!destinationScope) return false;
  if (!currentValue || currentValue === 'about:blank') return true;
  return workshopFrameScope(currentValue) === destinationScope;
};

export const requireTrustedMainRenderer = (event: unknown, capability: string): void => {
  const mainWindow = getMainWindow();
  const trustedUrl = getTrustedMainWindowUrl();
  const invokeEvent = event as Partial<IpcMainInvokeEvent> | null;
  const sender = invokeEvent?.sender;
  const senderFrame = invokeEvent?.senderFrame;
  const mainFrame = mainWindow?.webContents.mainFrame;

  if (
    !mainWindow
    || mainWindow.isDestroyed()
    || !sender
    || sender !== mainWindow.webContents
    || !senderFrame
    || senderFrame !== mainFrame
    || !isTrustedRendererUrl(senderFrame.url, trustedUrl)
  ) {
    throw new Error(`${capability} is only available to the trusted main renderer.`);
  }
};
