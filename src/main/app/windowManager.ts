import type { BrowserWindow } from 'electron';

let mainWindow: BrowserWindow | null = null;
let trustedMainWindowUrl: string | null = null;

export const setMainWindow = (window: BrowserWindow, trustedRendererUrl: string): void => {
  mainWindow = window;
  trustedMainWindowUrl = trustedRendererUrl;
};

export const getMainWindow = (): BrowserWindow | null => mainWindow;
export const getTrustedMainWindowUrl = (): string | null => trustedMainWindowUrl;

export const clearMainWindow = (): void => {
  mainWindow = null;
  trustedMainWindowUrl = null;
};
