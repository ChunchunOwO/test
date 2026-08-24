import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Play, Search, TerminalSquare, X } from 'lucide-react';
import type { PluginCommand, PluginSummary } from '../../../shared/types/plugins';
import { useOptionalI18n } from '../../i18n/I18nProvider';
import { getPluginsBridge } from '../../utils/echoBridge';
import { matchesSearchFields } from '../../utils/smartTextSearch';
import { EchoSearchFieldTools } from '../common/EchoSearchFieldTools';
import { formatUserFacingError } from '../../utils/userFacingError';

type PluginCommandPaletteProps = {
  isOpen: boolean;
  onClose: () => void;
};

type PaletteCommand = PluginCommand & {
  pluginName: string;
};

const textByLocale = {
  'zh-CN': {
    title: '插件命令',
    description: '运行已启用插件提供的全局命令',
    search: '搜索插件或命令',
    empty: '没有可运行的全局插件命令',
    loading: '正在读取插件命令…',
    running: '正在运行…',
    result: '命令结果',
    noResult: '命令已完成',
    close: '关闭插件命令',
    clear: '清除搜索',
  },
  'zh-TW': {
    title: '外掛命令',
    description: '執行已啟用外掛提供的全域命令',
    search: '搜尋外掛或命令',
    empty: '沒有可執行的全域外掛命令',
    loading: '正在讀取外掛命令…',
    running: '正在執行…',
    result: '命令結果',
    noResult: '命令已完成',
    close: '關閉外掛命令',
    clear: '清除搜尋',
  },
  'ja-JP': {
    title: 'プラグインコマンド',
    description: '有効なプラグインが提供するグローバルコマンドを実行します',
    search: 'プラグインまたはコマンドを検索',
    empty: '実行できるグローバルプラグインコマンドはありません',
    loading: 'プラグインコマンドを読み込み中…',
    running: '実行中…',
    result: 'コマンドの結果',
    noResult: 'コマンドが完了しました',
    close: 'プラグインコマンドを閉じる',
    clear: '検索をクリア',
  },
  'ko-KR': {
    title: '플러그인 명령',
    description: '활성화된 플러그인이 제공하는 전역 명령을 실행합니다',
    search: '플러그인 또는 명령 검색',
    empty: '실행할 수 있는 전역 플러그인 명령이 없습니다',
    loading: '플러그인 명령을 불러오는 중…',
    running: '실행 중…',
    result: '명령 결과',
    noResult: '명령이 완료되었습니다',
    close: '플러그인 명령 닫기',
    clear: '검색 지우기',
  },
  'en-US': {
    title: 'Plugin commands',
    description: 'Run global commands contributed by enabled plugins',
    search: 'Search plugins or commands',
    empty: 'No global plugin commands are available',
    loading: 'Loading plugin commands…',
    running: 'Running…',
    result: 'Command result',
    noResult: 'Command completed',
    close: 'Close plugin commands',
    clear: 'Clear search',
  },
} as const;

const isChineseTraditional = (locale: string): boolean => locale === 'zh-TW';
const paletteText = (locale: string) =>
  locale === 'zh-CN'
    ? textByLocale['zh-CN']
    : isChineseTraditional(locale)
      ? textByLocale['zh-TW']
      : locale === 'ja-JP'
        ? textByLocale['ja-JP']
        : locale === 'ko-KR'
          ? textByLocale['ko-KR']
          : textByLocale['en-US'];

const paletteError = (locale: string, kind: 'load' | 'run'): string => {
  if (locale === 'ja-JP') {
    return kind === 'load' ? 'プラグインコマンドを読み込めません。' : 'プラグインコマンドの実行に失敗しました。';
  }
  if (locale === 'ko-KR') {
    return kind === 'load' ? '플러그인 명령을 읽을 수 없습니다.' : '플러그인 명령 실행에 실패했습니다.';
  }
  if (locale === 'zh-TW') {
    return kind === 'load' ? '無法讀取外掛命令。' : '外掛命令執行失敗。';
  }
  if (locale === 'zh-CN') {
    return kind === 'load' ? '无法读取插件命令。' : '插件命令运行失败。';
  }
  return kind === 'load' ? 'Unable to load plugin commands.' : 'Plugin command failed.';
};

