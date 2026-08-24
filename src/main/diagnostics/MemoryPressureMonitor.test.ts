import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagnosticMemorySnapshot } from '../../shared/types/diagnostics';
import {
  checkMemoryPressureNow,
  createMemoryPressureConsoleSummary,
  getLargestRendererMemoryBytes,
  isRendererProbeLyricsPageVisible,
  rendererEmergencyMemoryPressureThresholdBytes,
  rendererMemoryPressureThresholdBytes,
  resetMemoryPressureMonitorForTests,
  shouldReleaseSoftMemoryPressure,
} from './MemoryPressureMonitor';
import {
  getLargestGpuMemoryBytes,
  gpuMemoryPressureThresholdBytes,
  hasSustainedGpuMemoryPressure,
} from './MemoryPressureHeuristics';

const testMocks = vi.hoisted(() => ({
  appMetrics: vi.fn<() => Array<Record<string, unknown>>>(() => []),
  browserWindows: [] as Array<Record<string, unknown>>,
  reportMemoryPressure: vi.fn(),
  releaseSoftMemoryPressure: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    getAppMetrics: testMocks.appMetrics,
    getVersion: vi.fn(() => '1.0.1-test'),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => testMocks.browserWindows),
  },
}));

vi.mock('./CrashReportService', () => ({
  createMemoryPressureEventFromSnapshot: (snapshot: DiagnosticMemorySnapshot, reportPath: string) => ({
    timestamp: snapshot.timestamp,
    thresholdBytes: snapshot.thresholdBytes,
    totalWorkingSetBytes: snapshot.totalWorkingSetBytes,
    totalPrivateBytes: snapshot.totalPrivateBytes,
    processCount: snapshot.processCount,
    topProcessType: snapshot.topProcesses[0]?.type ?? 'unknown',
    topProcessWorkingSetBytes: snapshot.topProcesses[0]?.workingSetBytes ?? 0,
    reportPath,
    graphicsPressure: null,
  }),
  getCrashReportService: () => ({
    getLogger: () => null,
    reportMemoryPressure: testMocks.reportMemoryPressure,
  }),
}));

vi.mock('./SoftMemoryJanitor', () => ({
  createSoftMemoryCleanupLogFields: vi.fn(() => ({})),
  releaseSoftMemoryPressure: testMocks.releaseSoftMemoryPressure,
}));

afterEach(() => {
  resetMemoryPressureMonitorForTests();
  testMocks.browserWindows.length = 0;
  testMocks.appMetrics.mockReset().mockReturnValue([]);
  testMocks.reportMemoryPressure.mockReset();
  testMocks.releaseSoftMemoryPressure.mockReset().mockResolvedValue({
    ran: false,
    skipped: true,
    skippedReason: 'empty',
    cooldownHit: false,
    cooldownRemainingMs: 0,
    startedAtMs: 0,
    finishedAtMs: 0,
    taskCount: 0,
    removedEntries: 0,
    tasks: [],
    errors: [],
    errorCount: 0,
    reason: 'test',
  });
});

const makeSnapshot = (overrides: Partial<DiagnosticMemorySnapshot> = {}): DiagnosticMemorySnapshot => ({
  timestamp: '2026-06-30T12:00:00.000Z',
  thresholdBytes: 3 * 1024 * 1024 * 1024,
  totalWorkingSetBytes: 3_700_000_000,
  totalPrivateBytes: 3_100_000_000,
  processCount: 1,
  source: 'electron-app-metrics',
  currentProcess: {
    pid: 100,
    rssBytes: 400_000_000,
    heapTotalBytes: 120_000_000,
    heapUsedBytes: 80_000_000,
    externalBytes: 20_000_000,
    arrayBuffersBytes: 10_000_000,
  },
  metrics: [
    {
      pid: 220,
      type: 'Tab',
      name: 'renderer',
      workingSetBytes: 3_300_000_000,
      peakWorkingSetBytes: 3_400_000_000,
      privateBytes: 2_900_000_000,
      cpuPercent: 3,
    },
  ],
  topProcesses: [
    {
      pid: 220,
      type: 'Tab',
      name: 'renderer',
      workingSetBytes: 3_300_000_000,
      peakWorkingSetBytes: 3_400_000_000,
      privateBytes: 2_900_000_000,
      cpuPercent: 3,
    },
  ],
  appVersion: '1.0.1-test',
  platform: 'win32',
  arch: 'x64',
  ...overrides,
});

