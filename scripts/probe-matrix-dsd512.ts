import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { Readable, Writable } from 'node:stream';
import { createEchoSrcFirTaps } from '../src/main/audio/EchoSrcFirEngine';
import { JsonRpcBridge, type NativeDspProcessingStatus } from '../src/main/audio/JsonRpcBridge';
import { resolveSdmDopTransportSampleRate, resolveSdmNativeSampleRate } from '../src/main/audio/SdmFormatPlan';
import { createSdmSoundStagePlans } from '../src/main/audio/SdmSoundProfilePlan';
import { getAudioSdmSoundProfile, type AudioSdmSoundProfileId } from '../src/shared/audioSdmSoundProfiles';
import type { AudioEchoSrcFilterProfile, AudioSdmQualityProfile } from '../src/shared/types/audio';

type ProbeOptions = {
  hostPath: string;
  deviceName: string;
  sourceRates: number[];
  bufferFrames: number;
  qualityProfile: AudioSdmQualityProfile;
  soundProfile: AudioSdmSoundProfileId;
  computeBackend: 'cpu' | 'cuda';
  evidencePath: string;
  exerciseSilenceSeconds: number;
  dryRun: boolean;
  verbose: boolean;
};

type ProbeCase = {
  sourceSampleRate: number;
  carrierSampleRate: number;
  nativeDsdSampleRate: number;
  stageProfiles: AudioEchoSrcFilterProfile[];
  stages: Array<{ upsampleFactor: 2; taps: number[] }>;
};

const projectRoot = resolve(import.meta.dirname, '..');
const defaultHostPath = resolve(projectRoot, 'out/native/audio-host/Release/echo-audio-host.exe');
const defaultEvidencePath = resolve(projectRoot, 'out/hardware-probes/matrix-dsd512-admission.json');

const parseOptions = (argv: string[]): ProbeOptions => {
  const options: ProbeOptions = {
    hostPath: defaultHostPath,
    deviceName: 'Matrix ASIO Driver',
    sourceRates: [44_100, 48_000],
    bufferFrames: 2_048,
    qualityProfile: 'safe',
    soundProfile: 'linear',
    computeBackend: 'cpu',
    evidencePath: defaultEvidencePath,
    exerciseSilenceSeconds: 0,
    dryRun: false,
    verbose: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === '--host' && value) {
      options.hostPath = resolve(value);
      index += 1;
    } else if (argument === '--device' && value) {
      options.deviceName = value;
      index += 1;
    } else if (argument === '--source-rate' && value) {
      options.sourceRates = value === 'both'
        ? [44_100, 48_000]
        : [Math.round(Number(value))];
      index += 1;
    } else if (argument === '--buffer' && value) {
      options.bufferFrames = Math.max(1, Math.round(Number(value)));
      index += 1;
    } else if (argument === '--quality' && value) {
      if (value === 'safe' || value === 'hifi' || value === 'reference' || value === 'insane') {
        options.qualityProfile = value;
      }
      index += 1;
    } else if (argument === '--sound' && value) {
      if (value === 'linear' || value === 'transient' || value === 'smooth') {
        options.soundProfile = value;
      }
      index += 1;
    } else if (argument === '--compute' && value) {
      if (value === 'cpu' || value === 'cuda') {
        options.computeBackend = value;
      }
      index += 1;
    } else if (argument === '--evidence' && value) {
      options.evidencePath = resolve(value);
      index += 1;
    } else if (argument === '--exercise-silence' && value) {
      options.exerciseSilenceSeconds = Math.max(0, Number(value));
      index += 1;
    } else if (argument === '--dry-run') {
      options.dryRun = true;
    } else if (argument === '--verbose') {
      options.verbose = true;
    }
  }

  if (options.sourceRates.some((rate) => rate !== 44_100 && rate !== 48_000)) {
    throw new Error('source rate must be 44100, 48000, or both');
  }
  if (!Number.isFinite(options.bufferFrames) || options.bufferFrames <= 0) {
    throw new Error('buffer must be a positive integer');
  }
  if (!Number.isFinite(options.exerciseSilenceSeconds) || options.exerciseSilenceSeconds < 0 || options.exerciseSilenceSeconds > 10) {
    throw new Error('exercise-silence must be between 0 and 10 seconds');
  }
  return options;
};

