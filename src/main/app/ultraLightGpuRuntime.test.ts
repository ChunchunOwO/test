import { describe, expect, it } from 'vitest';
import {
  createNormalRuntimeArgs,
  createUltraLightGpuRuntimeArgs,
  isUltraLightGpuRuntime,
  prepareNormalRuntimeRelaunch,
} from './ultraLightGpuRuntime';

describe('ultraLightGpuRuntime', () => {
  it('adds the GPU-disabled runtime marker exactly once', () => {
    const args = createUltraLightGpuRuntimeArgs(['electron', '.', '--echo-ultra-light-gpu-runtime']);

    expect(args).toEqual(['.', '--echo-ultra-light-gpu-runtime']);
    expect(isUltraLightGpuRuntime(args)).toBe(true);
  });

  it('removes the marker when returning to the normal GPU runtime', () => {
    expect(createNormalRuntimeArgs(['electron', '.', '--echo-ultra-light-gpu-runtime']))
      .toEqual(['.']);
  });

  it('drops the transient renderer dev URL before relaunching the normal runtime', () => {
    const environment = {
      ELECTRON_RENDERER_URL: 'http://localhost:5173',
      ECHO_KEEP_ME: '1',
    };

    expect(prepareNormalRuntimeRelaunch(
      ['electron', '.', '--echo-ultra-light-gpu-runtime'],
      environment,
    )).toEqual(['.']);
    expect(environment).toEqual({ ECHO_KEEP_ME: '1' });
  });
});