describe('createMemoryPressureConsoleSummary', () => {
  it('classifies high renderer JS heap and lyrics DOM pressure for console output', () => {
    const summary = createMemoryPressureConsoleSummary(makeSnapshot({
      rendererProcesses: [
        {
          timestamp: '2026-06-30T12:00:00.000Z',
          pid: 220,
          windowId: 1,
          windowKind: 'main',
          route: 'lyrics',
          process: {
            type: 'Tab',
            name: 'renderer',
            workingSetBytes: 3_300_000_000,
            privateBytes: 2_900_000_000,
            peakWorkingSetBytes: 3_400_000_000,
            cpuPercent: 3,
          },
          heap: {
            usedJSHeapSize: 700_000_000,
            totalJSHeapSize: 850_000_000,
            jsHeapSizeLimit: 4_000_000_000,
          },
          dom: {
            nodeCount: 60_000,
            elementCount: 40_000,
            textNodeCount: 19_000,
            documentWidth: 1200,
            documentHeight: 900,
          },
          selectors: {
            lyricsLines: 2_100,
            lyricWordNodes: 6_500,
          },
        },
      ],
    }), 'D:\\reports\\memory-pressure-report.md');

    expect(summary.likelyCause).toBe('renderer-js-heap-retention');
    expect(summary.dominantRenderer).toMatchObject({
      pid: 220,
      route: 'lyrics',
      windowKind: 'main',
    });
    expect(summary.evidence.join('\n')).toContain('renderer JS heap high');
    expect(summary.evidence.join('\n')).toContain('lyrics DOM pressure');
    expect(summary.reportPath).toBe('D:\\reports\\memory-pressure-report.md');
  });
});

