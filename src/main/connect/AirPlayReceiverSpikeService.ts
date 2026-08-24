import { EventEmitter } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  getCiphers,
  hkdfSync,
  randomBytes,
  sign,
  timingSafeEqual,
  verify,
  type KeyObject,
} from 'node:crypto';
import type { RemoteInfo } from 'node:dgram';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request as httpRequest, type ClientRequest } from 'node:http';
import { createServer as createTcpServer, isIP, type Server as TcpServer, type Socket } from 'node:net';
import { networkInterfaces } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import readline from 'node:readline';
import { PassThrough, Transform } from 'node:stream';
import { app } from 'electron';
import type { AudioOutputSettings, AudioStatus } from '../../shared/types/audio';
import type { AirPlayReceiverProtocol } from '../../shared/types/appSettings';
import type { AirPlayReceiverStatus, ConnectMetadata, ConnectReceiverClient, ConnectReceiverDebugEvent } from '../../shared/types/connect';
import { getAudioSession } from '../audioPublicApi';
import { getAppSettings } from '../app/appSettings';
import { AirPlayDacpRemote, type AirPlayDacpRemoteLike } from './AirPlayDacpRemote';
import { parseAirPlayDmapMetadata, type AirPlayDmapMetadata } from './AirPlayDmapMetadata';
import {
  AirPlayMdnsAdvertiser,
  createAirPlay2TxtData,
  createAirPlay2PairingUuid,
  getAirPlay2AdvertisementProfile,
} from './AirPlayMdnsAdvertiser';
import {
  createDefaultAirPlay2AacDecoder,
  type AirPlay2AacDecoderLike,
  type AirPlay2AacFormat,
} from './AirPlay2AacDecoder';
import { AirPlay2BufferedTransport } from './AirPlay2BufferedTransport';
import { AirPlay2NtpSession } from './AirPlay2NtpSession';
import { AirPlay2PtpClock, type AirPlay2PtpClockLike } from './AirPlay2PtpClock';
import {
  createDefaultAirPlay2PairingStore,
  type AirPlay2PairingStoreLike,
} from './AirPlay2PairingStore';
import {
  AirPlay2UdpTransport,
  type AirPlay2AudioTransportLike,
  type AirPlay2RtpSyncPacket,
  type AirPlay2UdpTransportOptions,
} from './AirPlay2UdpTransport';
import { AirPlayRtpReorderBuffer } from './AirPlayRtpReorderBuffer';

type RaopEvent = Record<string, unknown> & {
  type?: string;
  data?: Buffer;
  sampleRate?: number;
  channels?: number;
  title?: string;
  artist?: string;
  album?: string;
  durationMs?: number;
  elapsedMs?: number;
  value?: number;
  remoteAddress?: string;
  address?: string;
  host?: string;
  mimeType?: string;
  contentType?: string;
};

type RaopReceiverOptions = {
  name: string;
  model: string;
  host?: string;
  mac?: string;
  latencies: string;
  metadata: boolean;
  portBase: number;
  portRange: number;
};

type RaopModule = {
  checkAvailable?: () => void | Promise<void>;
  startReceiver: (options: RaopReceiverOptions, handler: (event: RaopEvent) => void) => number | Promise<number>;
  stopReceiver: (handle: number) => void | Promise<void>;
  sendRemoteCommand?: (handle: number, command: 'play' | 'pause' | 'stop' | 'next' | 'prev' | 'previous') => boolean | Promise<boolean>;
  setPcmForwarding?: (enabled: boolean) => boolean | Promise<boolean>;
  setLogHandler?: (handler: ((event: unknown) => void) | null, level?: string, raopLevel?: string, utilLevel?: string) => void;
};

type AirPlayAudioSession = {
  getStatus: () => AudioStatus;
  playPcmStream: (request: {
    stream: PassThrough;
    sourceId: string;
    trackId?: string | null;
    sampleRate: number;
    channels: number;
    durationSeconds?: number;
    output?: AudioOutputSettings;
  }) => Promise<AudioStatus>;
  pause: () => Promise<AudioStatus> | AudioStatus;
  stop: () => Promise<AudioStatus> | AudioStatus;
  setOutput: (settings: { volume: number }) => Promise<AudioStatus> | AudioStatus;
  on: (event: 'status', listener: (status: AudioStatus) => void) => AirPlayAudioSession;
  off?: (event: 'status', listener: (status: AudioStatus) => void) => AirPlayAudioSession;
};

type AirPlayReceiverEvents = {
  status: [AirPlayReceiverStatus];
};

type AirPlayReceiverDependencies = {
  audioSession?: AirPlayAudioSession;
  advertisedName?: string;
  loadRaopModule?: () => Promise<RaopModule>;
  createAirPlay2AlacDecoder?: AirPlay2AlacDecoderFactory;
  createAirPlay2AacDecoder?: AirPlay2AacDecoderFactory;
  getAdvertiseInterfaces?: () => AirPlayAdvertiseInterface[];
  createMdnsAdvertiser?: () => AirPlayMdnsAdvertiserLike;
  useHttpPcmBridge?: boolean;
  airPlay2Experimental?: boolean;
  getAirPlayReceiverProtocol?: () => AirPlayReceiverProtocol;
  startupTimeoutMs?: number;
  now?: () => number;
  pairingStore?: AirPlay2PairingStoreLike;
  ptpClock?: AirPlay2PtpClockLike;
  dacpRemote?: AirPlayDacpRemoteLike;
};

type AirPlayHelperRuntimeOptions = {
  isPackaged: boolean;
  processExecPath: string;
  npmNodeExecPath?: string | null;
  nodeEnvPath?: string | null;
};

type AirPlay2Identity = {
  publicKey: Buffer;
  privateKey: KeyObject;
};

type AirPlay2PairVerifyState = {
  clientPublicKey: Buffer;
  serverPublicKey: Buffer;
  sharedSecret: Buffer;
  sessionKey: Buffer;
  controlReadKey: Buffer;
  controlWriteKey: Buffer;
};

type AirPlay2EncryptedControlState = Pick<AirPlay2PairVerifyState, 'controlReadKey' | 'controlWriteKey'> & {
  keyLabel: string;
};

type AirPlay2EncryptedEventState = {
  readKey: Buffer;
  writeKey: Buffer;
  keyLabel: string;
};

type AirPlay2PairSetupState = {
  salt: Buffer;
  privateKey: bigint;
  publicKey: Buffer;
  verifier: bigint;
  sessionKey: Buffer | null;
  transient: boolean;
};

type AirPlay2FairPlayState = {
  keyMessage: Buffer | null;
};

type AirPlay2SessionSetupInfo = {
  encryptionKey: Buffer | null;
  encryptionIv: Buffer | null;
  encryptionType: number | null;
  timingProtocol: string | null;
  senderName: string | null;
  senderModel: string | null;
  sourceVersion: string | null;
  sessionUuid: string | null;
  timingPort: number | null;
};

type AirPlay2ControlCipherState = {
  readCounter: number;
  writeCounter: number;
  readCounterOffset: number;
  writeCounterOffset: number;
};

type AirPlay2TlvField = {
  type: number;
  value: Buffer;
};

type AirPlay2ProbeRequest = {
  method: string;
  path: string;
  protocol: string;
  headers: Record<string, string>;
  body: Buffer;
  remoteAddress: string | null;
  localAddress: string | null;
};

type AirPlay2ProbeResponse = {
  statusCode: number;
  headers?: Record<string, string | number>;
  body?: Buffer | string;
  encryptedAfterWrite?: boolean;
};

type AirPlay2TcpConnection = {
  buffer: Buffer;
  plaintextBuffer: Buffer;
  encrypted: boolean;
  draining: boolean;
  waitingForData: boolean;
  cipher: AirPlay2ControlCipherState;
  lastFrameSummary: string | null;
};

type AirPlay2RtpPacket = {
  version: number;
  payloadType: number;
  marker: boolean;
  sequenceNumber: number;
  timestamp: number;
  ssrc: number;
  headerLength: number;
  aad: Buffer;
  payload: Buffer;
};

type AirPlay2SetupStreamInfo = {
  type: number | null;
  compressionType: number | null;
  audioFormat: number | null;
  sampleRate: number | null;
  sampleSize: number | null;
  channels: number | null;
  framesPerPacket: number | null;
  sharedKey: Buffer | null;
  remoteControlPort: number | null;
  streamConnectionId: number | null;
};

type AirPlay2PcmFormat = {
  audioFormat: number;
  sampleRate: number;
  bitDepth: 16 | 24;
  channels: number;
};

type AirPlay2AlacFormat = {
  audioFormat: number;
  sampleRate: number;
  bitDepth: 16;
  channels: 2;
  framesPerPacket: number;
};

type AirPlay2AlacDecoder = {
  decodeFrame: (frame: Buffer) => Buffer;
  close: () => void;
};

type AirPlay2AlacDecoderFactory = (format: AirPlay2AlacFormat) => Promise<AirPlay2AlacDecoder>;

type AirPlay2AacDecoderFactory = (
  format: AirPlay2AacFormat,
  handlers: {
    onPcm: (chunk: Buffer) => void;
    onDiagnostic: (message: string) => void;
    onFailure: (error: Error) => void;
  },
) => Promise<AirPlay2AacDecoderLike>;

type AirPlay2StreamState = {
  dataPort: number;
  controlPort: number;
  streamType: number | null;
  compressionType: number | null;
  audioFormat: number | null;
  framesPerPacket: number | null;
  sharedKey: Buffer | null;
  pcmFormat: AirPlay2PcmFormat | null;
  alacFormat: AirPlay2AlacFormat | null;
  alacDecoder: AirPlay2AlacDecoder | null;
  aacFormat: AirPlay2AacFormat | null;
  aacDecoder: AirPlay2AacDecoderLike | null;
  packetCount: number;
  byteCount: number;
  decryptedPacketCount: number;
  decodedPacketCount: number;
  decryptFailureCount: number;
  retransmittedPacketCount: number;
  firstPacketAt: number | null;
  lastSequenceNumber: number | null;
  lastTimestamp: number | null;
  lastSync: AirPlay2RtpSyncPacket | null;
  streamId: number;
  audioBufferSize: number;
  bufferedPackets: Array<{ packet: AirPlay2RtpPacket; remote: RemoteInfo }>;
  bufferedBytes: number;
  bufferedPlaying: boolean;
  bufferedRate: 0 | 1;
  bufferedAnchorRtpTime: number | null;
  bufferedAnchorMasterTimeNanoseconds: bigint | null;
  bufferedAnchorTimelineId: bigint | null;
  bufferedStartTimer: NodeJS.Timeout | null;
};

type AirPlay2BplistValue =
  | null
  | boolean
  | number
  | bigint
  | string
  | Buffer
  | AirPlay2BplistValue[]
  | { [key: string]: AirPlay2BplistValue };

type AirPlay2BplistObjectRecord = {
  value: AirPlay2BplistValue;
  arrayRefs?: number[];
  dictKeyRefs?: number[];
  dictValueRefs?: number[];
};

const defaultAdvertisedName = (): string =>
  process.env.ELECTRON_RENDERER_URL ? 'ECHO Dev (AirPlay)' : 'ECHO (AirPlay)';
const defaultTitle = 'AirPlay stream';
const unknownArtist = 'Unknown Artist';
const debugEventLimit = 24;
const defaultSampleRate = 44_100;
const defaultChannels = 2;
const airPlayModel = 'ECHO-AirPlay-Spike';
const airPlayPcmHighWaterMark = 4 * 1024 * 1024;
const airPlayOutputSampleRate = 48_000;
const airPlayOutputBufferFrames = 8192;
const airPlay2OutputLeadNanoseconds = BigInt(Math.round(
  (airPlayOutputBufferFrames / airPlayOutputSampleRate) * 1_000_000_000,
));
const airPlay2RtpTimestampDelta = (timestamp: number, anchor: number): number => {
  const unsigned = (timestamp - anchor) >>> 0;
  return unsigned >= 0x8000_0000 ? unsigned - 0x1_0000_0000 : unsigned;
};
const airPlayHttpPcmFallbackMs = 1_500;
const airPlayHttpPcmReconnectMs = 120;
const airPlayRaopLatencies = '1000:1000';
const airPlayStartupStepTimeoutMs = 10_000;
const shouldUseAirPlayHttpPcmBridge = (): boolean => process.env.ECHO_AIRPLAY_HTTP_PCM === '1';
const readConfiguredAirPlayReceiverProtocol = (): AirPlayReceiverProtocol => {
  if (process.env.ECHO_AIRPLAY2_EXPERIMENTAL === '1') {
    return 'airplay2';
  }
  if (process.env.ECHO_AIRPLAY2_EXPERIMENTAL === '0') {
    return 'airplay1';
  }
  try {
    return getAppSettings().airPlayReceiverProtocol === 'airplay2' ? 'airplay2' : 'airplay1';
  } catch {
    return 'airplay1';
  }
};
const highVolumeDebugActions = new Set(['pcm', 'rtp', 'rtcp', 'timing']);
const airPlay2ProbeHeaderLimitBytes = 32 * 1024;
const airPlay2ProbeBodyLimitBytes = 64 * 1024;
const airPlay2ArtworkBodyLimitBytes = 8 * 1024 * 1024;
const airPlay2SupportedPcmAudioFormats = 0x3fffc;
const airPlay2SupportedAlacAudioFormats = 0x40000;
const airPlay2SupportedAacAudioFormats = 0xc00000;
const airPlay2SupportedAudioFormats = airPlay2SupportedPcmAudioFormats
  | airPlay2SupportedAlacAudioFormats
  | airPlay2SupportedAacAudioFormats;
const airPlay2RealtimeSupportedFormats = 0x440800; // LPCM/44.1K/S16/2, ALAC/44.1K/S16/2 and AAC-LC/44.1K/2.
const airPlay2BufferedSupportedFormats = 0xc40000; // ALAC/44.1K/S16/2 and AAC-LC stereo at 44.1/48K.
const optionalRequire = createRequire(import.meta.url);
const nodeLibraopPackageName = '@lox-audioserver/node-libraop';
const x25519SpkiPrefix = Buffer.from('302a300506032b656e032100', 'hex');
const ed25519SpkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
const airPlay2PairVerifySalt = 'Pair-Verify-Encrypt-Salt';
const airPlay2PairVerifyInfo = 'Pair-Verify-Encrypt-Info';
const airPlay2PairSetupEncryptSalt = 'Pair-Setup-Encrypt-Salt';
const airPlay2PairSetupEncryptInfo = 'Pair-Setup-Encrypt-Info';
const airPlay2PairSetupControllerSignSalt = 'Pair-Setup-Controller-Sign-Salt';
const airPlay2PairSetupControllerSignInfo = 'Pair-Setup-Controller-Sign-Info';
const airPlay2PairSetupAccessorySignSalt = 'Pair-Setup-Accessory-Sign-Salt';
const airPlay2PairSetupAccessorySignInfo = 'Pair-Setup-Accessory-Sign-Info';
const airPlay2ControlSalt = 'Control-Salt';
const airPlay2EventsSalt = 'Events-Salt';
const airPlay2EncryptedFrameLimitBytes = 1024;
const airPlay2RtpTrailerBytes = 24;
const airPlay2BufferedStreamType = 103;
const airPlay2RealtimeStreamType = 96;
const airPlay2BufferedAudioBufferBytes = 8 * 1024 * 1024;
const airPlay2PairingFlagTransient = 0x10;
const airPlay2PairSetupUsername = 'Pair-Setup';
const airPlay2PairSetupPassword = '3939';
const airPlay2SrpModulusHex = [
  'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD',
  '3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F',
  '83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864D87602733EC86A64',
  '521F2B18177B200CBBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF',
].join('');
const airPlay2SrpModulus = BigInt(`0x${airPlay2SrpModulusHex}`);
const airPlay2SrpModulusBytes = airPlay2SrpModulusHex.length / 2;
const airPlay2SrpGenerator = 5n;
const airPlay2FairPlaySetup1Responses = [
  [
    '46504c59030102000000008202000f9f3f9e0a2521dbdf312ab2bfb29e8d232b6376a8c818701d22ae93d82737feaf9db4fdf41c2d',
    'ba9d1f49caaabf6591ac1f7bc6f7e0663d21afe01565953eab81f418ceed095adb7c3d0e254909a79831d49c3982973434',
    'facb42c63a1cd911a6fe941a8a6d4a743b46c3a7649e44c78955e49d8155009549c4e2f7a3f6d5ba',
  ],
  [
    '46504c5903010200000000820201cf32a25714b2524f8aa0ad7af164e37bcf4424e200047efc0ad67afcd95ded1c2730bb591b962ed63a9c4d',
    'ed88ba8fc78de64d91ccfd5c7b56da88e31f5cceafc7431995a01665a54e1939d25b94db64b9e45d8d063e1e6af07e',
    '9656162b0efa404275ea5a44d9591c7256b9fbe6513898b80227721988571650942ad946688a',
  ],
  [
    '46504c5903010200000000820202c169a352eeed35b18cdd9c58d64f16c1519a89eb5317bd0d4336cd68f638ff9d016a5b52b7',
    'fa9216b2b65482c78444118121a2c7fed83db7119e9182aad7d18c7063e2a457555910af9e0efc76347d164043807f58',
    '1ee4fbe42ca9dedc1b5eb2a3aa3d2ecd59e7eee70b3629f22afd161d877353ddb99adc8e07006e56f850ce',
  ],
  [
    '46504c59030102000000008202039001e1727e0f57f9f5880db104a6257a23f5cfff1abbe1e93045251afb97eb9fc001',
    '1ebe0f3a81df5b691d76acb2f7a5c708e3d328f56bb39dbde5f29c8a17f481487e3ae863c678325422e6f78e166d18aa',
    '7fd636258bce28726f661f738893ce44311e4be6c0535193e5ef72e8686233729c227d820c999445d89246c8c359',
  ],
].map((chunks) => Buffer.from(chunks.join(''), 'hex'));
const airPlay2FairPlaySetup2ResponsePrefix = Buffer.from('46504c590301040000000014', 'hex');
const airPlay2FairPlaySetup2SuffixBytes = 20;

const airPlay2PcmFormats: AirPlay2PcmFormat[] = [
  { audioFormat: 0x4, sampleRate: 8_000, bitDepth: 16, channels: 1 },
  { audioFormat: 0x8, sampleRate: 8_000, bitDepth: 16, channels: 2 },
  { audioFormat: 0x10, sampleRate: 16_000, bitDepth: 16, channels: 1 },
  { audioFormat: 0x20, sampleRate: 16_000, bitDepth: 16, channels: 2 },
  { audioFormat: 0x40, sampleRate: 24_000, bitDepth: 16, channels: 1 },
  { audioFormat: 0x80, sampleRate: 24_000, bitDepth: 16, channels: 2 },
  { audioFormat: 0x100, sampleRate: 32_000, bitDepth: 16, channels: 1 },
  { audioFormat: 0x200, sampleRate: 32_000, bitDepth: 16, channels: 2 },
  { audioFormat: 0x400, sampleRate: 44_100, bitDepth: 16, channels: 1 },
  { audioFormat: 0x800, sampleRate: 44_100, bitDepth: 16, channels: 2 },
  { audioFormat: 0x1000, sampleRate: 44_100, bitDepth: 24, channels: 1 },
  { audioFormat: 0x2000, sampleRate: 44_100, bitDepth: 24, channels: 2 },
  { audioFormat: 0x4000, sampleRate: 48_000, bitDepth: 16, channels: 1 },
  { audioFormat: 0x8000, sampleRate: 48_000, bitDepth: 16, channels: 2 },
  { audioFormat: 0x10000, sampleRate: 48_000, bitDepth: 24, channels: 1 },
  { audioFormat: 0x20000, sampleRate: 48_000, bitDepth: 24, channels: 2 },
];

const airPlay2AlacFormats: Array<Omit<AirPlay2AlacFormat, 'framesPerPacket'>> = [
  { audioFormat: 0x40000, sampleRate: 44_100, bitDepth: 16, channels: 2 },
];

const airPlay2AacFormats: AirPlay2AacFormat[] = [
  { audioFormat: 0x400000, sampleRate: 44_100, channels: 2 },
  { audioFormat: 0x800000, sampleRate: 48_000, channels: 2 },
];

const airPlay2TlvNames: Record<number, string> = {
  0: 'method',
  1: 'identifier',
  2: 'salt',
  3: 'publicKey',
  4: 'proof',
  5: 'encryptedData',
  6: 'state',
  7: 'error',
  8: 'retryDelay',
  9: 'certificate',
  10: 'signature',
  11: 'permissions',
  12: 'fragmentData',
  13: 'fragmentLast',
  19: 'flags',
};

type AirPlayAdvertiseInterface = {
  name: string;
  address: string;
  mac: string;
};

type AirPlayMdnsAdvertiserLike = Pick<AirPlayMdnsAdvertiser, 'start' | 'stop'>;

const loadDefaultRaopModule = async (): Promise<RaopModule> => {
  return new AirPlayRaopHelperModule();
};

type NodeLibraopAlacExports = {
  default?: NodeLibraopAlacExports;
  startAlacDecoder?: (options: {
    sampleRate: number;
    sampleSize: number;
    channels: number;
    framesPerPacket: number;
  }) => number;
  decodeAlacFrame?: (handle: number, frame: Buffer) => Buffer;
  stopAlacDecoder?: (handle: number) => void;
};

const createDefaultAirPlay2AlacDecoder: AirPlay2AlacDecoderFactory = async (format) => {
  const imported = optionalRequire(nodeLibraopPackageName) as unknown as NodeLibraopAlacExports;
  const raop = imported.default ?? imported;
  if (
    typeof raop.startAlacDecoder !== 'function' ||
    typeof raop.decodeAlacFrame !== 'function' ||
    typeof raop.stopAlacDecoder !== 'function'
  ) {
    throw new Error('AirPlay 2 ALAC decoder is not available in @lox-audioserver/node-libraop.');
  }

  const handle = raop.startAlacDecoder({
    sampleRate: format.sampleRate,
    sampleSize: format.bitDepth,
    channels: format.channels,
    framesPerPacket: format.framesPerPacket,
  });
  let closed = false;
  return {
    decodeFrame: (frame) => {
      if (closed) {
        return Buffer.alloc(0);
      }
      return Buffer.from(raop.decodeAlacFrame!(handle, frame));
    },
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      raop.stopAlacDecoder!(handle);
    },
  };
};

const withTimeout = async <T>(operation: PromiseLike<T> | T, timeoutMs: number, message: string): Promise<T> => {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

export const resolveAirPlayHelperNodePath = (options: AirPlayHelperRuntimeOptions): string => {
  if (options.isPackaged) {
    return options.processExecPath;
  }

  const explicitRuntime = [
    options.npmNodeExecPath,
    options.nodeEnvPath,
  ].filter((value): value is string => Boolean(value));
  return explicitRuntime[0] ?? options.processExecPath;
};

const prependNodePaths = (env: NodeJS.ProcessEnv, nodePaths: string[]): void => {
  const existing = env.NODE_PATH ? [env.NODE_PATH] : [];
  env.NODE_PATH = [...nodePaths, ...existing].join(delimiter);
};

const trimText = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text : null;
};

const normalizeAirPlayDeviceId = (mac: string | null | undefined): string => {
  const cleaned = (mac ?? '').replace(/[^a-fA-F0-9]/gu, '').toUpperCase();
  const value = cleaned.length === 12 ? cleaned : '024543484F00';
  return value.match(/.{1,2}/gu)?.join(':') ?? '02:45:43:48:4F:00';
};

