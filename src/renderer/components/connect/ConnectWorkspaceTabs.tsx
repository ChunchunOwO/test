import { useRef, type KeyboardEvent } from 'react';
import { AudioLines, Cast, Download, Radio, Smartphone } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type ConnectWorkspaceMode = 'output' | 'hqplayer' | 'receive' | 'mobile' | 'radio';
export type ConnectWorkspaceGroup = 'cast' | 'incoming';

type ConnectWorkspaceLabels = Record<ConnectWorkspaceMode, string>;

type ConnectWorkspaceTabsProps = {
  ariaLabel: string;
  descriptions: ConnectWorkspaceLabels;
  groupLabels: Record<ConnectWorkspaceGroup, string>;
  /** Marks modes that currently have live activity (e.g. server running, radio playing). */
  indicators?: Partial<Record<ConnectWorkspaceMode, boolean>>;
  labels: ConnectWorkspaceLabels;
  mode: ConnectWorkspaceMode;
  onModeChange: (mode: ConnectWorkspaceMode) => void;
};

export const connectWorkspaceModes: Array<{ group: ConnectWorkspaceGroup; icon: LucideIcon; id: ConnectWorkspaceMode }> = [
  { id: 'output', icon: Cast, group: 'cast' },
  { id: 'hqplayer', icon: AudioLines, group: 'cast' },
  { id: 'receive', icon: Download, group: 'incoming' },
  { id: 'mobile', icon: Smartphone, group: 'incoming' },
  { id: 'radio', icon: Radio, group: 'incoming' },
];

export const ConnectWorkspaceTabs = ({
  ariaLabel,
  descriptions,
  groupLabels,
  indicators,
  labels,
  mode,
  onModeChange,
}: ConnectWorkspaceTabsProps): JSX.Element => {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (
      event.defaultPrevented
      || event.repeat
      || event.nativeEvent.isComposing
      || event.altKey
      || event.ctrlKey
      || event.metaKey
      || event.shiftKey
    ) {
      return;
    }

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % connectWorkspaceModes.length;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + connectWorkspaceModes.length) % connectWorkspaceModes.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = connectWorkspaceModes.length - 1;
    if (nextIndex == null) return;

    event.preventDefault();
    onModeChange(connectWorkspaceModes[nextIndex].id);
    buttonRefs.current[nextIndex]?.focus();
  };

  return (
    <div className="connect-workspace-tabs" role="toolbar" aria-label={ariaLabel}>
      {connectWorkspaceModes.map(({ icon: Icon, id, group }, index) => {
        const showGroup = index === 0 || connectWorkspaceModes[index - 1].group !== group;
        return (
          <div className="connect-workspace-tabs__item" key={id}>
            {showGroup ? <small className="connect-workspace-tabs__stage">{groupLabels[group]}</small> : null}
            <button
              ref={(element) => { buttonRefs.current[index] = element; }}
              type="button"
              data-id={id}
              aria-label={labels[id]}
              aria-pressed={mode === id}
              data-active={mode === id ? 'true' : undefined}
              data-selected={mode === id ? 'true' : undefined}
              tabIndex={mode === id ? 0 : -1}
              onClick={() => onModeChange(id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <span className="connect-workspace-tabs__icon" aria-hidden="true">
                <Icon size={16} />
              </span>
              <span className="connect-workspace-tabs__copy">
                <strong>{labels[id]}</strong>
                <small>{descriptions[id]}</small>
              </span>
              {indicators?.[id] ? <i className="connect-workspace-tabs__dot" aria-hidden="true" /> : null}
            </button>
          </div>
        );
      })}
    </div>
  );
};