describe('shouldReleaseSoftMemoryPressure', () => {
  it('requires sustained soft-threshold samples', () => {
    expect(shouldReleaseSoftMemoryPressure([
      { totalWorkingSetBytes: 99 },
      { totalWorkingSetBytes: 101 },
    ], 100)).toBe(false);

    expect(shouldReleaseSoftMemoryPressure([
      { totalWorkingSetBytes: 100 },
      { totalWorkingSetBytes: 101 },
    ], 100)).toBe(true);

    expect(shouldReleaseSoftMemoryPressure([
      { totalWorkingSetBytes: 70, totalPrivateBytes: 110 },
      { totalWorkingSetBytes: 75, totalPrivateBytes: 105 },
    ], 100)).toBe(true);
  });

  it('requires two consecutive GPU pressure samples', () => {
    const highGpuProcess = {
      pid: 330,
      type: 'GPU',
      serviceName: 'GPU',
      workingSetBytes: 900 * 1024 * 1024,
      privateBytes: 1200 * 1024 * 1024,
    };
    const lowGpuProcess = {
      ...highGpuProcess,
      privateBytes: 900 * 1024 * 1024,
    };

    expect(getLargestGpuMemoryBytes([highGpuProcess])).toBe(1200 * 1024 * 1024);
    expect(hasSustainedGpuMemoryPressure([
      { topProcesses: [lowGpuProcess] },
      { topProcesses: [highGpuProcess] },
    ])).toBe(false);
    expect(hasSustainedGpuMemoryPressure([
      { topProcesses: [highGpuProcess] },
      { topProcesses: [highGpuProcess] },
    ])).toBe(true);
  });

  it('silently mitigates sustained GPU pressure when graphics pressure is confirmed', async () => {
    const gpuKib = 1200 * 1024;
    const rendererKib = 700 * 1024;
    testMocks.appMetrics.mockReturnValue([
      {
        pid: 330,
        type: 'GPU',
        serviceName: 'GPU',
        memory: {
          workingSetSize: gpuKib,
          peakWorkingSetSize: gpuKib,
          privateBytes: gpuKib,
        },
        cpu: { percentCPUUsage: 0, idleWakeupsPerSecond: 0 },
      },
      {
        pid: 220,
        type: 'Tab',
        name: 'renderer',
        memory: {
          workingSetSize: rendererKib,
          peakWorkingSetSize: rendererKib,
          privateBytes: rendererKib,
        },
        cpu: { percentCPUUsage: 0, idleWakeupsPerSecond: 0 },
      },
    ]);
    testMocks.reportMemoryPressure.mockImplementation((snapshot: DiagnosticMemorySnapshot) => ({
      timestamp: snapshot.timestamp,
      thresholdBytes: snapshot.thresholdBytes,
      totalWorkingSetBytes: snapshot.totalWorkingSetBytes,
      totalPrivateBytes: snapshot.totalPrivateBytes,
      processCount: snapshot.processCount,
      topProcessType: 'GPU',
      topProcessWorkingSetBytes: snapshot.topProcesses[0]?.workingSetBytes ?? 0,
      reportPath: 'gpu-memory-pressure-report.md',
      graphicsPressure: {
        kind: 'lyrics-mv-render-pressure',
        reason: 'gpu-process-memory-high-on-lyrics-or-mv-page',
      },
    }));

    await expect(checkMemoryPressureNow()).resolves.toBeNull();
    await expect(checkMemoryPressureNow()).resolves.toMatchObject({
      thresholdBytes: gpuMemoryPressureThresholdBytes,
      reportPath: 'gpu-memory-pressure-report.md',
      userNoticeRecommended: false,
      rendererMitigationRecommended: true,
    });
    await vi.waitFor(() => expect(testMocks.releaseSoftMemoryPressure).toHaveBeenCalledWith({
      reason: 'sustained-gpu-memory-pressure',
    }));
  });

  it('does not mitigate a hidden mounted lyrics route during sustained GPU pressure', async () => {
    const visibleLyricsPage = {
      closest: vi.fn(() => null),
      ownerDocument: {
        defaultView: {
          getComputedStyle: vi.fn(() => ({
            display: 'block',
            visibility: 'visible',
            contentVisibility: 'visible',
          })),
        },
      },
    } as unknown as Element;
    const hiddenRoute = {};
    const mountedLyricsPage = {
      closest: vi.fn(() => hiddenRoute),
      ownerDocument: {
        defaultView: {
          getComputedStyle: vi.fn(() => ({
            display: 'block',
            visibility: 'visible',
            contentVisibility: 'visible',
          })),
        },
      },
    } as unknown as Element;
    expect(isRendererProbeLyricsPageVisible('lyrics', visibleLyricsPage)).toBe(true);
    expect(isRendererProbeLyricsPageVisible('songs', mountedLyricsPage)).toBe(false);
    expect(isRendererProbeLyricsPageVisible('lyrics', mountedLyricsPage)).toBe(false);

    const gpuKib = 1200 * 1024;
    const rendererKib = 700 * 1024;
    testMocks.appMetrics.mockReturnValue([
      {
        pid: 330,
        type: 'GPU',
        serviceName: 'GPU',
        memory: {
          workingSetSize: gpuKib,
          peakWorkingSetSize: gpuKib,
          privateBytes: gpuKib,
        },
        cpu: { percentCPUUsage: 0, idleWakeupsPerSecond: 0 },
      },
      {
        pid: 220,
        type: 'Tab',
        name: 'renderer',
        memory: {
          workingSetSize: rendererKib,
          peakWorkingSetSize: rendererKib,
          privateBytes: rendererKib,
        },
        cpu: { percentCPUUsage: 0, idleWakeupsPerSecond: 0 },
      },
    ]);
    testMocks.browserWindows.push({
      id: 1,
      isDestroyed: vi.fn(() => false),
      isFocused: vi.fn(() => true),
      isVisible: vi.fn(() => true),
      webContents: {
        debugger: { isAttached: vi.fn(() => true) },
        executeJavaScript: vi.fn().mockResolvedValue({
          route: 'songs',
          routeDetail: {
            activeRouteId: 'songs',
            visibleRouteIds: ['songs'],
          },
          visibleState: {
            currentReactRoute: 'songs',
            lyricsPageVisible: isRendererProbeLyricsPageVisible('songs', mountedLyricsPage),
            mvPanelVisible: false,
          },
        }),
        getOSProcessId: vi.fn(() => 220),
        getURL: vi.fn(() => 'file:///index.html'),
        isLoading: vi.fn(() => false),
        send: vi.fn(),
      },
    });
    testMocks.reportMemoryPressure.mockImplementation((snapshot: DiagnosticMemorySnapshot) => {
      const visibleGraphics = snapshot.rendererProcesses?.some((renderer) =>
        renderer.visibleState?.lyricsPageVisible === true || renderer.visibleState?.mvPanelVisible === true,
      ) ?? false;
      return {
        timestamp: snapshot.timestamp,
        thresholdBytes: snapshot.thresholdBytes,
        totalWorkingSetBytes: snapshot.totalWorkingSetBytes,
        totalPrivateBytes: snapshot.totalPrivateBytes,
        processCount: snapshot.processCount,
        topProcessType: 'GPU',
        topProcessWorkingSetBytes: snapshot.topProcesses[0]?.workingSetBytes ?? 0,
        reportPath: 'hidden-lyrics-gpu-pressure-report.md',
        graphicsPressure: visibleGraphics
          ? {
              kind: 'lyrics-mv-render-pressure',
              reason: 'gpu-process-memory-high-on-lyrics-or-mv-page',
            }
          : null,
      };
    });

    await expect(checkMemoryPressureNow()).resolves.toBeNull();
    await expect(checkMemoryPressureNow()).resolves.toMatchObject({
      reportPath: 'hidden-lyrics-gpu-pressure-report.md',
      userNoticeRecommended: false,
      rendererMitigationRecommended: false,
      graphicsPressure: null,
    });
    await vi.waitFor(() => expect(testMocks.releaseSoftMemoryPressure).toHaveBeenCalledWith({
      reason: 'sustained-gpu-memory-pressure',
    }));
  });

  it('triggers protection before total memory reaches 3 GiB when one renderer exceeds 768 MiB', async () => {
    const rendererKib = 800 * 1024;
    testMocks.appMetrics.mockReturnValue([{
      pid: 220,
      type: 'Tab',
      name: 'renderer',
      memory: {
        workingSetSize: rendererKib,
        peakWorkingSetSize: rendererKib,
        privateBytes: rendererKib,
      },
      cpu: { percentCPUUsage: 0, idleWakeupsPerSecond: 0 },
    }]);
    testMocks.reportMemoryPressure.mockImplementation((snapshot: DiagnosticMemorySnapshot) => ({
      timestamp: snapshot.timestamp,
      thresholdBytes: snapshot.thresholdBytes,
      totalWorkingSetBytes: snapshot.totalWorkingSetBytes,
      totalPrivateBytes: snapshot.totalPrivateBytes,
      processCount: snapshot.processCount,
      topProcessType: 'Tab',
      topProcessWorkingSetBytes: snapshot.topProcesses[0]?.workingSetBytes ?? 0,
      reportPath: 'renderer-memory-pressure-report.md',
      graphicsPressure: null,
    }));

    await expect(checkMemoryPressureNow()).resolves.toMatchObject({
      thresholdBytes: rendererMemoryPressureThresholdBytes,
      reportPath: 'renderer-memory-pressure-report.md',
      userNoticeRecommended: false,
      rendererMitigationRecommended: false,
    });
    expect(testMocks.reportMemoryPressure).toHaveBeenCalledWith(expect.objectContaining({
      thresholdBytes: rendererMemoryPressureThresholdBytes,
      totalWorkingSetBytes: 800 * 1024 * 1024,
    }));
    await vi.waitFor(() => expect(testMocks.releaseSoftMemoryPressure).toHaveBeenCalledWith({
      reason: 'renderer-memory-pressure',
    }));
  });

  it('keeps emergency renderer protection silent while allowing visual mitigation', async () => {
    const rendererKib = 1600 * 1024;
    testMocks.appMetrics.mockReturnValue([{
      pid: 220,
      type: 'Tab',
      name: 'renderer',
      memory: {
        workingSetSize: rendererKib,
        peakWorkingSetSize: rendererKib,
        privateBytes: rendererKib,
      },
      cpu: { percentCPUUsage: 0, idleWakeupsPerSecond: 0 },
    }]);
    testMocks.reportMemoryPressure.mockImplementation((snapshot: DiagnosticMemorySnapshot) => ({
      timestamp: snapshot.timestamp,
      thresholdBytes: snapshot.thresholdBytes,
      totalWorkingSetBytes: snapshot.totalWorkingSetBytes,
      totalPrivateBytes: snapshot.totalPrivateBytes,
      processCount: snapshot.processCount,
      topProcessType: 'Tab',
      topProcessWorkingSetBytes: snapshot.topProcesses[0]?.workingSetBytes ?? 0,
      reportPath: 'renderer-emergency-report.md',
      graphicsPressure: null,
    }));

    await expect(checkMemoryPressureNow()).resolves.toMatchObject({
      thresholdBytes: rendererEmergencyMemoryPressureThresholdBytes,
      userNoticeRecommended: false,
      rendererMitigationRecommended: true,
    });
  });

  it('ignores non-renderer processes when calculating the early threshold', () => {
    expect(getLargestRendererMemoryBytes(makeSnapshot({
      metrics: [
        {
          pid: 330,
          type: 'GPU',
          workingSetBytes: 2_000_000_000,
          peakWorkingSetBytes: 2_100_000_000,
          privateBytes: 2_100_000_000,
        },
        {
          pid: 220,
          type: 'Tab',
          name: 'renderer',
          workingSetBytes: 700_000_000,
          peakWorkingSetBytes: 720_000_000,
          privateBytes: 710_000_000,
        },
      ],
    }))).toBe(710_000_000);
  });

  it('keeps sampling and releases caches after the first hard-pressure report', async () => {
    testMocks.appMetrics.mockReturnValue([{
      pid: 220,
      type: 'Tab',
      name: 'renderer',
      memory: {
        workingSetSize: 4 * 1024 * 1024,
        peakWorkingSetSize: 4 * 1024 * 1024,
        privateBytes: 4 * 1024 * 1024,
      },
      cpu: { percentCPUUsage: 0, idleWakeupsPerSecond: 0 },
    }]);
    testMocks.reportMemoryPressure.mockReturnValue({
      timestamp: '2026-06-30T12:00:00.000Z',
      thresholdBytes: 3 * 1024 * 1024 * 1024,
      totalWorkingSetBytes: 4 * 1024 * 1024 * 1024,
      processCount: 1,
      topProcessType: 'Tab',
      topProcessWorkingSetBytes: 4 * 1024 * 1024 * 1024,
      reportPath: 'memory-pressure-report.md',
    });
    testMocks.releaseSoftMemoryPressure.mockResolvedValue({
      ran: false,
      skipped: true,
      skippedReason: 'empty',
      cooldownHit: false,
      cooldownRemainingMs: 0,
      startedAtMs: 0,
      finishedAtMs: 0,
      taskCount: 0,
      removedEntries: 0,
      tasks: [],
      errors: [],
      errorCount: 0,
      reason: 'sustained-soft-memory-pressure',
    });

    expect(await checkMemoryPressureNow()).not.toBeNull();
    await expect(checkMemoryPressureNow()).resolves.toMatchObject({
      reportPath: 'memory-pressure-report.md',
    });

    await vi.waitFor(() => expect(testMocks.releaseSoftMemoryPressure).toHaveBeenCalledTimes(1));
    expect(testMocks.reportMemoryPressure).toHaveBeenCalledTimes(1);
  });
});