const compactAirPlayText = (value: string | null): string =>
  (value ?? '')
    .replace(/[\s"'`.,!?，。！？、:：;；-]+/gu, '')
    .toLocaleLowerCase();

const comparableAirPlayText = (value: string | null): string =>
  compactAirPlayText(value?.replace(/\s*[(（][^()（）]*[)）]\s*/gu, '') ?? null);

const isGenericAirPlayTitle = (title: string | null): boolean => {
  if (!title) {
    return true;
  }

  const normalized = compactAirPlayText(title);
  return normalized === '纯音乐' || normalized === '纯音乐请欣赏' || normalized === 'airplaystream';
};

const sameText = (left: string | null, right: string | null): boolean => {
  if (!left || !right) {
    return false;
  }
  return comparableAirPlayText(left) === comparableAirPlayText(right);
};

const isAlbumLikeArtistPart = (part: string | null, album: string | null): boolean => {
  const normalizedPart = comparableAirPlayText(part);
  const normalizedAlbum = comparableAirPlayText(album);
  return Boolean(normalizedPart && normalizedAlbum && (normalizedPart === normalizedAlbum || normalizedPart.startsWith(normalizedAlbum)));
};

const looksLikeAirPlayLyricLine = (title: string | null): boolean =>
  Boolean(
    title &&
      title.length >= 8 &&
      (/\s/u.test(title) || /[,'"!?，。！？、…]/u.test(title) || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(title)),
  );

const shouldKeepCurrentMetadataForLyricLine = (title: string | null, current: ConnectMetadata | null): boolean =>
  Boolean(
    current?.title &&
      !isGenericAirPlayTitle(current.title) &&
      looksLikeAirPlayLyricLine(title) &&
      !sameText(title, current.title),
  );

const normalizeAirPlayMetadataText = (
  title: string | null,
  artist: string | null,
  album: string | null,
): { title: string | null; artist: string | null; album: string | null } => {
  if (!album) {
    return { title, artist, album };
  }

  const artistParts = artist?.split(/[/／]/u).map((part) => part.trim()).filter(Boolean) ?? [];
  const albumPartIndex = artistParts.findIndex((part) => isAlbumLikeArtistPart(part, album));
  const shouldPreferAlbumTitle =
    isGenericAirPlayTitle(title) || (albumPartIndex >= 0 && !sameText(title, album) && looksLikeAirPlayLyricLine(title));

  if (!shouldPreferAlbumTitle) {
    return { title, artist, album };
  }

  return {
    title: album,
    artist: albumPartIndex > 0 ? artistParts.slice(0, albumPartIndex).join(' / ') : artist,
    album,
  };
};

const summarizeBuffer = (value: Buffer): string => {
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 12);
  return `${value.length}b:${digest}`;
};

const summarizeBufferPrefix = (value: Buffer, maxBytes = 16): string =>
  value.subarray(0, Math.min(value.length, maxBytes)).toString('hex') || '-';

const airPlay2CipherName = 'chacha20-poly1305';

const airPlay2CipherAvailable = (): boolean => {
  try {
    return getCiphers().includes(airPlay2CipherName);
  } catch {
    return false;
  }
};

const shouldUseAirPlay2NativeCipher = (): boolean =>
  process.env.ECHO_FORCE_AIRPLAY2_CHACHA_FALLBACK !== '1' && airPlay2CipherAvailable();

const airPlay2CipherProvider = (): 'native' | 'fallback' =>
  shouldUseAirPlay2NativeCipher() ? 'native' : 'fallback';

const summarizeAirPlay2CryptoError = (operation: string, error: unknown, details: string): string => {
  const message = error instanceof Error ? error.message : String(error);
  const code = error && typeof error === 'object' && 'code' in error
    ? ` code=${String((error as { code?: unknown }).code)}`
    : '';
  return `${operation} failed cipher=${airPlay2CipherName} provider=${airPlay2CipherProvider()} available=${airPlay2CipherAvailable() ? 'yes' : 'no'}${code}; ${details}; ${message}`;
};

const summarizeAirPlay2EncryptedControlFrame = (frame: Buffer): string => {
  const declaredLength = frame.length >= 2 ? frame.readUInt16LE(0) : null;
  const expectedLength = declaredLength === null ? null : 2 + declaredLength + 16;
  const cipherLength = declaredLength === null ? null : Math.max(0, Math.min(declaredLength, Math.max(0, frame.length - 2)));
  const tagLength = declaredLength === null ? null : Math.max(0, Math.min(16, frame.length - 2 - (cipherLength ?? 0)));
  return [
    `frame=${frame.length}b`,
    `declared=${declaredLength ?? 'missing'}`,
    `expected=${expectedLength ?? 'unknown'}b`,
    `cipher=${cipherLength ?? 'unknown'}b`,
    `tag=${tagLength ?? 'unknown'}b`,
    `prefix=${summarizeBufferPrefix(frame)}`,
    `hash=${summarizeBuffer(frame)}`,
  ].join(' ');
};

const airPlay2SocketPeer = (socket: Socket): string =>
  `${socket.remoteAddress ?? 'unknown'}:${socket.remotePort ?? 'unknown'}`;

const normalizeAirPlay2RemoteAddress = (address: string | null | undefined): string | null => {
  if (!address) {
    return null;
  }
  return address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address;
};

const readUInt32Le = (buffer: Buffer, offset: number): number => buffer.readUInt32LE(offset) >>> 0;

const writeUInt32Le = (buffer: Buffer, value: number, offset: number): void => {
  buffer.writeUInt32LE(value >>> 0, offset);
};

const rotateLeft32 = (value: number, shift: number): number =>
  ((value << shift) | (value >>> (32 - shift))) >>> 0;

const chacha20QuarterRound = (state: number[], a: number, b: number, c: number, d: number): void => {
  state[a] = (state[a] + state[b]) >>> 0;
  state[d] = rotateLeft32(state[d] ^ state[a], 16);
  state[c] = (state[c] + state[d]) >>> 0;
  state[b] = rotateLeft32(state[b] ^ state[c], 12);
  state[a] = (state[a] + state[b]) >>> 0;
  state[d] = rotateLeft32(state[d] ^ state[a], 8);
  state[c] = (state[c] + state[d]) >>> 0;
  state[b] = rotateLeft32(state[b] ^ state[c], 7);
};

const chacha20Block = (key: Buffer, nonce: Buffer, counter: number): Buffer => {
  if (key.length !== 32) {
    throw new Error(`ChaCha20-Poly1305 key must be 32 bytes; got ${key.length}.`);
  }
  if (nonce.length !== 12) {
    throw new Error(`ChaCha20-Poly1305 nonce must be 12 bytes; got ${nonce.length}.`);
  }

  const initialState = [
    0x61707865,
    0x3320646e,
    0x79622d32,
    0x6b206574,
    readUInt32Le(key, 0),
    readUInt32Le(key, 4),
    readUInt32Le(key, 8),
    readUInt32Le(key, 12),
    readUInt32Le(key, 16),
    readUInt32Le(key, 20),
    readUInt32Le(key, 24),
    readUInt32Le(key, 28),
    counter >>> 0,
    readUInt32Le(nonce, 0),
    readUInt32Le(nonce, 4),
    readUInt32Le(nonce, 8),
  ];
  const workingState = [...initialState];
  for (let round = 0; round < 10; round += 1) {
    chacha20QuarterRound(workingState, 0, 4, 8, 12);
    chacha20QuarterRound(workingState, 1, 5, 9, 13);
    chacha20QuarterRound(workingState, 2, 6, 10, 14);
    chacha20QuarterRound(workingState, 3, 7, 11, 15);
    chacha20QuarterRound(workingState, 0, 5, 10, 15);
    chacha20QuarterRound(workingState, 1, 6, 11, 12);
    chacha20QuarterRound(workingState, 2, 7, 8, 13);
    chacha20QuarterRound(workingState, 3, 4, 9, 14);
  }

  const output = Buffer.allocUnsafe(64);
  for (let index = 0; index < 16; index += 1) {
    writeUInt32Le(output, (workingState[index] + initialState[index]) >>> 0, index * 4);
  }
  return output;
};

const chacha20Xor = (key: Buffer, nonce: Buffer, counter: number, input: Buffer): Buffer => {
  const output = Buffer.allocUnsafe(input.length);
  for (let offset = 0; offset < input.length; offset += 64) {
    const block = chacha20Block(key, nonce, counter);
    const chunkLength = Math.min(64, input.length - offset);
    for (let index = 0; index < chunkLength; index += 1) {
      output[offset + index] = input[offset + index] ^ block[index];
    }
    counter = (counter + 1) >>> 0;
  }
  return output;
};

const bigintFromLittleEndian = (value: Buffer): bigint => {
  let result = 0n;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    result = (result << 8n) + BigInt(value[index]);
  }
  return result;
};

const bigintToLittleEndian = (value: bigint, length: number): Buffer => {
  const output = Buffer.alloc(length);
  let next = value;
  for (let index = 0; index < length; index += 1) {
    output[index] = Number(next & 0xffn);
    next >>= 8n;
  }
  return output;
};

const poly1305Authenticate = (key: Buffer, message: Buffer): Buffer => {
  if (key.length !== 32) {
    throw new Error(`Poly1305 key must be 32 bytes; got ${key.length}.`);
  }
  const rBytes = Buffer.from(key.subarray(0, 16));
  rBytes[3] &= 15;
  rBytes[7] &= 15;
  rBytes[11] &= 15;
  rBytes[15] &= 15;
  rBytes[4] &= 252;
  rBytes[8] &= 252;
  rBytes[12] &= 252;
  const r = bigintFromLittleEndian(rBytes);
  const s = bigintFromLittleEndian(key.subarray(16, 32));
  const p = (1n << 130n) - 5n;
  let accumulator = 0n;
  for (let offset = 0; offset < message.length; offset += 16) {
    const chunk = message.subarray(offset, Math.min(offset + 16, message.length));
    const n = bigintFromLittleEndian(chunk) + (1n << BigInt(8 * chunk.length));
    accumulator = ((accumulator + n) * r) % p;
  }
  return bigintToLittleEndian((accumulator + s) & ((1n << 128n) - 1n), 16);
};

const pad16 = (value: Buffer): Buffer =>
  value.length % 16 === 0 ? Buffer.alloc(0) : Buffer.alloc(16 - (value.length % 16));

const uint64LittleEndian = (value: number): Buffer => {
  const output = Buffer.alloc(8);
  output.writeUInt32LE(value >>> 0, 0);
  output.writeUInt32LE(Math.floor(value / 0x1_0000_0000), 4);
  return output;
};

const chacha20Poly1305MacData = (aad: Buffer, ciphertext: Buffer): Buffer =>
  Buffer.concat([
    aad,
    pad16(aad),
    ciphertext,
    pad16(ciphertext),
    uint64LittleEndian(aad.length),
    uint64LittleEndian(ciphertext.length),
  ]);

const fallbackEncryptChaCha20Poly1305 = (
  key: Buffer,
  nonce: Buffer,
  plaintext: Buffer,
  aad = Buffer.alloc(0),
): { encrypted: Buffer; tag: Buffer } => {
  const polyKey = chacha20Block(key, nonce, 0).subarray(0, 32);
  const encrypted = chacha20Xor(key, nonce, 1, plaintext);
  const tag = poly1305Authenticate(polyKey, chacha20Poly1305MacData(aad, encrypted));
  return { encrypted, tag };
};

const fallbackDecryptChaCha20Poly1305 = (
  key: Buffer,
  nonce: Buffer,
  encrypted: Buffer,
  tag: Buffer,
  aad = Buffer.alloc(0),
): Buffer => {
  const polyKey = chacha20Block(key, nonce, 0).subarray(0, 32);
  const expectedTag = poly1305Authenticate(polyKey, chacha20Poly1305MacData(aad, encrypted));
  if (tag.length !== 16 || !timingSafeEqual(tag, expectedTag)) {
    throw new Error(`ChaCha20-Poly1305 authentication tag did not verify; expected=${summarizeBuffer(expectedTag)} got=${summarizeBuffer(tag)}.`);
  }
  return chacha20Xor(key, nonce, 1, encrypted);
};

const parseAirPlay2RtpPacket = (packet: Buffer): AirPlay2RtpPacket | null => {
  if (packet.length < 12) {
    return null;
  }
  const version = packet[0] >>> 6;
  if (version !== 2) {
    return null;
  }
  const csrcCount = packet[0] & 0x0f;
  const hasExtension = (packet[0] & 0x10) !== 0;
  const hasPadding = (packet[0] & 0x20) !== 0;
  let headerLength = 12 + csrcCount * 4;
  if (packet.length < headerLength) {
    return null;
  }
  if (hasExtension) {
    if (packet.length < headerLength + 4) {
      return null;
    }
    const extensionLength = packet.readUInt16BE(headerLength + 2) * 4;
    headerLength += 4 + extensionLength;
    if (packet.length < headerLength) {
      return null;
    }
  }

  let payloadEnd = packet.length;
  if (hasPadding) {
    const paddingLength = packet[packet.length - 1];
    if (paddingLength <= 0 || paddingLength > packet.length - headerLength) {
      return null;
    }
    payloadEnd -= paddingLength;
  }

  return {
    version,
    payloadType: packet[1] & 0x7f,
    marker: (packet[1] & 0x80) !== 0,
    sequenceNumber: packet.readUInt16BE(2),
    timestamp: packet.readUInt32BE(4),
    ssrc: packet.readUInt32BE(8),
    headerLength,
    aad: packet.subarray(4, 12),
    payload: packet.subarray(headerLength, payloadEnd),
  };
};

const parseAirPlay2BufferedRtpPacket = (packet: Buffer): AirPlay2RtpPacket | null => {
  if (packet.length < 12 || packet[0] >>> 6 !== 2) {
    return null;
  }
  return {
    version: 2,
    payloadType: 0,
    marker: false,
    sequenceNumber: packet.readUIntBE(1, 3),
    timestamp: packet.readUInt32BE(4),
    ssrc: packet.readUInt32BE(8),
    headerLength: 12,
    aad: packet.subarray(4, 12),
    payload: packet.subarray(12),
  };
};

const summarizeAirPlay2RtpPacket = (packet: AirPlay2RtpPacket): string => {
  const marker = packet.marker ? ' marker=1' : '';
  return `RTP v=${packet.version} pt=${packet.payloadType}${marker} seq=${packet.sequenceNumber} ts=${packet.timestamp} ssrc=${packet.ssrc.toString(16).padStart(8, '0')} header=${packet.headerLength}b payload=${packet.payload.length}b`;
};

const decryptAirPlay2RtpPayload = (packet: AirPlay2RtpPacket, sharedKey: Buffer): Buffer => {
  if (sharedKey.length !== 32) {
    throw new Error(`AirPlay 2 RTP shared key must be 32 bytes; got ${sharedKey.length}.`);
  }
  if (packet.payload.length < airPlay2RtpTrailerBytes) {
    throw new Error(`AirPlay 2 RTP payload missing ${airPlay2RtpTrailerBytes}-byte encryption trailer.`);
  }
  const encryptedEnd = packet.payload.length - airPlay2RtpTrailerBytes;
  const encrypted = packet.payload.subarray(0, encryptedEnd);
  const nonce = Buffer.concat([Buffer.alloc(4), packet.payload.subarray(encryptedEnd, encryptedEnd + 8)]);
  const tag = packet.payload.subarray(encryptedEnd + 8);
  try {
    if (shouldUseAirPlay2NativeCipher()) {
      const decipher = createDecipheriv(airPlay2CipherName, sharedKey, nonce, { authTagLength: 16 });
      decipher.setAAD(packet.aad, { plaintextLength: encrypted.length });
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }
    return fallbackDecryptChaCha20Poly1305(sharedKey, nonce, encrypted, tag, Buffer.from(packet.aad));
  } catch (error) {
    throw new Error(summarizeAirPlay2CryptoError(
      'RTP decrypt',
      error,
      `${summarizeAirPlay2RtpPacket(packet)} nonce=${nonce.toString('hex')} encrypted=${encrypted.length}b tag=${summarizeBuffer(tag)}`,
    ));
  }
};

const resolveAirPlay2PcmFormat = (streamInfo: AirPlay2SetupStreamInfo | null): AirPlay2PcmFormat | null => {
  if (streamInfo?.compressionType !== 1) return null;
  if (streamInfo.audioFormat) {
    return airPlay2PcmFormats.find((format) => (streamInfo.audioFormat! & format.audioFormat) !== 0) ?? null;
  }
  const sampleRate = streamInfo.sampleRate;
  const bitDepth = streamInfo.sampleSize ?? 16;
  const channels = streamInfo.channels ?? 2;
  return airPlay2PcmFormats.find((format) =>
    format.sampleRate === sampleRate && format.bitDepth === bitDepth && format.channels === channels,
  ) ?? null;
};

const resolveAirPlay2AlacFormat = (streamInfo: AirPlay2SetupStreamInfo | null): AirPlay2AlacFormat | null => {
  if (streamInfo?.compressionType !== 2) return null;
  const format = streamInfo.audioFormat
    ? airPlay2AlacFormats.find((candidate) => (streamInfo.audioFormat! & candidate.audioFormat) !== 0)
    : airPlay2AlacFormats.find((candidate) =>
      candidate.sampleRate === streamInfo.sampleRate
      && candidate.bitDepth === (streamInfo.sampleSize ?? 16)
      && candidate.channels === (streamInfo.channels ?? 2),
    );
  if (!format) {
    return null;
  }
  return {
    ...format,
    framesPerPacket: streamInfo.framesPerPacket && streamInfo.framesPerPacket > 0 ? streamInfo.framesPerPacket : 352,
  };
};

const convertAirPlay2LpcmToF32le = (input: Buffer, format: AirPlay2PcmFormat): Buffer => {
  const sampleBytes = format.bitDepth / 8;
  const sampleCount = Math.floor(input.length / sampleBytes);
  const output = Buffer.allocUnsafe(sampleCount * 4);
  for (let index = 0; index < sampleCount; index += 1) {
    const offset = index * sampleBytes;
    let sample: number;
    if (format.bitDepth === 16) {
      sample = input.readInt16BE(offset) / 32768;
    } else {
      let value = (input[offset] << 16) | (input[offset + 1] << 8) | input[offset + 2];
      if ((value & 0x80_0000) !== 0) {
        value -= 0x100_0000;
      }
      sample = value / 8_388_608;
    }
    output.writeFloatLE(Math.max(-1, Math.min(1, sample)), index * 4);
  }
  return output;
};

const airPlay2IdentityFileName = 'airplay2-identity.json';

type StoredAirPlay2Identity = {
  version?: number;
  publicKey?: string;
  privateKey?: string;
};

const exportAirPlay2Ed25519PublicKey = (publicKey: KeyObject): Buffer => {
  const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
  return Buffer.from(publicKeyDer).subarray(ed25519SpkiPrefix.length);
};

const createAirPlay2Identity = (): AirPlay2Identity => {
  const keyPair = generateKeyPairSync('ed25519');
  return {
    publicKey: exportAirPlay2Ed25519PublicKey(keyPair.publicKey),
    privateKey: keyPair.privateKey,
  };
};

const loadStoredAirPlay2Identity = (filePath: string): AirPlay2Identity | null => {
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as StoredAirPlay2Identity;
    if (!parsed.privateKey) {
      return null;
    }
    const privateKey = createPrivateKey({
      key: Buffer.from(parsed.privateKey, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
    const publicKey = exportAirPlay2Ed25519PublicKey(createPublicKey(privateKey));
    if (parsed.publicKey && parsed.publicKey !== publicKey.toString('hex')) {
      return null;
    }
    return { publicKey, privateKey };
  } catch {
    return null;
  }
};

const saveAirPlay2Identity = (filePath: string, identity: AirPlay2Identity): void => {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    const privateKey = identity.privateKey.export({ format: 'der', type: 'pkcs8' });
    const payload: StoredAirPlay2Identity = {
      version: 1,
      publicKey: identity.publicKey.toString('hex'),
      privateKey: Buffer.from(privateKey).toString('base64'),
    };
    writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  } catch {
    // A stable AirPlay identity is best-effort; pairing can still run with an in-memory key.
  }
};

const resolveAirPlay2IdentityPath = (): string | null => {
  try {
    const userDataPath = app?.getPath?.('userData');
    return userDataPath ? join(userDataPath, airPlay2IdentityFileName) : null;
  } catch {
    return null;
  }
};

const loadOrCreateAirPlay2Identity = (): AirPlay2Identity => {
  const filePath = resolveAirPlay2IdentityPath();
  const stored = filePath ? loadStoredAirPlay2Identity(filePath) : null;
  if (stored) {
    return stored;
  }
  const identity = createAirPlay2Identity();
  if (filePath) {
    saveAirPlay2Identity(filePath, identity);
  }
  return identity;
};

const exportX25519PublicKey = (publicKey: KeyObject): Buffer => {
  const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' });
  return Buffer.from(publicKeyDer).subarray(x25519SpkiPrefix.length);
};

const createX25519PublicKey = (rawPublicKey: Buffer): KeyObject => {
  if (rawPublicKey.length !== 32) {
    throw new Error(`Invalid X25519 public key length: ${rawPublicKey.length}.`);
  }
  return createPublicKey({
    key: Buffer.concat([x25519SpkiPrefix, rawPublicKey]),
    format: 'der',
    type: 'spki',
  });
};

const createEd25519PublicKey = (rawPublicKey: Buffer): KeyObject => {
  if (rawPublicKey.length !== 32) {
    throw new Error(`Invalid Ed25519 public key length: ${rawPublicKey.length}.`);
  }
  return createPublicKey({
    key: Buffer.concat([ed25519SpkiPrefix, rawPublicKey]),
    format: 'der',
    type: 'spki',
  });
};

const createAirPlay2Nonce = (label: string): Buffer => {
  const value = Buffer.from(label, 'utf8');
  if (value.length !== 8) {
    throw new Error(`AirPlay 2 nonce labels must be 8 bytes: ${label}`);
  }
  return Buffer.concat([Buffer.alloc(4), value]);
};

const createAirPlay2CounterNonce = (counter: number): Buffer => {
  const nonce = Buffer.alloc(12);
  nonce.writeUInt32LE(counter >>> 0, 4);
  nonce.writeUInt32LE(Math.floor(counter / 0x1_0000_0000), 8);
  return nonce;
};

const deriveAirPlay2Key = (inputKey: Buffer, salt: string, info: string): Buffer =>
  Buffer.from(hkdfSync('sha512', inputKey, Buffer.from(salt, 'utf8'), Buffer.from(info, 'utf8'), 32));

const createAirPlay2EncryptedControlState = (
  encryptionKey: Buffer,
  keyLabel: string,
  swapped = false,
): AirPlay2EncryptedControlState => ({
  controlReadKey: deriveAirPlay2Key(
    encryptionKey,
    airPlay2ControlSalt,
    swapped ? 'Control-Write-Encryption-Key' : 'Control-Read-Encryption-Key',
  ),
  controlWriteKey: deriveAirPlay2Key(
    encryptionKey,
    airPlay2ControlSalt,
    swapped ? 'Control-Read-Encryption-Key' : 'Control-Write-Encryption-Key',
  ),
  keyLabel,
});

const uniqueAirPlay2EncryptedControlStates = (
  states: AirPlay2EncryptedControlState[],
): AirPlay2EncryptedControlState[] => {
  const unique: AirPlay2EncryptedControlState[] = [];
  for (const state of states) {
    if (!unique.some((item) =>
      item.controlReadKey.equals(state.controlReadKey) && item.controlWriteKey.equals(state.controlWriteKey)
    )) {
      unique.push(state);
    }
  }
  return unique;
};

const createAirPlay2TransientControlStates = (session: ReturnType<typeof calculateAirPlay2SrpSession>): AirPlay2EncryptedControlState[] => {
  const setupKeyFromSessionKey = deriveAirPlay2Key(
    session.sessionKey,
    airPlay2PairSetupEncryptSalt,
    airPlay2PairSetupEncryptInfo,
  );
  const setupKeyFromSharedSecret = deriveAirPlay2Key(
    session.sessionSecret,
    airPlay2PairSetupEncryptSalt,
    airPlay2PairSetupEncryptInfo,
  );
  const keyMaterials: Array<{ label: string; value: Buffer }> = [
    { label: 'srp-session-key', value: session.sessionKey },
    { label: 'srp-shared-secret-padded', value: session.sessionSecret },
    { label: 'srp-shared-secret-minimal', value: session.sessionSecretMinimal },
    { label: 'pair-setup-encrypt-key/session-key', value: setupKeyFromSessionKey },
    { label: 'pair-setup-encrypt-key/shared-secret', value: setupKeyFromSharedSecret },
  ];

  return uniqueAirPlay2EncryptedControlStates(keyMaterials.flatMap(({ label, value }) => [
    createAirPlay2EncryptedControlState(value, label),
    createAirPlay2EncryptedControlState(value, `${label}/swapped`, true),
  ]));
};

const createAirPlay2PairVerifyControlStates = (
  state: AirPlay2PairVerifyState | null,
): AirPlay2EncryptedControlState[] => {
  if (!state) {
    return [];
  }
  return uniqueAirPlay2EncryptedControlStates([
    {
      controlReadKey: state.controlReadKey,
      controlWriteKey: state.controlWriteKey,
      keyLabel: 'pair-verify-m1-shared-secret',
    },
    {
      controlReadKey: state.controlWriteKey,
      controlWriteKey: state.controlReadKey,
      keyLabel: 'pair-verify-m1-shared-secret/swapped',
    },
  ]);
};

const hashAirPlay2Sha512 = (...buffers: Buffer[]): Buffer => {
  const hash = createHash('sha512');
  for (const buffer of buffers) {
    hash.update(buffer);
  }
  return hash.digest();
};

const airPlay2BigintFromBuffer = (value: Buffer): bigint => BigInt(`0x${value.toString('hex') || '0'}`);

const airPlay2BigintToBuffer = (value: bigint, byteLength = airPlay2SrpModulusBytes): Buffer => {
  const hex = value.toString(16).padStart(byteLength * 2, '0');
  return Buffer.from(hex.slice(-byteLength * 2), 'hex');
};

const airPlay2BigintToMinimalBuffer = (value: bigint): Buffer => {
  const hex = value.toString(16);
  return Buffer.from(hex.length % 2 === 0 ? hex : `0${hex}`, 'hex');
};

const airPlay2SrpHashBigint = (...buffers: Buffer[]): bigint => airPlay2BigintFromBuffer(hashAirPlay2Sha512(...buffers));

const airPlay2SrpMultiplier = airPlay2SrpHashBigint(
  airPlay2BigintToBuffer(airPlay2SrpModulus),
  airPlay2BigintToBuffer(airPlay2SrpGenerator),
);

const airPlay2ModPow = (base: bigint, exponent: bigint, modulus: bigint): bigint => {
  let result = 1n;
  let nextBase = ((base % modulus) + modulus) % modulus;
  let nextExponent = exponent;
  while (nextExponent > 0n) {
    if (nextExponent & 1n) {
      result = (result * nextBase) % modulus;
    }
    nextBase = (nextBase * nextBase) % modulus;
    nextExponent >>= 1n;
  }
  return result;
};

const createAirPlay2SrpVerifier = (salt: Buffer): bigint => {
  const userHash = hashAirPlay2Sha512(Buffer.from(`${airPlay2PairSetupUsername}:${airPlay2PairSetupPassword}`, 'utf8'));
  const x = airPlay2SrpHashBigint(salt, userHash);
  return airPlay2ModPow(airPlay2SrpGenerator, x, airPlay2SrpModulus);
};

const createAirPlay2SrpPrivateKey = (): bigint => {
  let value = 0n;
  while (value === 0n) {
    value = airPlay2BigintFromBuffer(randomBytes(32));
  }
  return value;
};

const createAirPlay2SrpServerPublicKey = (verifier: bigint, privateKey: bigint): Buffer => {
  const publicKey = (
    (airPlay2SrpMultiplier * verifier) +
    airPlay2ModPow(airPlay2SrpGenerator, privateKey, airPlay2SrpModulus)
  ) % airPlay2SrpModulus;
  return airPlay2BigintToBuffer(publicKey);
};

const calculateAirPlay2SrpSession = (
  salt: Buffer,
  clientPublicKey: Buffer,
  serverPublicKey: Buffer,
  privateKey: bigint,
  verifier: bigint,
): { sessionKey: Buffer; sessionSecret: Buffer; sessionSecretMinimal: Buffer; clientProof: Buffer; serverProof: Buffer } => {
  const clientPublic = airPlay2BigintFromBuffer(clientPublicKey);
  if (clientPublic % airPlay2SrpModulus === 0n) {
    throw new Error('Pair-Setup M3 client SRP public key is invalid.');
  }
  const scramblingParameter = airPlay2SrpHashBigint(clientPublicKey, serverPublicKey);
  const sessionSecret = airPlay2ModPow(
    (clientPublic * airPlay2ModPow(verifier, scramblingParameter, airPlay2SrpModulus)) % airPlay2SrpModulus,
    privateKey,
    airPlay2SrpModulus,
  );
  const sessionSecretBuffer = airPlay2BigintToBuffer(sessionSecret);
  const sessionKey = hashAirPlay2Sha512(sessionSecretBuffer);
  const modulusHash = hashAirPlay2Sha512(airPlay2BigintToBuffer(airPlay2SrpModulus));
  const generatorHash = hashAirPlay2Sha512(airPlay2BigintToMinimalBuffer(airPlay2SrpGenerator));
  const groupHash = Buffer.from(modulusHash.map((value, index) => value ^ generatorHash[index]));
  const usernameHash = hashAirPlay2Sha512(Buffer.from(airPlay2PairSetupUsername, 'utf8'));
  const clientProof = hashAirPlay2Sha512(groupHash, usernameHash, salt, clientPublicKey, serverPublicKey, sessionKey);
  const serverProof = hashAirPlay2Sha512(clientPublicKey, clientProof, sessionKey);
  return {
    sessionKey,
    sessionSecret: sessionSecretBuffer,
    sessionSecretMinimal: airPlay2BigintToMinimalBuffer(sessionSecret),
    clientProof,
    serverProof,
  };
};

const encodeAirPlay2Tlv = (fields: AirPlay2TlvField[]): Buffer => {
  const chunks: Buffer[] = [];
  for (const field of fields) {
    if (field.value.length === 0) {
      chunks.push(Buffer.from([field.type & 0xff, 0]));
      continue;
    }
    let offset = 0;
    while (offset < field.value.length) {
      const chunk = field.value.subarray(offset, offset + 255);
      chunks.push(Buffer.from([field.type & 0xff, chunk.length]));
      chunks.push(chunk);
      offset += chunk.length;
    }
  }
  return Buffer.concat(chunks);
};

const parseAirPlay2Tlv = (body: Buffer): { fields: Map<number, Buffer[]>; error: null } | { fields: null; error: string } => {
  const fields = new Map<number, Buffer[]>();
  let offset = 0;
  while (offset + 2 <= body.length) {
    const type = body[offset];
    const length = body[offset + 1];
    offset += 2;
    if (offset + length > body.length) {
      return { fields: null, error: `malformed TLV at ${offset - 2}; body=${summarizeBuffer(body)}` };
    }
    const chunk = body.subarray(offset, offset + length);
    offset += length;
    const list = fields.get(type) ?? [];
    list.push(chunk);
    fields.set(type, list);
  }

  if (offset !== body.length) {
    return { fields: null, error: `malformed TLV trailing byte; body=${summarizeBuffer(body)}` };
  }

  return { fields, error: null };
};

const getAirPlay2TlvValue = (fields: Map<number, Buffer[]>, type: number): Buffer | null => {
  const chunks = fields.get(type);
  return chunks ? Buffer.concat(chunks) : null;
};

const getAirPlay2TlvByte = (fields: Map<number, Buffer[]>, type: number): number | null => {
  const value = getAirPlay2TlvValue(fields, type);
  return value && value.length > 0 ? value.readUInt8(0) : null;
};

const airPlay2TlvNumber = (value: Buffer | null): number =>
  value ? value.reduce((next, byte) => (next * 256) + byte, 0) : 0;

const encryptAirPlay2Payload = (key: Buffer, nonceLabel: string, body: Buffer): Buffer => {
  const nonce = createAirPlay2Nonce(nonceLabel);
  try {
    if (shouldUseAirPlay2NativeCipher()) {
      const cipher = createCipheriv(airPlay2CipherName, key, nonce, { authTagLength: 16 });
      const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
      return Buffer.concat([encrypted, cipher.getAuthTag()]);
    }
    const { encrypted, tag } = fallbackEncryptChaCha20Poly1305(key, nonce, body);
    return Buffer.concat([encrypted, tag]);
  } catch (error) {
    throw new Error(summarizeAirPlay2CryptoError(
      `payload encrypt ${nonceLabel}`,
      error,
      `key=${key.length}b nonce=${nonce.toString('hex')} body=${summarizeBuffer(body)}`,
    ));
  }
};

const decryptAirPlay2Payload = (key: Buffer, nonceLabel: string, body: Buffer): Buffer => {
  if (body.length < 16) {
    throw new Error('AirPlay 2 encrypted payload is missing its authentication tag.');
  }
  const encrypted = body.subarray(0, -16);
  const tag = body.subarray(-16);
  const nonce = createAirPlay2Nonce(nonceLabel);
  try {
    if (shouldUseAirPlay2NativeCipher()) {
      const decipher = createDecipheriv(airPlay2CipherName, key, nonce, { authTagLength: 16 });
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }
    return fallbackDecryptChaCha20Poly1305(key, nonce, encrypted, tag);
  } catch (error) {
    throw new Error(summarizeAirPlay2CryptoError(
      `payload decrypt ${nonceLabel}`,
      error,
      `key=${key.length}b nonce=${nonce.toString('hex')} encrypted=${encrypted.length}b tag=${summarizeBuffer(tag)} body=${summarizeBuffer(body)}`,
    ));
  }
};

const encryptAirPlay2ControlFrame = (key: Buffer, counter: number, payload: Buffer): Buffer => {
  const nonce = createAirPlay2CounterNonce(counter);
  try {
    const header = Buffer.alloc(2);
    header.writeUInt16LE(payload.length, 0);
    const { encrypted, tag } = shouldUseAirPlay2NativeCipher()
      ? (() => {
        const cipher = createCipheriv(airPlay2CipherName, key, nonce, { authTagLength: 16 });
        cipher.setAAD(header, { plaintextLength: payload.length });
        const encryptedPayload = Buffer.concat([cipher.update(payload), cipher.final()]);
        return { encrypted: encryptedPayload, tag: cipher.getAuthTag() };
      })()
      : fallbackEncryptChaCha20Poly1305(key, nonce, payload, header);
    const frame = Buffer.alloc(2 + encrypted.length + 16);
    header.copy(frame, 0);
    encrypted.copy(frame, 2);
    tag.copy(frame, 2 + encrypted.length);
    return frame;
  } catch (error) {
    throw new Error(summarizeAirPlay2CryptoError(
      'control frame encrypt',
      error,
      `key=${key.length}b counter=${counter} nonce=${nonce.toString('hex')} payload=${summarizeBuffer(payload)}`,
    ));
  }
};

const decryptAirPlay2ControlFrame = (key: Buffer, counter: number, frame: Buffer): Buffer => {
  if (frame.length < 18) {
    throw new Error(`AirPlay 2 encrypted control frame is too short; ${summarizeAirPlay2EncryptedControlFrame(frame)}.`);
  }
  const length = frame.readUInt16LE(0);
  if (frame.length !== 2 + length + 16) {
    throw new Error(`AirPlay 2 encrypted control frame length mismatch; ${summarizeAirPlay2EncryptedControlFrame(frame)}.`);
  }
  const nonce = createAirPlay2CounterNonce(counter);
  try {
    const header = frame.subarray(0, 2);
    const encrypted = frame.subarray(2, 2 + length);
    const tag = frame.subarray(2 + length);
    if (shouldUseAirPlay2NativeCipher()) {
      const decipher = createDecipheriv(airPlay2CipherName, key, nonce, { authTagLength: 16 });
      decipher.setAAD(header, { plaintextLength: encrypted.length });
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }
    const encryptedCopy = Buffer.alloc(encrypted.length);
    const tagCopy = Buffer.alloc(tag.length);
    const headerCopy = Buffer.alloc(header.length);
    encrypted.copy(encryptedCopy);
    tag.copy(tagCopy);
    header.copy(headerCopy);
    return fallbackDecryptChaCha20Poly1305(key, nonce, encryptedCopy, tagCopy, headerCopy);
  } catch (error) {
    throw new Error(summarizeAirPlay2CryptoError(
      'control frame decrypt',
      error,
      `key=${key.length}b counter=${counter} nonce=${nonce.toString('hex')} ${summarizeAirPlay2EncryptedControlFrame(frame)}`,
    ));
  }
};

const summarizeAirPlay2Tlv = (body: Buffer): string | null => {
  if (body.length === 0) {
    return 'empty body';
  }

  const parsed = parseAirPlay2Tlv(body);
  if (!parsed.fields) {
    return parsed.error;
  }

  const parts = [...parsed.fields.entries()]
    .sort(([left], [right]) => left - right)
    .map(([type, chunks]) => {
      const value = Buffer.concat(chunks);
      const name = airPlay2TlvNames[type] ?? `type${type}`;
      if ((type === 0 || type === 6 || type === 7 || type === 11 || type === 13 || type === 19) && value.length > 0) {
        return `${name}=${value.readUInt8(0)}`;
      }
      if (type === 1 && value.length > 0) {
        const text = value.toString('utf8').replace(/[^\w:.-]/gu, '?').slice(0, 48);
        return `${name}=${text}`;
      }
      return `${name}=${summarizeBuffer(value)}`;
    });

  return parts.length > 0 ? parts.join(' ') : `unparsed body=${summarizeBuffer(body)}`;
};

const parseAirPlay2TextRequest = (
  buffer: Buffer,
  remoteAddress: string | null = null,
  localAddress: string | null = null,
): { request: AirPlay2ProbeRequest; consumed: number } | null => {
  const headerEnd = buffer.indexOf('\r\n\r\n');
  if (headerEnd < 0) {
    if (buffer.length > airPlay2ProbeHeaderLimitBytes) {
      throw new Error(`AirPlay 2 request headers exceed ${airPlay2ProbeHeaderLimitBytes} bytes.`);
    }
    return null;
  }
  if (headerEnd > airPlay2ProbeHeaderLimitBytes) {
    throw new Error(`AirPlay 2 request headers exceed ${airPlay2ProbeHeaderLimitBytes} bytes.`);
  }

  const headerText = buffer.subarray(0, headerEnd).toString('utf8');
  const [requestLine, ...headerLines] = headerText.split('\r\n');
  const match = /^([A-Z_]+)\s+(\S+)\s+(\S+)$/u.exec(requestLine ?? '');
  if (!match) {
    throw new Error(`Invalid AirPlay 2 request line: ${requestLine ?? ''}`);
  }

  const headers: Record<string, string> = {};
  for (const line of headerLines) {
    const separator = line.indexOf(':');
    if (separator <= 0) {
      continue;
    }
    headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  }

  const contentLength = Number(headers['content-length'] ?? 0);
  const contentType = headers['content-type']?.toLowerCase() ?? '';
  const bodyLimit = contentType.startsWith('image/') ? airPlay2ArtworkBodyLimitBytes : airPlay2ProbeBodyLimitBytes;
  if (!Number.isInteger(contentLength) || contentLength < 0 || contentLength > bodyLimit) {
    throw new Error(`Invalid AirPlay 2 Content-Length: ${headers['content-length'] ?? 'missing'}.`);
  }

  const bodyStart = headerEnd + 4;
  const totalLength = bodyStart + contentLength;
  if (buffer.length < totalLength) {
    return null;
  }

  return {
    request: {
      method: match[1],
      path: match[2].split('?')[0] ?? '/',
      protocol: match[3],
      headers,
      body: buffer.subarray(bodyStart, totalLength),
      remoteAddress,
      localAddress,
    },
    consumed: totalLength,
  };
};

const airPlay2ReasonPhrase = (statusCode: number): string => {
  if (statusCode === 200) return 'OK';
  if (statusCode === 400) return 'Bad Request';
  if (statusCode === 501) return 'Not Implemented';
  return 'Internal Server Error';
};

const serializeAirPlay2ProbeResponse = (
  request: AirPlay2ProbeRequest,
  response: AirPlay2ProbeResponse,
  sourceVersion: string,
): Buffer => {
  const protocol = request.protocol.startsWith('RTSP/') ? 'RTSP/1.0' : 'HTTP/1.1';
  const body = typeof response.body === 'string'
    ? Buffer.from(response.body, 'utf8')
    : response.body ?? Buffer.alloc(0);
  const cseq = request.headers.cseq;
  const headers = {
    Server: `AirTunes/${sourceVersion}`,
    ...(cseq ? { CSeq: cseq } : {}),
    'Content-Length': body.length,
    ...(response.headers ?? {}),
  };
  const headerText = [
    `${protocol} ${response.statusCode} ${airPlay2ReasonPhrase(response.statusCode)}`,
    ...Object.entries(headers).map(([key, value]) => `${key}: ${value}`),
    '',
    '',
  ].join('\r\n');
  return Buffer.concat([Buffer.from(headerText, 'utf8'), body]);
};

const airPlay2BplistIntByteLength = (value: number | bigint): 1 | 2 | 4 | 8 => {
  if (typeof value === 'bigint') {
    if (value >= 0n && value <= 0x7fn) return 1;
    if (value >= 0n && value <= 0x7fffn) return 2;
    if (value >= 0n && value <= 0x7fff_ffffn) return 4;
    return 8;
  }
  if (value >= 0 && value <= 0x7f) return 1;
  if (value >= 0 && value <= 0x7fff) return 2;
  if (value >= 0 && value <= 0x7fff_ffff) return 4;
  return 8;
};

const encryptAirPlay2ControlFrames = (
  key: Buffer,
  firstCounter: number,
  payload: Buffer,
): { data: Buffer; frameCount: number } => {
  const frames: Buffer[] = [];
  for (let offset = 0; offset < payload.length; offset += airPlay2EncryptedFrameLimitBytes) {
    frames.push(encryptAirPlay2ControlFrame(
      key,
      firstCounter + frames.length,
      payload.subarray(offset, offset + airPlay2EncryptedFrameLimitBytes),
    ));
  }
  if (frames.length === 0) frames.push(encryptAirPlay2ControlFrame(key, firstCounter, Buffer.alloc(0)));
  return { data: Buffer.concat(frames), frameCount: frames.length };
};

const writeAirPlay2BplistUint = (value: number | bigint, byteLength: number): Buffer => {
  const output = Buffer.alloc(byteLength);
  let next = BigInt(value);
  for (let index = byteLength - 1; index >= 0; index -= 1) {
    output[index] = Number(next & 0xffn);
    next >>= 8n;
  }
  return output;
};

const encodeAirPlay2BplistInt = (value: number | bigint): Buffer => {
  const byteLength = airPlay2BplistIntByteLength(value);
  const exponent = Math.log2(byteLength);
  return Buffer.concat([Buffer.from([0x10 | exponent]), writeAirPlay2BplistUint(value, byteLength)]);
};

const encodeAirPlay2BplistLength = (type: number, length: number): Buffer => {
  if (length < 15) {
    return Buffer.from([type | length]);
  }
  return Buffer.concat([Buffer.from([type | 0x0f]), encodeAirPlay2BplistInt(length)]);
};

const collectAirPlay2BplistObjects = (value: AirPlay2BplistValue, objects: AirPlay2BplistObjectRecord[]): number => {
  const index = objects.length;
  const record: AirPlay2BplistObjectRecord = { value };
  objects.push(record);
  if (Array.isArray(value)) {
    record.arrayRefs = value.map((item) => collectAirPlay2BplistObjects(item, objects));
  } else if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
    const entries = Object.entries(value);
    record.dictKeyRefs = entries.map(([key]) => collectAirPlay2BplistObjects(key, objects));
    record.dictValueRefs = entries.map(([, item]) => collectAirPlay2BplistObjects(item, objects));
  }
  return index;
};

const encodeAirPlay2BplistRef = (index: number, refSize: number): Buffer => writeAirPlay2BplistUint(index, refSize);

const encodeAirPlay2BplistObject = (
  record: AirPlay2BplistObjectRecord,
  refSize: number,
): Buffer => {
  const { value } = record;
  if (value === null) return Buffer.from([0x00]);
  if (typeof value === 'boolean') return Buffer.from([value ? 0x09 : 0x08]);
  if (typeof value === 'number' || typeof value === 'bigint') return encodeAirPlay2BplistInt(value);
  if (typeof value === 'string') {
    const ascii = [...value].every((char) => char.charCodeAt(0) <= 0x7f);
    if (ascii) {
      const content = Buffer.from(value, 'ascii');
      return Buffer.concat([encodeAirPlay2BplistLength(0x50, content.length), content]);
    }
    const content = Buffer.from(value, 'utf16le');
    for (let index = 0; index < content.length; index += 2) {
      const next = content[index];
      content[index] = content[index + 1];
      content[index + 1] = next;
    }
    return Buffer.concat([encodeAirPlay2BplistLength(0x60, value.length), content]);
  }
  if (Buffer.isBuffer(value)) {
    return Buffer.concat([encodeAirPlay2BplistLength(0x40, value.length), value]);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([
      encodeAirPlay2BplistLength(0xa0, value.length),
      ...(record.arrayRefs ?? []).map((childRef) => encodeAirPlay2BplistRef(childRef, refSize)),
    ]);
  }

  const entries = Object.entries(value);
  return Buffer.concat([
    encodeAirPlay2BplistLength(0xd0, entries.length),
    ...(record.dictKeyRefs ?? []).map((childRef) => encodeAirPlay2BplistRef(childRef, refSize)),
    ...(record.dictValueRefs ?? []).map((childRef) => encodeAirPlay2BplistRef(childRef, refSize)),
  ]);
};

const encodeAirPlay2Bplist = (value: AirPlay2BplistValue): Buffer => {
  const objects: AirPlay2BplistObjectRecord[] = [];
  collectAirPlay2BplistObjects(value, objects);
  const refSize = objects.length <= 0xff ? 1 : objects.length <= 0xffff ? 2 : 4;
  const encodedObjects = objects.map((object) => encodeAirPlay2BplistObject(object, refSize));
  const offsets: number[] = [];
  let offset = 8;
  for (const object of encodedObjects) {
    offsets.push(offset);
    offset += object.length;
  }
  const offsetTableOffset = offset;
  const offsetSize = offset <= 0xff ? 1 : offset <= 0xffff ? 2 : offset <= 0xffff_ffff ? 4 : 8;
  const offsetTable = Buffer.concat(offsets.map((item) => writeAirPlay2BplistUint(item, offsetSize)));
  const trailer = Buffer.concat([
    Buffer.alloc(6),
    Buffer.from([offsetSize, refSize]),
    writeAirPlay2BplistUint(objects.length, 8),
    writeAirPlay2BplistUint(0, 8),
    writeAirPlay2BplistUint(offsetTableOffset, 8),
  ]);
  return Buffer.concat([Buffer.from('bplist00', 'ascii'), ...encodedObjects, offsetTable, trailer]);
};

const readAirPlay2BplistBigUint = (body: Buffer, offset: number, byteLength: number): bigint | null => {
  if (offset < 0 || byteLength <= 0 || offset + byteLength > body.length) {
    return null;
  }
  let value = 0n;
  for (let index = offset; index < offset + byteLength; index += 1) {
    value = (value << 8n) | BigInt(body[index]);
  }
  return value;
};

const readAirPlay2BplistUintNumber = (body: Buffer, offset: number, byteLength: number): number | null => {
  const value = readAirPlay2BplistBigUint(body, offset, byteLength);
  if (value === null || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  return Number(value);
};

const readAirPlay2BplistIntValue = (
  body: Buffer,
  offset: number,
  byteLength: number,
): number | bigint | null => {
  const unsigned = readAirPlay2BplistBigUint(body, offset, byteLength);
  if (unsigned === null) return null;
  const bits = BigInt(byteLength * 8);
  const signBit = 1n << (bits - 1n);
  const signed = (unsigned & signBit) !== 0n ? unsigned - (1n << bits) : unsigned;
  return signed <= BigInt(Number.MAX_SAFE_INTEGER) && signed >= BigInt(Number.MIN_SAFE_INTEGER)
    ? Number(signed)
    : signed;
};

const resolveAirPlay2AacFormat = (streamInfo: AirPlay2SetupStreamInfo | null): AirPlay2AacFormat | null => {
  if (streamInfo?.compressionType !== 4) return null;
  if (streamInfo.audioFormat) {
    return airPlay2AacFormats.find((candidate) => (streamInfo.audioFormat! & candidate.audioFormat) !== 0) ?? null;
  }
  return airPlay2AacFormats.find((candidate) =>
    candidate.sampleRate === streamInfo.sampleRate && candidate.channels === (streamInfo.channels ?? 2),
  ) ?? null;
};

const readAirPlay2BplistLength = (
  body: Buffer,
  objectOffset: number,
  info: number,
): { length: number; cursor: number } | null => {
  if (info < 0x0f) {
    return { length: info, cursor: objectOffset + 1 };
  }
  const markerOffset = objectOffset + 1;
  const marker = body[markerOffset];
  if ((marker & 0xf0) !== 0x10) {
    return null;
  }
  const byteLength = 1 << (marker & 0x0f);
  const length = readAirPlay2BplistUintNumber(body, markerOffset + 1, byteLength);
  if (length === null) {
    return null;
  }
  return { length, cursor: markerOffset + 1 + byteLength };
};

const decodeAirPlay2Bplist = (body: Buffer): { value: AirPlay2BplistValue; error: null } | { value: null; error: string } => {
  if (body.length < 40 || body.subarray(0, 8).toString('ascii') !== 'bplist00') {
    return { value: null, error: 'not a binary plist' };
  }
  const trailerOffset = body.length - 32;
  const offsetSize = body[trailerOffset + 6];
  const refSize = body[trailerOffset + 7];
  const objectCount = readAirPlay2BplistUintNumber(body, trailerOffset + 8, 8);
  const topObject = readAirPlay2BplistUintNumber(body, trailerOffset + 16, 8);
  const offsetTableOffset = readAirPlay2BplistUintNumber(body, trailerOffset + 24, 8);
  if (
    !offsetSize ||
    !refSize ||
    objectCount === null ||
    topObject === null ||
    offsetTableOffset === null ||
    objectCount <= 0 ||
    topObject >= objectCount ||
    offsetTableOffset >= trailerOffset
  ) {
    return { value: null, error: 'invalid binary plist trailer' };
  }

  const offsets: number[] = [];
  for (let index = 0; index < objectCount; index += 1) {
    const offset = readAirPlay2BplistUintNumber(body, offsetTableOffset + index * offsetSize, offsetSize);
    if (offset === null || offset < 8 || offset >= trailerOffset) {
      return { value: null, error: `invalid binary plist object offset ${index}` };
    }
    offsets.push(offset);
  }

  const cache = new Map<number, AirPlay2BplistValue>();
  let parseError: string | null = null;
  const markParseError = (ref: number, reason: string): void => {
    if (parseError) {
      return;
    }
    const objectOffset = offsets[ref];
    const marker = body[objectOffset];
    parseError = [
      reason,
      `ref=${ref}`,
      `offset=${objectOffset}`,
      `marker=0x${marker.toString(16).padStart(2, '0')}`,
      `type=0x${(marker & 0xf0).toString(16).padStart(2, '0')}`,
      `info=0x${(marker & 0x0f).toString(16)}`,
    ].join(' ');
  };
  const parseRef = (ref: number, depth = 0): AirPlay2BplistValue | undefined => {
    if (ref < 0 || ref >= offsets.length || depth > 64) {
      parseError ??= `invalid binary plist reference ref=${ref} depth=${depth}`;
      return undefined;
    }
    const cached = cache.get(ref);
    if (cached !== undefined) {
      return cached;
    }

    const objectOffset = offsets[ref];
    const marker = body[objectOffset];
    const type = marker & 0xf0;
    const info = marker & 0x0f;
    let value: AirPlay2BplistValue | undefined;

    if (type === 0x00) {
      if (info === 0x00) value = null;
      else if (info === 0x08) value = false;
      else if (info === 0x09) value = true;
    } else if (type === 0x10) {
      const byteLength = 1 << info;
      value = readAirPlay2BplistIntValue(body, objectOffset + 1, byteLength) ?? undefined;
    } else if (type === 0x20) {
      const byteLength = 1 << info;
      if (byteLength === 4 && objectOffset + 5 <= body.length) value = body.readFloatBE(objectOffset + 1);
      if (byteLength === 8 && objectOffset + 9 <= body.length) value = body.readDoubleBE(objectOffset + 1);
    } else if (type === 0x30) {
      if (info === 0x03 && objectOffset + 9 <= body.length) value = body.readDoubleBE(objectOffset + 1);
    } else if (type === 0x40) {
      const lengthInfo = readAirPlay2BplistLength(body, objectOffset, info);
      if (lengthInfo && lengthInfo.cursor + lengthInfo.length <= trailerOffset) {
        value = body.subarray(lengthInfo.cursor, lengthInfo.cursor + lengthInfo.length);
      }
    } else if (type === 0x50) {
      const lengthInfo = readAirPlay2BplistLength(body, objectOffset, info);
      if (lengthInfo && lengthInfo.cursor + lengthInfo.length <= trailerOffset) {
        value = body.toString('ascii', lengthInfo.cursor, lengthInfo.cursor + lengthInfo.length);
      }
    } else if (type === 0x60) {
      const lengthInfo = readAirPlay2BplistLength(body, objectOffset, info);
      const byteLength = lengthInfo ? lengthInfo.length * 2 : 0;
      if (lengthInfo && lengthInfo.cursor + byteLength <= trailerOffset) {
        const chars: string[] = [];
        for (let cursor = lengthInfo.cursor; cursor < lengthInfo.cursor + byteLength; cursor += 2) {
          chars.push(String.fromCharCode(body.readUInt16BE(cursor)));
        }
        value = chars.join('');
      }
    } else if (type === 0x80) {
      value = readAirPlay2BplistUintNumber(body, objectOffset + 1, info + 1) ?? undefined;
    } else if (type === 0xa0) {
      const lengthInfo = readAirPlay2BplistLength(body, objectOffset, info);
      if (lengthInfo && lengthInfo.cursor + lengthInfo.length * refSize <= trailerOffset) {
        const array: AirPlay2BplistValue[] = [];
        cache.set(ref, array);
        for (let index = 0; index < lengthInfo.length; index += 1) {
          const childRef = readAirPlay2BplistUintNumber(body, lengthInfo.cursor + index * refSize, refSize);
          const child = childRef === null ? undefined : parseRef(childRef, depth + 1);
          if (child === undefined) {
            return undefined;
          }
          array.push(child);
        }
        value = array;
      }
    } else if (type === 0xc0) {
      const lengthInfo = readAirPlay2BplistLength(body, objectOffset, info);
      if (lengthInfo && lengthInfo.cursor + lengthInfo.length * refSize <= trailerOffset) {
        const setItems: AirPlay2BplistValue[] = [];
        cache.set(ref, setItems);
        for (let index = 0; index < lengthInfo.length; index += 1) {
          const childRef = readAirPlay2BplistUintNumber(body, lengthInfo.cursor + index * refSize, refSize);
          const child = childRef === null ? undefined : parseRef(childRef, depth + 1);
          if (child === undefined) {
            return undefined;
          }
          setItems.push(child);
        }
        value = setItems;
      }
    } else if (type === 0xd0) {
      const lengthInfo = readAirPlay2BplistLength(body, objectOffset, info);
      if (lengthInfo && lengthInfo.cursor + lengthInfo.length * refSize * 2 <= trailerOffset) {
        const record: { [key: string]: AirPlay2BplistValue } = {};
        cache.set(ref, record);
        const valueRefsOffset = lengthInfo.cursor + lengthInfo.length * refSize;
        for (let index = 0; index < lengthInfo.length; index += 1) {
          const keyRef = readAirPlay2BplistUintNumber(body, lengthInfo.cursor + index * refSize, refSize);
          const valueRef = readAirPlay2BplistUintNumber(body, valueRefsOffset + index * refSize, refSize);
          const key = keyRef === null ? undefined : parseRef(keyRef, depth + 1);
          const item = valueRef === null ? undefined : parseRef(valueRef, depth + 1);
          if (typeof key !== 'string' || item === undefined) {
            return undefined;
          }
          record[key] = item;
        }
        value = record;
      }
    }

    if (value === undefined) {
      markParseError(ref, 'unsupported binary plist object');
      return undefined;
    }
    cache.set(ref, value);
    return value;
  };

  const value = parseRef(topObject);
  if (value === undefined) {
    return { value: null, error: parseError ?? 'unsupported binary plist object' };
  }
  return { value, error: null };
};

const isAirPlay2BplistRecord = (value: AirPlay2BplistValue): value is { [key: string]: AirPlay2BplistValue } =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value));

const getAirPlay2BplistNumber = (value: AirPlay2BplistValue | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const getAirPlay2BplistBigInt = (value: AirPlay2BplistValue | undefined): bigint | null => {
  if (typeof value === 'bigint') return value < 0n ? BigInt.asUintN(64, value) : value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  return null;
};

const getAirPlay2BplistString = (value: AirPlay2BplistValue | undefined): string | null =>
  typeof value === 'string' ? value : null;

const getAirPlay2BplistBuffer = (value: AirPlay2BplistValue | undefined): Buffer | null =>
  Buffer.isBuffer(value) ? value : null;

const collectAirPlay2PeerAddresses = (
  value: AirPlay2BplistValue,
  addresses = new Set<string>(),
  depth = 0,
): Set<string> => {
  if (depth > 16) return addresses;
  if (typeof value === 'string') {
    const normalized = normalizeAirPlay2RemoteAddress(value.trim());
    if (normalized && isIP(normalized) !== 0) addresses.add(normalized);
    return addresses;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAirPlay2PeerAddresses(item, addresses, depth + 1);
    return addresses;
  }
  if (isAirPlay2BplistRecord(value)) {
    for (const item of Object.values(value)) collectAirPlay2PeerAddresses(item, addresses, depth + 1);
  }
  return addresses;
};

const parseAirPlay2SetupSessionInfo = (body: Buffer): { info: AirPlay2SessionSetupInfo | null; error: string | null } => {
  if (body.length === 0) {
    return { info: null, error: null };
  }
  const decoded = decodeAirPlay2Bplist(body);
  if (!decoded.value) {
    return { info: null, error: decoded.error };
  }
  const root = isAirPlay2BplistRecord(decoded.value) ? decoded.value : null;
  if (!root) {
    return { info: null, error: null };
  }
  return {
    info: {
      encryptionKey: getAirPlay2BplistBuffer(root.ekey),
      encryptionIv: getAirPlay2BplistBuffer(root.eiv),
      encryptionType: getAirPlay2BplistNumber(root.et),
      timingProtocol: getAirPlay2BplistString(root.timingProtocol),
      senderName: getAirPlay2BplistString(root.name),
      senderModel: getAirPlay2BplistString(root.model),
      sourceVersion: getAirPlay2BplistString(root.sourceVersion),
      sessionUuid: getAirPlay2BplistString(root.sessionUUID),
      timingPort: getAirPlay2BplistNumber(root.timingPort),
    },
    error: null,
  };
};

const parseAirPlay2SetupStreams = (body: Buffer): { streams: AirPlay2SetupStreamInfo[]; error: string | null } => {
  const decoded = decodeAirPlay2Bplist(body);
  if (!decoded.value) {
    return { streams: [], error: decoded.error };
  }
  const root = isAirPlay2BplistRecord(decoded.value) ? decoded.value : null;
  const streamsValue = root?.streams;
  if (!Array.isArray(streamsValue)) {
    return { streams: [], error: null };
  }
  const streams = streamsValue
    .map((stream): AirPlay2SetupStreamInfo | null => {
      if (!isAirPlay2BplistRecord(stream)) {
        return null;
      }
      return {
        type: getAirPlay2BplistNumber(stream.type),
        compressionType: getAirPlay2BplistNumber(stream.ct),
        audioFormat: getAirPlay2BplistNumber(stream.audioFormat),
        sampleRate: getAirPlay2BplistNumber(stream.sr),
        sampleSize: getAirPlay2BplistNumber(stream.ss),
        channels: getAirPlay2BplistNumber(stream.ch),
        framesPerPacket: getAirPlay2BplistNumber(stream.spf),
        sharedKey: getAirPlay2BplistBuffer(stream.shk),
        remoteControlPort: getAirPlay2BplistNumber(stream.controlPort),
        streamConnectionId: getAirPlay2BplistNumber(stream.streamConnectionID),
      };
    })
    .filter((stream): stream is AirPlay2SetupStreamInfo => Boolean(stream));
  return { streams, error: null };
};

const summarizeAirPlay2SetupStream = (stream: AirPlay2SetupStreamInfo | null): string => {
  if (!stream) {
    return 'stream metadata unavailable';
  }
  const pcmFormat = resolveAirPlay2PcmFormat(stream);
  const alacFormat = resolveAirPlay2AlacFormat(stream);
  return [
    `type=${stream.type ?? 'unknown'}`,
    `ct=${stream.compressionType ?? 'unknown'}`,
    `audioFormat=${stream.audioFormat ?? 'unknown'}`,
    `sr=${stream.sampleRate ?? 'unknown'}`,
    `ss=${stream.sampleSize ?? 'unknown'}`,
    `ch=${stream.channels ?? 'unknown'}`,
    `spf=${stream.framesPerPacket ?? 'unknown'}`,
    `shk=${stream.sharedKey ? `${stream.sharedKey.length}b` : 'missing'}`,
    `remoteControlPort=${stream.remoteControlPort ?? 'missing'}`,
    `streamConnectionID=${stream.streamConnectionId ?? 'missing'}`,
    `pcm=${pcmFormat ? `${pcmFormat.sampleRate}/${pcmFormat.bitDepth}/${pcmFormat.channels}` : 'unsupported'}`,
    `alac=${alacFormat ? `${alacFormat.sampleRate}/${alacFormat.bitDepth}/${alacFormat.channels}` : 'unsupported'}`,
  ].join(' ');
};

const summarizeAirPlay2SessionSetupInfo = (info: AirPlay2SessionSetupInfo | null): string => {
  if (!info) {
    return 'session metadata unavailable';
  }
  return [
    `ekey=${info.encryptionKey ? `${info.encryptionKey.length}b` : 'missing'}`,
    `eiv=${info.encryptionIv ? `${info.encryptionIv.length}b` : 'missing'}`,
    `et=${info.encryptionType ?? 'unknown'}`,
    `timing=${info.timingProtocol ?? 'unknown'}`,
    `timingPort=${info.timingPort ?? 'missing'}`,
    `sender=${info.senderName ?? 'unknown'}`,
    `model=${info.senderModel ?? 'unknown'}`,
    `source=${info.sourceVersion ?? 'unknown'}`,
    `session=${info.sessionUuid ?? 'unknown'}`,
  ].join(' ');
};

const normalizeVolume = (value: unknown): number => {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    return 100;
  }

  if (numberValue <= 0) {
    if (numberValue <= -144) {
      return 0;
    }

    const dbValue = Math.max(-30, numberValue);
    return Math.max(1, Math.min(100, Math.round(10 ** (dbValue / 20) * 100)));
  }

  if (numberValue <= 1 && numberValue >= 0) {
    return Math.round(numberValue * 100);
  }

  return Math.max(0, Math.min(100, Math.round(numberValue)));
};

const volumePercentToAirPlayDb = (volumePercent: number): number => {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(volumePercent) ? volumePercent : 100));
  if (clamped <= 0) {
    return -144;
  }
  return Math.max(-144, Math.min(0, Math.round(20 * Math.log10(clamped / 100))));
};

