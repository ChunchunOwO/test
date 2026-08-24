import { describe, expect, it } from 'vitest';
import { calculateNativeDspRealtimeRatio } from './NativeDspTelemetry';

describe('calculateNativeDspRealtimeRatio', () => {
  it('uses the actual processor input rate for an oversampled SDM block', () => {
    expect(calculateNativeDspRealtimeRatio(131_072, 46, 1_536_000)).toBeCloseTo(0.539, 3);
  });

  it('does not manufacture telemetry before a native block has run', () => {
    expect(calculateNativeDspRealtimeRatio(0, 0, 1_536_000)).toBeNull();
  });
});
