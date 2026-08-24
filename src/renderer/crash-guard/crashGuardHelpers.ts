export const crashGuardFeedbackUrl = 'https://github.com/Moekotori/ECHO/issues';

export const displayCrashOutputPath = (outputPath: string): string => {
  const trimmed = outputPath.trim();
  if (!trimmed) {
    return trimmed;
  }

  const parts = trimmed.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || trimmed;
};

export const crashGuardWindowKey = (
  label: string,
): 'crashGuard.window.main' | 'crashGuard.window.miniPlayer' | 'crashGuard.window.desktopLyrics' | 'crashGuard.window.pet' => {
  if (label === 'mini-player') {
    return 'crashGuard.window.miniPlayer';
  }
  if (label === 'desktop-lyrics') {
    return 'crashGuard.window.desktopLyrics';
  }
  if (label === 'pet') {
    return 'crashGuard.window.pet';
  }
  return 'crashGuard.window.main';
};

export const buildCrashClipboardText = (error: Error): string => {
  const stack = error.stack?.trim();
  return stack ? `${error.message}\n\n${stack}` : error.message;
};