const parseAirPlayTextParameters = (body: Buffer): Record<string, string> => {
  const parameters: Record<string, string> = {};
  for (const line of body.toString('utf8').split(/\r?\n/u)) {
    const separator = line.indexOf(':');
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key) {
      parameters[key] = value;
    }
  }
  return parameters;
};

const parseAirPlayRequestedParameters = (body: Buffer): string[] =>
  body
    .toString('utf8')
    .split(/\r?\n/u)
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean);

const parseAirPlayProgressParameter = (
  value: string | undefined,
  sampleRate: number,
): { positionSeconds: number; durationSeconds: number } | null => {
  if (!value) {
    return null;
  }
  const [startText, currentText, endText] = value.split('/').map((part) => part.trim());
  const start = Number(startText);
  const current = Number(currentText);
  const end = Number(endText);
  if (!Number.isFinite(start) || !Number.isFinite(current) || !Number.isFinite(end) || end <= start) {
    return null;
  }
  const safeSampleRate = sampleRate > 0 ? sampleRate : defaultSampleRate;
  return {
    positionSeconds: Math.max(0, (current - start) / safeSampleRate),
    durationSeconds: Math.max(0, (end - start) / safeSampleRate),
  };
};

const eventAddress = (event: RaopEvent): string | null =>
  trimText(event.remoteAddress) ?? trimText(event.address) ?? trimText(event.host);

const normalizeMac = (mac: string | null | undefined): string | null => {
  const cleaned = (mac ?? '').replace(/[^a-fA-F0-9]/gu, '').toUpperCase();
  if (cleaned.length !== 12 || cleaned === '000000000000') {
    return null;
  }
  return cleaned.match(/.{1,2}/gu)?.join(':') ?? null;
};

const isBenchmarkIpv4 = (address: string): boolean => /^198\.(?:18|19)\./u.test(address);

const isApipaIpv4 = (address: string): boolean => address.startsWith('169.254.');

const isPrivateLanIpv4 = (address: string): boolean =>
  address.startsWith('10.') ||
  address.startsWith('192.168.') ||
  /^172\.(?:1[6-9]|2\d|3[0-1])\./u.test(address);

const isLikelyVirtualAirPlayInterface = (name: string): boolean =>
  /(?:mihomo|clash|vpn|wireguard|tailscale|zerotier|vmware|virtualbox|hyper-v|docker|wsl|loopback|vethernet|tap|tun|npcap|bluetooth)/iu.test(name);

