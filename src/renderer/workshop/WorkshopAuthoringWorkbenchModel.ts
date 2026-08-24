import type {
  WorkshopAuthoringKind,
  WorkshopAuthoringValidation,
  WorkshopDependencyDeclaration,
} from '../../shared/types/workshop';

type JsonRecord = Record<string, unknown>;

export type WorkshopAuthoringManifestForm = {
  title: string;
  version: string;
  minEchoVersion: string;
  maxEchoVersion: string;
  licenseId: string;
  licenseHolder: string;
  licenseSourceUrl: string;
  dependenciesText: string;
  conflictsText: string;
  networkHostsText: string;
};

export type WorkshopAuthoringField = {
  path: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  options?: readonly string[];
};

export type WorkshopAuthoringScenario = {
  id: 'healthy-playing' | 'empty-library' | 'missing-lyrics' | 'playback-ended' | 'provider-offline';
  title: string;
  description: string;
  payload: JsonRecord;
};

export type WorkshopAuthoringQualityIssue = {
  code: string;
  severity: 'pass' | 'warning' | 'blocker';
  title: string;
  detail: string;
};

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseRecord = (text: string, code: string): JsonRecord => {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error(code);
  }
  if (!isRecord(value)) throw new Error(code);
  return value;
};

const textList = (value: unknown): string =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').join('\n') : '';

const dependencyLine = (dependency: WorkshopDependencyDeclaration): string => {
  if (typeof dependency === 'string') return dependency;
  return [dependency.itemId, dependency.versionRange ?? '', dependency.optional ? 'optional' : '']
    .filter(Boolean)
    .join(' | ');
};

const parseLines = (value: string): string[] => [...new Set(value
  .split(/[\n,]/u)
  .map((entry) => entry.trim())
  .filter(Boolean))];

const parseDependencies = (value: string): WorkshopDependencyDeclaration[] => parseLines(value).map((line) => {
  const [itemId = '', versionRange = '', optional = ''] = line.split('|').map((part) => part.trim());
  if (!itemId) throw new Error('workshop_authoring_dependency_invalid');
  if (!versionRange && !optional) return itemId;
  return {
    itemId,
    ...(versionRange ? { versionRange } : {}),
    ...(optional.toLowerCase() === 'optional' ? { optional: true } : {}),
  };
});

export const readWorkshopAuthoringManifestForm = (manifestText: string): WorkshopAuthoringManifestForm => {
  const manifest = parseRecord(manifestText, 'workshop_authoring_manifest_invalid_json');
  const compatibility = isRecord(manifest.compatibility) ? manifest.compatibility : {};
  const license = isRecord(manifest.license) ? manifest.license : {};
  const dependencies = Array.isArray(manifest.dependencies)
    ? manifest.dependencies.filter((entry): entry is WorkshopDependencyDeclaration =>
        typeof entry === 'string' || isRecord(entry))
    : [];
  return {
    title: typeof manifest.title === 'string' ? manifest.title : '',
    version: typeof manifest.version === 'string' ? manifest.version : '',
    minEchoVersion: typeof compatibility.minEchoVersion === 'string' ? compatibility.minEchoVersion : '',
    maxEchoVersion: typeof compatibility.maxEchoVersion === 'string' ? compatibility.maxEchoVersion : '',
    licenseId: typeof license.id === 'string' ? license.id : '',
    licenseHolder: typeof license.holder === 'string' ? license.holder : '',
    licenseSourceUrl: typeof license.sourceUrl === 'string' ? license.sourceUrl : '',
    dependenciesText: dependencies.map(dependencyLine).join('\n'),
    conflictsText: textList(manifest.conflicts),
    networkHostsText: textList(manifest.networkHosts),
  };
};

export const writeWorkshopAuthoringManifestForm = (
  manifestText: string,
  form: WorkshopAuthoringManifestForm,
): string => {
  const manifest = parseRecord(manifestText, 'workshop_authoring_manifest_invalid_json');
  const compatibility = isRecord(manifest.compatibility) ? { ...manifest.compatibility } : {};
  compatibility.minEchoVersion = form.minEchoVersion.trim();
  if (form.maxEchoVersion.trim()) compatibility.maxEchoVersion = form.maxEchoVersion.trim();
  else delete compatibility.maxEchoVersion;
  const license: JsonRecord = { id: form.licenseId.trim(), holder: form.licenseHolder.trim() };
  if (form.licenseSourceUrl.trim()) license.sourceUrl = form.licenseSourceUrl.trim();
  const dependencies = parseDependencies(form.dependenciesText);
  const conflicts = parseLines(form.conflictsText);
  const networkHosts = parseLines(form.networkHostsText).map((host) => host.toLowerCase());
  const next: JsonRecord = {
    ...manifest,
    title: form.title.trim(),
    version: form.version.trim(),
    compatibility,
    license,
  };
  if (dependencies.length) next.dependencies = dependencies;
  else delete next.dependencies;
  if (conflicts.length) next.conflicts = conflicts;
  else delete next.conflicts;
  if (networkHosts.length) next.networkHosts = networkHosts;
  else delete next.networkHosts;
  return `${JSON.stringify(next, null, 2)}\n`;
};

