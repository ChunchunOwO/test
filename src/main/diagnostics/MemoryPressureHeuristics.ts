import type {
  DiagnosticMemoryProcessMetric,
  DiagnosticMemoryTrendSample,
} from '../../shared/types/diagnostics';

const mib = 1024 * 1024;

export const gpuMemoryPressureThresholdBytes = 1024 * mib;
const gpuMemoryPressureRequiredSamples = 2;

type MemoryProcessMetric = Pick<
  DiagnosticMemoryProcessMetric,
  'type' | 'name' | 'serviceName' | 'workingSetBytes' | 'privateBytes'
>;

const isGpuProcess = (metric: MemoryProcessMetric): boolean => {
  const label = `${metric.type} ${metric.name ?? ''} ${metric.serviceName ?? ''}`.toLowerCase();
  return label.includes('gpu');
};

export const getLargestGpuMemoryBytes = (metrics: readonly MemoryProcessMetric[]): number =>
  metrics.reduce((largest, metric) => {
    if (!isGpuProcess(metric)) {
      return largest;
    }

    return Math.max(largest, metric.workingSetBytes, metric.privateBytes ?? 0);
  }, 0);

export const hasSustainedGpuMemoryPressure = (
  recentSamples: readonly Pick<DiagnosticMemoryTrendSample, 'topProcesses'>[],
  thresholdBytes = gpuMemoryPressureThresholdBytes,
): boolean => {
  const samples = recentSamples.slice(-gpuMemoryPressureRequiredSamples);
  return samples.length >= gpuMemoryPressureRequiredSamples &&
    samples.every((sample) => getLargestGpuMemoryBytes(sample.topProcesses) >= thresholdBytes);
};