const scoreAdvertiseInterface = (item: AirPlayAdvertiseInterface): number => {
  let score = isPrivateLanIpv4(item.address) ? 0 : 20;
  if (/wi-?fi|wlan|ethernet|以太网/iu.test(item.name)) {
    score -= 5;
  }
  if (isLikelyVirtualAirPlayInterface(item.name)) {
    score += 50;
  }
  if (item.mac === '02:45:43:48:4F:00') {
    score += 10;
  }
  return score;
};

const getAdvertiseInterfaces = (): AirPlayAdvertiseInterface[] => {
  const candidates = Object.entries(networkInterfaces())
    .flatMap(([name, items]) => (items ?? []).map((item) => ({ name, item })))
    .filter(({ item }) => item.family === 'IPv4' && !item.internal)
    .map(({ name, item }) => ({
      name,
      address: item.address,
      mac: normalizeMac(item.mac) ?? '02:45:43:48:4F:00',
    }))
    .filter((item) => !isBenchmarkIpv4(item.address) && !isApipaIpv4(item.address));
  const realLanCandidates = candidates.filter((item) => !isLikelyVirtualAirPlayInterface(item.name));
  return (realLanCandidates.length > 0 ? realLanCandidates : candidates)
    .sort((left, right) => {
      const scoreDelta = scoreAdvertiseInterface(left) - scoreAdvertiseInterface(right);
      return scoreDelta || left.name.localeCompare(right.name) || left.address.localeCompare(right.address);
    });
};

const findAvailableTcpPort = async (host: string | null, basePort: number, portRange: number): Promise<number> => {
  for (let offset = 0; offset < portRange; offset += 1) {
    const port = basePort + offset;
    const available = await new Promise<boolean>((resolve) => {
      const server = createTcpServer();
      server.unref();
      server.once('error', () => resolve(false));
      server.listen(port, host ?? undefined, () => {
        server.close(() => resolve(true));
      });
    });
    if (available) {
      return port;
    }
  }
  throw new Error(`No available AirPlay port in ${basePort}-${basePort + portRange - 1}`);
};

type HelperRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class AirPlayRaopHelperModule implements RaopModule {
  private child: ChildProcessWithoutNullStreams | null = null;
  private handler: ((event: RaopEvent) => void) | null = null;
  private logHandler: ((event: unknown) => void) | null = null;
  private readyPromise: Promise<void> | null = null;
  private nextRequestId = 1;
  private pending = new Map<number, HelperRequest>();

  setLogHandler(handler: ((event: unknown) => void) | null): void {
    this.logHandler = handler;
  }

  async startReceiver(options: RaopReceiverOptions, handler: (event: RaopEvent) => void): Promise<number> {
    this.handler = handler;
    await this.ensureHelper();
    const response = await this.sendRequest('start', { options });
    const handle = Number((response as { handle?: unknown }).handle);
    if (!Number.isInteger(handle)) {
      throw new Error('AirPlay helper did not return a receiver handle.');
    }
    return handle;
  }

  async stopReceiver(): Promise<void> {
    if (!this.child) {
      return;
    }
    await this.sendRequest('stop', {}).catch(() => undefined);
    await this.shutdownHelper();
  }

  async sendRemoteCommand(_handle: number, command: 'play' | 'pause' | 'stop' | 'next' | 'prev' | 'previous'): Promise<boolean> {
    if (!this.child) {
      return false;
    }
    const response = await this.sendRequest('remote', { command }).catch(() => ({ ok: false }));
    return Boolean((response as { ok?: unknown }).ok);
  }

  async setPcmForwarding(enabled: boolean): Promise<boolean> {
    if (!this.child) {
      return false;
    }
    const response = await this.sendRequest('pcm-forwarding', { enabled }).catch(() => ({ ok: false }));
    return Boolean((response as { ok?: unknown }).ok);
  }

  async checkAvailable(): Promise<void> {
    await this.ensureHelper();
    await this.shutdownHelper();
  }

  private async ensureHelper(): Promise<void> {
    if (this.readyPromise) {
      await this.readyPromise;
      return;
    }

    const nodePath = this.resolveNodePath();
    const helperPath = this.resolveHelperPath();
    if (!existsSync(helperPath)) {
      throw new Error(`AirPlay helper script is missing: ${helperPath}`);
    }
    const env = { ...process.env };
    if (this.shouldRunAsNode(nodePath)) {
      env.ELECTRON_RUN_AS_NODE = '1';
    } else {
      delete env.ELECTRON_RUN_AS_NODE;
    }
    if (app.isPackaged) {
      prependNodePaths(env, [
        join(process.resourcesPath, 'app.asar.unpacked', 'node_modules'),
        join(app.getAppPath(), 'node_modules'),
      ]);
    }

    this.child = spawn(nodePath, [helperPath], {
      cwd: dirname(helperPath),
      env,
      stdio: 'pipe',
      windowsHide: true,
    });

    const child = this.child;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      const readyTimeout = setTimeout(() => {
        const error = new Error('AirPlay helper did not become ready.');
        if (this.child === child) {
          this.child = null;
          this.readyPromise = null;
          this.rejectAll(error);
          child.kill();
        }
        reject(error);
      }, 10_000);
      child.once('error', (error) => {
        clearTimeout(readyTimeout);
        reject(error);
      });
      child.stdin.on('error', (error: Error) => {
        this.handleHelperWriteFailure(child, error);
      });
      child.once('exit', (code, signal) => {
        clearTimeout(readyTimeout);
        this.rejectAll(new Error(`AirPlay helper exited (${code ?? signal ?? 'unknown'}).`));
        this.child = null;
        this.readyPromise = null;
        if (code !== 0) {
          this.logHandler?.({ source: 'helper', level: 'error', line: `helper exited (${code ?? signal ?? 'unknown'})` });
        }
      });

      const rl = readline.createInterface({ input: child.stdout });
      rl.on('line', (line) => {
        const message = this.parseMessage(line);
        if (!message) {
          return;
        }
        if (message.type === 'ready') {
          clearTimeout(readyTimeout);
          resolve();
          return;
        }
        this.handleHelperMessage(message);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        this.logHandler?.({ source: 'helper', level: 'warn', line: chunk.toString('utf8').trim() });
      });
    });

    await this.readyPromise;
  }

  private parseMessage(line: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(line) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      this.logHandler?.({ source: 'helper', level: 'warn', line });
      return null;
    }
  }

  private handleHelperMessage(message: Record<string, unknown>): void {
    if (message.type === 'event') {
      const event = message.event;
      if (event && typeof event === 'object' && !Array.isArray(event)) {
        const nextEvent = { ...(event as RaopEvent) };
        if (nextEvent.data && !(nextEvent.data instanceof Buffer)) {
          const data = nextEvent.data as { type?: unknown; data?: unknown };
          if (data.type === 'Buffer' && Array.isArray(data.data)) {
            nextEvent.data = Buffer.from(data.data as number[]);
          }
        }
        this.handler?.(nextEvent);
      }
      return;
    }

    if (message.type === 'log') {
      this.logHandler?.({ source: 'helper', level: message.level, line: message.message });
      return;
    }

    if (message.type === 'fatal') {
      const error = new Error(trimText(message.message) ?? 'AirPlay helper crashed.');
      this.rejectAll(error);
      this.logHandler?.({ source: 'helper', level: 'error', line: error.message });
      return;
    }

    const requestId = Number(message.requestId);
    if (!Number.isInteger(requestId)) {
      return;
    }

    const pending = this.pending.get(requestId);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    if (message.type === 'error') {
      pending.reject(new Error(trimText(message.message) ?? 'AirPlay helper request failed.'));
    } else {
      pending.resolve(message);
    }
  }

  private sendRequest(type: string, payload: Record<string, unknown>): Promise<unknown> {
    const child = this.child;
    if (!child || child.killed) {
      return Promise.reject(new Error('AirPlay helper is not running.'));
    }
    if (child.stdin.destroyed || child.stdin.writableEnded || !child.stdin.writable) {
      return Promise.reject(new Error('AirPlay helper stdin is not writable.'));
    }

    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`AirPlay helper request timed out: ${type}`));
      }, 10_000);
      this.pending.set(requestId, { resolve, reject, timer });
      const message = `${JSON.stringify({ ...payload, type, requestId })}\n`;
      const fail = (error: unknown): void => {
        const request = this.pending.get(requestId);
        if (request) {
          clearTimeout(request.timer);
          this.pending.delete(requestId);
          request.reject(error instanceof Error ? error : new Error(String(error)));
        }
        this.handleHelperWriteFailure(child, error);
      };

      try {
        child.stdin.write(message, (error: Error | null | undefined) => {
          if (error) {
            fail(error);
          }
        });
      } catch (error) {
        fail(error);
      }
    });
  }

  private rejectAll(error: Error): void {
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(requestId);
    }
  }

  private handleHelperWriteFailure(child: ChildProcessWithoutNullStreams, error: unknown): void {
    if (this.child !== child) {
      return;
    }

    const nextError = error instanceof Error ? error : new Error(String(error));
    this.logHandler?.({ source: 'helper', level: 'error', line: `helper stdin closed: ${nextError.message}` });
    this.child = null;
    this.readyPromise = null;
    this.rejectAll(nextError);
    try {
      if (!child.killed) {
        child.kill();
      }
    } catch {
      // Best-effort cleanup after helper pipe failure.
    }
  }

  private async shutdownHelper(): Promise<void> {
    const child = this.child;
    this.child = null;
    this.readyPromise = null;
    if (!child || child.killed) {
      return;
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        child.kill();
        resolve();
      }, 1000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        if (!child.stdin.destroyed && !child.stdin.writableEnded) {
          child.stdin.end();
        }
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  private resolveNodePath(): string {
    return resolveAirPlayHelperNodePath({
      isPackaged: app.isPackaged,
      processExecPath: process.execPath,
      npmNodeExecPath: process.env.npm_node_execpath,
      nodeEnvPath: process.env.NODE,
    });
  }

  private shouldRunAsNode(nodePath: string): boolean {
    return nodePath === process.execPath;
  }

  private resolveHelperPath(): string {
    const appPath = app.getAppPath();
    const candidates = [
      join(appPath, 'src', 'main', 'connect', 'airplayRaopHelper.cjs'),
      join(appPath, 'out', 'main', 'airplayRaopHelper.cjs'),
      join(process.resourcesPath, 'airplayRaopHelper.cjs'),
    ];
    return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
  }
}

export const convertS16leToF32le = (input: Buffer): Buffer => {
  const sampleCount = Math.floor(input.length / 2);
  const output = Buffer.allocUnsafe(sampleCount * 4);

  for (let index = 0; index < sampleCount; index += 1) {
    output.writeFloatLE(input.readInt16LE(index * 2) / 32768, index * 4);
  }

  return output;
};

const createAirPlayOutputSettings = (): NonNullable<Parameters<AirPlayAudioSession['playPcmStream']>[0]['output']> => ({
  outputMode: 'shared',
  sharedBackend: 'auto',
  requestedOutputSampleRate: airPlayOutputSampleRate,
  latencyProfile: 'stable',
  bufferSizeFrames: airPlayOutputBufferFrames,
  dsdOutputMode: 'pcm',
  releaseExclusiveOnPauseExperimentalEnabled: false,
});

const airPlayStateFromAudioStatus = (audioStatus: AudioStatus, currentState: AirPlayReceiverStatus['state']): AirPlayReceiverStatus['state'] => {
  if (currentState === 'playing' && audioStatus.state === 'paused') {
    return currentState;
  }
  if (currentState === 'paused' && audioStatus.state === 'playing') {
    return currentState;
  }
  return audioStatus.state === 'playing' || audioStatus.state === 'paused' || audioStatus.state === 'stopped' || audioStatus.state === 'error'
    ? audioStatus.state
    : currentState;
};

const metadataIdentityKey = (metadata: ConnectMetadata | null): string | null => {
  if (!metadata) {
    return null;
  }
  return [
    comparableAirPlayText(metadata.title),
    comparableAirPlayText(metadata.artist),
    comparableAirPlayText(metadata.album),
    metadata.durationSeconds > 0 ? Math.round(metadata.durationSeconds).toString() : '',
  ].join('|');
};

const metadataFromEvent = (event: RaopEvent, current: ConnectMetadata | null, artworkUrl: string | null): ConnectMetadata => {
  const durationSeconds = Number(event.durationMs);
  const eventDurationSeconds = Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.round(durationSeconds / 1000) : 0;
  const currentDurationSeconds = current?.durationSeconds ?? 0;
  const eventTitle = trimText(event.title);
  const keepCurrentMetadata =
    shouldKeepCurrentMetadataForLyricLine(eventTitle, current) &&
    (!eventDurationSeconds || !currentDurationSeconds || Math.abs(eventDurationSeconds - currentDurationSeconds) <= 2);
  const title = keepCurrentMetadata ? current?.title ?? null : eventTitle ?? current?.title ?? null;
  const artist = keepCurrentMetadata ? current?.artist ?? null : trimText(event.artist) ?? current?.artist ?? null;
  const album = keepCurrentMetadata ? current?.album ?? null : trimText(event.album) ?? current?.album ?? null;
  const normalized = normalizeAirPlayMetadataText(title, artist, album);
  return {
    title: normalized.title ?? defaultTitle,
    artist: normalized.artist ?? unknownArtist,
    album: normalized.album,
    albumArtist: current?.albumArtist ?? normalized.artist ?? unknownArtist,
    durationSeconds: eventDurationSeconds || (current?.durationSeconds ?? 0),
    coverHttpUrl: artworkUrl ?? current?.coverHttpUrl ?? '',
  };
};

const metadataFromDmap = (
  event: AirPlayDmapMetadata,
  current: ConnectMetadata | null,
  artworkUrl: string | null,
): ConnectMetadata => {
  const normalized = normalizeAirPlayMetadataText(
    event.title ?? current?.title ?? null,
    event.artist ?? current?.artist ?? null,
    event.album ?? current?.album ?? null,
  );
  return {
    title: normalized.title ?? current?.title ?? defaultTitle,
    artist: normalized.artist ?? current?.artist ?? unknownArtist,
    album: normalized.album ?? current?.album ?? null,
    albumArtist: event.albumArtist ?? current?.albumArtist ?? normalized.artist ?? unknownArtist,
    durationSeconds: event.durationSeconds ?? current?.durationSeconds ?? 0,
    coverHttpUrl: artworkUrl ?? current?.coverHttpUrl ?? '',
  };
};

export class AirPlayReceiverSpikeService extends EventEmitter<AirPlayReceiverEvents> {
  private readonly audioSession: AirPlayAudioSession;
  private readonly advertisedName: string;
  private readonly loadRaopModule: () => Promise<RaopModule>;
  private readonly createAirPlay2AlacDecoder: AirPlay2AlacDecoderFactory;
  private readonly createAirPlay2AacDecoder: AirPlay2AacDecoderFactory;
  private readonly getAdvertiseInterfaces: () => AirPlayAdvertiseInterface[];
  private readonly createMdnsAdvertiser: () => AirPlayMdnsAdvertiserLike;
  private readonly useHttpPcmBridge: boolean;
  private readonly getAirPlayReceiverProtocol: () => AirPlayReceiverProtocol;
  private readonly startupTimeoutMs: number;
  private readonly now: () => number;
  private readonly airPlay2Identity: AirPlay2Identity;
  private readonly airPlay2PairingStore: AirPlay2PairingStoreLike;
  private readonly airPlay2NtpSession: AirPlay2NtpSession;
  private readonly airPlay2PtpClock: AirPlay2PtpClockLike;
  private readonly airPlay2DacpRemote: AirPlayDacpRemoteLike;
  private airPlay2TimingMode: 'ntp' | 'ptp' = 'ntp';
  private airPlayReceiverProtocol: AirPlayReceiverProtocol;
  private raopModule: RaopModule | null = null;
  private receiverHandle: number | null = null;
  private advertisedInterface: AirPlayAdvertiseInterface | null = null;
  private mdnsAdvertisers: AirPlayMdnsAdvertiserLike[] = [];
  private airPlay2ProbeServer: TcpServer | null = null;
  private airPlay2ProbePort: number | null = null;
  private readonly airPlay2ProbeSockets = new Set<Socket>();
  private airPlay2EventServer: TcpServer | null = null;
  private airPlay2EventPort: number | null = null;
  private readonly airPlay2EventSockets = new Set<Socket>();
  private airPlay2AudioTransport: AirPlay2AudioTransportLike | null = null;
  private airPlay2StreamState: AirPlay2StreamState | null = null;
  private airPlay2PairSetupState: AirPlay2PairSetupState | null = null;
  private airPlay2PairVerifyState: AirPlay2PairVerifyState | null = null;
  private airPlay2EncryptedControlState: AirPlay2EncryptedControlState | null = null;
  private airPlay2EncryptedControlCandidates: AirPlay2EncryptedControlState[] = [];
  private airPlay2EncryptedEventState: AirPlay2EncryptedEventState | null = null;
  private airPlay2FairPlayState: AirPlay2FairPlayState | null = null;
  private airPlay2SessionSetupInfo: AirPlay2SessionSetupInfo | null = null;
  private pcmStream: PassThrough | null = null;
  private httpPcmRequest: ClientRequest | null = null;
  private readonly intentionalHttpPcmRequestCloses = new WeakSet<ClientRequest>();
  private httpPcmTransform: Transform | null = null;
  private httpPcmFallbackTimer: NodeJS.Timeout | null = null;
  private httpPcmReconnectTimer: NodeJS.Timeout | null = null;
  private httpPcmBytesReceived = 0;
  private lastHttpPcmPort: number | null = null;
  private pcmPlaybackStarted = false;
  private pcmBackpressured = false;
  private pcmDrainStream: PassThrough | null = null;
  private pcmDrainListener: (() => void) | null = null;
  private pcmForwardingOperation: Promise<void> = Promise.resolve();
  private currentSourceId: string | null = null;
  private ignorePcmUntilNextStream = false;
  private audioSessionClaimedCurrentSource = false;
  private currentMetadataIdentityKey: string | null = null;
  private positionAnchorSeconds = 0;
  private positionAnchorUpdatedAtMs = 0;
  private sessionCounter = 0;
  private status: AirPlayReceiverStatus;
  private lifecycleOperation: Promise<void> = Promise.resolve();
  private receiverEventOperation: Promise<void> = Promise.resolve();
  private readonly airPlay2RtpReorderBuffer = new AirPlayRtpReorderBuffer<{
    packet: AirPlay2RtpPacket;
    remote: RemoteInfo;
  }>({
    maxPendingPackets: 32,
    maxWaitMs: 30,
    onPacket: ({ packet, remote }) => this.processAirPlay2RtpPacket(packet, remote),
    onGap: (missingPackets) => this.handleAirPlay2RtpGap(missingPackets),
    onMissing: (firstMissingSequence, missingPackets) => {
      const requested = this.airPlay2AudioTransport?.requestResend(firstMissingSequence, missingPackets) === true;
      this.addDebugEvent(
        'rtcp',
        `${requested ? 'requested' : 'could not request'} resend seq=${firstMissingSequence} count=${missingPackets}`,
      );
    },
  });

  constructor(dependencies: AirPlayReceiverDependencies = {}) {
    super();
    this.audioSession = dependencies.audioSession ?? getAudioSession();
    this.advertisedName = dependencies.advertisedName ?? defaultAdvertisedName();
    this.loadRaopModule = dependencies.loadRaopModule ?? loadDefaultRaopModule;
    this.createAirPlay2AlacDecoder = dependencies.createAirPlay2AlacDecoder ?? createDefaultAirPlay2AlacDecoder;
    this.createAirPlay2AacDecoder = dependencies.createAirPlay2AacDecoder ?? createDefaultAirPlay2AacDecoder;
    this.getAdvertiseInterfaces = dependencies.getAdvertiseInterfaces ?? getAdvertiseInterfaces;
    this.createMdnsAdvertiser = dependencies.createMdnsAdvertiser ?? (() => new AirPlayMdnsAdvertiser((error) => {
      this.addDebugEvent('mdns', error.message);
    }));
    this.useHttpPcmBridge = dependencies.useHttpPcmBridge ?? shouldUseAirPlayHttpPcmBridge();
    this.getAirPlayReceiverProtocol = dependencies.airPlay2Experimental !== undefined
      ? () => (dependencies.airPlay2Experimental ? 'airplay2' : 'airplay1')
      : dependencies.getAirPlayReceiverProtocol ?? readConfiguredAirPlayReceiverProtocol;
    this.airPlayReceiverProtocol = this.getAirPlayReceiverProtocol();
    this.startupTimeoutMs = dependencies.startupTimeoutMs ?? airPlayStartupStepTimeoutMs;
    this.now = dependencies.now ?? Date.now;
    this.airPlay2Identity = loadOrCreateAirPlay2Identity();
    this.airPlay2PairingStore = dependencies.pairingStore ?? createDefaultAirPlay2PairingStore();
    this.airPlay2DacpRemote = dependencies.dacpRemote ?? new AirPlayDacpRemote();
    this.airPlay2NtpSession = new AirPlay2NtpSession({
      onDiagnostic: (message) => this.addDebugEvent('timing', message, {
        method: 'UDP',
        path: '/airplay2/timing',
      }),
      onSample: (sample) => this.addDebugEvent(
        'timing',
        `NTP sample delay=${sample.delayMs.toFixed(3)}ms offset=${sample.offsetMs.toFixed(3)}ms remote=${sample.remoteAddress}:${sample.remotePort}`,
        { method: 'UDP', path: '/airplay2/timing' },
      ),
    });
    this.airPlay2PtpClock = dependencies.ptpClock ?? new AirPlay2PtpClock({
      onDiagnostic: (message) => this.addDebugEvent('timing', message, {
        method: 'UDP',
        path: '/airplay2/ptp',
      }),
      onSample: (sample) => {
        this.addDebugEvent(
          'timing',
          `PTP sample clock=${sample.grandmasterClockIdentity} offsetNs=${sample.smoothedOffsetNanoseconds} source=${sample.sourceAddress} paired=${sample.pairedSync ? 'yes' : 'no'}`,
          { method: 'UDP', path: '/airplay2/ptp' },
        );
        this.handleAirPlay2PtpSample();
      },
    });
    this.status = this.createDisabledStatus();
    this.audioSession.on('status', this.handleAudioStatus);
    if (!dependencies.loadRaopModule) {
      void this.refreshNativeAvailability();
    }
  }

  getStatus(): AirPlayReceiverStatus {
    return this.withAudioPosition(this.status);
  }

  async setEnabled(enabled: boolean): Promise<AirPlayReceiverStatus> {
    const operation = this.lifecycleOperation.then(() => enabled ? this.start() : this.stop());
    this.lifecycleOperation = operation.catch(() => undefined);
    await operation;

    return this.getStatus();
  }

  async stopPlayback(): Promise<AirPlayReceiverStatus> {
    await this.sendRemoteCommand('stop');
    await this.stopIncomingPlayback('stopped by ECHO');
    return this.getStatus();
  }

  private async stopIncomingPlayback(reason: string): Promise<void> {
    const currentSourceId = this.currentSourceId;
    if (currentSourceId && this.audioSession.getStatus().currentFilePath === currentSourceId) {
      try {
        await this.audioSession.stop();
      } catch (error) {
        const message = `AirPlay PCM stop failed: ${error instanceof Error ? error.message : String(error)}`;
        this.addDebugEvent('stop', message);
        this.setStatus({ state: 'error', error: message });
        throw error;
      }
    }
    this.ignorePcmUntilNextStream = true;
    this.clearCurrentSession(reason);
    this.setStatus({
      state: this.status.enabled ? 'idle' : 'disabled',
      currentSourceId: null,
      currentClient: null,
      metadata: null,
      currentLyricLine: null,
      artworkUrl: null,
      positionSeconds: 0,
      durationSeconds: 0,
      error: null,
    });
  }

  isCurrentSource(sourceId: string | null | undefined): boolean {
    return Boolean(sourceId && this.currentSourceId === sourceId);
  }

  async playPlayback(): Promise<AirPlayReceiverStatus> {
    if (!await this.sendRemoteCommand('play')) {
      throw new Error('AirPlay sender did not accept the play command.');
    }
    return this.getStatus();
  }

  async pausePlayback(): Promise<AirPlayReceiverStatus> {
    if (!await this.sendRemoteCommand('pause')) {
      throw new Error('AirPlay sender did not accept the pause command.');
    }
    return this.getStatus();
  }

  async seekPlayback(_positionSeconds?: number): Promise<AirPlayReceiverStatus> {
    void _positionSeconds;
    this.addDebugEvent('seek', 'AirPlay receiver seek is not supported by the native backend');
    return this.getStatus();
  }

  async dispose(): Promise<void> {
    await this.setEnabled(false);
    this.audioSession.off?.('status', this.handleAudioStatus);
    this.removeAllListeners();
  }

  private createDisabledStatus(): AirPlayReceiverStatus {
    return {
      enabled: false,
      state: 'disabled',
      protocol: this.airPlayReceiverProtocol,
      advertisedName: this.advertisedName,
      nativeAvailable: false,
      currentSourceId: null,
      currentClient: null,
      metadata: null,
      currentLyricLine: null,
      artworkUrl: null,
      positionSeconds: 0,
      durationSeconds: 0,
      volume: Math.round((this.audioSession.getStatus().volume ?? 1) * 100),
      error: null,
      debugEvents: [],
      updatedAt: new Date(this.now()).toISOString(),
    };
  }

  private async start(): Promise<void> {
    if (this.status.enabled && this.receiverHandle !== null) {
      return;
    }

    this.setStatus({ enabled: false, state: 'starting', error: null });
    try {
      this.airPlayReceiverProtocol = this.getAirPlayReceiverProtocol();
      const airPlay2Experimental = this.airPlayReceiverProtocol === 'airplay2';
      this.raopModule ??= await this.loadRaopModule();
      this.raopModule.setLogHandler?.((event) => this.handleNativeLog(event), 'info', 'info', 'warn');
      const advertiseInterfaces = this.getAdvertiseInterfaces();
      const advertiseInterface = advertiseInterfaces[0] ?? null;
      const advertisedMac = advertiseInterface?.mac ?? '02:45:43:48:4F:00';
      this.advertisedInterface = advertiseInterface;
      const portBase = await findAvailableTcpPort(null, 6000, 100);
      const airPlay2ProbePort = airPlay2Experimental ? await this.startAirPlay2ProbeServer() : null;
      this.airPlay2TimingMode = 'ntp';
      if (airPlay2Experimental && airPlay2ProbePort) {
        try {
          await this.airPlay2PtpClock.start();
          this.airPlay2TimingMode = 'ptp';
          this.addDebugEvent('timing', 'AirPlay 2 PTP listener active on UDP 319/320; buffered/PTP profile enabled', {
            method: 'UDP',
            path: '/airplay2/ptp',
          });
        } catch (error) {
          this.addDebugEvent('timing', `AirPlay 2 PTP unavailable; using realtime/NTP profile: ${error instanceof Error ? error.message : String(error)}`, {
            method: 'UDP',
            path: '/airplay2/ptp',
          });
        }
      }
      this.receiverHandle = await withTimeout(
        this.raopModule.startReceiver(
          {
            name: this.advertisedName,
            model: airPlayModel,
            mac: advertisedMac,
            latencies: airPlayRaopLatencies,
            metadata: true,
            portBase,
            portRange: 100,
          },
          (event) => this.handleRaopEvent(event),
        ),
        this.startupTimeoutMs,
        'AirPlay RAOP receiver startup timed out.',
      );
      const advertisedAddresses: string[] = [];
      for (const item of advertiseInterfaces) {
        const mdnsAdvertiser = this.createMdnsAdvertiser();
        try {
          await withTimeout(
            mdnsAdvertiser.start({
              name: this.advertisedName,
              model: airPlayModel,
              address: item.address,
              mac: advertisedMac,
              port: portBase,
              airPlayPort: airPlay2ProbePort,
              airPlayPublicKey: this.airPlay2Identity.publicKey.toString('hex'),
              airPlay2Experimental,
              airPlay2TimingMode: this.airPlay2TimingMode,
            }),
            this.startupTimeoutMs,
            `AirPlay mDNS advertiser startup timed out on ${item.address}.`,
          );
          this.mdnsAdvertisers.push(mdnsAdvertiser);
          advertisedAddresses.push(`${item.address} (${item.name})`);
        } catch (error) {
          await withTimeout(
            Promise.resolve().then(() => mdnsAdvertiser.stop(false)),
            Math.min(this.startupTimeoutMs, 1000),
            `AirPlay mDNS advertiser cleanup timed out on ${item.address}.`,
          ).catch((stopError) => {
            this.addDebugEvent('mdns', stopError instanceof Error ? stopError.message : String(stopError));
          });
          this.addDebugEvent('mdns', `${item.address}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      this.addDebugEvent(
        'mdns',
        advertisedAddresses.length > 0
          ? `fallback advertisers on ${advertisedAddresses.join(', ')}`
          : 'AirPlay mDNS advertiser did not start on any eligible LAN IPv4 interface',
      );
      this.addDebugEvent(
        'start',
        advertiseInterface
          ? `RAOP receiver started on 0.0.0.0:${portBase}; primary advertisement ${advertiseInterface.address} (${advertiseInterface.mac})`
          : `RAOP receiver started on 0.0.0.0:${portBase}; no LAN IPv4 interface found`,
      );
      if (airPlay2Experimental) {
        this.addDebugEvent(
          'airplay2',
          airPlay2ProbePort
            ? `experimental AirPlay 2 advertisement enabled on ${airPlay2ProbePort}; timing=${this.airPlay2TimingMode}; RAOP discovery is routed to the AirPlay 2 control server`
            : 'experimental _airplay._tcp advertisement skipped because probe server did not start',
        );
      }
      this.setStatus({
        enabled: true,
        state: 'idle',
        protocol: this.airPlayReceiverProtocol,
        nativeAvailable: true,
        error: advertisedAddresses.length > 0 ? null : 'AirPlay discovery unavailable: mDNS advertiser did not start on any LAN interface.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failedReceiverHandle = this.receiverHandle;
      const failedRaopModule = this.raopModule;
      this.receiverHandle = null;
      this.raopModule = null;
      const mdnsAdvertisers = this.mdnsAdvertisers.splice(0);
      await Promise.all(mdnsAdvertisers.map((advertiser) => advertiser.stop(false).catch(() => undefined)));
      await this.stopAirPlay2ProbeServer().catch(() => undefined);
      if (failedRaopModule) {
        await Promise.resolve(failedRaopModule.stopReceiver(failedReceiverHandle ?? -1)).catch((cleanupError) => {
          this.addDebugEvent('error', `AirPlay receiver cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
        });
      }
      this.clearCurrentSession('native module unavailable');
      this.setStatus({
        enabled: false,
        state: 'unavailable',
        nativeAvailable: false,
        error: `AirPlay native backend unavailable: ${message}`,
      });
      this.addDebugEvent('error', message);
    }
  }

