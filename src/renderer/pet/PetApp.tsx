import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { RotateCcw, X } from 'lucide-react';
import type { PetBounds } from '../../shared/types/pet';
import { translateFallback, useOptionalI18n } from '../i18n/I18nProvider';

const petArtworkUrl = new URL('../assets/echo-pet-interact.gif', import.meta.url).href;
const petIdleArtworkUrl = new URL('../assets/echo-pet-idle.gif', import.meta.url).href;
const petControlsArtworkUrl = new URL('../assets/echo-pet-controls.png', import.meta.url).href;
const petAnimationDurationMs = 3_600;
const petDragThresholdPx = 4;
const petTransportErrorDurationMs = 2_400;

type PetDragGesture = {
  pointerId: number;
  startScreenX: number;
  startScreenY: number;
  startWindowX: number;
  startWindowY: number;
  moved: boolean;
};

export const PetApp = (): JSX.Element => {
  const t = useOptionalI18n()?.t ?? translateFallback;
  const [pendingAction, setPendingAction] = useState<'previous' | 'playPause' | 'next' | null>(null);
  const [transportError, setTransportError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationTimerRef = useRef<number | null>(null);
  const transportErrorTimerRef = useRef<number | null>(null);
  const transportPendingRef = useRef(false);
  const dragGestureRef = useRef<PetDragGesture | null>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingDragPositionRef = useRef<Pick<PetBounds, 'x' | 'y'> | null>(null);
  const suppressCharacterClickRef = useRef(false);

  const triggerAnimation = useCallback((): void => {
    if (animationTimerRef.current !== null) {
      window.clearTimeout(animationTimerRef.current);
    }
    setIsAnimating(true);
    animationTimerRef.current = window.setTimeout(() => {
      animationTimerRef.current = null;
      setIsAnimating(false);
    }, petAnimationDurationMs);
  }, []);

  useEffect(() => () => {
    if (animationTimerRef.current !== null) {
      window.clearTimeout(animationTimerRef.current);
    }
    if (transportErrorTimerRef.current !== null) {
      window.clearTimeout(transportErrorTimerRef.current);
    }
  }, []);

  useEffect(() => {
    const stopHiddenAnimation = (): void => {
      if (document.visibilityState !== 'hidden') {
        return;
      }
      if (animationTimerRef.current !== null) {
        window.clearTimeout(animationTimerRef.current);
        animationTimerRef.current = null;
      }
      setIsAnimating(false);
    };

    document.addEventListener('visibilitychange', stopHiddenAnimation);
    return () => document.removeEventListener('visibilitychange', stopHiddenAnimation);
  }, []);

  useEffect(() => () => {
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
    }
  }, []);

  const flushPetDrag = useCallback((): void => {
    dragFrameRef.current = null;
    const position = pendingDragPositionRef.current;
    pendingDragPositionRef.current = null;
    if (position) {
      void window.echo?.pet?.moveTo(position);
    }
  }, []);

  const schedulePetDrag = useCallback((position: Pick<PetBounds, 'x' | 'y'>): void => {
    pendingDragPositionRef.current = position;
    if (dragFrameRef.current === null) {
      dragFrameRef.current = window.requestAnimationFrame(flushPetDrag);
    }
  }, [flushPetDrag]);

  const handleCharacterPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0 || !Number.isFinite(window.screenX) || !Number.isFinite(window.screenY)) {
      return;
    }
    dragGestureRef.current = {
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      startWindowX: window.screenX,
      startWindowY: window.screenY,
      moved: false,
    };
    if (typeof event.currentTarget.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }, []);

  const handleCharacterPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>): void => {
    const gesture = dragGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.screenX - gesture.startScreenX;
    const deltaY = event.screenY - gesture.startScreenY;
    if (!gesture.moved && Math.hypot(deltaX, deltaY) < petDragThresholdPx) {
      return;
    }
    gesture.moved = true;
    schedulePetDrag({ x: gesture.startWindowX + deltaX, y: gesture.startWindowY + deltaY });
  }, [schedulePetDrag]);

  const finishCharacterDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>): void => {
    const gesture = dragGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }
    dragGestureRef.current = null;
    suppressCharacterClickRef.current = gesture.moved;
    if (dragFrameRef.current !== null) {
      window.cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
      flushPetDrag();
    }
    if (typeof event.currentTarget.hasPointerCapture === 'function' && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [flushPetDrag]);

  const handleCharacterClick = useCallback((): void => {
    if (suppressCharacterClickRef.current) {
      suppressCharacterClickRef.current = false;
      return;
    }
    triggerAnimation();
  }, [triggerAnimation]);

  const controlPlayback = useCallback(async (type: 'previous' | 'playPause' | 'next'): Promise<void> => {
    const controlMainWindow = window.echo?.playback?.controlMainWindow;
    if (!controlMainWindow || transportPendingRef.current) {
      return;
    }

    transportPendingRef.current = true;
    setPendingAction(type);
    setTransportError(null);
    if (transportErrorTimerRef.current !== null) {
      window.clearTimeout(transportErrorTimerRef.current);
      transportErrorTimerRef.current = null;
    }
    triggerAnimation();
    try {
      await controlMainWindow({ type });
    } catch (error) {
      setTransportError(error instanceof Error ? error.message : String(error));
      transportErrorTimerRef.current = window.setTimeout(() => {
        transportErrorTimerRef.current = null;
        setTransportError(null);
      }, petTransportErrorDurationMs);
    } finally {
      transportPendingRef.current = false;
      setPendingAction(null);
    }
  }, [triggerAnimation]);

  return (
    <main className="echo-pet-app" aria-label={t('pet.aria.window')}>
      <div className="echo-pet-stage">
        <img
          alt={t('pet.aria.character')}
          className="echo-pet-character"
          draggable={false}
          src={isAnimating ? petArtworkUrl : petIdleArtworkUrl}
        />
        <button
          aria-label={t('pet.aria.character')}
          className="echo-pet-character-trigger"
          title={t('pet.aria.character')}
          type="button"
          onClick={handleCharacterClick}
          onPointerCancel={finishCharacterDrag}
          onPointerDown={handleCharacterPointerDown}
          onPointerMove={handleCharacterPointerMove}
          onPointerUp={finishCharacterDrag}
        />
        <div className="echo-pet-track-controls" aria-busy={pendingAction !== null}>
          <button
            aria-label={t('miniPlayer.action.previous')}
            className="echo-pet-track-control echo-pet-track-control--previous"
            disabled={pendingAction !== null}
            title={transportError ?? t('miniPlayer.action.previous')}
            type="button"
            onClick={() => void controlPlayback('previous')}
          >
            <span className="echo-pet-track-art echo-pet-track-art--previous" aria-hidden="true">
              <img alt="" draggable={false} src={petControlsArtworkUrl} />
            </span>
          </button>
          <button
            aria-label={t('pet.action.playPause')}
            className="echo-pet-track-control echo-pet-track-control--play-pause"
            disabled={pendingAction !== null}
            title={transportError ?? t('pet.action.playPause')}
            type="button"
            onClick={() => void controlPlayback('playPause')}
          >
            <span className="echo-pet-track-art echo-pet-track-art--play-pause" aria-hidden="true">
              <img alt="" draggable={false} src={petControlsArtworkUrl} />
            </span>
          </button>
          <button
            aria-label={t('miniPlayer.action.next')}
            className="echo-pet-track-control echo-pet-track-control--next"
            disabled={pendingAction !== null}
            title={transportError ?? t('miniPlayer.action.next')}
            type="button"
            onClick={() => void controlPlayback('next')}
          >
            <span className="echo-pet-track-art echo-pet-track-art--next" aria-hidden="true">
              <img alt="" draggable={false} src={petControlsArtworkUrl} />
            </span>
          </button>
        </div>
        {transportError ? <span className="echo-pet-status" role="status">{transportError}</span> : null}
        <div className="echo-pet-controls">
          <button
            aria-label={t('pet.action.resetPosition')}
            className="echo-pet-control"
            title={t('pet.action.resetPosition')}
            type="button"
            onClick={() => void window.echo?.pet?.resetBounds?.()}
          >
            <RotateCcw size={13} strokeWidth={2.4} />
          </button>
          <button
            aria-label={t('pet.action.hide')}
            className="echo-pet-control"
            title={t('pet.action.hide')}
            type="button"
            onClick={() => void window.echo?.pet?.hide?.()}
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </main>
  );
};
