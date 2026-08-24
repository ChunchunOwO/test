export const calculateNativeDspRealtimeRatio = (
  inputFrames: number | null | undefined,
  processMilliseconds: number | null | undefined,
  inputSampleRate: number | null | undefined,
): number | null => {
  if (
    typeof inputFrames !== 'number' || !Number.isFinite(inputFrames) || inputFrames <= 0 ||
    typeof processMilliseconds !== 'number' || !Number.isFinite(processMilliseconds) || processMilliseconds <= 0 ||
    typeof inputSampleRate !== 'number' || !Number.isFinite(inputSampleRate) || inputSampleRate <= 0
  ) {
    return null;
  }

  return processMilliseconds / (inputFrames / inputSampleRate * 1_000);
};