  private async refreshNativeAvailability(): Promise<void> {
    if (this.status.enabled || this.status.state === 'starting') {
      return;
    }

    try {
      this.raopModule ??= await this.loadRaopModule();
      await this.raopModule.checkAvailable?.();
      if (!this.status.enabled) {
        this.setStatus({
          nativeAvailable: true,
          error: null,
        });
      }
    } catch (error) {
      if (!this.status.enabled) {
        const message = error instanceof Error ? error.message : String(error);
        this.setStatus({
          nativeAvailable: false,
          error: `AirPlay native backend unavailable: ${message}`,
        });
      }
    }
  }

  private async stop(): Promise<void> {
    await this.receiverEventOperation;
    const hadAirPlayPlayback = Boolean(this.currentSourceId);
    if (hadAirPlayPlayback) {
      await this.stopPlayback().catch(() => undefined);
    } else {
      this.clearCurrentSession('');
    }
    if (this.mdnsAdvertisers.length > 0) {
      const mdnsAdvertisers = this.mdnsAdvertisers;
      this.mdnsAdvertisers = [];
      await Promise.all(
        mdnsAdvertisers.map((mdnsAdvertiser) =>
          mdnsAdvertiser.stop().catch((error) => {
            this.addDebugEvent('mdns', error instanceof Error ? error.message : String(error));
          }),
        ),
      );
    }
    await this.stopAirPlay2ProbeServer();
    if (this.receiverHandle !== null && this.raopModule) {
      try {
        await this.raopModule.stopReceiver(this.receiverHandle);
      } catch (error) {
        this.addDebugEvent('error', error instanceof Error ? error.message : String(error));
      }
    }
    this.receiverHandle = null;
    this.raopModule = null;
    this.advertisedInterface = null;
    this.setStatus({
      enabled: false,
      state: 'disabled',
      currentClient: null,
      currentSourceId: null,
      metadata: null,
      currentLyricLine: null,
      artworkUrl: null,
      positionSeconds: 0,
      durationSeconds: 0,
      error: null,
    });
  }

