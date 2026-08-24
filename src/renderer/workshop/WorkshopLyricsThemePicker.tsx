import { Check, Palette, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WorkshopActiveLyricsScene } from '../../shared/types/workshopLyricsScene';
import type { WorkshopManagerItem } from '../../shared/types/workshop';

export const WorkshopLyricsThemePicker = (): JSX.Element | null => {
  const workshop = window.echo?.workshop;
  const [items, setItems] = useState<WorkshopManagerItem[]>([]);
  const [active, setActive] = useState<WorkshopActiveLyricsScene | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!workshop) return;
    try {
      const [snapshot, scene] = await Promise.all([
        workshop.getSnapshot(),
        workshop.getActiveLyricsScene(),
      ]);
      setItems(snapshot.items);
      setActive(scene);
    } catch {
      setItems([]);
      setActive(null);
    }
  }, [workshop]);

  useEffect(() => {
    void load();
    return workshop?.onActiveLyricsSceneChanged?.((scene) => setActive(scene));
  }, [load, workshop]);

  const themes = useMemo(() => items.filter((item) =>
    item.enabled && item.catalogReady && item.contentKind === 'lyrics-style' && item.lyricsStyle?.hasScene), [items]);

  if (!workshop) return null;

  const selectTheme = async (item: WorkshopManagerItem): Promise<void> => {
    const key = `${item.sourceId}:${item.itemId}`;
    setBusyKey(key);
    setMessage(null);
    try {
      const result = await workshop.apply({ sourceId: item.sourceId, itemId: item.itemId });
      if (!result.ok) throw new Error(result.reason ?? 'apply-failed');
      await load();
      setMessage(`已应用“${item.lyricsStyle?.title ?? item.contentId ?? item.itemId}”`);
    } catch (error) {
      setMessage(`歌词主题应用失败：${error instanceof Error ? error.message : 'unknown'}`);
    } finally {
      setBusyKey(null);
    }
  };

  const useBuiltInTheme = async (): Promise<void> => {
    setBusyKey('builtin');
    setMessage(null);
    try {
      await workshop.clearActiveLyricsScene();
      await load();
      setMessage('已切换到 ECHO 内置歌词布局');
    } catch (error) {
      setMessage(`歌词主题切换失败：${error instanceof Error ? error.message : 'unknown'}`);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="workshop-lyrics-theme-picker" data-drawer-search-item="">
      <div className="lyrics-color-panel__header">
        <span><Palette size={15} /><strong>创意工坊歌词主题</strong></span>
        <em>{active?.title ?? 'ECHO 内置'}</em>
      </div>
      <p>启用歌词样式项目后，可在这里直接切换。主题只能控制歌词页面的受校验布局与视觉。</p>
      <div className="lyrics-font-actions" role="radiogroup" aria-label="创意工坊歌词主题">
        <button
          className="audio-device-pill"
          type="button"
          role="radio"
          aria-checked={!active}
          disabled={busyKey !== null}
          onClick={() => void useBuiltInTheme()}
        >
          <RotateCcw size={15} />
          <span><strong>ECHO 内置</strong><small>关闭当前 Workshop 场景</small></span>
          <em>{!active ? <Check size={14} /> : '使用'}</em>
        </button>
        {themes.map((item) => {
          const isActive = active?.sourceId === item.sourceId && active.itemId === item.itemId;
          const key = `${item.sourceId}:${item.itemId}`;
          return (
            <button
              className="audio-device-pill"
              type="button"
              role="radio"
              aria-checked={isActive}
              disabled={busyKey !== null}
              key={key}
              onClick={() => void selectTheme(item)}
            >
              <Palette size={15} />
              <span>
                <strong>{item.lyricsStyle?.title ?? item.contentId ?? item.itemId}</strong>
                <small>{item.lyricsStyle?.description ?? '创意工坊自定义歌词布局'}</small>
              </span>
              <em>{isActive ? <Check size={14} /> : busyKey === key ? '应用中…' : '使用'}</em>
            </button>
          );
        })}
      </div>
      {themes.length === 0 ? <p>还没有已启用的自定义歌词主题，可从创意工坊订阅或使用作者模板创建。</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
};