const buildProbeCase = (sourceSampleRate: number, soundProfileId: AudioSdmSoundProfileId): ProbeCase => {
  const soundProfile = getAudioSdmSoundProfile(soundProfileId);
  const carrierSampleRate = resolveSdmDopTransportSampleRate('dsd512', sourceSampleRate);
  const nativeDsdSampleRate = resolveSdmNativeSampleRate('dsd512', sourceSampleRate);
  const stagePlans = createSdmSoundStagePlans({
    sourceSampleRate,
    targetSampleRate: carrierSampleRate,
    filterProfile1x: soundProfile.filterProfile1x,
    filterProfileNx: soundProfile.filterProfileNx,
  });
  if (stagePlans.length !== 5) {
    throw new Error(`DSD512 requires five x2 FIR stages; received ${stagePlans.length}`);
  }

  return {
    sourceSampleRate,
    carrierSampleRate,
    nativeDsdSampleRate,
    stageProfiles: stagePlans.map((stage) => stage.plan.profile),
    stages: stagePlans.map((stage) => ({
      upsampleFactor: 2,
      taps: Array.from(createEchoSrcFirTaps(stage.plan)),
    })),
  };
};

const writeSilentWav = async (filePath: string, sampleRate: number, seconds: number): Promise<void> => {
  const channels = 2;
  const bitsPerSample = 16;
  const frameCount = Math.max(1, Math.round(sampleRate * seconds));
  const blockAlign = channels * (bitsPerSample / 8);
  const dataBytes = frameCount * blockAlign;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * blockAlign, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataBytes, 40);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, wav);
};

const calculateProcessingRealtimeRatio = (
  processing: NativeDspProcessingStatus | null,
): { fir: number | null; modulator: number | null; total: number | null } => {
  const sdm = processing?.sdm;
  if (!sdm) return { fir: null, modulator: null, total: null };
  const fir = (sdm.oversamplingLastInputFrames ?? 0) > 0 && (sdm.oversamplingLastProcessMilliseconds ?? 0) > 0 && (sdm.sourceSampleRate ?? 0) > 0
    ? (sdm.oversamplingLastProcessMilliseconds as number) /
      ((sdm.oversamplingLastInputFrames as number) / (sdm.sourceSampleRate as number) * 1_000)
    : null;
  const modulator = (sdm.lastInputFrames ?? 0) > 0 && (sdm.lastProcessMilliseconds ?? 0) > 0 && (sdm.targetSampleRate ?? 0) > 0
    ? (sdm.lastProcessMilliseconds as number) /
      ((sdm.lastInputFrames as number) / (sdm.targetSampleRate as number) * 1_000)
    : null;
  return {
    fir,
    modulator,
    total: fir === null && modulator === null ? null : (fir ?? 0) + (modulator ?? 0),
  };
};

const waitForProcessReady = async (process: ChildProcess, outputLines: string[]): Promise<Record<string, unknown>> => {
  const stdout = process.stdout;
  if (!stdout) {
    throw new Error('native host stdout is unavailable');
  }
  stdout.setEncoding('utf8');

  return await new Promise<Record<string, unknown>>((resolveReady, rejectReady) => {
    let pending = '';
    const timer = setTimeout(() => finish(new Error('native host process-ready timeout')), 15_000);
    const onExit = (code: number | null): void => finish(new Error(`native host exited before process-ready: ${String(code)}`));
    const onData = (chunk: string): void => {
      pending += chunk;
      let lineBreak = pending.indexOf('\n');
      while (lineBreak >= 0) {
        const line = pending.slice(0, lineBreak).trim();
        pending = pending.slice(lineBreak + 1);
        if (line) {
          outputLines.push(line);
          try {
            const parsed = JSON.parse(line) as Record<string, unknown>;
            if (parsed.ready === true && parsed.readyLevel === 'process') {
              finish(null, parsed);
              return;
            }
          } catch {
            // Non-JSON diagnostics remain in evidence but do not define readiness.
          }
        }
        lineBreak = pending.indexOf('\n');
      }
    };
    const finish = (error: Error | null, ready?: Record<string, unknown>): void => {
      clearTimeout(timer);
      stdout.removeListener('data', onData);
      process.removeListener('exit', onExit);
      if (error) rejectReady(error);
      else resolveReady(ready ?? {});
    };
    stdout.on('data', onData);
    process.on('exit', onExit);
  });
};

const waitForExit = async (process: ChildProcess, timeoutMs: number): Promise<boolean> => {
  if (process.exitCode !== null) return true;
  return await new Promise<boolean>((resolveExit) => {
    const timer = setTimeout(() => finish(false), timeoutMs);
    const onExit = (): void => finish(true);
    const finish = (exited: boolean): void => {
      clearTimeout(timer);
      process.removeListener('exit', onExit);
      resolveExit(exited);
    };
    process.on('exit', onExit);
  });
};