  private async startAirPlay2ProbeServer(): Promise<number | null> {
    if (this.airPlay2ProbeServer && this.airPlay2ProbePort) {
      return this.airPlay2ProbePort;
    }

    try {
      const port = await findAvailableTcpPort(null, 7000, 100);
      const server = createTcpServer((socket) => this.handleAirPlay2TcpConnection(socket));
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen(port, () => {
            server.off('error', reject);
            resolve();
          });
        }),
        this.startupTimeoutMs,
        'AirPlay 2 probe server startup timed out.',
      );
      this.airPlay2ProbeServer = server;
      this.airPlay2ProbePort = port;
      this.addDebugEvent('airplay2', `probe server listening on ${port}`);
      this.addDebugEvent(
        'crypto',
        `runtime cipher=${airPlay2CipherName} provider=${airPlay2CipherProvider()} available=${airPlay2CipherAvailable() ? 'yes' : 'no'} node=${process.versions.node ?? '-'} openssl=${process.versions.openssl ?? '-'} electron=${process.versions.electron ?? '-'}`,
        { method: 'BOOT', path: '/airplay2' },
      );
      return port;
    } catch (error) {
      this.addDebugEvent('airplay2', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  private async stopAirPlay2ProbeServer(): Promise<void> {
    const server = this.airPlay2ProbeServer;
    this.airPlay2ProbeServer = null;
    this.airPlay2ProbePort = null;
    this.airPlay2PairSetupState = null;
    this.airPlay2PairVerifyState = null;
    this.airPlay2EncryptedControlState = null;
    this.airPlay2EncryptedControlCandidates = [];
    this.airPlay2EncryptedEventState = null;
    this.airPlay2FairPlayState = null;
    this.airPlay2SessionSetupInfo = null;
    this.airPlay2DacpRemote.clear();
    this.airPlay2TimingMode = 'ntp';
    await this.airPlay2PtpClock.stop();
    await this.stopAirPlay2SessionResources();
    if (!server) {
      return;
    }

    await this.closeAirPlay2TcpServer(server, this.airPlay2ProbeSockets);
  }

  private async stopAirPlay2SessionResources(): Promise<void> {
    const eventServer = this.airPlay2EventServer;
    this.airPlay2EventServer = null;
    this.airPlay2EventPort = null;
    await this.closeAirPlay2StreamState();
    const audioTransport = this.airPlay2AudioTransport;
    this.airPlay2AudioTransport = null;
    this.airPlay2PtpClock.setPeerAddresses([]);
    await Promise.all([
      this.airPlay2NtpSession.stop(),
      audioTransport?.stop() ?? Promise.resolve(),
      eventServer
        ? this.closeAirPlay2TcpServer(eventServer, this.airPlay2EventSockets)
        : Promise.resolve(),
    ]);
  }

  private async closeAirPlay2TcpServer(server: TcpServer, sockets: Set<Socket>): Promise<void> {
    for (const socket of sockets) {
      socket.end();
    }
    await new Promise<void>((resolve) => {
      let finished = false;
      const finish = (): void => {
        if (finished) {
          return;
        }
        finished = true;
        clearTimeout(forceCloseTimer);
        sockets.clear();
        resolve();
      };
      const forceCloseTimer = setTimeout(() => {
        for (const socket of sockets) {
          socket.destroy();
        }
      }, 250);
      forceCloseTimer.unref?.();
      server.close(finish);
    });
  }

  private async closeAirPlay2StreamState(): Promise<void> {
    this.airPlay2RtpReorderBuffer.reset();
    const state = this.airPlay2StreamState;
    this.airPlay2StreamState = null;
    if (state?.bufferedStartTimer) {
      clearTimeout(state.bufferedStartTimer);
      state.bufferedStartTimer = null;
    }
    if (state?.alacDecoder) {
      try {
        state.alacDecoder.close();
      } catch (error) {
        this.addDebugEvent('setup', `AirPlay 2 ALAC decoder close failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (state?.aacDecoder) {
      try {
        await state.aacDecoder.stop();
      } catch (error) {
        this.addDebugEvent('setup', `AirPlay 2 AAC decoder close failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private handleAirPlay2TcpConnection(socket: Socket): void {
    this.airPlay2ProbeSockets.add(socket);
    socket.once('close', () => this.airPlay2ProbeSockets.delete(socket));
    const connection: AirPlay2TcpConnection = {
      buffer: Buffer.alloc(0),
      plaintextBuffer: Buffer.alloc(0),
      encrypted: false,
      draining: false,
      waitingForData: false,
      cipher: { readCounter: 0, writeCounter: 0, readCounterOffset: 0, writeCounterOffset: 0 },
      lastFrameSummary: null,
    };

    socket.on('data', (chunk) => {
      connection.buffer = Buffer.concat([connection.buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      connection.waitingForData = false;
      if (!connection.draining) {
        void this.drainAirPlay2TcpConnection(socket, connection);
      }
    });
    socket.on('error', (error) => {
      this.addDebugEvent('probe-error', `socket=${airPlay2SocketPeer(socket)} ${error.message}`, {
        method: 'TCP',
        path: '/airplay2',
        statusCode: null,
        remoteAddress: airPlay2SocketPeer(socket),
      });
    });
  }

  private async drainAirPlay2TcpConnection(socket: Socket, connection: AirPlay2TcpConnection): Promise<void> {
    connection.draining = true;
    try {
      while (connection.buffer.length > 0) {
        if (connection.encrypted) {
          const state = this.airPlay2EncryptedControlState;
          if (!state) {
            throw new Error('Encrypted AirPlay 2 control frame arrived before control encryption was ready.');
          }
          if (connection.buffer.length < 2) {
            connection.waitingForData = true;
            return;
          }
          const payloadLength = connection.buffer.readUInt16LE(0);
          if (payloadLength > airPlay2EncryptedFrameLimitBytes) {
            throw new Error(`AirPlay 2 encrypted control frame is too large: ${payloadLength}.`);
          }
          const frameLength = 2 + payloadLength + 16;
          if (connection.buffer.length < frameLength) {
            connection.waitingForData = true;
            return;
          }
          const frame = connection.buffer.subarray(0, frameLength);
          connection.lastFrameSummary = summarizeAirPlay2EncryptedControlFrame(frame);
          connection.buffer = connection.buffer.subarray(frameLength);
          const decrypted = this.decryptAirPlay2ControlFrame(socket, connection, state, frame);
          const plaintext = decrypted.plaintext;
          connection.cipher.readCounter += 1;
          connection.lastFrameSummary = `${connection.lastFrameSummary} key=${decrypted.state.keyLabel} counter=${decrypted.counter} plaintext=${summarizeBuffer(plaintext)}`;
          connection.plaintextBuffer = Buffer.concat([connection.plaintextBuffer, plaintext]);
          let handledEncryptedRequest = false;
          while (connection.plaintextBuffer.length > 0) {
            const parsed = parseAirPlay2TextRequest(
              connection.plaintextBuffer,
              socket.remoteAddress ?? null,
              socket.localAddress ?? null,
            );
            if (!parsed) {
              connection.waitingForData = true;
              break;
            }
            connection.plaintextBuffer = connection.plaintextBuffer.subarray(parsed.consumed);
            connection.lastFrameSummary = `${connection.lastFrameSummary} request=${parsed.request.method} ${parsed.request.path} consumed=${parsed.consumed} remainingPlain=${connection.plaintextBuffer.length}`;
            const response = await this.handleAirPlay2ProbeRequest(parsed.request);
            const serialized = serializeAirPlay2ProbeResponse(
              parsed.request,
              response,
              getAirPlay2AdvertisementProfile(this.airPlay2TimingMode).sourceVersion,
            );
            const writeCounter = connection.cipher.writeCounter + connection.cipher.writeCounterOffset;
            const encryptedResponse = encryptAirPlay2ControlFrames(
              decrypted.state.controlReadKey,
              writeCounter,
              serialized,
            );
            socket.write(encryptedResponse.data);
            connection.cipher.writeCounter += encryptedResponse.frameCount;
            handledEncryptedRequest = true;
          }
          if (!handledEncryptedRequest) {
            connection.lastFrameSummary = `${connection.lastFrameSummary} waitingPlain=${summarizeBuffer(connection.plaintextBuffer)} prefix=${summarizeBufferPrefix(connection.plaintextBuffer, 48)}`;
          }
          continue;
        }

        const parsed = parseAirPlay2TextRequest(
          connection.buffer,
          socket.remoteAddress ?? null,
          socket.localAddress ?? null,
        );
        if (!parsed) {
          connection.waitingForData = true;
          return;
        }
        connection.buffer = connection.buffer.subarray(parsed.consumed);
        const response = await this.handleAirPlay2ProbeRequest(parsed.request);
        socket.write(serializeAirPlay2ProbeResponse(
          parsed.request,
          response,
          getAirPlay2AdvertisementProfile(this.airPlay2TimingMode).sourceVersion,
        ));
        if (response.encryptedAfterWrite) {
          connection.encrypted = true;
          connection.cipher = { readCounter: 0, writeCounter: 0, readCounterOffset: 0, writeCounterOffset: 0 };
          connection.plaintextBuffer = Buffer.alloc(0);
          connection.lastFrameSummary = 'encrypted control enabled after response';
          this.addDebugEvent('crypto', `Encrypted AirPlay 2 control enabled socket=${airPlay2SocketPeer(socket)} key=${this.airPlay2EncryptedControlState?.keyLabel ?? 'unknown'} candidates=${this.airPlay2EncryptedControlCandidates.length}`, {
            method: 'ENC',
            path: parsed.request.path,
            statusCode: 200,
            remoteAddress: airPlay2SocketPeer(socket),
          });
        }
      }
    } catch (error) {
      const context = connection.encrypted
        ? [
          `socket=${airPlay2SocketPeer(socket)}`,
          `readCounter=${connection.cipher.readCounter}`,
          `readOffset=${connection.cipher.readCounterOffset}`,
          `writeCounter=${connection.cipher.writeCounter}`,
          `writeOffset=${connection.cipher.writeCounterOffset}`,
          `buffer=${summarizeBuffer(connection.buffer)}`,
          `plainBuffer=${summarizeBuffer(connection.plaintextBuffer)}`,
          `keyState=${this.airPlay2EncryptedControlState ? 'ready' : 'missing'}`,
          connection.lastFrameSummary ? `lastFrame=[${connection.lastFrameSummary}]` : 'lastFrame=none',
        ].join(' ')
        : `socket=${airPlay2SocketPeer(socket)} buffer=${summarizeBuffer(connection.buffer)} prefix=${summarizeBufferPrefix(connection.buffer, 48)}`;
      this.addDebugEvent('probe-error', `${error instanceof Error ? error.message : String(error)}; ${context}`, {
        method: connection.encrypted ? 'ENC' : 'TCP',
        path: '/airplay2',
        statusCode: 400,
        remoteAddress: airPlay2SocketPeer(socket),
      });
      socket.end();
    } finally {
      connection.draining = false;
      if (connection.buffer.length > 0 && !connection.waitingForData && !socket.destroyed) {
        void this.drainAirPlay2TcpConnection(socket, connection);
      }
    }
  }

  private decryptAirPlay2ControlFrame(
    socket: Socket,
    connection: AirPlay2TcpConnection,
    state: AirPlay2EncryptedControlState,
    frame: Buffer,
  ): { plaintext: Buffer; state: AirPlay2EncryptedControlState; counter: number } {
    const candidates = [state, ...this.airPlay2EncryptedControlCandidates];
    const errors: string[] = [];
    for (const candidate of candidates) {
      for (const offset of [...new Set([connection.cipher.readCounterOffset, 0, 1, 2])]) {
        const counter = connection.cipher.readCounter + offset;
        try {
          const plaintext = decryptAirPlay2ControlFrame(candidate.controlWriteKey, counter, frame);
          if (candidate !== state || offset !== connection.cipher.readCounterOffset) {
            this.airPlay2EncryptedControlState = candidate;
            this.airPlay2EncryptedControlCandidates = this.airPlay2EncryptedControlCandidates.filter((item) => item !== candidate);
            connection.cipher.readCounterOffset = offset;
            connection.cipher.writeCounterOffset = offset;
            this.addDebugEvent(
              'crypto',
              `Selected AirPlay 2 encrypted control key=${candidate.keyLabel}; counterOffset=${offset}; socket=${airPlay2SocketPeer(socket)}`,
              {
                method: 'ENC',
                path: '/airplay2',
                statusCode: 200,
                remoteAddress: airPlay2SocketPeer(socket),
              },
            );
          }
          return { plaintext, state: candidate, counter };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (offset === connection.cipher.readCounterOffset) {
            errors.push(`${candidate.keyLabel}@${counter}: ${message}`);
          }
        }
      }
    }

    throw new Error(
      `AirPlay 2 encrypted control frame did not verify with ${candidates.length} key candidate(s); ${errors.join(' | ')}`,
    );
  }

  private async handleAirPlay2ProbeRequest(request: AirPlay2ProbeRequest): Promise<AirPlay2ProbeResponse> {
    const { method, path, body } = request;
    const contentTypeText = request.headers['content-type'] ?? null;
    this.updateAirPlay2DacpSender(request);

    if (method === 'GET' && path === '/info') {
      if (request.protocol.startsWith('RTSP/') && body.length === 0 && !contentTypeText) {
        const responseBody = this.createAirPlay2InitialInfoPlist();
        this.addDebugEvent('info', 'AirPlay 2 initial info response sent', { method, path, statusCode: 200 });
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/x-apple-binary-plist' },
          body: responseBody,
        };
      }
      if (contentTypeText?.includes('application/x-apple-binary-plist') || body.subarray(0, 8).toString('ascii') === 'bplist00') {
        const responseBody = this.createAirPlay2InfoBplist();
        this.addDebugEvent('info', 'AirPlay 2 /info binary plist response sent', { method, path, statusCode: 200 });
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/x-apple-binary-plist' },
          body: responseBody,
        };
      }
      const responseBody = this.createAirPlay2InfoPlist();
      this.addDebugEvent('info', 'AirPlay 2 /info probe response sent', { method, path, statusCode: 200 });
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/x-apple-plist+xml' },
        body: responseBody,
      };
    }

    if (method === 'OPTIONS') {
      this.addDebugEvent('options', 'AirPlay 2 OPTIONS probe response sent', { method, path, statusCode: 200 });
      return {
        statusCode: 200,
        headers: {
          Public: 'ANNOUNCE, SETUP, RECORD, PAUSE, FLUSH, FLUSHBUFFERED, TEARDOWN, OPTIONS, GET_PARAMETER, SET_PARAMETER, SETRATEANCHORTIME, SETPEERS, SETPEERSX, GET, POST',
        },
      };
    }

    if (method === 'POST' && path === '/pair-setup') {
      return this.handleAirPlay2PairSetupRequest(method, path, contentTypeText, body);
    }

    if (method === 'POST' && path === '/pair-verify') {
      return this.handleAirPlay2PairVerifyRequest(method, path, contentTypeText, body);
    }

    if (method === 'POST' && path === '/fp-setup') {
      return this.handleAirPlay2FairPlaySetupRequest(method, path, body);
    }

    if (method === 'SETUP') {
      return this.handleAirPlay2SetupRequest(request);
    }

    if (method === 'RECORD') {
      this.addDebugEvent('record', 'AirPlay 2 RECORD acknowledged; RTP audio packets may follow', { method, path, statusCode: 200 });
      return { statusCode: 200, headers: { 'Audio-Latency': 0 } };
    }

    if (method === 'FLUSHBUFFERED') {
      return this.handleAirPlay2FlushBufferedRequest(request);
    }

    if (method === 'FLUSH') {
      return this.handleAirPlay2FlushRequest(request);
    }

    if (method === 'SET_PARAMETER') {
      return this.handleAirPlay2SetParameterRequest(request, contentTypeText);
    }

    if (method === 'GET_PARAMETER') {
      return this.handleAirPlay2GetParameterRequest(request, contentTypeText);
    }

    if (method === 'SETRATEANCHORTIME') {
      return this.handleAirPlay2SetRateAnchorTimeRequest(request);
    }

    if (method === 'PAUSE') {
      if (this.airPlay2StreamState?.streamType === airPlay2BufferedStreamType) {
        const state = this.airPlay2StreamState;
        state.bufferedPlaying = false;
        state.bufferedRate = 0;
        if (state.bufferedStartTimer) {
          clearTimeout(state.bufferedStartTimer);
          state.bufferedStartTimer = null;
        }
      }
      await this.pauseAirPlay2ActivePlayback('AirPlay 2 PAUSE acknowledged');
      this.addDebugEvent('pause', 'AirPlay 2 PAUSE acknowledged', { method, path, statusCode: 200 });
      return { statusCode: 200 };
    }

    if (method === 'TEARDOWN') {
      return this.handleAirPlay2TeardownRequest(request, contentTypeText);
    }

    if (method === 'POST' && path === '/pair-setup-pin') {
      const summary = this.summarizeAirPlay2ProbeBody(path, contentTypeText, body);
      this.addDebugEvent('pairing', summary, { method, path, statusCode: 501 });
      return { statusCode: 501 };
    }

    if (
      method === 'POST' && path === '/feedback'
    ) {
      const state = this.airPlay2StreamState;
      const sampleRate = state?.pcmFormat?.sampleRate
        ?? state?.alacFormat?.sampleRate
        ?? state?.aacFormat?.sampleRate
        ?? defaultSampleRate;
      const responseBody = encodeAirPlay2Bplist(state
        ? {
          streams: [{
            type: state.streamType ?? airPlay2RealtimeStreamType,
            sr: sampleRate,
            controlPort: state.controlPort,
            dataPort: state.dataPort,
            ...(state.audioBufferSize > 0 ? { audioBufferSize: state.audioBufferSize } : {}),
            streamID: state.streamId,
          }],
        }
        : {});
      this.addDebugEvent('feedback', 'AirPlay 2 stream feedback sent', { method, path, statusCode: 200 });
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/x-apple-binary-plist' },
        body: responseBody,
      };
    }

    if (method === 'POST' && path === '/configure') {
      this.addDebugEvent('configure', 'AirPlay 2 accessory configuration acknowledged', {
        method,
        path,
        statusCode: 200,
      });
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/x-apple-binary-plist' },
        body: encodeAirPlay2Bplist({}),
      };
    }

    if (
      method === 'SETPEERS' || method === 'SETPEERSX'
    ) {
      const decoded = body.length > 0 ? decodeAirPlay2Bplist(body) : { value: [], error: null };
      if (decoded.error || decoded.value === null) {
        this.addDebugEvent('timing', `AirPlay 2 ${method} plist parse failed: ${decoded.error ?? 'empty value'}`, {
          method,
          path,
          statusCode: 400,
        });
        return { statusCode: 400 };
      }
      const addresses = collectAirPlay2PeerAddresses(decoded.value);
      const remoteAddress = normalizeAirPlay2RemoteAddress(request.remoteAddress);
      if (remoteAddress) addresses.add(remoteAddress);
      this.airPlay2PtpClock.setPeerAddresses([...addresses]);
      this.addDebugEvent('timing', `AirPlay 2 ${method} updated PTP peers: ${[...addresses].join(', ') || 'any'}`, {
        method,
        path,
        statusCode: 200,
      });
      return { statusCode: 200 };
    }

    if (
      method === 'POST' && (path === '/command' || path === '/audioMode')
    ) {
      const message = body.length > 0
        ? `AirPlay 2 probe request acknowledged; ${this.summarizeAirPlay2ProbeBody(path, contentTypeText, body)}`
        : 'AirPlay 2 probe request acknowledged';
      this.addDebugEvent('probe', message, { method, path, statusCode: 200 });
      return { statusCode: 200 };
    }

    this.addDebugEvent('probe', 'AirPlay 2 probe request is not implemented yet', { method, path, statusCode: 501 });
    return { statusCode: 501 };
  }

  private handleAirPlay2PairSetupRequest(
    method: string,
    path: string,
    contentType: string | null,
    body: Buffer,
  ): AirPlay2ProbeResponse {
    const parsed = parseAirPlay2Tlv(body);
    if (!parsed.fields) {
      this.addDebugEvent('pair-setup', `${contentType ? `content-type=${contentType}; ` : ''}${parsed.error}`, { method, path, statusCode: 400 });
      return { statusCode: 400 };
    }

    const state = getAirPlay2TlvByte(parsed.fields, 6);
    if (state === 1) {
      return this.handleAirPlay2PairSetupM1(method, path, parsed.fields);
    }
    if (state === 3) {
      return this.handleAirPlay2PairSetupM3(method, path, parsed.fields);
    }
    if (state === 5) {
      return this.handleAirPlay2PairSetupM5(method, path, parsed.fields);
    }

    const summary = this.summarizeAirPlay2ProbeBody(path, contentType, body);
    this.addDebugEvent('pair-setup', `unsupported state=${state ?? 'missing'}; ${summary}`, { method, path, statusCode: 501 });
    return { statusCode: 501 };
  }

  private handleAirPlay2PairVerifyRequest(
    method: string,
    path: string,
    contentType: string | null,
    body: Buffer,
  ): AirPlay2ProbeResponse {
    const parsed = parseAirPlay2Tlv(body);
    if (!parsed.fields) {
      this.addDebugEvent('pair-verify', `${contentType ? `content-type=${contentType}; ` : ''}${parsed.error}`, { method, path, statusCode: 400 });
      return { statusCode: 400 };
    }

    const state = getAirPlay2TlvByte(parsed.fields, 6);
    if (state === 1) {
      return this.handleAirPlay2PairVerifyM1(method, path, parsed.fields);
    }
    if (state === 3) {
      return this.handleAirPlay2PairVerifyM3(method, path, parsed.fields);
    }

    this.addDebugEvent('pair-verify', `unsupported state=${state ?? 'missing'}`, { method, path, statusCode: 400 });
    return { statusCode: 400 };
  }

  private async handleAirPlay2SetupRequest(request: AirPlay2ProbeRequest): Promise<AirPlay2ProbeResponse> {
    const setupStreams = parseAirPlay2SetupStreams(request.body);
    const isStreamSetup = setupStreams.streams.length > 0 || request.body.includes(Buffer.from('streams', 'ascii'));
    if (setupStreams.error && request.body.subarray(0, 8).toString('ascii') === 'bplist00') {
      this.addDebugEvent('setup', `AirPlay 2 setup plist parse failed: ${setupStreams.error}`, {
        method: request.method,
        path: request.path,
        statusCode: null,
      });
    }
    if (isStreamSetup) {
      return this.handleAirPlay2StreamSetup(request, setupStreams.streams[0] ?? null);
    }
    return this.handleAirPlay2SessionSetup(request);
  }

  private async handleAirPlay2SetParameterRequest(
    request: AirPlay2ProbeRequest,
    contentType: string | null,
  ): Promise<AirPlay2ProbeResponse> {
    const contentTypeLower = contentType?.toLowerCase() ?? '';
    const details: string[] = [];
    if (contentTypeLower.includes('text/parameters')) {
      const parameters = parseAirPlayTextParameters(request.body);
      if (parameters.volume !== undefined) {
        const volume = normalizeVolume(parameters.volume);
        try {
          await this.audioSession.setOutput({ volume: volume / 100 });
        } catch (error) {
          const message = `AirPlay 2 volume update failed: ${error instanceof Error ? error.message : String(error)}`;
          this.addDebugEvent('set-parameter', message, {
            method: request.method,
            path: request.path,
            statusCode: 500,
          });
          this.setStatus({ state: 'error', error: message });
          return { statusCode: 500 };
        }
        this.setStatus({ volume });
        details.push(`volume=${volume}`);
      }
      const progress = parseAirPlayProgressParameter(
        parameters.progress,
        this.airPlay2StreamState?.pcmFormat?.sampleRate
          ?? this.airPlay2StreamState?.alacFormat?.sampleRate
          ?? this.airPlay2StreamState?.aacFormat?.sampleRate
          ?? defaultSampleRate,
      );
      if (progress) {
        this.setPositionAnchor(progress.positionSeconds, progress.durationSeconds);
        this.setStatus({
          positionSeconds: progress.positionSeconds,
          durationSeconds: progress.durationSeconds,
        });
        details.push(`progress=${progress.positionSeconds.toFixed(3)}/${progress.durationSeconds.toFixed(3)}`);
      }
    } else if (contentTypeLower.includes('application/x-dmap-tagged')) {
      const parsed = parseAirPlayDmapMetadata(request.body);
      if (parsed.metadata) {
        const metadata = metadataFromDmap(parsed.metadata, this.status.metadata, this.status.artworkUrl);
        const nextMetadataIdentityKey = metadataIdentityKey(metadata);
        const metadataChanged = Boolean(
          nextMetadataIdentityKey && nextMetadataIdentityKey !== this.currentMetadataIdentityKey,
        );
        const nextPositionSeconds = metadataChanged ? 0 : this.estimatePosition(this.status);
        this.currentMetadataIdentityKey = nextMetadataIdentityKey;
        this.setPositionAnchor(nextPositionSeconds, metadata.durationSeconds);
        this.setStatus({
          metadata,
          currentLyricLine: metadataChanged ? null : this.status.currentLyricLine,
          durationSeconds: metadata.durationSeconds,
          positionSeconds: nextPositionSeconds,
        });
        details.push(
          `metadata=${JSON.stringify(metadata.title)}/${JSON.stringify(metadata.artist)}`,
          `duration=${metadata.durationSeconds.toFixed(3)}`,
        );
      } else if (parsed.error === 'DMAP body contains no supported metadata atoms.') {
        details.push('metadata=unsupported-atoms');
      } else {
        this.addDebugEvent('set-parameter', `AirPlay 2 DMAP metadata rejected: ${parsed.error ?? 'unknown parse error'}`, {
          method: request.method,
          path: request.path,
          statusCode: 400,
        });
        return { statusCode: 400 };
      }
    } else if (contentTypeLower.startsWith('image/')) {
      this.applyArtworkEvent({
        type: 'artwork',
        data: request.body,
        mimeType: contentTypeLower,
      });
      details.push(`artwork=${request.body.length}b`);
    }

    const message = details.length > 0
      ? `AirPlay 2 SET_PARAMETER applied; ${details.join(' ')}`
      : request.body.length > 0
        ? `AirPlay 2 SET_PARAMETER acknowledged; ${this.summarizeAirPlay2ProbeBody(request.path, contentType, request.body)}`
        : 'AirPlay 2 SET_PARAMETER acknowledged';
    this.addDebugEvent('set-parameter', message, {
      method: request.method,
      path: request.path,
      statusCode: 200,
    });
    return { statusCode: 200 };
  }

  private handleAirPlay2GetParameterRequest(
    request: AirPlay2ProbeRequest,
    contentType: string | null,
  ): AirPlay2ProbeResponse {
    const contentTypeLower = contentType?.toLowerCase() ?? '';
    if (!contentTypeLower.includes('text/parameters')) {
      this.addDebugEvent('get-parameter', 'AirPlay 2 GET_PARAMETER acknowledged', {
        method: request.method,
        path: request.path,
        statusCode: 200,
      });
      return { statusCode: 200 };
    }

    const requested = new Set(parseAirPlayRequestedParameters(request.body));
    const responseLines: string[] = [];
    if (requested.has('volume')) {
      responseLines.push(`volume: ${volumePercentToAirPlayDb(this.status.volume)}`);
    }
    if (requested.has('progress')) {
      const sampleRate = this.airPlay2StreamState?.pcmFormat?.sampleRate
        ?? this.airPlay2StreamState?.alacFormat?.sampleRate
        ?? this.airPlay2StreamState?.aacFormat?.sampleRate
        ?? defaultSampleRate;
      const currentFrame = Math.max(0, Math.round(this.estimatePosition(this.status) * sampleRate));
      const endFrame = this.status.durationSeconds > 0
        ? Math.max(currentFrame, Math.round(this.status.durationSeconds * sampleRate))
        : currentFrame;
      responseLines.push(`progress: 0/${currentFrame}/${endFrame}`);
    }
    const body = responseLines.length > 0 ? `${responseLines.join('\r\n')}\r\n` : '';
    this.addDebugEvent(
      'get-parameter',
      responseLines.length > 0
        ? `AirPlay 2 GET_PARAMETER response; ${responseLines.join(' ')}`
        : 'AirPlay 2 GET_PARAMETER response empty',
      { method: request.method, path: request.path, statusCode: 200 },
    );
    return {
      statusCode: 200,
      headers: body ? { 'Content-Type': 'text/parameters' } : undefined,
      body,
    };
  }

  private async handleAirPlay2FlushRequest(request: AirPlay2ProbeRequest): Promise<AirPlay2ProbeResponse> {
    const state = this.airPlay2StreamState;
    this.airPlay2RtpReorderBuffer.reset();
    if (state) {
      state.lastSequenceNumber = null;
      state.lastTimestamp = null;
    }
    if (state && !await this.resetAirPlay2PlaybackForFlush(state, 'AirPlay 2 FLUSH discarded active PCM')) {
      return { statusCode: 500 };
    }
    this.addDebugEvent(
      'flush',
      request.headers['rtp-info'] ?? 'AirPlay 2 flush acknowledged; decoder and native PCM queues reset',
      { method: request.method, path: request.path, statusCode: 200 },
    );
    return { statusCode: 200 };
  }

  private async handleAirPlay2FlushBufferedRequest(request: AirPlay2ProbeRequest): Promise<AirPlay2ProbeResponse> {
    const decoded = request.body.length > 0 ? decodeAirPlay2Bplist(request.body) : { value: {}, error: null };
    if (decoded.error) {
      this.addDebugEvent('flush', `AirPlay 2 FLUSHBUFFERED plist parse failed: ${decoded.error}`, {
        method: request.method,
        path: request.path,
        statusCode: 400,
      });
      return { statusCode: 400 };
    }
    const root = isAirPlay2BplistRecord(decoded.value) ? decoded.value : {};
    const flushFrom = getAirPlay2BplistNumber(root.flushFromSeq);
    const flushUntil = getAirPlay2BplistNumber(root.flushUntilSeq);
    const state = this.airPlay2StreamState;
    if (state?.streamType === airPlay2BufferedStreamType) {
      this.airPlay2RtpReorderBuffer.reset();
      if (state.bufferedStartTimer) clearTimeout(state.bufferedStartTimer);
      state.bufferedPackets.length = 0;
      state.bufferedBytes = 0;
      state.bufferedPlaying = false;
      state.bufferedRate = 0;
      state.bufferedAnchorRtpTime = null;
      state.bufferedAnchorMasterTimeNanoseconds = null;
      state.bufferedAnchorTimelineId = null;
      state.bufferedStartTimer = null;
      state.lastSequenceNumber = null;
      state.lastTimestamp = null;
      if (!await this.resetAirPlay2PlaybackForFlush(state, 'AirPlay 2 FLUSHBUFFERED discarded active PCM')) {
        return { statusCode: 500 };
      }
    }
    this.addDebugEvent(
      'flush',
      `AirPlay 2 FLUSHBUFFERED cleared queued audio from=${flushFrom ?? 'unknown'} until=${flushUntil ?? 'unknown'}`,
      { method: request.method, path: request.path, statusCode: 200 },
    );
    return { statusCode: 200 };
  }

  private async resetAirPlay2PlaybackForFlush(state: AirPlay2StreamState, reason: string): Promise<boolean> {
    if (this.airPlay2StreamState !== state) return false;
    if (this.pcmStream || this.pcmPlaybackStarted) await this.pauseAirPlay2ActivePlayback(reason);
    if (!state.aacDecoder) return true;
    try {
      await state.aacDecoder.reset();
      this.addDebugEvent('aac', 'AirPlay 2 AAC-LC decoder reset after flush');
      return true;
    } catch (error) {
      const message = `AirPlay 2 AAC-LC decoder reset failed: ${error instanceof Error ? error.message : String(error)}`;
      this.addDebugEvent('aac', message);
      this.setStatus({ state: 'error', error: message });
      return false;
    }
  }

  private async handleAirPlay2SetRateAnchorTimeRequest(request: AirPlay2ProbeRequest): Promise<AirPlay2ProbeResponse> {
    const decoded = decodeAirPlay2Bplist(request.body);
    if (decoded.error || !isAirPlay2BplistRecord(decoded.value)) {
      this.addDebugEvent('anchor', `AirPlay 2 SETRATEANCHORTIME plist parse failed: ${decoded.error ?? 'root is not a dictionary'}`, {
        method: request.method,
        path: request.path,
        statusCode: 400,
      });
      return { statusCode: 400 };
    }
    const rate = getAirPlay2BplistNumber(decoded.value.rate);
    const rtpTime = getAirPlay2BplistNumber(decoded.value.rtpTime);
    const networkTimeSecs = getAirPlay2BplistBigInt(decoded.value.networkTimeSecs);
    const networkTimeFrac = getAirPlay2BplistBigInt(decoded.value.networkTimeFrac);
    const networkTimeTimelineId = getAirPlay2BplistBigInt(decoded.value.networkTimeTimelineID);
    const state = this.airPlay2StreamState;
    if (!state || state.streamType !== airPlay2BufferedStreamType || (rate !== 0 && rate !== 1)) {
      this.addDebugEvent('anchor', `AirPlay 2 SETRATEANCHORTIME rejected rate=${rate ?? 'missing'} buffered=${state?.streamType === airPlay2BufferedStreamType ? 'yes' : 'no'}`, {
        method: request.method,
        path: request.path,
        statusCode: 400,
      });
      return { statusCode: 400 };
    }

    if (rate === 0) {
      if (state.bufferedStartTimer) clearTimeout(state.bufferedStartTimer);
      state.bufferedStartTimer = null;
      state.bufferedPlaying = false;
      state.bufferedRate = 0;
      await this.pauseAirPlay2ActivePlayback('AirPlay 2 buffered anchor paused');
    } else {
      const ptpSession = this.airPlay2SessionSetupInfo?.timingProtocol?.toUpperCase() === 'PTP';
      if (
        ptpSession &&
        (rtpTime === null || networkTimeSecs === null || networkTimeFrac === null || networkTimeTimelineId === null)
      ) {
        this.addDebugEvent('anchor', 'AirPlay 2 PTP anchor is missing rtpTime, networkTimeSecs, networkTimeFrac, or networkTimeTimelineID', {
          method: request.method,
          path: request.path,
          statusCode: 400,
        });
        return { statusCode: 400 };
      }
      state.bufferedRate = 1;
      state.bufferedPlaying = false;
      state.bufferedAnchorRtpTime = rtpTime === null ? null : rtpTime >>> 0;
      state.bufferedAnchorMasterTimeNanoseconds = networkTimeSecs === null || networkTimeFrac === null
        ? null
        : networkTimeSecs * 1_000_000_000n + (networkTimeFrac * 1_000_000_000n >> 64n);
      state.bufferedAnchorTimelineId = networkTimeTimelineId;
      const queuedPacketCount = state.bufferedPackets.length;
      const startState = this.scheduleAirPlay2BufferedStart(state);
      this.addDebugEvent(
        'anchor',
        `AirPlay 2 buffered anchor ${startState} rtpTime=${rtpTime ?? 'unknown'} masterNs=${state.bufferedAnchorMasterTimeNanoseconds ?? 'unknown'} timeline=${networkTimeTimelineId?.toString(16) ?? 'unknown'} queuedPackets=${queuedPacketCount} remainingPackets=${state.bufferedPackets.length}`,
        { method: request.method, path: request.path, statusCode: 200 },
      );
    }
    return { statusCode: 200 };
  }

  private handleAirPlay2PtpSample(): void {
    const state = this.airPlay2StreamState;
    if (state?.streamType === airPlay2BufferedStreamType && state.bufferedRate === 1 && !state.bufferedPlaying) {
      this.scheduleAirPlay2BufferedStart(state);
    }
  }

  private scheduleAirPlay2BufferedStart(state: AirPlay2StreamState): 'started' | 'scheduled' | 'waiting-for-clock' | 'waiting-for-packet' {
    if (this.airPlay2StreamState !== state || state.bufferedRate !== 1) return 'waiting-for-clock';
    if (state.bufferedStartTimer) {
      clearTimeout(state.bufferedStartTimer);
      state.bufferedStartTimer = null;
    }
    const ptpSession = this.airPlay2SessionSetupInfo?.timingProtocol?.toUpperCase() === 'PTP';
    if (!ptpSession) {
      state.bufferedPlaying = true;
      this.drainAirPlay2BufferedPackets(state);
      return 'started';
    }
    const firstPacket = state.bufferedPackets[0]?.packet;
    if (!firstPacket) return 'waiting-for-packet';
    if (
      state.bufferedAnchorRtpTime === null ||
      state.bufferedAnchorMasterTimeNanoseconds === null ||
      state.bufferedAnchorTimelineId === null
    ) {
      return 'waiting-for-clock';
    }
    const anchorLocalTime = this.airPlay2PtpClock.localTimeForMasterTime(
      state.bufferedAnchorMasterTimeNanoseconds,
      state.bufferedAnchorTimelineId,
    );
    if (anchorLocalTime === null) return 'waiting-for-clock';
    const sampleRate = state.pcmFormat?.sampleRate
      ?? state.alacFormat?.sampleRate
      ?? state.aacFormat?.sampleRate
      ?? defaultSampleRate;
    const timestampDelta = airPlay2RtpTimestampDelta(firstPacket.timestamp, state.bufferedAnchorRtpTime);
    const packetLocalTime = anchorLocalTime + BigInt(timestampDelta) * 1_000_000_000n / BigInt(sampleRate);
    const startAt = packetLocalTime - airPlay2OutputLeadNanoseconds;
    const nowNanoseconds = BigInt(Math.round(this.now())) * 1_000_000n;
    const delayNanoseconds = startAt - nowNanoseconds;
    if (delayNanoseconds <= 0n) {
      state.bufferedPlaying = true;
      this.drainAirPlay2BufferedPackets(state);
      return 'started';
    }
    const delayMilliseconds = Math.max(1, Math.min(2_147_483_647, Number(delayNanoseconds / 1_000_000n)));
    state.bufferedStartTimer = setTimeout(() => {
      state.bufferedStartTimer = null;
      this.scheduleAirPlay2BufferedStart(state);
    }, delayMilliseconds);
    state.bufferedStartTimer.unref?.();
    return 'scheduled';
  }

  private async handleAirPlay2SessionSetup(request: AirPlay2ProbeRequest): Promise<AirPlay2ProbeResponse> {
    const setupInfo = parseAirPlay2SetupSessionInfo(request.body);
    if (setupInfo.error && request.body.subarray(0, 8).toString('ascii') === 'bplist00') {
      this.addDebugEvent('setup', `AirPlay 2 session setup plist parse failed: ${setupInfo.error}`, {
        method: request.method,
        path: request.path,
        statusCode: 400,
      });
      return { statusCode: 400 };
    }
    this.airPlay2SessionSetupInfo = setupInfo.info;
    await this.airPlay2NtpSession.stop();
    const remoteAddress = normalizeAirPlay2RemoteAddress(request.remoteAddress);
    const requestedTimingProtocol = setupInfo.info?.timingProtocol?.toUpperCase() ?? null;
    if (requestedTimingProtocol === 'PTP' && this.airPlay2TimingMode !== 'ptp') {
      this.addDebugEvent('timing', 'AirPlay 2 sender requested PTP while the PTP backend is unavailable', {
        method: request.method,
        path: request.path,
        statusCode: 501,
      });
      return { statusCode: 501 };
    }
    if (requestedTimingProtocol === 'PTP') {
      this.airPlay2PtpClock.setPeerAddresses(remoteAddress ? [remoteAddress] : []);
    }
    const remoteTimingPort = setupInfo.info?.timingPort ?? null;
    let timingPort = 0;
    if (requestedTimingProtocol === 'NTP' && remoteAddress && remoteTimingPort) {
      try {
        timingPort = await this.airPlay2NtpSession.start(remoteAddress, remoteTimingPort);
      } catch (error) {
        this.addDebugEvent('timing', `AirPlay 2 timing startup failed: ${error instanceof Error ? error.message : String(error)}`, {
          method: request.method,
          path: request.path,
          statusCode: 500,
        });
      }
    } else if (requestedTimingProtocol === 'NTP') {
      this.addDebugEvent('timing', 'AirPlay 2 sender requested NTP without a usable timingPort or remote address', {
        method: request.method,
        path: request.path,
        statusCode: 400,
      });
    }
    let eventPort: number;
    try {
      eventPort = await this.ensureAirPlay2EventServer();
    } catch (error) {
      this.addDebugEvent('event', `AirPlay 2 event server startup failed: ${error instanceof Error ? error.message : String(error)}`, {
        method: request.method,
        path: request.path,
        statusCode: 500,
      });
      return { statusCode: 500 };
    }
    const body = encodeAirPlay2Bplist({
      eventPort,
      timingPort,
      timingPeerInfo: {
        Addresses: [normalizeAirPlay2RemoteAddress(request.localAddress) ?? this.advertisedInterface?.address ?? '127.0.0.1'],
        ID: this.airPlay2DeviceIdentifier(),
      },
    });
    this.addDebugEvent('setup', `AirPlay 2 session setup acknowledged; eventPort=${eventPort} timingPort=${timingPort}; ${summarizeAirPlay2SessionSetupInfo(setupInfo.info)}`, {
      method: request.method,
      path: request.path,
      statusCode: 200,
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/x-apple-binary-plist' },
      body,
    };
  }

  private async handleAirPlay2TeardownRequest(
    request: AirPlay2ProbeRequest,
    contentType: string | null,
  ): Promise<AirPlay2ProbeResponse> {
    const { method, path, body } = request;
    const setupStreams = body.length > 0 ? parseAirPlay2SetupStreams(body) : { streams: [], error: null };
    if (setupStreams.error && body.subarray(0, 8).toString('ascii') === 'bplist00') {
      this.addDebugEvent('teardown', `AirPlay 2 teardown plist parse failed: ${setupStreams.error}`, {
        method,
        path,
        statusCode: null,
      });
    }

    if (setupStreams.streams.length > 0) {
      await this.pauseAirPlay2ActivePlayback(
        `AirPlay 2 TEARDOWN paused active stream; ${setupStreams.streams.map(summarizeAirPlay2SetupStream).join('; ')}`,
      );
      this.addDebugEvent('teardown', 'AirPlay 2 TEARDOWN acknowledged as pause; stream ports retained', {
        method,
        path,
        statusCode: 200,
      });
      return { statusCode: 200 };
    }

    await this.stopAirPlay2SessionResources();
    this.airPlay2DacpRemote.clear();
    await this.stopAirPlay2ActivePlayback('AirPlay 2 TEARDOWN disconnected');
    this.addDebugEvent('teardown', body.length > 0 ? this.summarizeAirPlay2ProbeBody(path, contentType, body) : 'AirPlay 2 teardown disconnected', {
      method,
      path,
      statusCode: 200,
    });
    return { statusCode: 200 };
  }

  private async handleAirPlay2StreamSetup(
    request: AirPlay2ProbeRequest,
    streamInfo: AirPlay2SetupStreamInfo | null,
  ): Promise<AirPlay2ProbeResponse> {
    const streamType = streamInfo?.type ?? airPlay2RealtimeStreamType;
    const isBuffered = streamType === airPlay2BufferedStreamType;
    if (streamType !== airPlay2RealtimeStreamType && !isBuffered) {
      this.addDebugEvent(
        'setup',
        `AirPlay 2 stream setup rejected; ${summarizeAirPlay2SetupStream(streamInfo)}; supported audio stream types are realtime 96 and buffered 103`,
        { method: request.method, path: request.path, statusCode: 501 },
      );
      return { statusCode: 501 };
    }

    const compressionType = streamInfo?.compressionType ?? null;
    let pcmFormat = resolveAirPlay2PcmFormat(streamInfo);
    let alacFormat = resolveAirPlay2AlacFormat(streamInfo);
    let aacFormat = resolveAirPlay2AacFormat(streamInfo);
    if (compressionType === 1) {
      alacFormat = null;
      aacFormat = null;
    } else if (compressionType === 2) {
      pcmFormat = null;
      aacFormat = null;
    } else if (compressionType === 4) {
      pcmFormat = null;
      alacFormat = null;
      if (!isBuffered) {
        this.addDebugEvent(
          'setup',
          `AirPlay 2 stream setup rejected; ${summarizeAirPlay2SetupStream(streamInfo)}; AAC-LC requires buffered stream type 103`,
          { method: request.method, path: request.path, statusCode: 501 },
        );
        return { statusCode: 501 };
      }
    } else if (compressionType !== null) {
      this.addDebugEvent(
        'setup',
        `AirPlay 2 stream setup rejected; ${summarizeAirPlay2SetupStream(streamInfo)}; supported path requires LPCM ct=1, ALAC ct=2, or buffered AAC-LC ct=4`,
        { method: request.method, path: request.path, statusCode: 501 },
      );
      return { statusCode: 501 };
    }

    if (!pcmFormat && !alacFormat && !aacFormat) {
      this.addDebugEvent(
        'setup',
        `AirPlay 2 stream setup rejected; ${summarizeAirPlay2SetupStream(streamInfo)}; supported path requires LPCM or ALAC, or buffered AAC-LC; requested audio format is not supported`,
        { method: request.method, path: request.path, statusCode: 501 },
      );
      return { statusCode: 501 };
    }
    const supportsClearRtp = this.airPlay2SessionSetupInfo?.encryptionType === 0
      && !this.airPlay2SessionSetupInfo.encryptionKey;
    if ((!streamInfo?.sharedKey || streamInfo.sharedKey.length !== 32) && !supportsClearRtp) {
      this.addDebugEvent(
        'setup',
        `AirPlay 2 stream setup rejected; ${summarizeAirPlay2SetupStream(streamInfo)}; encrypted RTP requires a 32-byte shared key`,
        { method: request.method, path: request.path, statusCode: 501 },
      );
      return { statusCode: 501 };
    }

    let alacDecoder: AirPlay2AlacDecoder | null = null;
    if (alacFormat) {
      try {
        alacDecoder = await this.createAirPlay2AlacDecoder(alacFormat);
      } catch (error) {
        this.addDebugEvent(
          'setup',
          `AirPlay 2 stream setup rejected; ${summarizeAirPlay2SetupStream(streamInfo)}; ALAC decoder unavailable: ${error instanceof Error ? error.message : String(error)}`,
          { method: request.method, path: request.path, statusCode: 501 },
        );
        return { statusCode: 501 };
      }
    }

    let aacDecoder: AirPlay2AacDecoderLike | null = null;
    let activeAacState: AirPlay2StreamState | null = null;
    const remoteAddress = normalizeAirPlay2RemoteAddress(request.remoteAddress) ?? 'unknown';
    if (aacFormat) {
      try {
        aacDecoder = await this.createAirPlay2AacDecoder(aacFormat, {
          onPcm: (chunk) => {
            if (activeAacState && this.airPlay2StreamState === activeAacState) {
              this.writeAirPlay2F32lePayload(chunk, activeAacState, remoteAddress, 'AAC-LC');
            }
          },
          onDiagnostic: (message) => this.addDebugEvent('aac', message),
          onFailure: (error) => {
            if (activeAacState && this.airPlay2StreamState === activeAacState) {
              this.addDebugEvent('aac', error.message);
              this.setStatus({ state: 'error', error: error.message });
            }
          },
        });
      } catch (error) {
        this.addDebugEvent(
          'setup',
          `AirPlay 2 stream setup rejected; ${summarizeAirPlay2SetupStream(streamInfo)}; AAC-LC decoder unavailable: ${error instanceof Error ? error.message : String(error)}`,
          { method: request.method, path: request.path, statusCode: 501 },
        );
        return { statusCode: 501 };
      }
    }

    const transportOptions: AirPlay2UdpTransportOptions = {
      onData: (packet, remote, retransmitted) => {
        this.handleAirPlay2TransportDataPacket(packet, remote, retransmitted);
      },
      onSync: (sync, remote) => {
        this.handleAirPlay2RtpSync(sync, remote);
      },
      onDiagnostic: (message) => this.addDebugEvent('rtcp', message, {
        method: 'UDP',
        path: '/airplay2/control',
        statusCode: null,
      }),
    };
    const audioTransport: AirPlay2AudioTransportLike = isBuffered
      ? new AirPlay2BufferedTransport(transportOptions)
      : new AirPlay2UdpTransport(transportOptions);
    let controlPort: number;
    let dataPort: number;
    try {
      ({ controlPort, dataPort } = await audioTransport.start());
    } catch (error) {
      alacDecoder?.close();
      await aacDecoder?.stop();
      this.addDebugEvent(
        'setup',
        `AirPlay 2 stream setup rejected; ${isBuffered ? 'buffered TCP' : 'realtime UDP'} transport unavailable: ${error instanceof Error ? error.message : String(error)}`,
        { method: request.method, path: request.path, statusCode: 500 },
      );
      return { statusCode: 500 };
    }
    audioTransport.configureRemoteControl(
      normalizeAirPlay2RemoteAddress(request.remoteAddress),
      streamInfo?.remoteControlPort ?? null,
    );
    const closeCandidateStream = async (): Promise<void> => {
      await audioTransport.stop().catch((error) => {
        this.addDebugEvent('setup', `AirPlay 2 candidate transport cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      });
      try {
        alacDecoder?.close();
      } catch (error) {
        this.addDebugEvent('setup', `AirPlay 2 candidate ALAC decoder cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      await aacDecoder?.stop().catch((error) => {
        this.addDebugEvent('setup', `AirPlay 2 candidate AAC decoder cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    };
    const previousTransport = this.airPlay2AudioTransport;
    try {
      await previousTransport?.stop();
      this.airPlay2AudioTransport = null;
      await this.closeAirPlay2StreamState();
    } catch (error) {
      await closeCandidateStream();
      this.addDebugEvent(
        'setup',
        `AirPlay 2 stream replacement cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
        { method: request.method, path: request.path, statusCode: 500 },
      );
      return { statusCode: 500 };
    }
    if (!await this.resetAirPlay2PlaybackForNewStream()) {
      await closeCandidateStream();
      this.addDebugEvent(
        'setup',
        'AirPlay 2 stream setup rejected because the previous Audio Core PCM session could not stop cleanly',
        { method: request.method, path: request.path, statusCode: 500 },
      );
      return { statusCode: 500 };
    }
    this.airPlay2AudioTransport = audioTransport;
    const streamId = randomBytes(4).readUInt32BE(0);
    this.airPlay2StreamState = {
      dataPort,
      controlPort,
      streamType,
      compressionType: streamInfo?.compressionType ?? null,
      audioFormat: streamInfo?.audioFormat ?? null,
      framesPerPacket: streamInfo?.framesPerPacket ?? null,
      sharedKey: streamInfo?.sharedKey ?? null,
      pcmFormat,
      alacFormat,
      alacDecoder,
      aacFormat,
      aacDecoder,
      packetCount: 0,
      byteCount: 0,
      decryptedPacketCount: 0,
      decodedPacketCount: 0,
      decryptFailureCount: 0,
      retransmittedPacketCount: 0,
      firstPacketAt: null,
      lastSequenceNumber: null,
      lastTimestamp: null,
      lastSync: null,
      streamId,
      audioBufferSize: isBuffered ? airPlay2BufferedAudioBufferBytes : 0,
      bufferedPackets: [],
      bufferedBytes: 0,
      bufferedPlaying: !isBuffered,
      bufferedRate: isBuffered ? 0 : 1,
      bufferedAnchorRtpTime: null,
      bufferedAnchorMasterTimeNanoseconds: null,
      bufferedAnchorTimelineId: null,
      bufferedStartTimer: null,
    };
    activeAacState = this.airPlay2StreamState;
    const responseStream: { [key: string]: AirPlay2BplistValue } = {
      type: streamType,
      controlPort,
      dataPort,
    };
    if (isBuffered) {
      responseStream.audioBufferSize = airPlay2BufferedAudioBufferBytes;
      responseStream.streamID = streamId;
    }
    const body = encodeAirPlay2Bplist({
      streams: [responseStream],
    });
    const codec = aacFormat ? 'AAC-LC' : alacFormat ? 'ALAC' : 'LPCM';
    this.addDebugEvent('setup', `AirPlay 2 stream setup acknowledged; dataPort=${dataPort} controlPort=${controlPort} streamID=${streamId}; ${summarizeAirPlay2SetupStream(streamInfo)}; ${streamInfo?.sharedKey ? 'encrypted' : 'clear'} ${isBuffered ? 'buffered TCP' : 'realtime UDP'} ${codec} RTP ready`, {
      method: request.method,
      path: request.path,
      statusCode: 200,
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/x-apple-binary-plist' },
      body,
    };
  }

  private async ensureAirPlay2EventServer(): Promise<number> {
    if (this.airPlay2EventServer && this.airPlay2EventPort) {
      return this.airPlay2EventPort;
    }
    const server = createTcpServer((socket) => {
      this.airPlay2EventSockets.add(socket);
      socket.once('close', () => this.airPlay2EventSockets.delete(socket));
      this.handleAirPlay2EventConnection(socket);
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, () => {
        server.off('error', reject);
        resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('AirPlay 2 event server did not bind to a TCP port.');
    }
    this.airPlay2EventServer = server;
    this.airPlay2EventPort = address.port;
    return address.port;
  }

  private handleAirPlay2EventConnection(socket: Socket): void {
    const state = this.airPlay2EncryptedEventState;
    if (!state) {
      socket.on('data', (chunk) => {
        this.addDebugEvent('event', `AirPlay 2 unencrypted event channel data ${summarizeBuffer(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))}`);
      });
      socket.on('error', (error) => this.addDebugEvent('event', error.message));
      this.addDebugEvent('event', `AirPlay 2 event channel connected without an encryption context from ${airPlay2SocketPeer(socket)}`);
      return;
    }

    let encryptedBuffer = Buffer.alloc(0);
    let plaintextBuffer = Buffer.alloc(0);
    let readCounter = 0;
    socket.on('data', (chunk) => {
      encryptedBuffer = Buffer.concat([encryptedBuffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      try {
        while (encryptedBuffer.length >= 2) {
          const payloadLength = encryptedBuffer.readUInt16LE(0);
          if (payloadLength > airPlay2EncryptedFrameLimitBytes) {
            throw new Error(`AirPlay 2 encrypted event frame is too large: ${payloadLength}.`);
          }
          const frameLength = 2 + payloadLength + 16;
          if (encryptedBuffer.length < frameLength) break;
          const frame = encryptedBuffer.subarray(0, frameLength);
          encryptedBuffer = encryptedBuffer.subarray(frameLength);
          plaintextBuffer = Buffer.concat([
            plaintextBuffer,
            decryptAirPlay2ControlFrame(state.readKey, readCounter, frame),
          ]);
          readCounter += 1;
        }
        const headerEnd = plaintextBuffer.indexOf('\r\n\r\n');
        if (headerEnd >= 0) {
          const statusLine = plaintextBuffer.subarray(0, plaintextBuffer.indexOf('\r\n')).toString('utf8');
          this.addDebugEvent('event', `AirPlay 2 updateInfo event response received: ${statusLine}`, {
            method: 'EVENT',
            path: '/command',
            statusCode: statusLine.includes(' 200 ') ? 200 : null,
            remoteAddress: airPlay2SocketPeer(socket),
          });
          plaintextBuffer = plaintextBuffer.subarray(headerEnd + 4);
        }
      } catch (error) {
        this.addDebugEvent('event', `AirPlay 2 event response decrypt failed: ${error instanceof Error ? error.message : String(error)}`, {
          method: 'EVENT',
          path: '/command',
          statusCode: 400,
          remoteAddress: airPlay2SocketPeer(socket),
        });
        socket.end();
      }
    });
    socket.on('error', (error) => this.addDebugEvent('event', error.message));

    const request = this.createAirPlay2EventUpdateRequest();
    const encryptedRequest = encryptAirPlay2ControlFrames(state.writeKey, 0, request);
    socket.write(encryptedRequest.data);
    this.addDebugEvent(
      'event',
      `AirPlay 2 updateInfo event sent in ${encryptedRequest.frameCount} encrypted frame(s) key=${state.keyLabel}`,
      {
        method: 'POST',
        path: '/command',
        statusCode: null,
        remoteAddress: airPlay2SocketPeer(socket),
      },
    );
  }

  private handleAirPlay2TransportDataPacket(message: Buffer, remote: RemoteInfo, retransmitted: boolean): void {
    const state = this.airPlay2StreamState;
    const isBuffered = state?.streamType === airPlay2BufferedStreamType;
    const packet = isBuffered
      ? parseAirPlay2BufferedRtpPacket(message)
      : parseAirPlay2RtpPacket(message);
    const transportMethod = isBuffered ? 'TCP' : 'UDP';
    if (!packet) {
      this.addDebugEvent('rtp', `${remote.address}:${remote.port} invalid RTP ${summarizeBuffer(message)}`, {
        method: transportMethod,
        path: '/airplay2/data',
        statusCode: null,
      });
      return;
    }

    if (state) {
      state.packetCount += 1;
      state.byteCount += message.length;
      if (retransmitted) {
        state.retransmittedPacketCount += 1;
      }
      state.firstPacketAt ??= this.now();
      if (isBuffered) {
        state.bufferedPackets.push({ packet, remote });
        state.bufferedBytes += message.length;
        let droppedPackets = 0;
        while (state.bufferedBytes > airPlay2BufferedAudioBufferBytes && state.bufferedPackets.length > 0) {
          const dropped = state.bufferedPackets.shift();
          state.bufferedBytes -= dropped ? dropped.packet.headerLength + dropped.packet.payload.length : 0;
          droppedPackets += dropped ? 1 : 0;
        }
        if (droppedPackets > 0) {
          this.addDebugEvent('rtp', `AirPlay 2 buffered queue reached ${airPlay2BufferedAudioBufferBytes} bytes; dropped ${droppedPackets} oldest packet(s)`, {
            method: 'TCP',
            path: '/airplay2/data',
            statusCode: null,
          });
        }
        if (state.bufferedRate === 1 && !state.bufferedPlaying) {
          this.scheduleAirPlay2BufferedStart(state);
        } else {
          this.drainAirPlay2BufferedPackets(state);
        }
      } else {
        this.airPlay2RtpReorderBuffer.push(packet.sequenceNumber, { packet, remote });
      }
      return;
    }

    this.addDebugEvent('rtp', `${remote.address}:${remote.port} no stream state; ${summarizeAirPlay2RtpPacket(packet)}`, {
      method: transportMethod,
      path: '/airplay2/data',
      statusCode: null,
    });
  }

  private drainAirPlay2BufferedPackets(state: AirPlay2StreamState): void {
    if (this.airPlay2StreamState !== state || !state.bufferedPlaying) {
      return;
    }
    while (!this.pcmBackpressured && state.bufferedPackets.length > 0) {
      const queued = state.bufferedPackets.shift();
      if (!queued) {
        break;
      }
      state.bufferedBytes = Math.max(0, state.bufferedBytes - queued.packet.headerLength - queued.packet.payload.length);
      this.processAirPlay2RtpPacket(queued.packet, queued.remote);
    }
  }

  private handleAirPlay2RtpSync(sync: AirPlay2RtpSyncPacket, remote: RemoteInfo): void {
    const state = this.airPlay2StreamState;
    if (state) {
      state.lastSync = sync;
    }
    this.addDebugEvent(
      'rtcp',
      `${remote.address}:${remote.port} ${sync.protocol.toUpperCase()} sync currentRtp=${sync.currentRtpTimestamp} nextRtp=${sync.nextRtpTimestamp} ${sync.remoteNtpTimestamp !== null ? `remoteNtp=0x${sync.remoteNtpTimestamp.toString(16)}` : `remoteMonotonicNs=${sync.remoteMonotonicNanoseconds ?? 'unknown'} clock=${sync.clockIdentity?.toString('hex') ?? 'unknown'}`}`,
      { method: 'UDP', path: '/airplay2/control', statusCode: null },
    );
  }

  private processAirPlay2RtpPacket(packet: AirPlay2RtpPacket, remote: RemoteInfo): void {
    const state = this.airPlay2StreamState;
    if (!state) {
      return;
    }
    const previousSequence = state.lastSequenceNumber;
    state.lastSequenceNumber = packet.sequenceNumber;
    state.lastTimestamp = packet.timestamp;
    const sequenceMask = state.streamType === airPlay2BufferedStreamType ? 0xff_ffff : 0xffff;
    const expectedSequence = previousSequence === null ? null : (previousSequence + 1) & sequenceMask;
    const hasGap = expectedSequence !== null && packet.sequenceNumber !== expectedSequence;
    const gap = hasGap ? ` gap=${previousSequence}->${packet.sequenceNumber}` : '';
    let decryptSummary = state.sharedKey ? 'decrypted=pending' : 'clear=pending';
    let decryptFailedNow = false;
    try {
      const decodedPayload = state.sharedKey
        ? decryptAirPlay2RtpPayload(packet, state.sharedKey)
        : packet.payload;
      if (state.sharedKey) {
        state.decryptedPacketCount += 1;
        decryptSummary = `decrypted=${decodedPayload.length}b`;
      } else {
        decryptSummary = `clear=${decodedPayload.length}b`;
      }
      if (state.pcmFormat) {
        this.writeAirPlay2LpcmPayload(decodedPayload, state, remote);
        decryptSummary += '; pcm=f32le';
      } else if (state.alacDecoder && state.alacFormat) {
        const pcm = state.alacDecoder.decodeFrame(decodedPayload);
        if (pcm.length > 0) {
          state.decodedPacketCount += 1;
          this.writeAirPlay2S16lePayload(pcm, state, remote, 'ALAC');
          decryptSummary += `; alacPcm=${pcm.length}b; pcm=f32le`;
        } else {
          decryptSummary += '; alacPcm=0b';
        }
      } else if (state.aacDecoder && state.aacFormat) {
        if (!state.aacDecoder.writeFrame(decodedPayload)) {
          throw new Error('AAC-LC decoder rejected the input frame.');
        }
        state.decodedPacketCount += 1;
        decryptSummary += '; aac=queued';
      }
    } catch (error) {
      state.decryptFailureCount += 1;
      decryptFailedNow = true;
      decryptSummary = `decodeFailed=${state.decryptFailureCount}:${error instanceof Error ? error.message : String(error)}`;
    }
    if (state.packetCount === 1 || state.packetCount % 64 === 0 || hasGap || (decryptFailedNow && state.decryptFailureCount <= 3)) {
      this.addDebugEvent(
        'rtp',
        `${remote.address}:${remote.port} packets=${state.packetCount} bytes=${state.byteCount} decryptedPackets=${state.decryptedPacketCount} decodedPackets=${state.decodedPacketCount}${gap}; ${summarizeAirPlay2RtpPacket(packet)}; ${decryptSummary}`,
        { method: state.streamType === airPlay2BufferedStreamType ? 'TCP' : 'UDP', path: '/airplay2/data', statusCode: null },
      );
    }
  }

  private handleAirPlay2RtpGap(missingPackets: number): void {
    const state = this.airPlay2StreamState;
    const format = state?.pcmFormat ?? state?.alacFormat ?? state?.aacFormat ?? null;
    if (!state || !format || missingPackets <= 0) {
      return;
    }
    const framesPerPacket = Math.max(
      1,
      state.framesPerPacket ?? state.alacFormat?.framesPerPacket ?? (state.aacFormat ? 1_024 : 352),
    );
    const silenceBytes = missingPackets * framesPerPacket * format.channels * 4;
    this.addDebugEvent('rtp', `concealed ${missingPackets} missing packet(s) with ${silenceBytes} bytes of silence`);
    if (this.pcmStream && silenceBytes > 0) {
      this.writePcmChunk(Buffer.alloc(silenceBytes), 'AirPlay 2 RTP concealment');
    }
  }

  private writeAirPlay2LpcmPayload(decrypted: Buffer, state: AirPlay2StreamState, remote: RemoteInfo): void {
    if (!state.pcmFormat || decrypted.length === 0) {
      return;
    }

    if (!this.currentSourceId || !this.pcmStream) {
      this.prepareIncomingStream({ type: 'stream', remoteAddress: remote.address });
      this.addDebugEvent(
        'pcm',
        `AirPlay 2 LPCM started ${state.pcmFormat.sampleRate}/${state.pcmFormat.bitDepth}/${state.pcmFormat.channels}`,
      );
    }

    if (!this.currentSourceId || !this.pcmStream) {
      return;
    }

    if (!this.pcmPlaybackStarted) {
      this.pcmPlaybackStarted = true;
      const stream = this.pcmStream;
      const sourceId = this.currentSourceId;
      const { sampleRate, channels } = state.pcmFormat;
      void this.audioSession
        .playPcmStream({
          stream,
          sourceId,
          trackId: sourceId,
          sampleRate,
          channels,
          durationSeconds: this.status.durationSeconds,
          output: createAirPlayOutputSettings(),
        })
        .then(() => {
          if (this.currentSourceId === sourceId) {
            this.setStatus({ state: 'playing', error: null });
          }
        })
        .catch((error) => {
          if (this.currentSourceId === sourceId) {
            this.setStatus({
              state: 'error',
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });
    }

    const converted = convertAirPlay2LpcmToF32le(decrypted, state.pcmFormat);
    if (converted.length > 0) {
      this.writePcmChunk(converted, 'AirPlay 2 LPCM');
    }
  }

  private writeAirPlay2S16lePayload(
    pcm: Buffer,
    state: AirPlay2StreamState,
    remote: RemoteInfo,
    codec: string,
  ): void {
    const format = state.alacFormat;
    if (!format || pcm.length === 0) {
      return;
    }

    if (!this.currentSourceId || !this.pcmStream) {
      this.prepareIncomingStream({ type: 'stream', remoteAddress: remote.address });
      this.addDebugEvent(
        'pcm',
        `AirPlay 2 ${codec} started ${format.sampleRate}/${format.bitDepth}/${format.channels}`,
      );
    }

    if (!this.currentSourceId || !this.pcmStream) {
      return;
    }

    if (!this.pcmPlaybackStarted) {
      this.pcmPlaybackStarted = true;
      const stream = this.pcmStream;
      const sourceId = this.currentSourceId;
      const { sampleRate, channels } = format;
      void this.audioSession
        .playPcmStream({
          stream,
          sourceId,
          trackId: sourceId,
          sampleRate,
          channels,
          durationSeconds: this.status.durationSeconds,
          output: createAirPlayOutputSettings(),
        })
        .then(() => {
          if (this.currentSourceId === sourceId) {
            this.setStatus({ state: 'playing', error: null });
          }
        })
        .catch((error) => {
          if (this.currentSourceId === sourceId) {
            this.setStatus({
              state: 'error',
              error: error instanceof Error ? error.message : String(error),
            });
          }
        });
    }

    const evenLength = pcm.length - (pcm.length % 2);
    const converted = convertS16leToF32le(evenLength === pcm.length ? pcm : pcm.subarray(0, evenLength));
    if (converted.length > 0) {
      this.writePcmChunk(converted, `AirPlay 2 ${codec}`);
    }
  }

  private writeAirPlay2F32lePayload(
    pcm: Buffer,
    state: AirPlay2StreamState,
    remoteAddress: string,
    codec: string,
  ): void {
    const format = state.aacFormat;
    if (!format || pcm.length < 4) return;

    if (!this.currentSourceId || !this.pcmStream) {
      this.prepareIncomingStream({ type: 'stream', remoteAddress });
      this.addDebugEvent('pcm', `AirPlay 2 ${codec} started ${format.sampleRate}/float32/${format.channels}`);
    }
    if (!this.currentSourceId || !this.pcmStream) return;

    if (!this.pcmPlaybackStarted) {
      this.pcmPlaybackStarted = true;
      const stream = this.pcmStream;
      const sourceId = this.currentSourceId;
      void this.audioSession
        .playPcmStream({
          stream,
          sourceId,
          trackId: sourceId,
          sampleRate: format.sampleRate,
          channels: format.channels,
          durationSeconds: this.status.durationSeconds,
          output: createAirPlayOutputSettings(),
        })
        .then(() => {
          if (this.currentSourceId === sourceId) this.setStatus({ state: 'playing', error: null });
        })
        .catch((error) => {
          if (this.currentSourceId === sourceId) {
            this.setStatus({ state: 'error', error: error instanceof Error ? error.message : String(error) });
          }
        });
    }

    const alignedLength = pcm.length - (pcm.length % 4);
    if (alignedLength > 0) this.writePcmChunk(pcm.subarray(0, alignedLength), `AirPlay 2 ${codec}`);
  }

  private handleAirPlay2PairSetupM1(
    method: string,
    path: string,
    fields: Map<number, Buffer[]>,
  ): AirPlay2ProbeResponse {
    try {
      const requestMethod = getAirPlay2TlvByte(fields, 0);
      const flags = getAirPlay2TlvValue(fields, 19);
      const flagsValue = airPlay2TlvNumber(flags);
      const transient = (flagsValue & airPlay2PairingFlagTransient) !== 0;
      const salt = randomBytes(16);
      const verifier = createAirPlay2SrpVerifier(salt);
      const privateKey = createAirPlay2SrpPrivateKey();
      const publicKey = createAirPlay2SrpServerPublicKey(verifier, privateKey);
      this.airPlay2PairSetupState = {
        salt,
        privateKey,
        publicKey,
        verifier,
        sessionKey: null,
        transient,
      };
      this.airPlay2EncryptedControlState = null;
      this.airPlay2EncryptedControlCandidates = [];
      this.airPlay2EncryptedEventState = null;

      const responseFields: AirPlay2TlvField[] = [
        { type: 6, value: Buffer.from([2]) },
        { type: 2, value: salt },
        { type: 3, value: publicKey },
      ];
      if (flags) {
        responseFields.push({ type: 19, value: flags });
      }
      const flagSummary = flags ? ` flags=0x${flagsValue.toString(16)}` : '';
      const responseBody = encodeAirPlay2Tlv(responseFields);
      this.addDebugEvent(
        'pair-setup',
        `M1 accepted; M2 SRP salt/public key sent; pairMethod=${requestMethod ?? 'missing'}${flagSummary}`,
        { method, path, statusCode: 200 },
      );
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
        body: responseBody,
      };
    } catch (error) {
      this.addDebugEvent('pair-setup', error instanceof Error ? error.message : String(error), { method, path, statusCode: 400 });
      return { statusCode: 400 };
    }
  }

  private handleAirPlay2PairSetupM3(
    method: string,
    path: string,
    fields: Map<number, Buffer[]>,
  ): AirPlay2ProbeResponse {
    try {
      const state = this.airPlay2PairSetupState;
      if (!state) {
        throw new Error('Pair-Setup M3 arrived before a valid M1/M2 exchange.');
      }
      const clientPublicKey = getAirPlay2TlvValue(fields, 3);
      if (!clientPublicKey || clientPublicKey.length !== airPlay2SrpModulusBytes) {
        throw new Error(`Pair-Setup M3 missing ${airPlay2SrpModulusBytes}-byte SRP public key; got ${clientPublicKey?.length ?? 0}.`);
      }
      const clientProof = getAirPlay2TlvValue(fields, 4);
      if (!clientProof || clientProof.length !== 64) {
        throw new Error(`Pair-Setup M3 missing 64-byte SRP proof; got ${clientProof?.length ?? 0}.`);
      }

      const session = calculateAirPlay2SrpSession(
        state.salt,
        clientPublicKey,
        state.publicKey,
        state.privateKey,
        state.verifier,
      );
      if (!timingSafeEqual(clientProof, session.clientProof)) {
        throw new Error('Pair-Setup M3 SRP proof did not verify.');
      }

      state.sessionKey = session.sessionKey;
      if (state.transient) {
        const controlStates = uniqueAirPlay2EncryptedControlStates([
          ...createAirPlay2PairVerifyControlStates(this.airPlay2PairVerifyState),
          ...createAirPlay2TransientControlStates(session),
        ]);
        this.airPlay2EncryptedControlState = controlStates[0] ?? null;
        this.airPlay2EncryptedControlCandidates = controlStates.slice(1);
        this.airPlay2EncryptedEventState = {
          readKey: deriveAirPlay2Key(session.sessionKey, airPlay2EventsSalt, 'Events-Read-Encryption-Key'),
          writeKey: deriveAirPlay2Key(session.sessionKey, airPlay2EventsSalt, 'Events-Write-Encryption-Key'),
          keyLabel: 'srp-session-key',
        };
      }
      const responseBody = encodeAirPlay2Tlv([
        { type: 6, value: Buffer.from([4]) },
        { type: 4, value: session.serverProof },
      ]);
      this.addDebugEvent(
        'pair-setup',
        state.transient
          ? `M3 SRP proof verified; M4 accessory proof sent; transient control channel ready key=${this.airPlay2EncryptedControlState?.keyLabel ?? 'missing'} candidates=${this.airPlay2EncryptedControlCandidates.length}`
          : 'M3 SRP proof verified; M4 accessory proof sent',
        { method, path, statusCode: 200 },
      );
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
        body: responseBody,
        encryptedAfterWrite: state.transient,
      };
    } catch (error) {
      this.addDebugEvent('pair-setup', error instanceof Error ? error.message : String(error), { method, path, statusCode: 400 });
      return { statusCode: 400 };
    }
  }

  private handleAirPlay2PairSetupM5(
    method: string,
    path: string,
    fields: Map<number, Buffer[]>,
  ): AirPlay2ProbeResponse {
    try {
      const state = this.airPlay2PairSetupState;
      if (!state?.sessionKey) {
        throw new Error('Pair-Setup M5 arrived before a verified SRP session.');
      }
      const encryptedData = getAirPlay2TlvValue(fields, 5);
      if (!encryptedData) {
        throw new Error('Pair-Setup M5 missing encrypted data.');
      }

      const encryptionKey = deriveAirPlay2Key(state.sessionKey, airPlay2PairSetupEncryptSalt, airPlay2PairSetupEncryptInfo);
      const decrypted = decryptAirPlay2Payload(encryptionKey, 'PS-Msg05', encryptedData);
      const clientFields = parseAirPlay2Tlv(decrypted);
      if (!clientFields.fields) {
        throw new Error(clientFields.error);
      }
      const clientIdentifier = getAirPlay2TlvValue(clientFields.fields, 1);
      const clientPublicKey = getAirPlay2TlvValue(clientFields.fields, 3);
      const clientSignature = getAirPlay2TlvValue(clientFields.fields, 10);
      if (!clientIdentifier) {
        throw new Error('Pair-Setup M5 missing client identifier.');
      }
      if (!clientPublicKey || clientPublicKey.length !== 32) {
        throw new Error(`Pair-Setup M5 missing 32-byte client public key; got ${clientPublicKey?.length ?? 0}.`);
      }
      if (!clientSignature || clientSignature.length !== 64) {
        throw new Error(`Pair-Setup M5 missing 64-byte client signature; got ${clientSignature?.length ?? 0}.`);
      }

      const controllerSigningKey = deriveAirPlay2Key(
        state.sessionKey,
        airPlay2PairSetupControllerSignSalt,
        airPlay2PairSetupControllerSignInfo,
      );
      const signedClientInfo = Buffer.concat([controllerSigningKey, clientIdentifier, clientPublicKey]);
      if (!verify(null, signedClientInfo, createEd25519PublicKey(clientPublicKey), clientSignature)) {
        throw new Error('Pair-Setup M5 client signature did not verify.');
      }
      const clientIdentifierText = clientIdentifier.toString('utf8');
      const permissionsValue = getAirPlay2TlvValue(clientFields.fields, 11);
      const permissions = permissionsValue?.[0] ?? 0;
      if (!state.transient) {
        this.airPlay2PairingStore.saveController({
          identifier: clientIdentifierText,
          publicKey: clientPublicKey,
          permissions,
        });
      }

      const accessoryIdentifier = Buffer.from(this.airPlay2DeviceIdentifier(), 'utf8');
      const accessorySigningKey = deriveAirPlay2Key(
        state.sessionKey,
        airPlay2PairSetupAccessorySignSalt,
        airPlay2PairSetupAccessorySignInfo,
      );
      const accessorySignature = sign(
        null,
        Buffer.concat([accessorySigningKey, accessoryIdentifier, this.airPlay2Identity.publicKey]),
        this.airPlay2Identity.privateKey,
      );
      const accessoryData = encodeAirPlay2Tlv([
        { type: 1, value: accessoryIdentifier },
        { type: 3, value: this.airPlay2Identity.publicKey },
        { type: 10, value: accessorySignature },
      ]);
      const responseBody = encodeAirPlay2Tlv([
        { type: 6, value: Buffer.from([6]) },
        { type: 5, value: encryptAirPlay2Payload(encryptionKey, 'PS-Msg06', accessoryData) },
      ]);
      this.addDebugEvent(
        'pair-setup',
        `M5 controller signature verified for ${clientIdentifierText}; pairing persisted permissions=${permissions}; M6 accessory identity sent`,
        { method, path, statusCode: 200 },
      );
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
        body: responseBody,
      };
    } catch (error) {
      this.addDebugEvent('pair-setup', error instanceof Error ? error.message : String(error), { method, path, statusCode: 400 });
      return { statusCode: 400 };
    }
  }

  private handleAirPlay2FairPlaySetupRequest(
    method: string,
    path: string,
    body: Buffer,
  ): AirPlay2ProbeResponse {
    try {
      if (body.length < 16 || body.subarray(0, 4).toString('ascii') !== 'FPLY') {
        throw new Error(`FairPlay setup body is not an FPLY message: ${summarizeBuffer(body)}.`);
      }
      const majorVersion = body[4];
      const messageType = body[5];
      const sequence = body[6];
      if (majorVersion !== 3 || messageType !== 1) {
        throw new Error(`Unsupported FairPlay setup message version=${majorVersion} type=${messageType}.`);
      }

      if (sequence === 1) {
        const mode = body[14];
        const responseBody = airPlay2FairPlaySetup1Responses[mode];
        if (!responseBody) {
          throw new Error(`Unsupported FairPlay setup mode=${mode}; expected 0-3.`);
        }
        this.airPlay2FairPlayState = { keyMessage: null };
        this.addDebugEvent('fp-setup', `FairPlay setup seq=1 mode=${mode} response sent`, { method, path, statusCode: 200 });
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
          body: responseBody,
        };
      }

      if (sequence === 3) {
        if (body.length < airPlay2FairPlaySetup2SuffixBytes) {
          throw new Error(`FairPlay setup seq=3 body too short: ${body.length}.`);
        }
        this.airPlay2FairPlayState = { keyMessage: Buffer.from(body) };
        const suffix = body.subarray(body.length - airPlay2FairPlaySetup2SuffixBytes);
        const responseBody = Buffer.concat([airPlay2FairPlaySetup2ResponsePrefix, suffix]);
        this.addDebugEvent('fp-setup', `FairPlay setup seq=3 key message captured (${body.length}b); response sent`, {
          method,
          path,
          statusCode: 200,
        });
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
          body: responseBody,
        };
      }

      throw new Error(`Unsupported FairPlay setup sequence=${sequence}.`);
    } catch (error) {
      this.addDebugEvent('fp-setup', error instanceof Error ? error.message : String(error), { method, path, statusCode: 501 });
      return { statusCode: 501 };
    }
  }

  private handleAirPlay2PairVerifyM1(
    method: string,
    path: string,
    fields: Map<number, Buffer[]>,
  ): AirPlay2ProbeResponse {
    try {
      const clientPublicKey = getAirPlay2TlvValue(fields, 3);
      if (!clientPublicKey || clientPublicKey.length !== 32) {
        throw new Error(`Pair-Verify M1 missing 32-byte client public key; got ${clientPublicKey?.length ?? 0}.`);
      }

      const serverKeys = generateKeyPairSync('x25519');
      const serverPublicKey = exportX25519PublicKey(serverKeys.publicKey);
      const sharedSecret = diffieHellman({
        privateKey: serverKeys.privateKey,
        publicKey: createX25519PublicKey(clientPublicKey),
      });
      this.airPlay2EncryptedControlState = null;
      this.airPlay2EncryptedControlCandidates = [];
      this.airPlay2EncryptedEventState = null;
      const sessionKey = deriveAirPlay2Key(sharedSecret, airPlay2PairVerifySalt, airPlay2PairVerifyInfo);
      const deviceIdentifier = this.airPlay2DeviceIdentifier();
      const signature = sign(
        null,
        Buffer.concat([serverPublicKey, Buffer.from(deviceIdentifier, 'utf8'), clientPublicKey]),
        this.airPlay2Identity.privateKey,
      );
      const encryptedData = encryptAirPlay2Payload(
        sessionKey,
        'PV-Msg02',
        encodeAirPlay2Tlv([
          { type: 1, value: Buffer.from(deviceIdentifier, 'utf8') },
          { type: 10, value: signature },
        ]),
      );

      this.airPlay2PairVerifyState = {
        clientPublicKey,
        serverPublicKey,
        sharedSecret,
        sessionKey,
        controlReadKey: deriveAirPlay2Key(sharedSecret, airPlay2ControlSalt, 'Control-Read-Encryption-Key'),
        controlWriteKey: deriveAirPlay2Key(sharedSecret, airPlay2ControlSalt, 'Control-Write-Encryption-Key'),
      };

      const responseBody = encodeAirPlay2Tlv([
        { type: 6, value: Buffer.from([2]) },
        { type: 3, value: serverPublicKey },
        { type: 5, value: encryptedData },
      ]);
      this.addDebugEvent('pair-verify', 'M1 accepted; M2 response sent with signed accessory identity', { method, path, statusCode: 200 });
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
        body: responseBody,
      };
    } catch (error) {
      this.addDebugEvent('pair-verify', error instanceof Error ? error.message : String(error), { method, path, statusCode: 400 });
      return { statusCode: 400 };
    }
  }

  private handleAirPlay2PairVerifyM3(
    method: string,
    path: string,
    fields: Map<number, Buffer[]>,
  ): AirPlay2ProbeResponse {
    try {
      const state = this.airPlay2PairVerifyState;
      if (!state) {
        throw new Error('Pair-Verify M3 arrived before a valid M1/M2 exchange.');
      }
      const encryptedData = getAirPlay2TlvValue(fields, 5);
      if (!encryptedData) {
        throw new Error('Pair-Verify M3 missing encrypted data.');
      }

      const decrypted = decryptAirPlay2Payload(state.sessionKey, 'PV-Msg03', encryptedData);
      const clientFields = parseAirPlay2Tlv(decrypted);
      if (!clientFields.fields) {
        throw new Error(clientFields.error);
      }
      const clientIdentifierValue = getAirPlay2TlvValue(clientFields.fields, 1);
      const clientSignature = getAirPlay2TlvValue(clientFields.fields, 10);
      if (!clientIdentifierValue || clientIdentifierValue.length === 0) {
        throw new Error('Pair-Verify M3 missing client identifier.');
      }
      if (!clientSignature || clientSignature.length !== 64) {
        throw new Error(`Pair-Verify M3 missing 64-byte client signature; got ${clientSignature?.length ?? 0}.`);
      }
      const clientIdentifier = clientIdentifierValue.toString('utf8');
      const pairedController = this.airPlay2PairingStore.getController(clientIdentifier);
      if (!pairedController) {
        throw new Error(`Pair-Verify M3 controller is not paired: ${clientIdentifier}.`);
      }
      const signedClientInfo = Buffer.concat([
        state.clientPublicKey,
        clientIdentifierValue,
        state.serverPublicKey,
      ]);
      if (!verify(null, signedClientInfo, createEd25519PublicKey(pairedController.publicKey), clientSignature)) {
        throw new Error(`Pair-Verify M3 controller signature did not verify for ${clientIdentifier}.`);
      }

      const responseBody = encodeAirPlay2Tlv([{ type: 6, value: Buffer.from([4]) }]);
      this.addDebugEvent(
        'pair-verify',
        `M3 decrypted for ${clientIdentifier}; M4 response sent; encrypted control channel ready`,
        { method, path, statusCode: 200 },
      );
      this.airPlay2EncryptedControlState = {
        controlReadKey: state.controlReadKey,
        controlWriteKey: state.controlWriteKey,
        keyLabel: 'pair-verify-shared-secret',
      };
      this.airPlay2EncryptedControlCandidates = [];
      this.airPlay2EncryptedEventState = {
        readKey: deriveAirPlay2Key(state.sharedSecret, airPlay2EventsSalt, 'Events-Read-Encryption-Key'),
        writeKey: deriveAirPlay2Key(state.sharedSecret, airPlay2EventsSalt, 'Events-Write-Encryption-Key'),
        keyLabel: 'pair-verify-shared-secret',
      };
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
        body: responseBody,
        encryptedAfterWrite: true,
      };
    } catch (error) {
      this.addDebugEvent('pair-verify', error instanceof Error ? error.message : String(error), { method, path, statusCode: 400 });
      return { statusCode: 400 };
    }
  }

  private summarizeAirPlay2ProbeBody(path: string, contentType: string | null, body: Buffer): string {
    const type = contentType ? `content-type=${contentType}; ` : '';
    if (contentType?.includes('application/octet-stream') || path === '/pair-setup' || path === '/pair-verify') {
      return `${type}${summarizeAirPlay2Tlv(body) ?? `body=${summarizeBuffer(body)}`}`;
    }
    return `${type}body=${summarizeBuffer(body)}`;
  }

  private createAirPlay2InfoPlist(): string {
    const profile = getAirPlay2AdvertisementProfile(this.airPlay2TimingMode);
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      '<dict>',
      '<key>deviceID</key>',
      `<string>${this.airPlay2DeviceIdentifier()}</string>`,
      '<key>features</key>',
      `<integer>${profile.featureMask}</integer>`,
      '<key>manufacturer</key>',
      '<string>Moekotori</string>',
      '<key>model</key>',
      '<string>ECHO-AirPlay-Spike</string>',
      '<key>name</key>',
      `<string>${this.escapePlistString(this.advertisedName)}</string>`,
      '<key>protovers</key>',
      '<string>1.1</string>',
      '<key>sourceVersion</key>',
      `<string>${profile.sourceVersion}</string>`,
      '<key>statusFlags</key>',
      '<integer>4</integer>',
      '<key>vv</key>',
      '<integer>2</integer>',
      '<key>volumeControlType</key>',
      '<integer>3</integer>',
      '<key>supportedFormats</key>',
      '<dict>',
      `<key>audioStream</key><integer>${airPlay2RealtimeSupportedFormats}</integer>`,
      `<key>bufferStream</key><integer>${airPlay2BufferedSupportedFormats}</integer>`,
      '</dict>',
      '<key>audioFormats</key>',
      '<array>',
      `<dict><key>type</key><integer>100</integer><key>audioInputFormats</key><integer>${airPlay2SupportedAudioFormats}</integer><key>audioOutputFormats</key><integer>${airPlay2SupportedAudioFormats}</integer></dict>`,
      '</array>',
      '<key>audioLatencies</key>',
      '<array>',
      '<dict><key>type</key><integer>100</integer><key>audioType</key><string>default</string><key>inputLatencyMicros</key><integer>0</integer><key>outputLatencyMicros</key><integer>0</integer></dict>',
      '</array>',
      '</dict>',
      '</plist>',
      '',
    ].join('\n');
  }

  private createAirPlay2InfoBplist(): Buffer {
    return encodeAirPlay2Bplist(this.createAirPlay2InfoRecord());
  }

  private createAirPlay2EventUpdateRequest(): Buffer {
    const body = encodeAirPlay2Bplist({
      type: 'updateInfo',
      value: this.createAirPlay2InfoRecord(),
    });
    return Buffer.concat([
      Buffer.from([
        'POST /command RTSP/1.0',
        `Content-Length: ${body.length}`,
        'Content-Type: application/x-apple-binary-plist',
        '',
        '',
      ].join('\r\n'), 'utf8'),
      body,
    ]);
  }

  private createAirPlay2InfoRecord(): { [key: string]: AirPlay2BplistValue } {
    const profile = getAirPlay2AdvertisementProfile(this.airPlay2TimingMode);
    const featuresEx = Buffer.alloc(8);
    featuresEx.writeBigUInt64LE(BigInt(profile.featureMask));
    const publicKey = this.airPlay2Identity.publicKey.toString('hex');
    const mac = this.airPlay2DeviceIdentifier();
    return {
      audioFormats: [
        {
          type: 100,
          audioInputFormats: airPlay2SupportedAudioFormats,
          audioOutputFormats: airPlay2SupportedAudioFormats,
        },
      ],
      audioLatencies: [
        {
          type: 100,
          audioType: 'default',
          inputLatencyMicros: 0,
          outputLatencyMicros: 0,
        },
      ],
      supportedFormats: {
        audioStream: airPlay2RealtimeSupportedFormats,
        bufferStream: airPlay2BufferedSupportedFormats,
      },
      playbackCapabilities: {
        supportsInterstitials: false,
        supportsFPSSecureStop: false,
        supportsUIForAudioOnlyContent: false,
      },
      canRecordScreenStream: false,
      deviceID: this.airPlay2DeviceIdentifier(),
      features: profile.featureMask,
      featuresEx: featuresEx.toString('base64').replace(/=+$/gu, ''),
      initialVolume: volumePercentToAirPlayDb(this.status.volume),
      keepAliveLowPower: true,
      keepAliveSendStatsAsBody: false,
      manufacturer: 'Moekotori',
      model: airPlayModel,
      name: this.advertisedName,
      nameIsFactoryDefault: false,
      pi: this.airPlay2PairingUuid('airplay'),
      protocolVersion: '1.1',
      psi: this.airPlay2PairingUuid('system'),
      pk: this.airPlay2Identity.publicKey,
      sourceVersion: profile.sourceVersion,
      statusFlags: 4,
      txtAirPlay: createAirPlay2TxtData({
        name: this.advertisedName,
        model: airPlayModel,
        address: this.advertisedInterface?.address ?? '127.0.0.1',
        mac,
        port: this.airPlay2ProbePort ?? 0,
        airPlayPort: this.airPlay2ProbePort,
        airPlayPublicKey: publicKey,
        airPlay2Experimental: true,
        airPlay2TimingMode: this.airPlay2TimingMode,
      }),
      volumeControlType: 3,
      vv: 2,
    };
  }

  private async resetAirPlay2PlaybackForNewStream(): Promise<boolean> {
    const previousSourceId = this.currentSourceId;
    if (previousSourceId && this.audioSession.getStatus().currentFilePath === previousSourceId) {
      try {
        await this.audioSession.stop();
      } catch (error) {
        const message = `AirPlay 2 could not stop the previous Audio Core PCM session: ${error instanceof Error ? error.message : String(error)}`;
        this.addDebugEvent('setup', message);
        this.setStatus({ state: 'error', error: message });
        return false;
      }
    }
    if (previousSourceId || this.pcmStream || this.pcmPlaybackStarted) {
      this.clearCurrentSession('AirPlay 2 stream format/session replaced');
      this.setStatus({
        state: this.status.enabled ? 'idle' : 'disabled',
        currentSourceId: null,
        currentClient: null,
        currentLyricLine: null,
        positionSeconds: 0,
        error: null,
      });
    }
    return true;
  }

  private createAirPlay2InitialInfoPlist(): Buffer {
    return this.createAirPlay2InfoBplist();
  }

  private escapePlistString(value: string): string {
    return value
      .replace(/&/gu, '&amp;')
      .replace(/</gu, '&lt;')
      .replace(/>/gu, '&gt;')
      .replace(/"/gu, '&quot;')
      .replace(/'/gu, '&apos;');
  }

  private airPlay2DeviceIdentifier(): string {
    return normalizeAirPlayDeviceId(this.advertisedInterface?.mac);
  }

  private airPlay2PairingUuid(suffix: string): string {
    return createAirPlay2PairingUuid(
      this.airPlay2DeviceIdentifier(),
      this.airPlay2Identity.publicKey.toString('hex'),
      suffix,
    );
  }

  private handleRaopEvent(event: RaopEvent): void {
    const type = trimText(event.type) ?? 'unknown';
    this.addDebugEvent(type, eventAddress(event) ?? '');

    switch (type) {
      case 'stream':
        this.clearHttpPcmReconnectTimer();
        this.prepareIncomingStream(event);
        if (this.useHttpPcmBridge) {
          this.startHttpPcmPlayback(event);
        } else {
          this.addDebugEvent('stream', 'using direct PCM events');
        }
        break;
      case 'metadata':
        this.applyMetadataEvent(event);
        break;
      case 'artwork':
        this.applyArtworkEvent(event);
        break;
      case 'pcm':
        this.handlePcmEvent(event);
        break;
      case 'play':
        this.setPositionAnchor(this.estimatePosition(this.status));
        this.setStatus({ state: 'playing' });
        break;
      case 'pause':
      case 'flush':
        this.setPositionAnchor(this.estimatePosition(this.status));
        this.setStatus({ state: 'paused' });
        if (type === 'flush') {
          this.handleFlushEvent();
        }
        break;
      case 'stop':
        this.queueReceiverStateOperation('sender stop', async () => {
          await this.stopIncomingPlayback('stopped by AirPlay sender');
        });
        break;
      case 'volume': {
        const volume = normalizeVolume(event.value);
        this.queueReceiverStateOperation('volume', async () => {
          const audioStatus = await this.audioSession.setOutput({ volume: volume / 100 });
          this.setStatus({ volume: Math.round(audioStatus.volume * 100), error: audioStatus.error });
        });
        break;
      }
      default:
        break;
    }
  }

  private prepareIncomingStream(event: RaopEvent): void {
    this.clearCurrentSession('new AirPlay stream');
    this.ignorePcmUntilNextStream = false;
    this.sessionCounter += 1;
    this.currentSourceId = `airplay-receiver:${this.now().toString(36)}-${this.sessionCounter.toString(36)}`;
    this.pcmStream = new PassThrough({ highWaterMark: airPlayPcmHighWaterMark });
    this.pcmPlaybackStarted = false;
    this.audioSessionClaimedCurrentSource = false;
    this.setPositionAnchor(0);
    const address = eventAddress(event);
    const client: ConnectReceiverClient | null = address
      ? {
          address,
          userAgent: 'AirPlay',
          lastSeenAt: new Date(this.now()).toISOString(),
        }
      : null;
    const metadata = metadataFromEvent(event, this.status.metadata, this.status.artworkUrl);
    this.currentMetadataIdentityKey = metadataIdentityKey(metadata);
    this.setStatus({
      state: 'ready',
      currentClient: client,
      currentSourceId: this.currentSourceId,
      metadata,
      currentLyricLine: null,
      positionSeconds: 0,
      durationSeconds: metadata.durationSeconds,
      error: null,
    });
  }

  private applyMetadataEvent(event: RaopEvent): void {
    const eventTitle = trimText(event.title);
    const metadata = metadataFromEvent(event, this.status.metadata, this.status.artworkUrl);
    const elapsedMs = Number(event.elapsedMs);
    const nextMetadataIdentityKey = metadataIdentityKey(metadata);
    const metadataChanged = Boolean(nextMetadataIdentityKey && nextMetadataIdentityKey !== this.currentMetadataIdentityKey);
    const nextLyricLine =
      !metadataChanged && shouldKeepCurrentMetadataForLyricLine(eventTitle, this.status.metadata) ? eventTitle : null;
    const nextPositionSeconds =
      Number.isFinite(elapsedMs) && elapsedMs >= 0
        ? elapsedMs / 1000
        : metadataChanged
          ? 0
          : this.estimatePosition(this.status);
    this.currentMetadataIdentityKey = nextMetadataIdentityKey;
    this.setPositionAnchor(nextPositionSeconds, metadata.durationSeconds);
    this.setStatus({
      metadata,
      currentLyricLine: nextLyricLine ?? (metadataChanged ? null : this.status.currentLyricLine),
      durationSeconds: metadata.durationSeconds,
      positionSeconds: nextPositionSeconds,
    });
  }

  private applyArtworkEvent(event: RaopEvent): void {
    const data = Buffer.isBuffer(event.data) ? event.data : null;
    if (!data || data.length === 0) {
      return;
    }

    const mimeType = trimText(event.mimeType) ?? trimText(event.contentType) ?? 'image/jpeg';
    const artworkUrl = `data:${mimeType};base64,${data.toString('base64')}`;
    const metadata = metadataFromEvent(event, this.status.metadata, artworkUrl);
    this.setStatus({
      artworkUrl,
      metadata,
      durationSeconds: metadata.durationSeconds,
    });
  }

  private handlePcmEvent(event: RaopEvent): void {
    if (this.httpPcmRequest || this.httpPcmTransform) {
      if (this.httpPcmBytesReceived > 0) {
        return;
      }
      this.addDebugEvent('pcm', 'fallback to direct PCM events before HTTP audio arrived');
      this.destroyHttpPcmPlayback();
      this.pcmStream = null;
      this.pcmPlaybackStarted = false;
    }

    const data = Buffer.isBuffer(event.data) ? event.data : null;
    if (!data || data.length < 2) {
      return;
    }

    if (this.ignorePcmUntilNextStream && !this.currentSourceId) {
      return;
    }

    if (!this.currentSourceId || !this.pcmStream) {
      this.prepareIncomingStream(event);
    }

    if (!this.currentSourceId || !this.pcmStream) {
      return;
    }

    if (!this.pcmPlaybackStarted) {
      this.pcmPlaybackStarted = true;
      const stream = this.pcmStream;
      const sampleRate = Number(event.sampleRate) || defaultSampleRate;
      const channels = Number(event.channels) || defaultChannels;
      void this.audioSession
        .playPcmStream({
          stream,
          sourceId: this.currentSourceId,
          trackId: this.currentSourceId,
          sampleRate,
          channels,
          durationSeconds: this.status.durationSeconds,
          output: createAirPlayOutputSettings(),
        })
        .then(() => this.setStatus({ state: 'playing', error: null }))
        .catch((error) => {
          this.setStatus({
            state: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }

    const converted = convertS16leToF32le(data);
    this.writePcmChunk(converted, 'AirPlay 1 PCM');
  }

  private writePcmChunk(chunk: Buffer, source: string): void {
    const stream = this.pcmStream;
    if (!stream || chunk.length === 0 || this.pcmBackpressured) {
      return;
    }
    if (stream.write(chunk)) {
      return;
    }

    this.pcmBackpressured = true;
    this.airPlay2StreamState?.aacDecoder?.pauseOutput();
    this.addDebugEvent('pcm', `${source} backpressure; dropping live PCM until native output drains`);
    if (this.airPlayReceiverProtocol === 'airplay1' && !this.useHttpPcmBridge) {
      this.queueDirectPcmForwarding(false);
    }
    const onDrain = (): void => {
      if (this.pcmDrainStream !== stream) {
        return;
      }
      this.pcmDrainStream = null;
      this.pcmDrainListener = null;
      this.pcmBackpressured = false;
      this.airPlay2StreamState?.aacDecoder?.resumeOutput();
      this.addDebugEvent('pcm', `${source} backpressure cleared`);
      const airPlay2State = this.airPlay2StreamState;
      if (airPlay2State?.streamType === airPlay2BufferedStreamType) {
        this.drainAirPlay2BufferedPackets(airPlay2State);
      }
      if (this.airPlayReceiverProtocol === 'airplay1' && !this.useHttpPcmBridge) {
        this.queueDirectPcmForwarding(true);
      }
    };
    this.pcmDrainStream = stream;
    this.pcmDrainListener = onDrain;
    stream.once('drain', onDrain);
  }

  private queueDirectPcmForwarding(enabled: boolean): void {
    this.pcmForwardingOperation = this.pcmForwardingOperation.then(async () => {
      const result = await Promise.resolve(this.raopModule?.setPcmForwarding?.(enabled));
      if (result === false) {
        this.addDebugEvent('pcm', `native PCM forwarding=${enabled} was not acknowledged`);
      }
    }).catch((error) => {
      this.addDebugEvent('pcm', error instanceof Error ? error.message : String(error));
    });
  }

  private clearPcmBackpressure(): void {
    if (this.pcmDrainStream && this.pcmDrainListener) {
      this.pcmDrainStream.removeListener('drain', this.pcmDrainListener);
    }
    this.pcmDrainStream = null;
    this.pcmDrainListener = null;
    this.pcmBackpressured = false;
  }

  private startHttpPcmPlayback(event: RaopEvent): void {
    const port = Number(event.port);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      this.addDebugEvent('stream', `invalid PCM HTTP port: ${String(event.port)}`);
      return;
    }

    if (!this.currentSourceId) {
      this.prepareIncomingStream(event);
    }

    if (!this.currentSourceId) {
      return;
    }

    this.destroyHttpPcmPlayback();
    const sourceId = this.currentSourceId;
    const stream = this.createHttpPcmTransform();
    this.pcmStream = stream;
    this.pcmPlaybackStarted = true;
    this.httpPcmBytesReceived = 0;
    this.lastHttpPcmPort = port;
    // The RAOP helper exposes PCM HTTP as a local bridge for this process; using
    // loopback avoids Windows adapter/firewall hairpin failures on LAN addresses.
    const host = '127.0.0.1';

    this.setStatus({ state: 'ready', error: null });
    this.addDebugEvent('stream', `pull PCM from http://${host}:${port}/`);
    this.httpPcmFallbackTimer = setTimeout(() => {
      if (this.currentSourceId !== sourceId || this.httpPcmBytesReceived > 0) {
        return;
      }
      this.enableDirectPcmFallback(sourceId, 'HTTP PCM produced no audio');
    }, airPlayHttpPcmFallbackMs);

    const request = httpRequest(
      {
        host,
        port,
        path: '/',
        method: 'GET',
        headers: {
          Connection: 'close',
        },
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          this.setStatus({ state: 'error', error: `AirPlay PCM HTTP ${response.statusCode}` });
          response.resume();
          return;
        }
        response.on('error', (error) => {
          if (this.intentionalHttpPcmRequestCloses.has(request)) {
            stream.destroy();
            return;
          }
          this.addDebugEvent('stream', error.message);
          stream.destroy(error);
        });
        response.pipe(stream);
      },
    );

    request.on('socket', (socket) => {
      socket.setNoDelay(true);
    });
    request.once('error', (error) => {
      if (this.intentionalHttpPcmRequestCloses.has(request)) {
        stream.destroy();
        return;
      }
      if (this.currentSourceId === sourceId) {
        this.enableDirectPcmFallback(sourceId, `AirPlay PCM HTTP failed: ${error.message}`);
      }
      stream.destroy(error);
    });
    request.once('close', () => {
      this.intentionalHttpPcmRequestCloses.delete(request);
      if (this.httpPcmRequest === request) {
        this.httpPcmRequest = null;
      }
    });
    this.httpPcmRequest = request;
    request.end();

    void this.audioSession
      .playPcmStream({
        stream,
        sourceId,
        trackId: sourceId,
        sampleRate: defaultSampleRate,
        channels: defaultChannels,
        durationSeconds: this.status.durationSeconds,
        output: createAirPlayOutputSettings(),
      })
      .then(() => {
        if (this.currentSourceId === sourceId) {
          this.setStatus({ state: 'playing', error: null });
        }
      })
      .catch((error) => {
        if (this.currentSourceId === sourceId) {
          this.setStatus({
            state: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
  }

  private createHttpPcmTransform(): Transform {
    let carry: Buffer | null = null;
    const transform = new Transform({
      highWaterMark: airPlayPcmHighWaterMark,
      transform: (chunk: Buffer, _encoding, callback) => {
        const input = carry ? Buffer.concat([carry, chunk]) : chunk;
        const evenLength = input.length - (input.length % 2);
        carry = evenLength === input.length ? null : input.subarray(evenLength);
        if (evenLength > 0) {
          const hadAudio = this.httpPcmBytesReceived > 0;
          this.httpPcmBytesReceived += evenLength;
          if (!hadAudio) {
            this.clearHttpPcmFallbackTimer();
            this.addDebugEvent('pcm', 'HTTP PCM started');
          }
          transform.push(convertS16leToF32le(input.subarray(0, evenLength)));
        }
        callback();
      },
      flush: (callback) => {
        carry = null;
        callback();
      },
    });
    this.httpPcmTransform = transform;
    return transform;
  }

  private clearHttpPcmFallbackTimer(): void {
    if (this.httpPcmFallbackTimer) {
      clearTimeout(this.httpPcmFallbackTimer);
      this.httpPcmFallbackTimer = null;
    }
  }

  private clearHttpPcmReconnectTimer(): void {
    if (this.httpPcmReconnectTimer) {
      clearTimeout(this.httpPcmReconnectTimer);
      this.httpPcmReconnectTimer = null;
    }
  }

  private scheduleHttpPcmReconnect(reason: string): void {
    if (!this.useHttpPcmBridge) {
      return;
    }

    const sourceId = this.currentSourceId;
    const port = this.lastHttpPcmPort;
    if (!sourceId || !port) {
      return;
    }

    this.clearHttpPcmReconnectTimer();
    this.destroyHttpPcmPlayback();
    this.pcmStream = null;
    this.pcmPlaybackStarted = false;
    this.addDebugEvent('stream', `restart PCM HTTP after ${reason}`);
    this.httpPcmReconnectTimer = setTimeout(() => {
      this.httpPcmReconnectTimer = null;
      if (this.currentSourceId !== sourceId || this.lastHttpPcmPort !== port) {
        return;
      }
      this.startHttpPcmPlayback({ type: 'stream', port });
    }, airPlayHttpPcmReconnectMs);
  }

  private handleFlushEvent(): void {
    if (this.httpPcmRequest && this.httpPcmTransform && this.httpPcmBytesReceived > 0) {
      this.addDebugEvent('stream', 'keep PCM HTTP alive after flush');
      return;
    }

    this.scheduleHttpPcmReconnect('flush');
  }

  private enableDirectPcmFallback(sourceId: string, reason: string): void {
    if (this.currentSourceId !== sourceId) {
      return;
    }
    this.addDebugEvent('pcm', `${reason}; switching to direct PCM events`);
    this.destroyHttpPcmPlayback();
    this.pcmStream = null;
    this.pcmPlaybackStarted = false;
    this.queueDirectPcmForwarding(true);
  }

  private destroyHttpPcmPlayback(): void {
    this.clearHttpPcmFallbackTimer();
    if (this.httpPcmRequest) {
      this.intentionalHttpPcmRequestCloses.add(this.httpPcmRequest);
      this.httpPcmRequest.destroy();
    }
    this.httpPcmRequest = null;
    if (this.httpPcmTransform) {
      this.httpPcmTransform.destroy();
    }
    this.httpPcmTransform = null;
    this.httpPcmBytesReceived = 0;
  }

  private clearCurrentSession(reason: string): void {
    this.clearHttpPcmReconnectTimer();
    this.destroyHttpPcmPlayback();
    this.clearPcmBackpressure();
    if (this.pcmStream) {
      this.pcmStream.destroy();
    }
    this.pcmStream = null;
    this.lastHttpPcmPort = null;
    this.pcmPlaybackStarted = false;
    this.currentSourceId = null;
    this.audioSessionClaimedCurrentSource = false;
    this.currentMetadataIdentityKey = null;
    this.setPositionAnchor(0);
    if (reason) {
      this.addDebugEvent('clear', reason);
    }
  }

  private async pauseAirPlay2ActivePlayback(reason: string): Promise<void> {
    this.clearHttpPcmReconnectTimer();
    this.destroyHttpPcmPlayback();
    this.clearPcmBackpressure();
    if (this.pcmStream) {
      this.pcmStream.destroy();
    }
    this.pcmStream = null;
    this.pcmPlaybackStarted = false;
    this.setPositionAnchor(this.estimatePosition(this.status));

    const currentSourceId = this.currentSourceId;
    if (currentSourceId && this.audioSession.getStatus().currentFilePath === currentSourceId) {
      await Promise.resolve(this.audioSession.pause()).catch((error) => {
        this.addDebugEvent('pause', error instanceof Error ? error.message : String(error));
      });
    }

    this.setStatus({
      state: this.status.enabled ? 'paused' : 'disabled',
      positionSeconds: this.estimatePosition({ ...this.status, state: 'paused' }),
      error: null,
    });
    if (reason) {
      this.addDebugEvent('pause', reason);
    }
  }

  private async stopAirPlay2ActivePlayback(reason: string): Promise<void> {
    const currentSourceId = this.currentSourceId;
    if (currentSourceId && this.audioSession.getStatus().currentFilePath === currentSourceId) {
      await Promise.resolve(this.audioSession.stop()).catch((error) => {
        this.addDebugEvent('stop', error instanceof Error ? error.message : String(error));
      });
    }

    this.ignorePcmUntilNextStream = true;
    this.clearCurrentSession(reason);
    this.setStatus({
      state: this.status.enabled ? 'idle' : 'disabled',
      currentClient: null,
      currentSourceId: null,
      metadata: null,
      currentLyricLine: null,
      artworkUrl: null,
      positionSeconds: 0,
      durationSeconds: 0,
      error: null,
    });
  }

  private async sendRemoteCommand(command: 'play' | 'pause' | 'stop'): Promise<boolean> {
    if (this.airPlayReceiverProtocol === 'airplay2') {
      try {
        const sent = await this.airPlay2DacpRemote.send(command);
        if (!sent) {
          this.addDebugEvent('remote', `${command} command was not accepted by the AirPlay 2 sender over DACP`);
        }
        return sent;
      } catch (error) {
        this.addDebugEvent('remote', error instanceof Error ? error.message : String(error));
        return false;
      }
    }
    if (this.receiverHandle === null || !this.raopModule?.sendRemoteCommand) {
      return false;
    }

    try {
      const sent = await Promise.resolve(this.raopModule.sendRemoteCommand(this.receiverHandle, command));
      if (!sent) {
        this.addDebugEvent('remote', `${command} command was not accepted by the AirPlay sender`);
      }
      return sent;
    } catch (error) {
      this.addDebugEvent('remote', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  private queueReceiverStateOperation(action: string, operation: () => Promise<void>): void {
    this.receiverEventOperation = this.receiverEventOperation.then(operation).catch((error) => {
      const message = `AirPlay ${action} failed: ${error instanceof Error ? error.message : String(error)}`;
      this.addDebugEvent(action, message);
      this.setStatus({ state: 'error', error: message });
    });
  }

  private updateAirPlay2DacpSender(request: AirPlay2ProbeRequest): void {
    const dacpId = request.headers['dacp-id']?.trim() ?? '';
    const activeRemote = request.headers['active-remote']?.trim() ?? '';
    const remoteAddress = normalizeAirPlay2RemoteAddress(request.remoteAddress);
    if (!dacpId && !activeRemote) return;
    if (!/^(?:0x)?[0-9a-f]{1,32}$/iu.test(dacpId) || !/^\d{1,20}$/u.test(activeRemote) || !remoteAddress) {
      this.addDebugEvent('remote', 'Ignored invalid AirPlay 2 DACP sender headers', {
        method: request.method,
        path: request.path,
        remoteAddress: request.remoteAddress,
      });
      return;
    }
    this.airPlay2DacpRemote.updateSender({
      dacpId,
      activeRemote,
      remoteAddress,
      interfaceAddress: normalizeAirPlay2RemoteAddress(request.localAddress) ?? this.advertisedInterface?.address ?? null,
    });
  }

  private withAudioPosition(status: AirPlayReceiverStatus): AirPlayReceiverStatus {
    const audioStatus = this.audioSession.getStatus();
    if (!this.currentSourceId || audioStatus.currentFilePath !== this.currentSourceId) {
      return {
        ...status,
        positionSeconds: this.estimatePosition(status),
        updatedAt: new Date(this.now()).toISOString(),
      };
    }

    const nextState = airPlayStateFromAudioStatus(audioStatus, status.state);
    return {
      ...status,
      state: nextState,
      positionSeconds: this.estimatePosition({ ...status, state: nextState }),
      durationSeconds: audioStatus.durationSeconds || status.durationSeconds,
      volume: Math.round(audioStatus.volume * 100),
      updatedAt: new Date(this.now()).toISOString(),
    };
  }

  private readonly handleAudioStatus = (audioStatus: AudioStatus): void => {
    if (!this.currentSourceId) {
      return;
    }

    if (audioStatus.currentFilePath === this.currentSourceId) {
      this.audioSessionClaimedCurrentSource = true;
    }

    if (
      this.audioSessionClaimedCurrentSource &&
      audioStatus.currentFilePath &&
      audioStatus.currentFilePath !== this.currentSourceId &&
      (audioStatus.state === 'loading' || audioStatus.state === 'playing')
    ) {
      this.queueReceiverStateOperation('local takeover remote stop', async () => {
        await this.sendRemoteCommand('stop');
      });
      this.ignorePcmUntilNextStream = true;
      this.clearCurrentSession('local playback took over');
      this.setStatus({
        state: this.status.enabled ? 'idle' : 'disabled',
        currentClient: null,
        currentSourceId: null,
        metadata: null,
        currentLyricLine: null,
        artworkUrl: null,
        positionSeconds: 0,
        durationSeconds: 0,
      });
      return;
    }

    if (audioStatus.currentFilePath !== this.currentSourceId) {
      return;
    }

    const nextState = airPlayStateFromAudioStatus(audioStatus, this.status.state);
    this.setStatus({
      state: nextState,
      positionSeconds: this.estimatePosition({ ...this.status, state: nextState }),
      durationSeconds: audioStatus.durationSeconds || this.status.durationSeconds,
      volume: Math.round(audioStatus.volume * 100),
      error: audioStatus.error ?? this.status.error,
    });
  };

  private setPositionAnchor(positionSeconds: number, durationSeconds = this.status.durationSeconds): void {
    const safePositionSeconds = Math.max(0, Number.isFinite(positionSeconds) ? positionSeconds : 0);
    this.positionAnchorSeconds = durationSeconds > 0 ? Math.min(durationSeconds, safePositionSeconds) : safePositionSeconds;
    this.positionAnchorUpdatedAtMs = this.now();
  }

  private estimatePosition(status: Pick<AirPlayReceiverStatus, 'durationSeconds' | 'state'>): number {
    const durationSeconds = status.durationSeconds > 0 ? status.durationSeconds : Number.POSITIVE_INFINITY;
    const elapsedSeconds = status.state === 'playing' ? Math.max(0, (this.now() - this.positionAnchorUpdatedAtMs) / 1000) : 0;
    return Math.min(durationSeconds, Math.max(0, this.positionAnchorSeconds + elapsedSeconds));
  }

  private setStatus(next: Partial<AirPlayReceiverStatus>): void {
    this.status = {
      ...this.status,
      ...next,
      updatedAt: new Date(this.now()).toISOString(),
    };
    this.emit('status', this.getStatus());
  }

  private addDebugEvent(
    action: string,
    message: string | null,
    details: Partial<Pick<ConnectReceiverDebugEvent, 'method' | 'path' | 'statusCode' | 'remoteAddress'>> = {},
  ): void {
    const event: ConnectReceiverDebugEvent = {
      id: `${this.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      at: new Date(this.now()).toISOString(),
      remoteAddress: details.remoteAddress ?? this.status.currentClient?.address ?? null,
      method: details.method ?? 'RAOP',
      path: details.path ?? '/airplay/receiver',
      action,
      statusCode: details.statusCode ?? null,
      message,
    };
    const previousEvents = highVolumeDebugActions.has(action)
      ? this.status.debugEvents.filter((previous) => previous.action !== action)
      : this.status.debugEvents;
    this.status = {
      ...this.status,
      debugEvents: [event, ...previousEvents].slice(0, debugEventLimit),
      updatedAt: new Date(this.now()).toISOString(),
    };
    if (!highVolumeDebugActions.has(action)) {
      this.emit('status', this.getStatus());
    }
    if ((event.statusCode !== null && event.statusCode >= 400) || action.endsWith('error')) {
      console.warn('[AirPlayReceiver]', `${event.method} ${event.path} ${event.statusCode ?? '-'} #${action}`, message ?? '');
    }
  }

  private formatNativeLog(event: unknown): string {
    if (event && typeof event === 'object') {
      const entry = event as { line?: unknown; source?: unknown; level?: unknown };
      return [entry.source, entry.level, entry.line].map((value) => trimText(value)).filter(Boolean).join(' ');
    }
    return String(event ?? '');
  }

  private handleNativeLog(event: unknown): void {
    const message = this.formatNativeLog(event);
    this.addDebugEvent('log', message);
    if (/unknown\/unhandled method POST/iu.test(message)) {
      this.setStatus({
        state: this.status.enabled ? 'error' : this.status.state,
        error: 'AirPlay connection failed: iPhone requested an unsupported AirPlay RTSP POST flow.',
      });
    }
  }
}

let airPlayReceiverService: AirPlayReceiverSpikeService | null = null;

export const getAirPlayReceiverSpikeService = (): AirPlayReceiverSpikeService => {
  airPlayReceiverService ??= new AirPlayReceiverSpikeService();
  return airPlayReceiverService;
};

export const disposeAirPlayReceiverSpikeService = async (): Promise<void> => {
  if (airPlayReceiverService) {
    await airPlayReceiverService.dispose();
    airPlayReceiverService = null;
  }
};
