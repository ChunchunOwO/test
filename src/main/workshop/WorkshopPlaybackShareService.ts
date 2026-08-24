import { createReadStream, statSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import type {
  WorkshopPlaybackShareInfo,
  WorkshopPlaybackShareStartRequest,
  WorkshopPlaybackShareTask,
  WorkshopPlaybackShareTrack,
  WorkshopPlaybackShareTaskRequest,
} from '../../shared/types/workshop';
import { getAudioSession } from '../audioPublicApi';
import type { WorkshopPluginService } from './WorkshopPluginService';

const maximumResponseBytes = 64 * 1024;
const maximumHeaderBytes = 8 * 1024;
const taskRetentionMs = 60 * 60 * 1000;
const uploadTimeoutMs = 30 * 60 * 1000;
const maximumActiveTasksPerPlugin = 2;
const maximumRetainedTasksPerPlugin = 32;
const headerNamePattern = /^(?:authorization|x-[a-z0-9-]{1,80})$/u;

type PrivateShareTrack = {
  filePath: string;
  publicTrack: WorkshopPlaybackShareTrack;
};

type ShareTaskRecord = WorkshopPlaybackShareTask & {
  sourceId: string;
  itemId: string;
  filePath: string;
  uploadUrl: string;
  headers: Record<string, string>;
  roomId: string | null;
  allowedHosts: string[];
  createdAtMs: number;
};

const mimeTypeForPath = (path: string): string => {
  switch (extname(path).toLowerCase()) {
    case '.mp3': return 'audio/mpeg';
    case '.flac': return 'audio/flac';
    case '.wav': return 'audio/wav';
    case '.m4a':
    case '.mp4': return 'audio/mp4';
    case '.aac': return 'audio/aac';
    case '.ogg':
    case '.opus': return 'audio/ogg';
    case '.aif':
    case '.aiff': return 'audio/aiff';
    default: return 'application/octet-stream';
  }
};

const publicTask = (task: ShareTaskRecord): WorkshopPlaybackShareTask => ({
  id: task.id,
  state: task.state,
  bytesSent: task.bytesSent,
  totalBytes: task.totalBytes,
  progress: task.totalBytes > 0 ? Math.min(1, task.bytesSent / task.totalBytes) : 0,
  playbackUrl: task.playbackUrl,
  expiresAt: task.expiresAt,
  error: task.error,
  track: task.track,
});

const normalizeHeaders = (value: Record<string, string> | undefined): Record<string, string> => {
  if (!value) return {};
  const output: Record<string, string> = {};
  let totalBytes = 0;
  for (const [rawName, rawValue] of Object.entries(value)) {
    const name = rawName.trim().toLowerCase();
    const headerValue = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!headerNamePattern.test(name) || !headerValue || /[\r\n]/u.test(headerValue)) {
      throw new Error('share-header-invalid');
    }
    totalBytes += Buffer.byteLength(name) + Buffer.byteLength(headerValue);
    if (totalBytes > maximumHeaderBytes) throw new Error('share-headers-too-large');
    output[name] = headerValue.slice(0, 2_048);
  }
  return output;
};

const requireAllowedUrl = (value: string, allowedHosts: readonly string[], errorCode: string): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(errorCode);
  }
  const hostname = url.hostname.toLowerCase();
  if (
    (url.protocol !== 'https:' && url.protocol !== 'http:')
    || url.username
    || url.password
    || !allowedHosts.includes(hostname)
  ) {
    throw new Error(errorCode);
  }
  return url;
};

export class WorkshopPlaybackShareService {
  private readonly tasks = new Map<string, ShareTaskRecord>();

  constructor(
    private readonly plugins: Pick<WorkshopPluginService, 'getRuntimePolicy'>,
    private readonly now: () => number = Date.now,
  ) {}

  async getShareInfo(sourceId: string, itemId: string): Promise<WorkshopPlaybackShareInfo> {
    const policy = await this.requireSharePolicy(sourceId, itemId);
    const current = this.resolveCurrentTrack();
    return {
      available: current !== null,
      reason: current ? null : this.currentTrackUnavailableReason(),
      track: current?.publicTrack ?? null,
      allowedHosts: policy.networkHosts,
    };
  }

  async shareCurrentTrack(request: WorkshopPlaybackShareStartRequest): Promise<WorkshopPlaybackShareTask> {
    const policy = await this.requireSharePolicy(request.sourceId, request.itemId);
    const uploadUrl = requireAllowedUrl(request.uploadUrl, policy.networkHosts, 'share-destination-denied').toString();
    const current = this.resolveCurrentTrack();
    if (!current) throw new Error(this.currentTrackUnavailableReason() ?? 'file-unavailable');
    this.cleanupTasks();
    const activeTasks = [...this.tasks.values()].filter((task) =>
      task.sourceId === request.sourceId
      && task.itemId === request.itemId
      && (task.state === 'queued' || task.state === 'uploading'));
    if (activeTasks.length >= maximumActiveTasksPerPlugin) throw new Error('share-task-limit');
    const task: ShareTaskRecord = {
      id: randomBytes(18).toString('base64url'),
      state: 'queued',
      bytesSent: 0,
      totalBytes: current.publicTrack.sizeBytes,
      progress: 0,
      playbackUrl: null,
      expiresAt: null,
      error: null,
      track: current.publicTrack,
      sourceId: request.sourceId,
      itemId: request.itemId,
      filePath: current.filePath,
      uploadUrl,
      headers: normalizeHeaders(request.headers),
      roomId: typeof request.roomId === 'string' && request.roomId.trim()
        ? request.roomId.trim().slice(0, 160)
        : null,
      allowedHosts: policy.networkHosts,
      createdAtMs: this.now(),
    };
    this.tasks.set(task.id, task);
    this.prunePluginTasks(request.sourceId, request.itemId);
    void this.upload(task);
    return publicTask(task);
  }

