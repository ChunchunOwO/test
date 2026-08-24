import type { DiagnosticPerformanceStallPayload } from '../../shared/types/diagnostics';

const frameStallThresholdMs = 750;
const frameProbeIntervalMs = 250;
const longTaskThresholdMs = 250;
const rendererHeartbeatIntervalMs = 500;
const rendererHeartbeatThresholdMs = 1000;
const reportCooldownMs = 10_000;
const maxElementDescriptionLength = 140;
const inputEventNames = ['pointerdown', 'keydown', 'wheel', 'input'] as const;

type LastInputEvent = {
  type: string;
  target?: string;
  timestampMs: number;
};

let monitorStarted = false;
let lastFrameAt = 0;
let frameId: number | null = null;
let frameProbeTimer: number | null = null;
let heartbeatTimer: number | null = null;
let longTaskObserver: PerformanceObserver | null = null;
let monitorBackgrounded = false;
let mainWindowMinimized = false;
let mainWindowHidden = false;
let unsubscribeMinimizedChange: (() => void) | null = null;
let unsubscribeHiddenChange: (() => void) | null = null;
let lastInputEvent: LastInputEvent | null = null;
const lastReportAtByKind = new Map<DiagnosticPerformanceStallPayload['kind'], number>();

const readRendererEnv = (name: string): string | undefined => {
  const maybeProcess = typeof process !== 'undefined' ? process : undefined;
  return maybeProcess?.env?.[name];
};

const isRendererScanPerfDiagnosticsEnabled = (): boolean => {
  const explicit = readRendererEnv('ECHO_SCAN_PERF_LOGS');
  return explicit === '1';
};

const getWindowKind = (): DiagnosticPerformanceStallPayload['windowKind'] => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('desktopLyrics') === '1') {
    return 'desktopLyrics';
  }
  if (params.get('miniPlayer') === '1') {
    return 'miniPlayer';
  }
  return 'main';
};

const truncateDetail = (value: string): string =>
  value.length > maxElementDescriptionLength ? `${value.slice(0, maxElementDescriptionLength - 3)}...` : value;

const describeElement = (target: EventTarget | Element | null | undefined): string | undefined => {
  if (!(target instanceof Element)) {
    return undefined;
  }

  const parts = [target.tagName.toLowerCase()];
  const id = target.id.trim();
  if (id) {
    parts.push(`#${id}`);
  }

  const role = target.getAttribute('role')?.trim();
  if (role) {
    parts.push(`[role="${role}"]`);
  }

  const ariaLabel = target.getAttribute('aria-label')?.trim();
  if (ariaLabel) {
    parts.push(`[aria-label="${ariaLabel}"]`);
  }

  const testId = target.getAttribute('data-testid')?.trim();
  if (testId) {
    parts.push(`[data-testid="${testId}"]`);
  }

  const classNames = Array.from(target.classList).slice(0, 3);
  if (classNames.length > 0) {
    parts.push(`.${classNames.join('.')}`);
  }

  return truncateDetail(parts.join(''));
};

const getRouteDetail = (): string => {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
};

const getCommonStallDetails = (): Record<string, unknown> => {
  const nowMs = performance.now();
  return {
    route: getRouteDetail(),
    visibilityState: document.visibilityState,
    documentFocused: typeof document.hasFocus === 'function' ? document.hasFocus() : undefined,
    activeElement: describeElement(document.activeElement),
    lastInputType: lastInputEvent?.type,
    lastInputTarget: lastInputEvent?.target,
    lastInputAgeMs: lastInputEvent ? Math.max(0, Math.round(nowMs - lastInputEvent.timestampMs)) : undefined,
  };
};

const rememberInputEvent = (event: Event): void => {
  lastInputEvent = {
    type: event.type,
    target: describeElement(event.target),
    timestampMs: performance.now(),
  };
};

const addInputBreadcrumbListeners = (): void => {
  for (const eventName of inputEventNames) {
    window.addEventListener(eventName, rememberInputEvent, { capture: true, passive: true });
  }
};

