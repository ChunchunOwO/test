import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import {
  workshopAuthoringKinds,
  workshopApplicableContentKinds,
  workshopManifestFileName,
  type WorkshopAuthoringDraft,
  type WorkshopAuthoringDraftInput,
  type WorkshopAuthoringKind,
  type WorkshopAuthoringValidation,
  type WorkshopContentKind,
  type WorkshopItemManifest,
  type WorkshopManifestFile,
} from '../../shared/types/workshop';
import { eqFrequenciesHz } from '../../shared/types/eq';
import { validateWorkshopContentDirectory, type ValidatedWorkshopContent } from './WorkshopContentValidator';
import { createWorkshopDataHandlerRegistry } from './WorkshopDataHandlers';
import { normalizeWorkshopRelativePath, normalizeWorkshopItemManifest } from './WorkshopManifest';
import { normalizeWorkshopPluginPackage } from './WorkshopPluginService';

export const echoWorkshopConsumerAppId = '5105090' as const;
export const workshopAuthoringProjectFileName = 'echo.workshop.project.json' as const;
export const workshopAuthoringVdfFileName = 'workshop-item.vdf' as const;
export const workshopAuthoringPreviewFileName = 'workshop-preview.html' as const;

export { workshopAuthoringKinds } from '../../shared/types/workshop';
export type { WorkshopAuthoringKind } from '../../shared/types/workshop';
export type WorkshopAuthoringVisibility = 'private' | 'friends-only' | 'unlisted' | 'public';

export type WorkshopAuthoringProjectConfig = {
  schemaVersion: 1;
  appId: typeof echoWorkshopConsumerAppId;
  publishedFileId: string;
  contentDirectory: string;
  previewFile: string;
  visibility: WorkshopAuthoringVisibility;
  description: string;
  changeNote: string;
  tags: string[];
};

export type CreateWorkshopAuthoringProjectOptions = {
  rootDirectory: string;
  kind: WorkshopAuthoringKind;
  id: string;
  title: string;
  licenseHolder: string;
  minEchoVersion: string;
};

export type PreparedWorkshopAuthoringProject = {
  rootDirectory: string;
  contentDirectory: string;
  previewPath: string;
  config: WorkshopAuthoringProjectConfig;
  manifest: WorkshopItemManifest;
  normalizedContribution: unknown;
  totalBytes: number;
  vdfPath: string;
  previewHtmlPath: string;
};

const visibilityNumber: Record<WorkshopAuthoringVisibility, string> = {
  public: '0',
  'friends-only': '1',
  private: '2',
  unlisted: '3',
};

const tagByKind: Record<WorkshopAuthoringKind, string> = {
  theme: 'Theme',
  'lyrics-style': 'Lyrics Scene',
  'visualizer-preset': 'Visualizer Preset',
  'dsp-preset': 'DSP / EQ Preset',
  'audio-plugin-profile': 'DSP / EQ Preset',
  'plugin-package': 'Sandboxed Plugin',
};

const entryFileByKind: Record<WorkshopAuthoringKind, string> = {
  theme: 'theme.json',
  'lyrics-style': 'lyrics-scene.json',
  'visualizer-preset': 'visualizer.json',
  'dsp-preset': 'dsp-preset.json',
  'audio-plugin-profile': 'audio-plugin-profile.json',
  'plugin-package': 'community.echo',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const boundedText = (value: unknown, field: string, maximum: number): string => {
  if (typeof value !== 'string') {
    throw new Error(`workshop_authoring_${field}_invalid`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) {
    throw new Error(`workshop_authoring_${field}_invalid`);
  }
  return normalized;
};

const safeProjectPath = (rootDirectory: string, value: unknown, field: string): string => {
  const relativePath = normalizeWorkshopRelativePath(value, field);
  const absolutePath = resolve(rootDirectory, ...relativePath.split('/'));
  const relativeToRoot = relative(rootDirectory, absolutePath);
  if (relativeToRoot.startsWith('..') || isAbsolute(relativeToRoot)) {
    throw new Error(`workshop_authoring_${field}_unsafe`);
  }
  return absolutePath;
};

const readJson = async (path: string, errorCode: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    throw new Error(errorCode);
  }
};

const writeJson = async (path: string, value: unknown): Promise<void> => {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const writeJsonAtomic = async (path: string, value: unknown): Promise<void> => {
  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeJson(temporaryPath, value);
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
};

const sha256File = async (path: string): Promise<string> => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
};

const toManifestPath = (rootDirectory: string, absolutePath: string): string =>
  relative(rootDirectory, absolutePath).split(sep).join('/');

const inventoryContentFiles = async (
  rootDirectory: string,
  directory = rootDirectory,
): Promise<WorkshopManifestFile[]> => {
  const files: WorkshopManifestFile[] = [];
  const visit = async (currentDirectory: string): Promise<void> => {
    const entries = await readdir(currentDirectory, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = resolve(currentDirectory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error('workshop_content_symlink_forbidden');
      }
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error('workshop_content_special_file_forbidden');
      }
      const manifestPath = normalizeWorkshopRelativePath(
        toManifestPath(rootDirectory, absolutePath),
        'file_path',
      );
      if (manifestPath.toLowerCase() === workshopManifestFileName.toLowerCase()) {
        continue;
      }
      const status = await lstat(absolutePath);
      files.push({
        path: manifestPath,
        size: status.size,
        sha256: await sha256File(absolutePath),
      });
    }
  };
  await visit(directory);
  return files.sort((left, right) => left.path.localeCompare(right.path, 'en'));
};