const commonFields: readonly WorkshopAuthoringField[] = [
  { path: 'title', label: '内容标题', type: 'text' },
  { path: 'description', label: '内容说明', type: 'text' },
];

const fieldsByKind: Record<WorkshopAuthoringKind, readonly WorkshopAuthoringField[]> = {
  theme: [...commonFields,
    { path: 'basePreset', label: '基础主题', type: 'text' },
    { path: 'dark.accent', label: '深色强调色', type: 'text' },
    { path: 'dark.cornerRadiusPx', label: '圆角像素', type: 'number' },
    { path: 'dark.motionEnabled', label: '启用动效', type: 'boolean' }],
  'lyrics-style': [...commonFields,
    { path: 'scene.background', label: '歌词背景', type: 'select', options: ['cover-blur', 'cover', 'solid', 'none'] },
    { path: 'settings.lyricsWordHighlightEnabled', label: '逐字高亮', type: 'boolean' },
    { path: 'settings.lyricsMusicReactiveVisualsEnabled', label: '音乐响应', type: 'boolean' }],
  'visualizer-preset': [
    { path: 'title', label: '内容标题', type: 'text' },
    { path: 'style', label: '可视化样式', type: 'select', options: ['bars', 'wave', 'radial', 'particles'] },
    { path: 'barCount', label: '柱数量', type: 'number' },
    { path: 'smoothing', label: '平滑度', type: 'number' },
    { path: 'sensitivity', label: '灵敏度', type: 'number' },
    { path: 'mirror', label: '镜像', type: 'boolean' }],
  'dsp-preset': [
    { path: 'title', label: '内容标题', type: 'text' },
    { path: 'preampDb', label: '前级增益 dB', type: 'number' }],
  'audio-plugin-profile': [...commonFields,
    { path: 'plugin.classId', label: 'VST3 Class ID', type: 'text' },
    { path: 'plugin.name', label: '本机插件名称', type: 'text' },
    { path: 'plugin.vendor', label: '插件厂商', type: 'text' },
    { path: 'routing.placement', label: '路由位置', type: 'select', options: ['pre-dsp', 'post-dsp'] }],
  'plugin-package': [
    { path: 'manifest.name', label: '插件名称', type: 'text' },
    { path: 'manifest.version', label: '插件版本', type: 'text' },
    { path: 'manifest.entry', label: '后台入口', type: 'text' },
    { path: 'manifest.apiVersion', label: 'API 版本', type: 'number' }],
};

export const getWorkshopAuthoringFields = (kind: WorkshopAuthoringKind): readonly WorkshopAuthoringField[] =>
  fieldsByKind[kind];

export const readWorkshopAuthoringEntryField = (entryText: string, path: string): unknown => {
  let current: unknown = parseRecord(entryText, 'workshop_authoring_entry_invalid_json');
  for (const segment of path.split('.')) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
};

export const writeWorkshopAuthoringEntryField = (
  entryText: string,
  path: string,
  value: string | number | boolean,
): string => {
  const entry = parseRecord(entryText, 'workshop_authoring_entry_invalid_json');
  const segments = path.split('.');
  let current = entry;
  segments.slice(0, -1).forEach((segment) => {
    if (!isRecord(current[segment])) current[segment] = {};
    current = current[segment] as JsonRecord;
  });
  current[segments[segments.length - 1]!] = value;
  return `${JSON.stringify(entry, null, 2)}\n`;
};

