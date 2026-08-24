import { useEffect, useState } from 'react';

const readDocumentVisibility = (): boolean =>
  typeof document === 'undefined' || document.visibilityState === 'visible';

export const useDocumentVisibilityState = (): boolean => {
  const [isVisible, setIsVisible] = useState(readDocumentVisibility);

  useEffect(() => {
    const syncVisibility = (): void => setIsVisible(readDocumentVisibility());
    document.addEventListener('visibilitychange', syncVisibility);
    syncVisibility();

    return () => document.removeEventListener('visibilitychange', syncVisibility);
  }, []);

  return isVisible;
};
