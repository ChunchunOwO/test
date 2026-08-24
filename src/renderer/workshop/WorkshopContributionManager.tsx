import { ArrowDown, ArrowUp, Eye, EyeOff, Pin, PinOff, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { WorkshopPluginSummary } from '../../shared/types/workshop';
import {
  collectWorkshopContributionDescriptors,
  readWorkshopContributionPreferences,
  sortWorkshopContributions,
  workshopPluginPreferenceId,
  workshopContributionPreferencesChangedEvent,
  writeWorkshopContributionPreferences,
  type WorkshopContributionKey,
  type WorkshopContributionPreferences,
} from './WorkshopContributionPreferences';

type WorkshopContributionManagerProps = {
  plugins: WorkshopPluginSummary[];
  onClose: () => void;
};

const kindLabels: Record<string, string> = {
  command: '命令',
  panel: '界面',
  agent: 'Agent',
  'source-provider': '音源',
  'lyrics-provider': '歌词源',
  'metadata-provider': '元数据',
  'cover-provider': '封面源',
  'theme-preset': '主题',
  'track-action': '歌曲菜单',
  'player-action': '播放器按钮',
  settings: '设置',
};

export const WorkshopContributionManager = ({ plugins, onClose }: WorkshopContributionManagerProps): JSX.Element => {
  const [selectedPluginId, setSelectedPluginId] = useState(() => plugins[0] ? workshopPluginPreferenceId(plugins[0]) : '');
  const selectedPlugin = plugins.find((plugin) => workshopPluginPreferenceId(plugin) === selectedPluginId) ?? plugins[0] ?? null;
  const [preferences, setPreferences] = useState<WorkshopContributionPreferences>(() =>
    selectedPlugin ? readWorkshopContributionPreferences(selectedPlugin) : { hidden: [], pinned: [], order: [] });

  useEffect(() => {
    if (selectedPlugin) setPreferences(readWorkshopContributionPreferences(selectedPlugin));
  }, [selectedPlugin]);

  const descriptors = useMemo(() => selectedPlugin
    ? sortWorkshopContributions(collectWorkshopContributionDescriptors(selectedPlugin), preferences)
    : [], [preferences, selectedPlugin]);

  const commit = (next: WorkshopContributionPreferences): void => {
    if (!selectedPlugin) return;
    setPreferences(writeWorkshopContributionPreferences(selectedPlugin, next));
  };

  const toggleListKey = (list: WorkshopContributionKey[], key: WorkshopContributionKey): WorkshopContributionKey[] =>
    list.includes(key) ? list.filter((entry) => entry !== key) : [...list, key];

  const move = (key: WorkshopContributionKey, delta: number): void => {
    const ordered = descriptors.map((item) => item.key);
    const index = ordered.indexOf(key);
    const target = Math.max(0, Math.min(ordered.length - 1, index + delta));
    if (index < 0 || index === target) return;
    ordered.splice(target, 0, ...ordered.splice(index, 1));
    commit({ ...preferences, order: ordered });
  };

  useEffect(() => {
    const refresh = (): void => {
      if (selectedPlugin) setPreferences(readWorkshopContributionPreferences(selectedPlugin));
    };
    window.addEventListener(workshopContributionPreferencesChangedEvent, refresh);
    return () => window.removeEventListener(workshopContributionPreferencesChangedEvent, refresh);
  }, [selectedPlugin]);

  return (
    <section className="workshop-contribution-manager" role="dialog" aria-modal="true" aria-label="管理插件功能">
      <header>
        <div><strong>插件功能编排</strong><span>逐项显示、固定和排序</span></div>
        <button type="button" aria-label="关闭插件功能管理" onClick={onClose}><X size={17} /></button>
      </header>
      <div className="workshop-contribution-manager__toolbar">
        <label>
          插件
          <select value={selectedPlugin ? workshopPluginPreferenceId(selectedPlugin) : ''} onChange={(event) => setSelectedPluginId(event.target.value)}>
            {plugins.map((plugin) => <option key={`${plugin.sourceId}:${plugin.itemId}`} value={workshopPluginPreferenceId(plugin)}>{plugin.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => commit({ hidden: [], pinned: [], order: [] })}><RotateCcw size={14} />恢复默认</button>
      </div>
      <div className="workshop-contribution-manager__list">
        {descriptors.map((item, index) => {
          const hidden = preferences.hidden.includes(item.key);
          const pinned = preferences.pinned.includes(item.key);
          return (
            <article key={item.key} data-hidden={hidden ? 'true' : undefined}>
              <div>
                <span>{kindLabels[item.kind] ?? item.kind}{item.placement ? ` · ${item.placement}` : ''}</span>
                <strong>{item.title}</strong>
                {item.description ? <small>{item.description}</small> : null}
              </div>
              <div className="workshop-contribution-manager__actions">
                <button type="button" aria-label={`${hidden ? '显示' : '隐藏'}${item.title}`} onClick={() => commit({ ...preferences, hidden: toggleListKey(preferences.hidden, item.key) })}>
                  {hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button type="button" aria-label={`${pinned ? '取消固定' : '固定'}${item.title}`} onClick={() => commit({ ...preferences, pinned: toggleListKey(preferences.pinned, item.key) })}>
                  {pinned ? <PinOff size={15} /> : <Pin size={15} />}
                </button>
                <button type="button" aria-label={`上移${item.title}`} disabled={index === 0} onClick={() => move(item.key, -1)}><ArrowUp size={15} /></button>
                <button type="button" aria-label={`下移${item.title}`} disabled={index === descriptors.length - 1} onClick={() => move(item.key, 1)}><ArrowDown size={15} /></button>
              </div>
            </article>
          );
        })}
        {descriptors.length === 0 ? <p>这个插件没有可编排的功能。</p> : null}
      </div>
    </section>
  );
};