const entryTemplate = (kind: WorkshopAuthoringKind, id: string, title: string): unknown => {
  if (kind === 'theme') {
    return {
      type: 'echo-workshop-theme-preset',
      schemaVersion: 1,
      id,
      title,
      description: 'A highly customizable, data-only ECHO theme.',
      basePreset: 'classic',
      dark: {
        appBg: '#10131a',
        appBg2: '#151b26',
        panel: '#182231',
        accent: '#66ccff',
        accentStrong: '#8cdbff',
        heading: '#f5fbff',
        text: '#d8e8f3',
        muted: '#91a7b8',
        border: '#30465a',
        titlebar: '#111924',
        sidebar: '#121d29',
        player: '#172535',
        panelOpacityPercent: 72,
        glassPercent: 30,
        shadowPercent: 58,
        cornerRadiusPx: 18,
        panelBlurPx: 18,
        saturationPercent: 108,
        motionSpeedSeconds: 0.7,
        motionIntensityPercent: 86,
        motionEnabled: true,
      },
      light: {
        appBg: '#eef8fc',
        panel: '#f8fdff',
        accent: '#0b78d0',
        heading: '#132938',
        text: '#254252',
        muted: '#607b8a',
        border: '#b8d3df',
        panelOpacityPercent: 88,
        glassPercent: 18,
        cornerRadiusPx: 18,
        panelBlurPx: 14,
      },
      swatches: ['#10131a', '#182231', '#66ccff', '#8cdbff', '#eef8fc'],
      skin: {
        mode: 'shell',
        layout: {
          sidebarPosition: 'left',
          sidebarPresentation: 'overlay',
          sidebarWidth: 'wide',
          playerStyle: 'hero',
          titlebarStyle: 'immersive',
          contentDensity: 'editorial',
          cardStyle: 'glass',
          displayStyle: 'editorial',
          navStyle: 'pills',
          motion: 'cinematic',
        },
        stages: {
          home: 'cinema',
          lyrics: 'theater',
          queue: 'tickets',
          songs: 'poster',
        },
        effects: {
          grainPercent: 8,
          vignettePercent: 22,
          glowPercent: 18,
          scrimPercent: 38,
          bloomPercent: 12,
          mistPercent: 6,
          dimChromePercent: 12,
          spotlightPercent: 28,
          frostPercent: 8,
        },
      },
    };
  }
  if (kind === 'lyrics-style') {
    return {
      type: 'echo-workshop-lyrics-style',
      schemaVersion: 1,
      id,
      title,
      description: 'A declarative ECHO lyrics scene.',
      settings: {
        lyricsWordHighlightEnabled: true,
        lyricsMusicReactiveVisualsEnabled: true,
      },
      scene: {
        schemaVersion: 1,
        background: 'cover-blur',
        root: {
          id: 'stage',
          type: 'group',
          style: {
            display: 'grid',
            gridTemplateColumns: 'minmax(220px, 0.8fr) minmax(0, 1.2fr)',
            gap: 'clamp(24px, 4vw, 72px)',
            padding: '32px 5vw',
            height: '100%',
          },
          responsive: {
            compact: { gridTemplateColumns: '1fr', padding: '20px' },
          },
          children: [
            { id: 'cover', type: 'slot', slot: 'cover', style: { width: '100%', aspectRatio: '1 / 1', borderRadius: '28px' } },
            { id: 'lyrics', type: 'slot', slot: 'lyrics', options: { showTranslation: true, wordHighlightEnabled: true } },
          ],
        },
      },
    };
  }
  if (kind === 'visualizer-preset') {
    return {
      type: 'echo-workshop-visualizer-preset',
      schemaVersion: 1,
      id,
      title,
      style: 'bars',
      palette: ['#66ccff', '#99ffcc'],
      barCount: 48,
      smoothing: 0.75,
      sensitivity: 1.2,
      decay: 0.4,
      mirror: true,
    };
  }
  if (kind === 'plugin-package') {
    return {
      type: 'echo-plugin-package',
      version: 1,
      exportedAt: new Date().toISOString(),
      manifest: {
        id,
        name: title,
        version: '1.0.0',
        apiVersion: 2,
        entry: 'plugin.js',
        permissions: ['playback:read', 'library:read', 'sources:provide', 'sources:direct', 'agent:runtime', 'lyrics:provide', 'fs:plugin'],
        contributes: {
          commands: [
            { id: 'library-summary', title: '显示曲库摘要' },
            { id: 'inspect-track', title: '检查歌曲' },
          ],
          trackContextMenus: [{
            id: 'inspect-track-action',
            title: '检查歌曲',
            description: '显示选中歌曲的格式摘要。',
            commandId: 'inspect-track',
            localOnly: false,
          }],
          playerBarActions: [{
            id: 'library-summary-player-action',
            title: '曲库摘要',
            description: '从播放器栏运行插件命令。',
            commandId: 'library-summary',
            icon: 'sparkles',
          }],
          panels: [{ id: 'main', title, path: 'panel.html', placement: 'utility' }],
          agents: [{
            id: 'library-helper',
            title: '曲库助手',
            description: '由 Workshop 作者实现的示例 Agent。',
            inputPlaceholder: '例如：告诉我曲库规模',
          }],
          sourceProviders: [{
            id: 'sample-radio',
            title: '示例电台目录',
            description: '演示由插件搜索并解析为用户确认的直链音源。',
          }],
          lyricsProviders: [{
            id: 'sample-lyrics',
            title: '示例歌词源',
            description: '演示如何根据清理后的当前歌曲元数据返回歌词候选。',
          }],
          metadataProviders: [{
            id: 'sample-metadata',
            title: '示例元数据提供器',
            description: '返回可由用户选择并写入标签的候选字段。',
          }],
          coverProviders: [{
            id: 'sample-covers',
            title: '示例封面提供器',
            description: '把你有权使用的 HTTP(S) 图片地址作为封面候选返回。',
          }],
          themePresets: [{
            id: 'sample-aurora',
            title: '示例极光主题',
            description: '订阅者可在外观设置中导入并继续微调。',
            basePreset: 'classic',
            preview: 'linear-gradient(135deg, #08111f 0%, #257f96 58%, #f0b35b 100%)',
            swatches: ['#08111f', '#257f96', '#5cc8dc', '#f0b35b'],
            light: { appBg: '#eef8ff', panel: '#ffffff', accent: '#257f96', text: '#234150' },
            dark: { appBg: '#08111f', panel: '#142234', accent: '#5cc8dc', text: '#c8dce8' },
          }],
          settings: [
            {
              id: 'summary-style',
              title: '摘要风格',
              description: '控制示例 Agent 的回答方式。',
              type: 'select',
              defaultValue: 'brief',
              options: [
                { label: '简洁', value: 'brief' },
                { label: '详细', value: 'detailed' },
              ],
            },
            {
              id: 'show-notifications',
              title: '显示完成通知',
              type: 'boolean',
              defaultValue: true,
            },
          ],
        },
      },
      files: [
        {
          path: 'plugin.js',
          content: [
            "echo.commands.register('library-summary', { title: '显示曲库摘要' }, async () => {",
            '  const summary = await echo.library.getSummary();',
            "  await echo.storage.set('lastSummary', summary);",
            "  await echo.ui.notify(`曲库中有 ${summary.trackCount || 0} 首歌曲`);",
            '});',
            "echo.commands.register('inspect-track', { title: '检查歌曲' }, async (track) => {",
            "  await echo.ui.notify(`${track.title} · ${track.codec || 'unknown'} · ${track.sampleRate || 0} Hz`);",
            '});',
            "echo.agents.register('library-helper', { title: '曲库助手' }, async (input) => {",
            '  const summary = await echo.library.getSummary();',
            "  const settings = await echo.settings.get();",
            "  const answer = settings['summary-style'] === 'detailed' ? `本地曲库有 ${summary.trackCount || 0} 首歌曲、${summary.albumCount || 0} 张专辑。` : `本地曲库有 ${summary.trackCount || 0} 首歌曲。`;",
            "  if (settings['show-notifications']) await echo.ui.notify('曲库摘要已生成');",
            "  return { input: String(input || ''), answer };",
            '});',
            "echo.lyrics.registerProvider('sample-lyrics', { title: '示例歌词源' }, async ({ track, query }) => ({",
            '  candidates: [{',
            "    title: track.title, source: 'Workshop sample', language: 'zh-CN', confidence: 0.5,",
            "    text: `[00:00.00]${query || track.title}\\n[00:05.00]请把这里替换为你的合法歌词源结果`,",
            '  }],',
            '}));',
            "echo.metadata.registerProvider('sample-metadata', { title: '示例元数据提供器' }, async ({ track }) => ({",
            "  candidates: [{ title: track.title, artist: track.artist, album: track.album, source: 'Workshop sample', confidence: 0.5 }],",
            '}));',
            "echo.covers.registerProvider('sample-covers', { title: '示例封面提供器' }, async () => ({",
            '  candidates: [], // Replace with owned or authorized HTTP(S) image URLs.',
            '}));',
            "const sampleStations = [{ providerTrackId: 'ambient', title: 'Ambient Radio', artist: 'Workshop Sample', source: 'Packaged catalog', playable: true }];",
            "echo.sources.registerProvider('sample-radio', { title: '示例电台目录' }, {",
            '  search: async ({ query }) => {',
            "    const term = String(query || '').toLowerCase();",
            '    const tracks = sampleStations.filter((station) => !term || station.title.toLowerCase().includes(term));',
            '    return { tracks, total: tracks.length, hasMore: false };',
            '  },',
            "  resolve: async ({ providerTrackId }) => providerTrackId === 'ambient' ? { url: 'https://radio.example/live.mp3', title: 'Ambient Radio', artist: 'Workshop Sample', live: true } : Promise.reject(new Error('station-not-found')),",
            '});',
          ].join('\n'),
        },
        {
          path: 'panel.html',
          content: '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="panel.css"></head><body><main><h1>Workshop Plugin</h1><p id="summary">正在读取曲库…</p><input id="agent-input" placeholder="问问作者 Agent"><button id="agent-run">运行 Agent</button><pre id="agent-result"></pre><input id="source-url" placeholder="https://radio.example/live.mp3"><button id="source-play">播放直链音源</button></main><script src="__bridge__.js"></script><script src="panel.js"></script></body></html>',
        },
        {
          path: 'panel.css',
          content: ':root{color-scheme:dark}body{margin:0;padding:28px;font:15px system-ui;background:#101522;color:#eef5ff}main{display:grid;gap:12px;max-width:720px;margin:auto}h1{color:#8bdcff}input,button,pre{padding:10px;border-radius:8px}pre{white-space:pre-wrap}',
        },
        {
          path: 'panel.js',
          content: [
            "echo.library.getSummary().then((summary) => { document.getElementById('summary').textContent = `曲库中有 ${summary.trackCount || 0} 首歌曲、${summary.albumCount || 0} 张专辑。`; }).catch(() => { document.getElementById('summary').textContent = '无法读取曲库摘要。'; });",
            "document.getElementById('agent-run').onclick = async () => { const value = await echo.agents.run('library-helper', document.getElementById('agent-input').value); document.getElementById('agent-result').textContent = JSON.stringify(value, null, 2); };",
            "document.getElementById('source-play').onclick = () => echo.sources.playDirect({ url: document.getElementById('source-url').value, title: 'Workshop Direct Source' });",
          ].join('\n'),
        },
      ],
    };
  }
  if (kind === 'audio-plugin-profile') {
    return {
      type: 'echo-workshop-audio-plugin-profile',
      schemaVersion: 1,
      id,
      title,
      description: 'A portable mapping for a VST3 plug-in installed by the subscriber.',
      format: 'vst3',
      role: 'effect',
      plugin: {
        classId: '00000000000000000000000000000000',
        name: 'Replace with the local plug-in name',
        vendor: 'Replace with the plug-in vendor',
      },
      adapter: {
        api: 'echo.audio-plugin-adapter',
        minimumVersion: 1,
      },
      routing: {
        placement: 'post-dsp',
      },
      parameters: [
        { id: 0, title: 'Mix', kind: 'continuous', defaultValue: 1 },
      ],
      presets: [
        { id: 'default', title: 'Default', values: { 0: 1 } },
      ],
    };
  }
  return {
    type: 'echo-workshop-dsp-preset',
    schemaVersion: 1,
    id,
    title,
    preampDb: -6,
    bands: eqFrequenciesHz.map((frequencyHz) => ({ frequencyHz, gainDb: 0, q: 1 })),
  };
};

