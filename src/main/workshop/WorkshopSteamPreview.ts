export const maxWorkshopPreviewBytes = 512 * 1024;

export const sanitizeSteamPreviewUrl = (value: string | undefined | null): string | null => {
  if (!value) {
    return null;
  }
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:') {
      return null;
    }
    if (
      host.endsWith('.steamstatic.com') ||
      host.endsWith('.steamusercontent.com') ||
      (host.endsWith('.akamaihd.net') && host.includes('steam'))
    ) {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
};

export const buildWorkshopPreviewProtocolUrl = (httpsUrl: string): string | null => {
  const sanitized = sanitizeSteamPreviewUrl(httpsUrl);
  if (!sanitized) {
    return null;
  }
  const url = new URL('echo-workshop://preview/');
  url.searchParams.set('u', sanitized);
  return url.toString();
};

export const parseWorkshopPreviewSourceUrl = (protocolUrl: string): string | null => {
  try {
    const parsed = new URL(protocolUrl);
    if (parsed.protocol !== 'echo-workshop:' || parsed.hostname !== 'preview') {
      return null;
    }
    return sanitizeSteamPreviewUrl(parsed.searchParams.get('u'));
  } catch {
    return null;
  }
};
