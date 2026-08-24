import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type {
  WorkshopPluginCapability,
  WorkshopDependencyDeclaration,
  WorkshopDependencySummary,
  WorkshopPluginSnapshot,
  WorkshopPluginSummary,
} from '../../shared/types/workshop';
import {
  workshopPluginCapabilities,
} from '../../shared/types/workshop';
import type { PluginPackage } from '../../shared/types/plugins';
import { normalizePluginManifest } from '../plugins/PluginManifest';
import { normalizeWorkshopRelativePath } from './WorkshopManifest';
import { workshopVersionSatisfies } from './WorkshopCompatibilityService';
import { workshopPluginBridgeScript } from './WorkshopPluginBridgeScript';
import type { WorkshopRegistry } from './WorkshopRegistry';
import type { WorkshopRegistryRecord, WorkshopRegistryRevision } from './WorkshopRegistryTypes';
import type { WorkshopStagingInstaller } from './WorkshopStagingInstaller';

const maximumPackageBytes = 2 * 1024 * 1024;
const maximumFiles = 32;
const maximumFileBytes = 512 * 1024;
const maximumSettings = 32;
const maximumLyricsProviders = 8;
const maximumSourceProviders = 8;
const maximumTrackContextMenus = 16;
const maximumPlayerBarActions = 8;
const maximumMetadataProviders = 8;
const maximumCoverProviders = 8;
const maximumThemePresets = 12;
const supportedCapabilitySet = new Set<string>(workshopPluginCapabilities);
const supportedAssetExtensions = new Set(['.css', '.html', '.js', '.json', '.mjs']);

type PluginAsset = { body: string; mimeType: string };

type ParsedWorkshopPlugin = {
  manifest: Omit<ReturnType<typeof normalizePluginManifest>, 'permissions'> & {
    permissions: WorkshopPluginCapability[];
  };
  files: Map<string, string>;
  networkHosts: string[];
  dependencies: WorkshopDependencyDeclaration[];
  conflicts: string[];
};

export type WorkshopPluginRuntimePolicy = {
  permissions: WorkshopPluginCapability[];
  networkHosts: string[];
};

type WorkshopPluginRegistryPort = Pick<
  WorkshopRegistry,
  'get' | 'getSnapshot' | 'setApprovedCapabilities' | 'transition'
>;

type WorkshopPluginInstallerPort = Pick<WorkshopStagingInstaller, 'verifyRevision'>;

export type WorkshopPluginActivationResult =
  | { ok: true }
  | { ok: false; reason: string };

const encodeUrlSegment = (value: string): string => encodeURIComponent(value);

const buildPluginUrl = (sourceId: string, itemId: string, path: string): string =>
  `echo-workshop://plugin/${encodeUrlSegment(sourceId)}/${encodeUrlSegment(itemId)}/${path.split('/').map(encodeUrlSegment).join('/')}`;

const mimeTypeFor = (path: string): string | null => {
  switch (extname(path).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js':
    case '.mjs': return 'text/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    default: return null;
  }
};

const sameCapabilities = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);

const dependencySummary = (
  dependency: WorkshopDependencyDeclaration,
  installed: ReadonlyMap<string, string>,
): WorkshopDependencySummary => {
  const itemId = typeof dependency === 'string' ? dependency : dependency.itemId;
  const versionRange = typeof dependency === 'string' ? null : dependency.versionRange ?? null;
  const installedVersion = installed.get(itemId) ?? null;
  return {
    itemId,
    versionRange,
    optional: typeof dependency === 'string' ? false : dependency.optional === true,
    installedVersion,
    state: installedVersion === null
      ? 'missing'
      : workshopVersionSatisfies(installedVersion, versionRange) ? 'ready' : 'version-mismatch',
  };
};

