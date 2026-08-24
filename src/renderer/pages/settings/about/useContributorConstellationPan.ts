import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
  type RefObject,
} from 'react';

type DragState = {
  pointerId: number;
  pointerX: number;
  pointerY: number;
  scrollLeft: number;
  scrollTop: number;
};

type ContributorConstellationPan = {
  viewportRef: RefObject<HTMLDivElement>;
  canPan: boolean;
  isDragging: boolean;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
  onPointerCancel: PointerEventHandler<HTMLElement>;
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
};

export const useContributorConstellationPan = (): ContributorConstellationPan => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [canPan, setCanPan] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const updateCanPan = useCallback((): void => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setCanPan(
      viewport.scrollWidth - viewport.clientWidth > 1
      || viewport.scrollHeight - viewport.clientHeight > 1,
    );
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    updateCanPan();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateCanPan);
      return () => window.removeEventListener('resize', updateCanPan);
    }

    const observer = new ResizeObserver(updateCanPan);
    observer.observe(viewport);
    const world = viewport.firstElementChild;
    if (world instanceof HTMLElement) observer.observe(world);
    return () => observer.disconnect();
  }, [updateCanPan]);

  const finishDragging = useCallback((event: ReactPointerEvent<HTMLElement>): void => {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const onPointerDown = useCallback<PointerEventHandler<HTMLElement>>((event) => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select')) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    dragStateRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIsDragging(true);
    event.preventDefault();
  }, []);

  const onPointerMove = useCallback<PointerEventHandler<HTMLElement>>((event) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = dragState.scrollLeft - (event.clientX - dragState.pointerX);
    viewport.scrollTop = dragState.scrollTop - (event.clientY - dragState.pointerY);
  }, []);

  const onKeyDown = useCallback<KeyboardEventHandler<HTMLDivElement>>((event) => {
    const viewport = event.currentTarget;
    const distance = event.shiftKey ? 260 : 84;
    const movement = {
      ArrowLeft: [-distance, 0],
      ArrowRight: [distance, 0],
      ArrowUp: [0, -distance],
      ArrowDown: [0, distance],
    }[event.key];

    if (movement) {
      viewport.scrollBy({ left: movement[0], top: movement[1], behavior: 'smooth' });
      event.preventDefault();
      return;
    }
    if (event.key === 'Home') {
      viewport.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
      event.preventDefault();
    } else if (event.key === 'End') {
      viewport.scrollTo({ left: viewport.scrollWidth, top: viewport.scrollHeight, behavior: 'smooth' });
      event.preventDefault();
    }
  }, []);

  return {
    viewportRef,
    canPan,
    isDragging,
    onKeyDown,
    onPointerCancel: finishDragging,
    onPointerDown,
    onPointerMove,
    onPointerUp: finishDragging,
  };
};