const exerciseSilentPipeline = async (
  bridge: JsonRpcBridge,
  options: ProbeOptions,
  probeCase: ProbeCase,
): Promise<Record<string, unknown>> => {
  const silencePath = resolve(
    dirname(options.evidencePath),
    `matrix-dsd512-silence-${probeCase.sourceSampleRate}.wav`,
  );
  await writeSilentWav(silencePath, probeCase.sourceSampleRate, options.exerciseSilenceSeconds);

  const realtimeSamples: Array<{ fir: number | null; modulator: number | null; total: number | null }> = [];
  let lastProcessing: NativeDspProcessingStatus | null = null;
  let lastPosition: Record<string, unknown> | null = null;
  const audioErrors: Record<string, unknown>[] = [];
  let resolveEnded: (() => void) | null = null;
  const ended = new Promise<void>((resolvePromise) => {
    resolveEnded = resolvePromise;
  });
  const onPosition = (params: Record<string, unknown>): void => {
    lastPosition = params;
    if (params.processing && typeof params.processing === 'object' && !Array.isArray(params.processing)) {
      lastProcessing = params.processing as NativeDspProcessingStatus;
      const sample = calculateProcessingRealtimeRatio(lastProcessing);
      if (sample.total !== null) realtimeSamples.push(sample);
    }
  };
  const onEnded = (): void => resolveEnded?.();
  const onAudioError = (params: Record<string, unknown>): void => audioErrors.push(params);
  bridge.on('audio.position', onPosition);
  bridge.on('audio.ended', onEnded);
  bridge.on('audio.error', onAudioError);

  try {
    const opened = await bridge.openFile(silencePath, probeCase.nativeDsdSampleRate, 0);
    const completion = await Promise.race([
      ended.then(() => 'ended' as const),
      delay(Math.max(5_000, options.exerciseSilenceSeconds * 2_000 + 3_000)).then(() => 'timeout' as const),
    ]);
    const totalRatios = realtimeSamples
      .map((sample) => sample.total)
      .filter((ratio): ratio is number => ratio !== null && Number.isFinite(ratio));
    const peakRealtimeRatio = totalRatios.length > 0 ? Math.max(...totalRatios) : null;
    const averageRealtimeRatio = totalRatios.length > 0
      ? totalRatios.reduce((sum, ratio) => sum + ratio, 0) / totalRatios.length
      : null;
    const sdm = lastProcessing?.sdm;
    const passed = completion === 'ended' &&
      audioErrors.length === 0 &&
      (sdm?.processedBlocks ?? 0) > 0 &&
      (sdm?.oversamplingProcessedBlocks ?? 0) > 0 &&
      (sdm?.stabilityRecoveries ?? 0) === 0 &&
      peakRealtimeRatio !== null && peakRealtimeRatio < 0.85;

    return {
      passed,
      completion,
      opened,
      silencePath,
      telemetrySamples: realtimeSamples.length,
      averageRealtimeRatio,
      peakRealtimeRatio,
      lastRealtimeRatio: calculateProcessingRealtimeRatio(lastProcessing),
      lastPosition,
      lastProcessing,
      audioErrors,
    };
  } finally {
    bridge.off('audio.position', onPosition);
    bridge.off('audio.ended', onEnded);
    bridge.off('audio.error', onAudioError);
  }
};

