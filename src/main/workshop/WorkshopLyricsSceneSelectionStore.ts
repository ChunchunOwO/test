import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { normalizeWorkshopRegistryIdentity } from './WorkshopRegistryCodec';

export type WorkshopLyricsSceneSelection = {
  sourceId: string;
  itemId: string;
  contentId: string;
  version: string;
  manifestSha256: string;
  registryUpdatedAt: string;
};

type PersistedWorkshopLyricsSceneSelection = {
  formatVersion: 2;
  selection: WorkshopLyricsSceneSelection | null;
};

const sha256Pattern = /^[a-f0-9]{64}$/u;
const contentIdPattern = /^[a-z0-9](?:[a-z0-9._-]{1,78}[a-z0-9])?$/u;

export const getWorkshopLyricsSceneSelectionPath = (): string =>
  join(app.getPath('userData'), 'workshop', 'active-lyrics-scene.json');

const normalizeSelection = (value: unknown): WorkshopLyricsSceneSelection => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('workshop_lyrics_scene_selection_invalid');
  }
  const input = value as Partial<WorkshopLyricsSceneSelection>;
  const identity = normalizeWorkshopRegistryIdentity(input.sourceId ?? '', input.itemId ?? '');
  const contentId = typeof input.contentId === 'string' ? input.contentId.trim().toLowerCase() : '';
  const version = typeof input.version === 'string' ? input.version.trim() : '';
  const manifestSha256 = typeof input.manifestSha256 === 'string'
    ? input.manifestSha256.trim().toLowerCase()
    : '';
  const registryUpdatedAt = typeof input.registryUpdatedAt === 'string' ? input.registryUpdatedAt.trim() : '';
  if (
    !contentIdPattern.test(contentId) ||
    !version || version.length > 64 ||
    !sha256Pattern.test(manifestSha256) ||
    !registryUpdatedAt || registryUpdatedAt.length > 64
  ) {
    throw new Error('workshop_lyrics_scene_selection_invalid');
  }
  return { ...identity, contentId, version, manifestSha256, registryUpdatedAt };
};

export class WorkshopLyricsSceneSelectionStore {
  private readonly filePath: string;
  private selection: WorkshopLyricsSceneSelection | null;
  private writable = true;

  constructor(filePath = getWorkshopLyricsSceneSelectionPath()) {
    this.filePath = filePath;
    this.selection = this.load();
  }

  get(): WorkshopLyricsSceneSelection | null {
    return this.selection ? { ...this.selection } : null;
  }

  set(selectionInput: WorkshopLyricsSceneSelection | null): void {
    if (!this.writable) {
      throw new Error('workshop_lyrics_scene_selection_unreadable');
    }
    const selection = selectionInput ? normalizeSelection(selectionInput) : null;
    const payload: PersistedWorkshopLyricsSceneSelection = { formatVersion: 2, selection };
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    mkdirSync(dirname(this.filePath), { recursive: true });
    try {
      writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
      renameSync(temporaryPath, this.filePath);
      this.selection = selection;
    } catch (error) {
      rmSync(temporaryPath, { force: true });
      throw error;
    }
  }

  private load(): WorkshopLyricsSceneSelection | null {
    if (!existsSync(this.filePath)) {
      return null;
    }
    try {
      const input = JSON.parse(readFileSync(this.filePath, 'utf8')) as {
        formatVersion?: number;
        selection?: unknown;
      };
      if (input.formatVersion === 1) {
        // v1 did not bind selections to a Registry activation receipt. Discard it once,
        // then allow a later explicit Apply to write a safe v2 selection.
        return null;
      }
      if (input.formatVersion !== 2) {
        throw new Error('workshop_lyrics_scene_selection_version_invalid');
      }
      return input.selection ? normalizeSelection(input.selection) : null;
    } catch {
      this.writable = false;
      return null;
    }
  }
}