const normalizeProjectConfig = (value: unknown): WorkshopAuthoringProjectConfig => {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error('workshop_authoring_project_invalid');
  }
  if (value.appId !== echoWorkshopConsumerAppId) {
    throw new Error('workshop_authoring_main_app_id_required');
  }
  const publishedFileId = boundedText(value.publishedFileId, 'published_file_id', 20);
  if (!/^(?:0|[1-9]\d{0,19})$/u.test(publishedFileId)) {
    throw new Error('workshop_authoring_published_file_id_invalid');
  }
  const visibility = value.visibility;
  if (!['private', 'friends-only', 'unlisted', 'public'].includes(String(visibility))) {
    throw new Error('workshop_authoring_visibility_invalid');
  }
  const tags = Array.isArray(value.tags)
    ? value.tags.map((tag) => boundedText(tag, 'tag', 40))
    : [];
  if (tags.length === 0 || tags.length > 8 || new Set(tags).size !== tags.length) {
    throw new Error('workshop_authoring_tags_invalid');
  }
  return {
    schemaVersion: 1,
    appId: echoWorkshopConsumerAppId,
    publishedFileId,
    contentDirectory: boundedText(value.contentDirectory, 'content_directory', 160),
    previewFile: boundedText(value.previewFile, 'preview_file', 160),
    visibility: visibility as WorkshopAuthoringVisibility,
    description: boundedText(value.description, 'description', 8000),
    changeNote: boundedText(value.changeNote, 'change_note', 8000),
    tags,
  };
};