const normalizeWorkshopPluginManifest = (input: unknown): ParsedWorkshopPlugin['manifest'] => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('plugin-manifest-invalid');
  const raw = input as Record<string, unknown>;
  const requested = raw.permissions === undefined ? [] : raw.permissions;
  if (!Array.isArray(requested)) {
    throw new Error('plugin-permission-invalid');
  }
  const permissions: WorkshopPluginCapability[] = [];
  for (const permission of requested) {
    if (typeof permission !== 'string' || !supportedCapabilitySet.has(permission) || permissions.includes(permission as WorkshopPluginCapability)) {
      throw new Error('plugin-permission-unsupported');
    }
    permissions.push(permission as WorkshopPluginCapability);
  }
  const rawContributes = raw.contributes && typeof raw.contributes === 'object' && !Array.isArray(raw.contributes)
    ? raw.contributes as Record<string, unknown>
    : {};
  const rawSettings = rawContributes.settings === undefined ? [] : rawContributes.settings;
  if (!Array.isArray(rawSettings) || rawSettings.length > maximumSettings) {
    throw new Error('plugin-settings-invalid');
  }
  if (rawSettings.some((setting) => setting && typeof setting === 'object' && !Array.isArray(setting)
    && (setting as Record<string, unknown>).type === 'secret')) {
    throw new Error('plugin-setting-secret-unsupported');
  }
  const normalized = normalizePluginManifest({ ...raw, permissions: [] });
  const commands = normalized.contributes?.commands ?? [];
  const rawTrackContextMenus = rawContributes.trackContextMenus === undefined ? [] : rawContributes.trackContextMenus;
  const trackContextMenus = normalized.contributes?.trackContextMenus ?? [];
  if (!Array.isArray(rawTrackContextMenus)
    || rawTrackContextMenus.length > maximumTrackContextMenus
    || trackContextMenus.length !== rawTrackContextMenus.length
    || new Set(trackContextMenus.map((item) => item.id)).size !== trackContextMenus.length
    || trackContextMenus.some((item) => !commands.some((command) => command.id === item.commandId))) {
    throw new Error('plugin-track-context-menus-invalid');
  }
  const rawPlayerBarActions = rawContributes.playerBarActions === undefined ? [] : rawContributes.playerBarActions;
  const playerBarActions = normalized.contributes?.playerBarActions ?? [];
  if (!Array.isArray(rawPlayerBarActions)
    || rawPlayerBarActions.length > maximumPlayerBarActions
    || playerBarActions.length !== rawPlayerBarActions.length
    || new Set(playerBarActions.map((item) => item.id)).size !== playerBarActions.length
    || playerBarActions.some((item) => !commands.some((command) => command.id === item.commandId))) {
    throw new Error('plugin-player-bar-actions-invalid');
  }
  const settings = normalized.contributes?.settings ?? [];
  if (settings.length !== rawSettings.length || new Set(settings.map((setting) => setting.id)).size !== settings.length) {
    throw new Error('plugin-settings-invalid');
  }
  if (settings.some((setting) => {
    if (setting.type === 'number') {
      if (setting.min !== undefined && setting.max !== undefined && setting.min > setting.max) return true;
      if (typeof setting.defaultValue === 'number'
        && ((setting.min !== undefined && setting.defaultValue < setting.min)
          || (setting.max !== undefined && setting.defaultValue > setting.max))) return true;
    }
    if (setting.type === 'select' && typeof setting.defaultValue === 'string'
      && !setting.options?.some((option) => option.value === setting.defaultValue)) return true;
    return false;
  })) {
    throw new Error('plugin-settings-invalid');
  }
  if (settings.length > 0 && !permissions.includes('fs:plugin')) {
    throw new Error('plugin-settings-require-storage');
  }
  const rawLyricsProviders = rawContributes.lyricsProviders === undefined ? [] : rawContributes.lyricsProviders;
  const lyricsProviders = normalized.contributes?.lyricsProviders ?? [];
  if (!Array.isArray(rawLyricsProviders)
    || rawLyricsProviders.length > maximumLyricsProviders
    || lyricsProviders.length !== rawLyricsProviders.length
    || new Set(lyricsProviders.map((provider) => provider.id)).size !== lyricsProviders.length) {
    throw new Error('plugin-lyrics-providers-invalid');
  }
  if (lyricsProviders.length > 0 && !permissions.includes('lyrics:provide')) {
    throw new Error('plugin-lyrics-providers-require-capability');
  }
  const rawSourceProviders = rawContributes.sourceProviders === undefined ? [] : rawContributes.sourceProviders;
  const sourceProviders = normalized.contributes?.sourceProviders ?? [];
  if (!Array.isArray(rawSourceProviders)
    || rawSourceProviders.length > maximumSourceProviders
    || sourceProviders.length !== rawSourceProviders.length
    || new Set(sourceProviders.map((provider) => provider.id)).size !== sourceProviders.length) {
    throw new Error('plugin-source-providers-invalid');
  }
  if (sourceProviders.length > 0 && !permissions.includes('sources:provide')) {
    throw new Error('plugin-source-providers-require-capability');
  }
  const rawMetadataProviders = rawContributes.metadataProviders === undefined ? [] : rawContributes.metadataProviders;
  const metadataProviders = normalized.contributes?.metadataProviders ?? [];
  if (!Array.isArray(rawMetadataProviders)
    || rawMetadataProviders.length > maximumMetadataProviders
    || metadataProviders.length !== rawMetadataProviders.length
    || new Set(metadataProviders.map((provider) => provider.id)).size !== metadataProviders.length) {
    throw new Error('plugin-metadata-providers-invalid');
  }
  const rawCoverProviders = rawContributes.coverProviders === undefined ? [] : rawContributes.coverProviders;
  const coverProviders = normalized.contributes?.coverProviders ?? [];
  if (!Array.isArray(rawCoverProviders)
    || rawCoverProviders.length > maximumCoverProviders
    || coverProviders.length !== rawCoverProviders.length
    || new Set(coverProviders.map((provider) => provider.id)).size !== coverProviders.length) {
    throw new Error('plugin-cover-providers-invalid');
  }
  const rawThemePresets = rawContributes.themePresets === undefined ? [] : rawContributes.themePresets;
  const themePresets = normalized.contributes?.themePresets ?? [];
  if (!Array.isArray(rawThemePresets)
    || rawThemePresets.length > maximumThemePresets
    || themePresets.length !== rawThemePresets.length
    || new Set(themePresets.map((preset) => preset.id)).size !== themePresets.length) {
    throw new Error('plugin-theme-presets-invalid');
  }
  return { ...normalized, permissions };
};