const removeInputBreadcrumbListeners = (): void => {
  for (const eventName of inputEventNames) {
    window.removeEventListener(eventName, rememberInputEvent, { capture: true });
  }
};

const reportStall = (payload: Omit<DiagnosticPerformanceStallPayload, 'source' | 'timestamp' | 'windowKind' | 'url'>): void => {
  const now = Date.now();
  const lastReportAt = lastReportAtByKind.get(payload.kind) ?? 0;
  if (now - lastReportAt < reportCooldownMs) {
    return;
  }

  lastReportAtByKind.set(payload.kind, now);
  void window.echo?.diagnostics.reportPerformanceStall({
    ...payload,
    details: {
      ...getCommonStallDetails(),
      ...payload.details,
    },
    source: 'renderer',
    timestamp: new Date().toISOString(),
    windowKind: getWindowKind(),
    url: window.location.href,
  }).catch(() => undefined);
};

const requestFrameProbe = (): void => {
  if (!monitorStarted || monitorBackgrounded || frameId !== null || frameProbeTimer !== null) {
    return;
  }

  frameId = window.requestAnimationFrame((timestamp) => {
    frameId = null;
    if (!monitorStarted || monitorBackgrounded) {
      return;
    }

    if (document.visibilityState === 'visible' && lastFrameAt > 0) {
      const gapMs = timestamp - lastFrameAt;
      if (gapMs >= frameStallThresholdMs) {
        reportStall({
          kind: 'animation_frame',
          durationMs: gapMs,
          thresholdMs: frameStallThresholdMs,
          details: { lastFrameGapMs: gapMs },
        });
      }
    }

    lastFrameAt = timestamp;
    frameProbeTimer = window.setTimeout(() => {
      frameProbeTimer = null;
      requestFrameProbe();
    }, frameProbeIntervalMs);
  });
};

const extractLongTaskAttribution = (entry: PerformanceEntry): unknown[] | undefined => {
  const attribution = (entry as PerformanceEntry & { attribution?: unknown }).attribution;
  if (!Array.isArray(attribution) || attribution.length === 0) {
    return undefined;
  }

  return attribution.slice(0, 3).map((item) => {
    if (!item || typeof item !== 'object') {
      return String(item);
    }

    const record = item as Record<string, unknown>;
    return {
      name: typeof record.name === 'string' ? record.name : undefined,
      entryType: typeof record.entryType === 'string' ? record.entryType : undefined,
      containerType: typeof record.containerType === 'string' ? record.containerType : undefined,
      containerName: typeof record.containerName === 'string' ? record.containerName : undefined,
      containerId: typeof record.containerId === 'string' ? record.containerId : undefined,
      containerSrc: typeof record.containerSrc === 'string' ? truncateDetail(record.containerSrc) : undefined,
    };
  });
};