const validatePreview = async (previewPath: string): Promise<void> => {
  const extension = extname(previewPath).toLowerCase();
  if (!['.gif', '.jpeg', '.jpg', '.png'].includes(extension)) {
    throw new Error('workshop_authoring_preview_type_invalid');
  }
  const status = await lstat(previewPath);
  if (!status.isFile() || status.isSymbolicLink() || status.size <= 0 || status.size >= 1024 * 1024) {
    throw new Error('workshop_authoring_preview_invalid');
  }
};

const vdfEscape = (value: string): string => value.replaceAll('\\', '/').replaceAll('"', '\\"');

const buildWorkshopVdf = (
  config: WorkshopAuthoringProjectConfig,
  contentDirectory: string,
  previewPath: string,
  manifest: WorkshopItemManifest,
): string => `"workshopitem"
{
  "appid" "${echoWorkshopConsumerAppId}"
  "publishedfileid" "${config.publishedFileId}"
  "contentfolder" "${vdfEscape(contentDirectory)}"
  "previewfile" "${vdfEscape(previewPath)}"
  "visibility" "${visibilityNumber[config.visibility]}"
  "title" "${vdfEscape(manifest.title)}"
  "description" "${vdfEscape(config.description)}"
  "changenote" "${vdfEscape(config.changeNote)}"
}
`;