export const workshopAuthoringScenarios: readonly WorkshopAuthoringScenario[] = [
  {
    id: 'healthy-playing', title: '正常播放', description: '本地曲库、逐行歌词与频谱都可用。',
    payload: {
      playbackStatus: { state: 'playing', trackId: 'fixture-track-01', position: 42.5, duration: 221.2 },
      track: { id: 'fixture-track-01', title: 'Neon Harbor', artist: 'ECHO Fixtures', album: 'Local Signals', codec: 'FLAC', sampleRate: 96000 },
      librarySummary: { trackCount: 1248, albumCount: 96, artistCount: 143, playlistCount: 7 },
      lyrics: { available: true, synchronized: true, currentLine: 'Mock lyrics stay inside the authoring preview.' },
      spectrum: { bands: [0.08, 0.2, 0.46, 0.72, 0.51, 0.3, 0.12], energy: 0.48, transient: 0.22 },
    },
  },
  {
    id: 'empty-library', title: '空曲库', description: '验证空状态和缺少可操作曲目的表现。',
    payload: { playbackStatus: { state: 'stopped' }, librarySummary: { trackCount: 0, albumCount: 0, artistCount: 0, playlistCount: 0 }, queue: { items: [] } },
  },
  {
    id: 'missing-lyrics', title: '无歌词', description: '歌曲正常播放，但没有任何歌词候选。',
    payload: { playbackStatus: { state: 'playing', trackId: 'fixture-track-02', position: 18, duration: 184 }, track: { id: 'fixture-track-02', title: 'Instrumental Fixture', artist: 'ECHO Fixtures' }, lyrics: { available: false }, spectrum: { bands: [0.1, 0.4, 0.65, 0.3], energy: 0.36 } },
  },
  {
    id: 'playback-ended', title: '真实播放结束', description: '只模拟宿主已经确认的 ended，不根据进度条推断。',
    payload: { playbackStatus: { state: 'ended', trackId: 'fixture-track-01', position: 221.2, duration: 221.2, nativeBufferedMs: 0 }, queue: { currentQueueId: 'fixture-track-01', canGoNext: true } },
  },
  {
    id: 'provider-offline', title: '提供器离线', description: '网络歌词源、音源目录或 Agent 服务失败。',
    payload: { network: { ok: false, error: 'fixture-provider-unavailable', retryable: true }, playbackStatus: { state: 'paused', trackId: 'fixture-track-01' } },
  },
] as const;

export const buildWorkshopAuthoringQualityReport = (
  kind: WorkshopAuthoringKind,
  manifestText: string,
  entryText: string,
  validation: WorkshopAuthoringValidation | null,
): WorkshopAuthoringQualityIssue[] => {
  const issues: WorkshopAuthoringQualityIssue[] = [];
  if (!validation?.ok) {
    return [{ code: 'schema', severity: 'blocker', title: 'Schema 校验未通过', detail: validation?.error ?? '等待实时校验。' }];
  }
  const manifest = parseRecord(manifestText, 'workshop_authoring_manifest_invalid_json');
  const entry = parseRecord(entryText, 'workshop_authoring_entry_invalid_json');
  issues.push({ code: 'schema', severity: 'pass', title: 'Schema 与内容规范', detail: '清单、入口与内容类型可以被当前 ECHO 正常化。' });
  const license = isRecord(manifest.license) ? manifest.license : {};
  const sourceRequired = typeof license.id === 'string' && !['All-Rights-Reserved', 'Proprietary'].includes(license.id);
  issues.push(sourceRequired && typeof license.sourceUrl !== 'string'
    ? { code: 'license-source', severity: 'warning', title: '缺少许可证来源', detail: '使用第三方或开放许可证时建议填写可核对的 sourceUrl。' }
    : { code: 'license-source', severity: 'pass', title: '权利声明已填写', detail: '包体清单包含许可证与权利人。' });
  const serialized = JSON.stringify(entry);
  if (/radio\.example|Replace with|00000000000000000000000000000000/iu.test(serialized)) {
    issues.push({ code: 'placeholder', severity: kind === 'audio-plugin-profile' ? 'blocker' : 'warning', title: '仍有模板占位内容', detail: '替换 example 域名、Replace with 文案或全零 Class ID 后再发布。' });
  } else {
    issues.push({ code: 'placeholder', severity: 'pass', title: '未发现模板占位', detail: '常见示例域名和占位标识已清理。' });
  }
  if (kind === 'plugin-package') {
    const pluginManifest = isRecord(entry.manifest) ? entry.manifest : {};
    const permissions = Array.isArray(pluginManifest.permissions) ? pluginManifest.permissions : [];
    const hosts = Array.isArray(manifest.networkHosts) ? manifest.networkHosts : [];
    issues.push(permissions.includes('network:request') && hosts.length === 0
      ? { code: 'network-hosts', severity: 'blocker', title: '网络权限没有域名', detail: 'network:request 必须配套声明固定 networkHosts。' }
      : { code: 'network-hosts', severity: 'pass', title: '网络声明一致', detail: '网络权限与宿主清单没有发现明显矛盾。' });
  }
  issues.push({ code: 'fixtures', severity: 'pass', title: '模拟场景可用', detail: `${workshopAuthoringScenarios.length} 个本地场景不会读取真实曲库、路径或账号。` });
  return issues;
};