export const normalizeWorkshopPluginPackage = (input: unknown): ParsedWorkshopPlugin => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('plugin-package-invalid');
  const value = input as Partial<PluginPackage>;
  if (value.type !== 'echo-plugin-package' || value.version !== 1 || !Array.isArray(value.files)) {
    throw new Error('plugin-package-invalid');
  }
  if (value.files.length === 0 || value.files.length > maximumFiles) throw new Error('plugin-package-file-limit');
  const manifest = normalizeWorkshopPluginManifest(value.manifest);
  const files = new Map<string, string>();
  for (const file of value.files) {
    if (!file || typeof file !== 'object' || Array.isArray(file)) throw new Error('plugin-package-file-invalid');
    const path = normalizeWorkshopRelativePath(file.path, 'plugin_file_path');
    if (!supportedAssetExtensions.has(extname(path).toLowerCase()) || typeof file.content !== 'string') {
      throw new Error('plugin-package-file-type-unsupported');
    }
    if (Buffer.byteLength(file.content, 'utf8') > maximumFileBytes || files.has(path.toLowerCase())) {
      throw new Error('plugin-package-file-invalid');
    }
    files.set(path.toLowerCase(), file.content);
  }
  if (!manifest.entry || !files.has(manifest.entry.toLowerCase())) throw new Error('plugin-entry-missing');
  const panelPaths = [manifest.panel, ...(manifest.contributes?.panels ?? []).map((panel) => panel.path)]
    .filter((path): path is string => Boolean(path));
  if (panelPaths.some((path) => !files.has(path.toLowerCase()))) throw new Error('plugin-panel-missing');
  return { manifest, files, networkHosts: [], dependencies: [], conflicts: [] };
};

export class WorkshopPluginService {
  constructor(
    private readonly registry: WorkshopPluginRegistryPort,
    private readonly installer: WorkshopPluginInstallerPort,
  ) {}

  async getSnapshot(): Promise<WorkshopPluginSnapshot> {
    const records = this.registry.getSnapshot().records.filter((record) =>
      (record.activeRevision ?? record.candidateRevision)?.contentKind === 'plugin-package');
    const plugins = await Promise.all(records.map((record) => this.toSummary(record)));
    return { plugins: plugins.filter((plugin): plugin is WorkshopPluginSummary => plugin !== null) };
  }

  async enable(
    sourceId: string,
    itemId: string,
    approvedCapabilities: readonly WorkshopPluginCapability[] | undefined,
  ): Promise<WorkshopPluginActivationResult> {
    const record = this.registry.get(sourceId, itemId);
    if (!record || record.state !== 'disabled' || record.candidateRevision?.contentKind !== 'plugin-package') {
      return { ok: false, reason: 'state-invalid' };
    }
    try {
      const plugin = await this.loadPlugin(record.sourceId, record.itemId, record.candidateRevision);
      const requested = (plugin.manifest.permissions ?? []) as WorkshopPluginCapability[];
      if (!approvedCapabilities || !sameCapabilities(requested, approvedCapabilities)) {
        return { ok: false, reason: 'plugin-capabilities-confirmation-required' };
      }
      this.registry.setApprovedCapabilities(record.sourceId, record.itemId, requested);
      this.registry.transition(record.sourceId, record.itemId, 'enabled');
      return { ok: true };
    } catch {
      return { ok: false, reason: 'plugin-package-invalid' };
    }
  }