const htmlEscape = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const buildPreviewHtml = (
  config: WorkshopAuthoringProjectConfig,
  manifest: WorkshopItemManifest,
  previewFile: string,
  totalBytes: number,
): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${htmlEscape(manifest.title)} - ECHO Workshop preview</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, "Segoe UI", sans-serif; background: #0d1117; color: #edf4ff; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at 15% 10%, #173247, transparent 38%), #0d1117; }
    article { width: min(720px, calc(100vw - 40px)); overflow: hidden; border: 1px solid #2c3d4f; border-radius: 20px; background: #141b24; box-shadow: 0 24px 80px #0008; }
    img { width: 100%; max-height: 420px; object-fit: cover; display: block; background: #0a0e13; }
    main { padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    p { color: #adbed1; line-height: 1.55; }
    ul { display: flex; flex-wrap: wrap; gap: 8px; padding: 0; list-style: none; }
    li { padding: 6px 10px; border-radius: 999px; background: #223243; color: #cceaff; font-size: 13px; }
    footer { color: #8194a9; font-size: 12px; }
  </style>
</head>
<body>
  <article>
    <img src="${htmlEscape(previewFile)}" alt="">
    <main>
      <h1>${htmlEscape(manifest.title)}</h1>
      <p>${htmlEscape(config.description)}</p>
      <ul>${config.tags.map((tag) => `<li>${htmlEscape(tag)}</li>`).join('')}</ul>
      <footer>${htmlEscape(manifest.content.kind)} · ${htmlEscape(manifest.version)} · ${manifest.files.length} files · ${totalBytes} bytes · ${htmlEscape(config.visibility)}</footer>
    </main>
  </article>
</body>
</html>
`;

const validateEntry = async (validated: ValidatedWorkshopContent): Promise<unknown> => {
  if (validated.manifest.content.kind === 'plugin-package') {
    const entryPath = resolve(validated.rootDirectory, ...validated.manifest.content.entry.split('/'));
    const plugin = normalizeWorkshopPluginPackage(await readJson(entryPath, 'workshop_plugin_package_invalid_json'));
    return {
      id: plugin.manifest.id,
      name: plugin.manifest.name,
      permissions: plugin.manifest.permissions ?? [],
      networkHosts: validated.manifest.networkHosts ?? [],
      commands: plugin.manifest.contributes?.commands ?? [],
      panels: plugin.manifest.contributes?.panels ?? [],
      sourceProviders: plugin.manifest.contributes?.sourceProviders ?? [],
      settings: plugin.manifest.contributes?.settings ?? [],
    };
  }
  if (!(workshopApplicableContentKinds as readonly WorkshopContentKind[]).includes(validated.manifest.content.kind) &&
      validated.manifest.content.kind !== 'audio-plugin-profile') {
    throw new Error('workshop_authoring_data_only_required');
  }
  const entryPath = resolve(validated.rootDirectory, ...validated.manifest.content.entry.split('/'));
  const entry = await readJson(entryPath, 'workshop_data_entry_invalid_json');
  return createWorkshopDataHandlerRegistry().normalize(
    validated.manifest.content.kind as Parameters<ReturnType<typeof createWorkshopDataHandlerRegistry>['normalize']>[0],
    entry,
    validated.manifest.id,
  );
};

const parseDraftJson = (text: string, errorCode: string): unknown => {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 2 * 1024 * 1024) {
    throw new Error(errorCode);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(errorCode);
  }
};

const validateDraftValues = (input: WorkshopAuthoringDraftInput): {
  manifest: WorkshopItemManifest;
  entry: unknown;
  normalizedContribution: unknown;
} => {
  const manifest = normalizeWorkshopItemManifest(parseDraftJson(
    input.manifestText,
    'workshop_authoring_manifest_invalid_json',
  ));
  if (!(workshopAuthoringKinds as readonly string[]).includes(manifest.content.kind)) {
    throw new Error('workshop_authoring_kind_unsupported');
  }
  const entry = parseDraftJson(input.entryText, 'workshop_authoring_entry_invalid_json');
  const normalizedContribution = manifest.content.kind === 'plugin-package'
    ? normalizeWorkshopPluginPackage(entry)
    : createWorkshopDataHandlerRegistry().normalize(
        manifest.content.kind as Parameters<ReturnType<typeof createWorkshopDataHandlerRegistry>['normalize']>[0],
        entry,
        manifest.id,
      );
  return { manifest, entry, normalizedContribution };
};

export class WorkshopAuthoringService {
  async createProject(options: CreateWorkshopAuthoringProjectOptions): Promise<string> {
    const kind = options.kind;
    if (!(workshopAuthoringKinds as readonly string[]).includes(kind)) {
      throw new Error('workshop_authoring_kind_unsupported');
    }
    const rootDirectory = resolve(options.rootDirectory);
    try {
      const existing = await readdir(rootDirectory);
      if (existing.length > 0) {
        throw new Error('workshop_authoring_project_not_empty');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    await mkdir(rootDirectory, { recursive: true });
    const contentDirectory = resolve(rootDirectory, 'content');
    await mkdir(contentDirectory, { recursive: true });

    const id = boundedText(options.id, 'id', 80).toLowerCase();
    const title = boundedText(options.title, 'title', 120);
    const licenseHolder = boundedText(options.licenseHolder, 'license_holder', 160);
    const minEchoVersion = boundedText(options.minEchoVersion, 'min_echo_version', 48);
    const entry = entryFileByKind[kind];
    const entryPath = resolve(contentDirectory, entry);
    await writeJson(entryPath, entryTemplate(kind, id, title));

    const status = await lstat(entryPath);
    const manifest = normalizeWorkshopItemManifest({
      type: 'echo-workshop-item',
      schemaVersion: 1,
      id,
      title,
      version: '1.0.0',
      content: { kind, entry },
      compatibility: {
        minEchoVersion,
        ...(kind === 'plugin-package' ? { pluginApiVersion: 2 } : {}),
      },
      files: [{ path: entry, size: status.size, sha256: await sha256File(entryPath) }],
      license: { id: 'All-Rights-Reserved', holder: licenseHolder },
    });
    await writeJson(resolve(contentDirectory, workshopManifestFileName), manifest);
    await writeJson(resolve(rootDirectory, workshopAuthoringProjectFileName), {
      schemaVersion: 1,
      appId: echoWorkshopConsumerAppId,
      publishedFileId: '0',
      contentDirectory: 'content',
      previewFile: 'preview.jpg',
      visibility: 'private',
      description: `${title} for ECHO.`,
      changeNote: 'Initial private test upload.',
      tags: [tagByKind[kind]],
    } satisfies WorkshopAuthoringProjectConfig);
    await writeFile(resolve(rootDirectory, 'README.md'), `# ${title}\n\n1. Edit \`content/${entry}\`.\n2. Add a JPG/PNG/GIF preview under 1 MB as \`preview.jpg\`.\n3. Run \`npm run workshop:author -- prepare "${rootDirectory}"\`.\n4. Review \`workshop-preview.html\` and \`workshop-item.vdf\`.\n\nThe generated VDF is private and targets ECHO AppID ${echoWorkshopConsumerAppId}.\n`, 'utf8');
    return rootDirectory;
  }

  async validateProject(inputRootDirectory: string): Promise<PreparedWorkshopAuthoringProject> {
    return this.inspectProject(inputRootDirectory, false);
  }

  validateDraft(input: WorkshopAuthoringDraftInput): WorkshopAuthoringValidation {
    try {
      const result = validateDraftValues(input);
      return {
        ok: true,
        kind: result.manifest.content.kind as WorkshopAuthoringKind,
        id: result.manifest.id,
        title: result.manifest.title,
        normalizedContribution: result.normalizedContribution,
        error: null,
      };
    } catch (error) {
      return {
        ok: false,
        kind: null,
        id: null,
        title: null,
        normalizedContribution: null,
        error: error instanceof Error ? error.message : 'workshop_authoring_draft_invalid',
      };
    }
  }

  async readDraft(inputRootDirectory: string): Promise<WorkshopAuthoringDraft> {
    const rootDirectory = resolve(inputRootDirectory);
    const config = normalizeProjectConfig(await readJson(
      resolve(rootDirectory, workshopAuthoringProjectFileName),
      'workshop_authoring_project_invalid',
    ));
    const contentDirectory = safeProjectPath(rootDirectory, config.contentDirectory, 'content_directory');
    const manifestPath = resolve(contentDirectory, workshopManifestFileName);
    const manifestText = await readFile(manifestPath, 'utf8');
    const manifest = normalizeWorkshopItemManifest(parseDraftJson(
      manifestText,
      'workshop_authoring_manifest_invalid_json',
    ));
    if (!(workshopAuthoringKinds as readonly string[]).includes(manifest.content.kind)) {
      throw new Error('workshop_authoring_kind_unsupported');
    }
    const entryPath = safeProjectPath(contentDirectory, manifest.content.entry, 'content_entry');
    return {
      rootDirectory,
      entryPath: manifest.content.entry,
      kind: manifest.content.kind as WorkshopAuthoringKind,
      id: manifest.id,
      title: manifest.title,
      manifestText,
      entryText: await readFile(entryPath, 'utf8'),
      publication: {
        publishedFileId: config.publishedFileId,
        visibility: config.visibility,
        description: config.description,
        changeNote: config.changeNote,
        tags: [...config.tags],
      },
    };
  }

  async saveDraft(
    inputRootDirectory: string,
    input: WorkshopAuthoringDraftInput & { publication?: WorkshopAuthoringDraft['publication'] },
  ): Promise<WorkshopAuthoringDraft> {
    const validated = validateDraftValues(input);
    const rootDirectory = resolve(inputRootDirectory);
    const config = normalizeProjectConfig(await readJson(
      resolve(rootDirectory, workshopAuthoringProjectFileName),
      'workshop_authoring_project_invalid',
    ));
    const publication = input.publication ?? config;
    const visibility = publication.visibility;
    if (!['private', 'friends-only', 'unlisted', 'public'].includes(visibility)) {
      throw new Error('workshop_authoring_visibility_invalid');
    }
    const description = boundedText(publication.description, 'description', 8_000);
    const changeNote = boundedText(publication.changeNote, 'change_note', 1_000);
    if (!Array.isArray(publication.tags)) throw new Error('workshop_authoring_tags_invalid');
    const tags = Array.from(new Set(publication.tags.map((tag: string) => boundedText(tag, 'tag', 64))));
    if (tags.length === 0 || tags.length > 16) throw new Error('workshop_authoring_tags_invalid');
    const contentDirectory = safeProjectPath(rootDirectory, config.contentDirectory, 'content_directory');
    const entryPath = safeProjectPath(contentDirectory, validated.manifest.content.entry, 'content_entry');
    await writeJsonAtomic(entryPath, validated.entry);
    const manifest = normalizeWorkshopItemManifest({
      ...validated.manifest,
      files: await inventoryContentFiles(contentDirectory),
    });
    await writeJsonAtomic(resolve(contentDirectory, workshopManifestFileName), manifest);
    await writeJsonAtomic(resolve(rootDirectory, workshopAuthoringProjectFileName), {
      ...config,
      visibility,
      description,
      changeNote,
      tags,
    });
    return this.readDraft(rootDirectory);
  }

  async prepareProject(inputRootDirectory: string): Promise<PreparedWorkshopAuthoringProject> {
    return this.inspectProject(inputRootDirectory, true);
  }

  async recordPublishedFileId(inputRootDirectory: string, publishedFileIdInput: string): Promise<void> {
    const publishedFileId = boundedText(publishedFileIdInput, 'published_file_id', 20);
    if (!/^[1-9]\d{0,19}$/u.test(publishedFileId)) {
      throw new Error('workshop_authoring_published_file_id_invalid');
    }
    const rootDirectory = resolve(inputRootDirectory);
    const configPath = resolve(rootDirectory, workshopAuthoringProjectFileName);
    const config = normalizeProjectConfig(await readJson(
      configPath,
      'workshop_authoring_project_invalid',
    ));
    await writeJsonAtomic(configPath, { ...config, publishedFileId });
  }

  private async inspectProject(
    inputRootDirectory: string,
    prepare: boolean,
  ): Promise<PreparedWorkshopAuthoringProject> {
    const rootDirectory = resolve(inputRootDirectory);
    const config = normalizeProjectConfig(await readJson(
      resolve(rootDirectory, workshopAuthoringProjectFileName),
      'workshop_authoring_project_invalid',
    ));
    const contentDirectory = safeProjectPath(rootDirectory, config.contentDirectory, 'content_directory');
    const previewPath = safeProjectPath(rootDirectory, config.previewFile, 'preview_file');
    await validatePreview(previewPath);
    const manifestPath = resolve(contentDirectory, workshopManifestFileName);

    if (prepare) {
      const manifestInput = await readJson(manifestPath, 'workshop_content_manifest_invalid');
      if (!isRecord(manifestInput)) {
        throw new Error('workshop_content_manifest_invalid');
      }
      const manifest = normalizeWorkshopItemManifest({
        ...manifestInput,
        files: await inventoryContentFiles(contentDirectory),
      });
      await writeJsonAtomic(manifestPath, manifest);
    }

    const validated = await validateWorkshopContentDirectory(contentDirectory);
    const normalizedContribution = await validateEntry(validated);
    const vdfPath = resolve(rootDirectory, workshopAuthoringVdfFileName);
    const previewHtmlPath = resolve(rootDirectory, workshopAuthoringPreviewFileName);
    if (prepare) {
      await writeFile(vdfPath, buildWorkshopVdf(
        config,
        contentDirectory,
        previewPath,
        validated.manifest,
      ), 'utf8');
      await writeFile(previewHtmlPath, buildPreviewHtml(
        config,
        validated.manifest,
        config.previewFile,
        validated.totalBytes,
      ), 'utf8');
    }
    return {
      rootDirectory,
      contentDirectory,
      previewPath,
      config,
      manifest: validated.manifest,
      normalizedContribution,
      totalBytes: validated.totalBytes,
      vdfPath,
      previewHtmlPath,
    };
  }
}
