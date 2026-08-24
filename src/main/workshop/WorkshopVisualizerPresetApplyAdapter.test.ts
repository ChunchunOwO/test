import { describe, expect, it, vi } from 'vitest';
import { createWorkshopVisualizerPresetApplyAdapter } from './WorkshopVisualizerPresetApplyAdapter';
import type { WorkshopVisualizerPresetContribution } from './WorkshopDataContributionTypes';

const contribution: WorkshopVisualizerPresetContribution = {
  type: 'echo-workshop-visualizer-preset',
  schemaVersion: 1,
  id: 'echo.visualizer-fixture',
  title: 'Mint Spectrum',
  style: 'wave',
  palette: ['#66ccff', '#99ffcc'],
  barCount: 32,
  smoothing: 0.4,
  sensitivity: 1.1,
  decay: 0.3,
  mirror: true,
};

const context = {
  sourceId: 'steam',
  itemId: '123',
  contentId: 'echo.visualizer-fixture',
  version: '1.0.0',
  manifestSha256: 'a'.repeat(64),
  registryUpdatedAt: '2026-08-13T00:00:00.000Z',
};

describe('Workshop visualizer preset apply adapter', () => {
  it('stores only a revision receipt through the visualizer service', async () => {
    const visualizer = {
      getSelection: vi.fn(() => null),
      select: vi.fn(),
      restore: vi.fn(),
    };
    const adapter = createWorkshopVisualizerPresetApplyAdapter(visualizer);

    await adapter.apply(contribution, context);

    expect(visualizer.select).toHaveBeenCalledWith(contribution, context);
    expect(visualizer.restore).not.toHaveBeenCalled();
  });

  it('rolls back the previous receipt when select fails', async () => {
    const previous = { ...context, itemId: '1' };
    const visualizer = {
      getSelection: vi.fn(() => previous),
      select: vi.fn(() => {
        throw new Error('disk');
      }),
      restore: vi.fn(),
    };
    const adapter = createWorkshopVisualizerPresetApplyAdapter(visualizer);

    await expect(adapter.apply(contribution, context)).rejects.toMatchObject({ reason: 'apply-failed' });
    expect(visualizer.restore).toHaveBeenCalledWith(previous);
  });
});