  async disable(sourceId: string, itemId: string): Promise<WorkshopPluginActivationResult> {
    const record = this.registry.get(sourceId, itemId);
    if (!record || record.state !== 'enabled' || record.activeRevision?.contentKind !== 'plugin-package') {
      return { ok: false, reason: 'state-invalid' };
    }
    try {
      this.registry.transition(record.sourceId, record.itemId, 'disabled');
      return { ok: true };
    } catch {
      return { ok: false, reason: 'registry-error' };
    }
  }

  async getRuntimePolicy(sourceId: string, itemId: string): Promise<WorkshopPluginRuntimePolicy | null> {
    const record = this.registry.get(sourceId, itemId);
    if (!record || record.state !== 'enabled' || !record.activeRevision || record.activeRevision.contentKind !== 'plugin-package') {
      return null;
    }
    try {
      const plugin = await this.loadPlugin(sourceId, itemId, record.activeRevision);
      const permissions = plugin.manifest.permissions ?? [];
      if (!sameCapabilities(record.approvedCapabilities, permissions)) return null;
      return { permissions, networkHosts: plugin.networkHosts };
    } catch {
      return null;
    }
  }

  async resolveAsset(sourceId: string, itemId: string, assetPathInput: string): Promise<PluginAsset | null> {
    const record = this.registry.get(sourceId, itemId);
    if (!record || record.state !== 'enabled' || !record.activeRevision || record.activeRevision.contentKind !== 'plugin-package') {
      return null;
    }
    try {
      const plugin = await this.loadPlugin(record.sourceId, record.itemId, record.activeRevision);
      const permissions = plugin.manifest.permissions ?? [];
      if (!sameCapabilities(record.approvedCapabilities, permissions)) return null;
      const assetPath = normalizeWorkshopRelativePath(assetPathInput, 'plugin_asset_path');
      if (assetPath === '__bridge__.js') {
        return { body: workshopPluginBridgeScript, mimeType: 'text/javascript; charset=utf-8' };
      }
      if (assetPath === '__runtime__.html') {
        const entry = plugin.manifest.entry;
        return {
          body: `<!doctype html><meta charset="utf-8"><script src="__bridge__.js"></script><script src="${entry}"></script>`,
          mimeType: 'text/html; charset=utf-8',
        };
      }
      const body = plugin.files.get(assetPath.toLowerCase());
      const mimeType = mimeTypeFor(assetPath);
      return body === undefined || !mimeType ? null : { body, mimeType };
    } catch {
      return null;
    }
  }