  async getShareTask(request: WorkshopPlaybackShareTaskRequest): Promise<WorkshopPlaybackShareTask> {
    await this.requireSharePolicy(request.sourceId, request.itemId);
    this.cleanupTasks();
    const task = this.tasks.get(request.taskId);
    if (!task || task.sourceId !== request.sourceId || task.itemId !== request.itemId) {
      throw new Error('share-task-not-found');
    }
    return publicTask(task);
  }

  private async requireSharePolicy(sourceId: string, itemId: string) {
    const policy = await this.plugins.getRuntimePolicy(sourceId, itemId);
    if (!policy || !policy.permissions.includes('playback:share')) {
      throw new Error('capability-denied');
    }
    return policy;
  }

  private resolveCurrentTrack(): PrivateShareTrack | null {
    const status = getAudioSession().getStatus();
    const filePath = status.currentFilePath?.trim() ?? '';
    if (!filePath) return null;
    try {
      const file = statSync(filePath);
      if (!file.isFile()) return null;
      return {
        filePath,
        publicTrack: {
          id: status.currentTrackId,
          title: status.currentTrackTitle?.trim() || 'Current Track',
          artist: status.currentTrackArtist?.trim() || '',
          album: status.currentTrackAlbum?.trim() || '',
          durationSeconds: Math.max(0, status.durationSeconds),
          codec: status.codec,
          sizeBytes: file.size,
        },
      };
    } catch {
      return null;
    }
  }

  private currentTrackUnavailableReason(): WorkshopPlaybackShareInfo['reason'] {
    const status = getAudioSession().getStatus();
    if (!status.currentTrackId && !status.currentFilePath) return 'no-current-track';
    if (!status.currentFilePath || !/^(?:[a-z]:[\\/]|\\\\|\/)/iu.test(status.currentFilePath)) return 'not-local-file';
    return 'file-unavailable';
  }

  private upload(task: ShareTaskRecord): Promise<void> {
    task.state = 'uploading';
    return new Promise((resolve) => {
      const url = new URL(task.uploadUrl);
      const metadata = Buffer.from(JSON.stringify({
        track: task.track,
        roomId: task.roomId,
      }), 'utf8').toString('base64url');
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
        method: 'POST',
        headers: {
          ...task.headers,
          'content-type': mimeTypeForPath(task.filePath),
          'content-length': String(task.totalBytes),
          'x-echo-share-version': '1',
          'x-echo-track-metadata': metadata,
        },
      }, (response) => {
        const chunks: Buffer[] = [];
        let total = 0;
        response.on('data', (chunk: string | Buffer) => {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += bytes.length;
          if (total > maximumResponseBytes) {
            request.destroy(new Error('share-response-too-large'));
            return;
          }
          chunks.push(bytes);
        });
        response.on('end', () => {
          if (task.state === 'error') return resolve();
          try {
            if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
              throw new Error(`share-upload-http-${response.statusCode ?? 0}`);
            }
            const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
            const playbackUrlValue = typeof payload.playbackUrl === 'string'
              ? payload.playbackUrl
              : typeof payload.url === 'string' ? payload.url : '';
            task.playbackUrl = requireAllowedUrl(
              playbackUrlValue,
              task.allowedHosts,
              'share-playback-url-denied',
            ).toString();
            task.expiresAt = typeof payload.expiresAt === 'string' ? payload.expiresAt.slice(0, 80) : null;
            task.bytesSent = task.totalBytes;
            task.state = 'ready';
            resolve();
          } catch (error) {
            this.failTask(task, error);
            resolve();
          }
        });
      });
      request.setTimeout(uploadTimeoutMs, () => request.destroy(new Error('share-upload-timeout')));
      request.on('error', (error) => {
        this.failTask(task, error);
        resolve();
      });
      const stream = createReadStream(task.filePath);
      stream.on('data', (chunk: string | Buffer) => {
        task.bytesSent = Math.min(task.totalBytes, task.bytesSent + Buffer.byteLength(chunk));
      });
      stream.on('error', (error) => request.destroy(error));
      stream.pipe(request);
    });
  }

  private failTask(task: ShareTaskRecord, error: unknown): void {
    if (task.state === 'ready') return;
    task.state = 'error';
    task.error = error instanceof Error ? error.message.slice(0, 160) : 'share-upload-failed';
  }

  private cleanupTasks(): void {
    const cutoff = this.now() - taskRetentionMs;
    for (const [id, task] of this.tasks) {
      if (task.createdAtMs < cutoff && task.state !== 'uploading') this.tasks.delete(id);
    }
  }

  private prunePluginTasks(sourceId: string, itemId: string): void {
    const completed = [...this.tasks.values()]
      .filter((task) => task.sourceId === sourceId && task.itemId === itemId && task.state !== 'uploading' && task.state !== 'queued')
      .sort((left, right) => right.createdAtMs - left.createdAtMs);
    for (const task of completed.slice(maximumRetainedTasksPerPlugin)) this.tasks.delete(task.id);
  }
}

let boundWorkshopPlaybackShareService: WorkshopPlaybackShareService | null = null;

export const bindWorkshopPlaybackShareService = (service: WorkshopPlaybackShareService): void => {
  boundWorkshopPlaybackShareService = service;
};

export const getWorkshopPlaybackShareService = (): WorkshopPlaybackShareService => {
  if (!boundWorkshopPlaybackShareService) throw new Error('workshop-playback-share-unavailable');
  return boundWorkshopPlaybackShareService;
};
