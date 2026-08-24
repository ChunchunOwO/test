import { useCallback, useEffect, useRef, useState } from 'react';

const clampVolume = (value: number): number => Math.max(0, Math.min(1, value));
const volumesMatch = (left: number, right: number): boolean => Math.abs(left - right) < 0.001;

export type WorkshopSceneVolume = {
  volume: number;
  interactive: boolean;
  commitVolume: (volume: number) => void;
};

/**
 * Output volume surface for Workshop lyrics scenes. Audio Core keeps owning the
 * volume fact: the hook mirrors AudioStatus, commits through audio.setOutput and
 * persists playerVolume exactly like the host player bar control does.
 */
export const useWorkshopSceneVolume = (enabled: boolean): WorkshopSceneVolume => {
  const [volume, setVolume] = useState(1);
  const [fixedVolumeEnabled, setFixedVolumeEnabled] = useState(false);
  const pendingVolumeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const audio = window.echo?.audio;
    if (!audio) return undefined;
    let isCancelled = false;
    const applyStatusVolume = (statusVolume: number | undefined): void => {
      const nextVolume = clampVolume(statusVolume ?? 1);
      const pending = pendingVolumeRef.current;
      if (pending !== null) {
        if (!volumesMatch(nextVolume, pending)) return;
        pendingVolumeRef.current = null;
      }
      setVolume(nextVolume);
    };
    void audio.getStatus()
      .then((status) => {
        if (!isCancelled) applyStatusVolume(status.volume);
      })
      .catch(() => undefined);
    const unsubscribe = audio.onStatus((status) => {
      if (!isCancelled) applyStatusVolume(status.volume);
    });
    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const getSettings = window.echo?.app?.getSettings;
    if (typeof getSettings === 'function') {
      void getSettings()
        .then((settings) => setFixedVolumeEnabled(settings.fixedVolumeEnabled === true))
        .catch(() => undefined);
    }
    const handleSettingsChanged = (event: Event): void => {
      const detail = (event as CustomEvent<{ fixedVolumeEnabled?: unknown }>).detail;
      if (detail && typeof detail.fixedVolumeEnabled === 'boolean') {
        setFixedVolumeEnabled(detail.fixedVolumeEnabled);
      }
    };
    window.addEventListener('settings:changed', handleSettingsChanged);
    return () => window.removeEventListener('settings:changed', handleSettingsChanged);
  }, [enabled]);

  const commitVolume = useCallback((nextVolume: number): void => {
    const audio = window.echo?.audio;
    if (!audio || fixedVolumeEnabled) return;
    const safeVolume = clampVolume(nextVolume);
    pendingVolumeRef.current = safeVolume;
    setVolume(safeVolume);
    void audio.setOutput({ volume: safeVolume })
      .then(() => {
        void window.echo?.app?.setSettings?.({ playerVolume: safeVolume }).catch(() => undefined);
      })
      .catch(() => {
        pendingVolumeRef.current = null;
      });
  }, [fixedVolumeEnabled]);

  return {
    volume: fixedVolumeEnabled ? 1 : volume,
    interactive: !fixedVolumeEnabled,
    commitVolume,
  };
};