const toPaletteCommands = (plugins: PluginSummary[]): PaletteCommand[] =>
  plugins.flatMap((plugin) => {
    if (!plugin.enabled || plugin.disabledByHost || plugin.status === 'error') {
      return [];
    }
    const contextualCommandIds = new Set(
      (plugin.contributes.trackContextMenus ?? []).map((item) => item.commandId),
    );
    return plugin.commands
      .filter((command) => !contextualCommandIds.has(command.id))
      .map((command) => ({ ...command, pluginName: plugin.name }));
  });

const formatResult = (value: unknown): string => {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const PluginCommandPalette = ({
  isOpen,
  onClose,
}: PluginCommandPaletteProps): JSX.Element | null => {
  const i18n = useOptionalI18n();
  const currentLocale = i18n?.locale ?? 'zh-CN';
  const copy = paletteText(currentLocale);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const pluginsApi = getPluginsBridge();
    setQuery('');
    setResult(null);
    setError(null);
    setLoading(true);
    void pluginsApi?.list()
      .then((response) => setPlugins(response.plugins))
      .catch((loadError) => {
        setPlugins([]);
        setError(formatUserFacingError(loadError, { context: 'plugins', fallback: paletteError(currentLocale, 'load') }));
      })
      .finally(() => setLoading(false));
    const focusHandle = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(focusHandle);
  }, [currentLocale, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const allCommands = useMemo(() => toPaletteCommands(plugins), [plugins]);
  const commands = useMemo(() => {
    const queryText = query.trim();
    if (!queryText) {
      return allCommands;
    }
    return allCommands.filter((command) =>
      matchesSearchFields(queryText, [
        command.title,
        command.description,
        command.id,
        command.pluginName,
      ]),
    );
  }, [allCommands, query]);

  const runCommand = (command: PaletteCommand): void => {
    const pluginsApi = getPluginsBridge();
    if (!pluginsApi) {
      return;
    }
    const commandKey = `${command.pluginId}:${command.id}`;
    setRunningKey(commandKey);
    setResult(null);
    setError(null);
    void pluginsApi.runCommand({ pluginId: command.pluginId, commandId: command.id })
      .then((value) => {
        setResult({
          title: `${command.pluginName} · ${command.title}`,
          value: formatResult(value),
        });
        window.dispatchEvent(new Event('plugins:changed'));
      })
      .catch((runError) => {
        setError(formatUserFacingError(runError, { context: 'plugins', fallback: paletteError(currentLocale, 'run') }));
      })
      .finally(() => setRunningKey(null));
  };

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="plugin-command-palette" role="presentation">
      <button className="plugin-command-palette__scrim" type="button" aria-label={copy.close} onClick={onClose} />
      <section className="plugin-command-palette__dialog" role="dialog" aria-modal="true" aria-label={copy.title}>
        <header>
          <span className="plugin-command-palette__icon"><TerminalSquare size={20} /></span>
          <div>
            <h2>{copy.title}</h2>
            <p>{copy.description}</p>
          </div>
          <button type="button" aria-label={copy.close} title={copy.close} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <label className="plugin-command-palette__search echo-search-surface">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            placeholder={copy.search}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query.trim() ? (
            <EchoSearchFieldTools
              clearLabel={copy.clear}
              count={`${commands.length} / ${allCommands.length}`}
              onClear={() => setQuery('')}
            />
          ) : (
            <kbd>Ctrl Shift P</kbd>
          )}
        </label>

        <div className="plugin-command-palette__list">
          {loading ? <p className="plugin-command-palette__empty">{copy.loading}</p> : null}
          {!loading && commands.length === 0 ? <p className="plugin-command-palette__empty">{copy.empty}</p> : null}
          {commands.map((command) => {
            const commandKey = `${command.pluginId}:${command.id}`;
            const isRunning = runningKey === commandKey;
            return (
              <button
                key={commandKey}
                type="button"
                disabled={runningKey !== null}
                onClick={() => runCommand(command)}
              >
                <span>
                  <strong>{command.title}</strong>
                  <small>{command.pluginName}{command.description ? ` · ${command.description}` : ''}</small>
                </span>
                <span className="plugin-command-palette__run">
                  <Play size={15} />
                  {isRunning ? copy.running : command.id}
                </span>
              </button>
            );
          })}
        </div>

        {error ? (
          <div className="plugin-command-palette__error" role="alert">
            <AlertTriangle size={17} />
            <span>{error}</span>
          </div>
        ) : null}
        {result ? (
          <section className="plugin-command-palette__result">
            <strong>{copy.result}</strong>
            <span>{result.title}</span>
            <pre>{result.value || copy.noResult}</pre>
          </section>
        ) : null}
      </section>
    </div>,
    document.body,
  );
};