  private async toSummary(record: WorkshopRegistryRecord): Promise<WorkshopPluginSummary | null> {
    const revision = record.activeRevision ?? record.candidateRevision;
    if (!revision || revision.contentKind !== 'plugin-package') return null;
    try {
      const plugin = await this.loadPlugin(record.sourceId, record.itemId, revision);
      const installed = new Map(this.registry.getSnapshot().records.flatMap((entry) => {
        const installedRevision = entry.activeRevision ?? entry.candidateRevision;
        return installedRevision ? [[entry.itemId, installedRevision.version] as const] : [];
      }));
      const panels = plugin.manifest.contributes?.panels ?? [];
      const fallbackPanels = panels.length === 0 && plugin.manifest.panel
        ? [{ id: 'main', title: plugin.manifest.name, path: plugin.manifest.panel, placement: 'main' as const }]
        : panels;
      return {
        sourceId: record.sourceId,
        itemId: record.itemId,
        contentId: revision.contentId,
        version: revision.version,
        pluginId: plugin.manifest.id,
        name: plugin.manifest.name,
        permissions: (plugin.manifest.permissions ?? []) as WorkshopPluginCapability[],
        commands: (plugin.manifest.contributes?.commands ?? []).map((command) => ({
          id: command.id,
          title: command.title,
          description: command.description ?? null,
        })),
        trackContextMenus: (plugin.manifest.contributes?.trackContextMenus ?? []).map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description ?? null,
          commandId: item.commandId,
          localOnly: item.localOnly === true,
        })),
        playerBarActions: (plugin.manifest.contributes?.playerBarActions ?? []).map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description ?? null,
          commandId: item.commandId,
          icon: item.icon ?? 'blocks',
        })),
        panels: fallbackPanels.flatMap((panel) => panel.path ? [{
          id: panel.id,
          title: panel.title,
          placement: panel.placement ?? 'main',
          entryUrl: buildPluginUrl(record.sourceId, record.itemId, panel.path),
        }] : []),
        agents: (plugin.manifest.contributes?.agents ?? []).map((agent) => ({
          id: agent.id,
          title: agent.title,
          description: agent.description ?? null,
          inputPlaceholder: agent.inputPlaceholder ?? null,
        })),
        sourceProviders: (plugin.manifest.contributes?.sourceProviders ?? []).map((provider) => ({
          id: provider.id,
          title: provider.title,
          description: provider.description ?? null,
        })),
        lyricsProviders: (plugin.manifest.contributes?.lyricsProviders ?? []).map((provider) => ({
          id: provider.id,
          title: provider.title,
          description: provider.description ?? null,
        })),
        metadataProviders: (plugin.manifest.contributes?.metadataProviders ?? []).map((provider) => ({
          id: provider.id,
          title: provider.title,
          description: provider.description ?? null,
        })),
        coverProviders: (plugin.manifest.contributes?.coverProviders ?? []).map((provider) => ({
          id: provider.id,
          title: provider.title,
          description: provider.description ?? null,
        })),
        themePresets: (plugin.manifest.contributes?.themePresets ?? []).map((preset) => ({
          ...preset,
          description: preset.description ?? null,
        })),
        settings: (plugin.manifest.contributes?.settings ?? []).map((setting) => ({
          id: setting.id,
          title: setting.title,
          description: setting.description ?? null,
          type: setting.type as 'string' | 'select' | 'boolean' | 'number',
          defaultValue: setting.defaultValue ?? null,
          options: setting.options ?? [],
          placeholder: setting.placeholder ?? null,
          min: setting.min ?? null,
          max: setting.max ?? null,
          required: setting.required === true,
        })),
        networkHosts: plugin.networkHosts,
        dependencies: plugin.dependencies.map((dependency) => dependencySummary(dependency, installed)),
        conflicts: plugin.conflicts.filter((itemId) => installed.has(itemId)),
        runtimeEntryUrl: buildPluginUrl(record.sourceId, record.itemId, '__runtime__.html'),
        enabled: record.state === 'enabled',
        error: null,
      };
    } catch (error) {
      return {
        sourceId: record.sourceId,
        itemId: record.itemId,
        contentId: revision.contentId,
        version: revision.version,
        pluginId: revision.contentId,
        name: revision.contentId,
        permissions: [],
        commands: [],
        trackContextMenus: [],
        playerBarActions: [],
        panels: [],
        agents: [],
        sourceProviders: [],
        lyricsProviders: [],
        metadataProviders: [],
        coverProviders: [],
        themePresets: [],
        settings: [],
        networkHosts: [],
        dependencies: [],
        conflicts: [],
        runtimeEntryUrl: '',
        enabled: false,
        error: error instanceof Error ? error.message : 'plugin-package-invalid',
      };
    }
  }

  private async loadPlugin(
    sourceId: string,
    itemId: string,
    revision: WorkshopRegistryRevision,
  ): Promise<ParsedWorkshopPlugin> {
    const content = await this.installer.verifyRevision(sourceId, itemId, revision);
    const packagePath = join(content.rootDirectory, content.manifest.content.entry);
    const packageText = await readFile(packagePath, 'utf8');
    if (Buffer.byteLength(packageText, 'utf8') > maximumPackageBytes) throw new Error('plugin-package-too-large');
    const plugin = normalizeWorkshopPluginPackage(JSON.parse(packageText) as unknown);
    if (plugin.manifest.id !== content.manifest.id) throw new Error('plugin-id-mismatch');
    const networkHosts = content.manifest.networkHosts ?? [];
    if (networkHosts.length > 0
      && !plugin.manifest.permissions.includes('playback:share')
      && !plugin.manifest.permissions.includes('network:request')) {
      throw new Error('plugin-network-hosts-require-capability');
    }
    if (plugin.manifest.permissions.includes('network:request') && networkHosts.length === 0) {
      throw new Error('plugin-network-request-requires-hosts');
    }
    return {
      ...plugin,
      networkHosts,
      dependencies: content.manifest.dependencies ?? [],
      conflicts: content.manifest.conflicts ?? [],
    };
  }
}

let boundWorkshopPluginService: WorkshopPluginService | null = null;

export const bindWorkshopPluginService = (service: WorkshopPluginService): void => {
  boundWorkshopPluginService = service;
};

export const getBoundWorkshopPluginService = (): WorkshopPluginService | null => boundWorkshopPluginService;