const startLongTaskObserver = (): void => {
  if (typeof PerformanceObserver !== 'function') {
    return;
  }

  try {
    const supportedTypes = PerformanceObserver.supportedEntryTypes ?? [];
    if (!supportedTypes.includes('longtask')) {
      return;
    }

    const observer = new PerformanceObserver((list) => {
      if (monitorBackgrounded) {
        return;
      }
      for (const entry of list.getEntries()) {
        if (entry.duration < longTaskThresholdMs) {
          continue;
        }

        reportStall({
          kind: 'long_task',
          durationMs: entry.duration,
          thresholdMs: longTaskThresholdMs,
          details: {
            name: entry.name,
            entryType: entry.entryType,
            startTime: entry.startTime,
            attribution: extractLongTaskAttribution(entry),
          },
        });
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
    longTaskObserver = observer;
  } catch {
    // Older Chromium builds can reject longtask observers; frame drift still covers visible stalls.
  }
};

const startRendererHeartbeat = (): void => {
  if (monitorBackgrounded || heartbeatTimer !== null || !isRendererScanPerfDiagnosticsEnabled()) {
    return;
  }

  let expectedAt = performance.now() + rendererHeartbeatIntervalMs;
  heartbeatTimer = window.setInterval(() => {
    const now = performance.now();
    const driftMs = now - expectedAt;
    expectedAt = now + rendererHeartbeatIntervalMs;
    if (driftMs < rendererHeartbeatThresholdMs) {
      return;
    }

    const roundedDriftMs = Math.round(driftMs);
    console.warn(
      `[library-scan-perf] renderer_heartbeat durationMs=${roundedDriftMs} thresholdMs=${rendererHeartbeatThresholdMs} route=${getRouteDetail()}`,
    );
    reportStall({
      kind: 'long_task',
      durationMs: driftMs,
      thresholdMs: rendererHeartbeatThresholdMs,
      details: {
        heartbeat: 'renderer',
        expectedIntervalMs: rendererHeartbeatIntervalMs,
      },
    });
  }, rendererHeartbeatIntervalMs);
};

const stopForegroundMonitoring = (): void => {
  if (frameId !== null) {
    window.cancelAnimationFrame(frameId);
    frameId = null;
  }
  if (frameProbeTimer !== null) {
    window.clearTimeout(frameProbeTimer);
    frameProbeTimer = null;
  }
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  longTaskObserver?.disconnect();
  longTaskObserver = null;
  lastFrameAt = 0;
};

const startForegroundMonitoring = (): void => {
  if (!monitorStarted || monitorBackgrounded) {
    return;
  }

  lastFrameAt = performance.now();
  requestFrameProbe();
  startLongTaskObserver();
  startRendererHeartbeat();
};

const syncForegroundMonitoring = (): void => {
  const nextBackgrounded =
    document.visibilityState !== 'visible' || mainWindowMinimized || mainWindowHidden;
  if (monitorBackgrounded === nextBackgrounded) {
    return;
  }

  monitorBackgrounded = nextBackgrounded;
  if (monitorBackgrounded) {
    stopForegroundMonitoring();
  } else {
    startForegroundMonitoring();
  }
};

const handleDocumentVisibilityChange = (): void => {
  syncForegroundMonitoring();
};

const handleMainWindowMinimizedChange = (isMinimized: boolean): void => {
  mainWindowMinimized = isMinimized;
  syncForegroundMonitoring();
};

const handleMainWindowHiddenChange = (isHidden: boolean): void => {
  mainWindowHidden = isHidden;
  syncForegroundMonitoring();
};

export const startPerformanceStallMonitor = (): void => {
  if (monitorStarted || typeof window === 'undefined' || !window.echo?.diagnostics.reportPerformanceStall) {
    return;
  }

  monitorStarted = true;
  monitorBackgrounded = document.visibilityState !== 'visible';
  mainWindowMinimized = false;
  mainWindowHidden = false;
  addInputBreadcrumbListeners();
  document.addEventListener('visibilitychange', handleDocumentVisibilityChange);
  unsubscribeMinimizedChange = window.echo?.app?.onMinimizedChange?.(handleMainWindowMinimizedChange) ?? null;
  unsubscribeHiddenChange = window.echo?.app?.onHiddenChange?.(handleMainWindowHiddenChange) ?? null;
  if (!monitorBackgrounded) {
    startForegroundMonitoring();
  }
};

export const stopPerformanceStallMonitorForTests = (): void => {
  stopForegroundMonitoring();
  document.removeEventListener('visibilitychange', handleDocumentVisibilityChange);
  unsubscribeMinimizedChange?.();
  unsubscribeMinimizedChange = null;
  unsubscribeHiddenChange?.();
  unsubscribeHiddenChange = null;
  monitorStarted = false;
  monitorBackgrounded = false;
  mainWindowMinimized = false;
  mainWindowHidden = false;
  lastFrameAt = 0;
  lastInputEvent = null;
  removeInputBreadcrumbListeners();
  lastReportAtByKind.clear();
};