const runHardwareAdmission = async (options: ProbeOptions, probeCase: ProbeCase): Promise<Record<string, unknown>> => {
  const outputLines: string[] = [];
  const stderrLines: string[] = [];
  const process = spawn(options.hostPath, [
    '--no-stdin',
    '--defer-device-open',
    '--rpc-stdin-fd', '3',
    '--rpc-stdout-fd', '4',
  ], {
    cwd: projectRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'],
  });
  const rpcInput = process.stdio[3] as Writable | null;
  const rpcOutput = process.stdio[4] as Readable | null;
  if (!rpcInput || !rpcOutput) {
    process.kill();
    throw new Error('native host fd3/fd4 transport is unavailable');
  }

  process.stderr?.setEncoding('utf8');
  const onStderr = (chunk: string): void => {
    stderrLines.push(...chunk.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean));
  };
  process.stderr?.on('data', onStderr);
  const bridge = new JsonRpcBridge();
  bridge.open(rpcOutput, rpcInput);

  try {
    const processReady = await waitForProcessReady(process, outputLines);
    const configured = await bridge.configureDevice({
      deviceId: options.deviceName,
      deviceIndex: 0,
      deviceName: options.deviceName,
      outputMode: 'asio',
      sampleRate: probeCase.nativeDsdSampleRate,
      bufferSize: options.bufferFrames,
      channels: 2,
      processing: {
        outputFormat: 'dsd-native-raw',
        sdm: {
          sourceSampleRate: probeCase.sourceSampleRate,
          targetSampleRate: probeCase.carrierSampleRate,
          stages: probeCase.stages,
          qualityProfile: options.qualityProfile,
          computeBackend: options.computeBackend,
        },
      },
    });
    const session = await bridge.sessionBegin({
      sr: probeCase.nativeDsdSampleRate,
      ch: 2,
      buffer: options.bufferFrames,
      fifoMs: 8_000,
      prebufferMs: 60,
      startPaused: options.exerciseSilenceSeconds <= 0,
    });
    const realtimeExercise = options.exerciseSilenceSeconds > 0
      ? await exerciseSilentPipeline(bridge, options, probeCase)
      : null;
    if (!realtimeExercise) await delay(750);

    const ready = typeof session === 'object' ? session.ready : null;
    const processing = configured.processing;
    const passed = configured.accepted === true &&
      typeof session === 'object' && session.accepted === true &&
      ready?.readyLevel === 'device' &&
      ready?.backendImpl === 'asio-native-dsd' &&
      ready?.deviceName === options.deviceName &&
      ready?.sampleRate === probeCase.nativeDsdSampleRate &&
      processing?.outputFormat === 'dsd-native-raw' &&
      processing.sdm.active === true &&
      processing.sdm.targetSampleRate === probeCase.carrierSampleRate &&
      processing.sdm.stageCount === 5 &&
      (realtimeExercise?.passed ?? true) === true;

    return {
      passed,
      processReady,
      configured,
      session,
      realtimeExercise,
      stderr: stderrLines,
      stdout: outputLines,
    };
  } finally {
    try {
      if (!bridge.isClosed) await bridge.call<string>('rpc.shutdown');
    } catch {
      // The owned process is still released below if graceful shutdown failed.
    }
    await bridge.close().catch(() => undefined);
    if (!await waitForExit(process, 2_000)) {
      process.kill();
      await waitForExit(process, 1_000);
    }
    process.stderr?.removeListener('data', onStderr);
  }
};

const main = async (): Promise<void> => {
  const options = parseOptions(process.argv);
  const probeCases = options.sourceRates.map((sourceRate) => buildProbeCase(sourceRate, options.soundProfile));
  const results: Array<Record<string, unknown>> = [];

  if (!options.dryRun) {
    for (const probeCase of probeCases) {
      try {
        results.push({
          sourceSampleRate: probeCase.sourceSampleRate,
          carrierSampleRate: probeCase.carrierSampleRate,
          nativeDsdSampleRate: probeCase.nativeDsdSampleRate,
          stageProfiles: probeCase.stageProfiles,
          stageTapCounts: probeCase.stages.map((stage) => stage.taps.length),
          ...await runHardwareAdmission(options, probeCase),
        });
      } catch (error) {
        results.push({
          sourceSampleRate: probeCase.sourceSampleRate,
          carrierSampleRate: probeCase.carrierSampleRate,
          nativeDsdSampleRate: probeCase.nativeDsdSampleRate,
          stageProfiles: probeCase.stageProfiles,
          stageTapCounts: probeCase.stages.map((stage) => stage.taps.length),
          passed: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const evidence = {
    generator: 'echo-matrix-dsd512-admission-probe',
    generatedAt: new Date().toISOString(),
    dryRun: options.dryRun,
    deviceName: options.deviceName,
    qualityProfile: options.qualityProfile,
    soundProfile: options.soundProfile,
    computeBackend: options.computeBackend,
    bufferFrames: options.bufferFrames,
    exerciseSilenceSeconds: options.exerciseSilenceSeconds,
    cases: options.dryRun
      ? probeCases.map((probeCase) => ({
        sourceSampleRate: probeCase.sourceSampleRate,
        carrierSampleRate: probeCase.carrierSampleRate,
        nativeDsdSampleRate: probeCase.nativeDsdSampleRate,
        stageProfiles: probeCase.stageProfiles,
        stageTapCounts: probeCase.stages.map((stage) => stage.taps.length),
      }))
      : results,
  };
  await mkdir(dirname(options.evidencePath), { recursive: true });
  await writeFile(options.evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(options.verbose ? evidence : {
    evidencePath: options.evidencePath,
    deviceName: options.deviceName,
    soundProfile: options.soundProfile,
    computeBackend: options.computeBackend,
    cases: (options.dryRun ? evidence.cases : results).map((result) => ({
      sourceSampleRate: result.sourceSampleRate,
      nativeDsdSampleRate: result.nativeDsdSampleRate,
      passed: result.passed,
      error: result.error,
    })),
  }, null, 2));

  if (!options.dryRun && results.some((result) => result.passed !== true)) {
    process.exitCode = 1;
  }
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
