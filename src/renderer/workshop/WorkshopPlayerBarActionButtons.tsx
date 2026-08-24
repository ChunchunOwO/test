import { useSyncExternalStore } from 'react';
import { Blocks, Bookmark, Bot, Heart, ListMusic, Radio, Sparkles, Zap } from 'lucide-react';
import {
  getWorkshopPlayerBarActions,
  subscribeWorkshopPlayerBarActions,
} from './WorkshopPlayerBarActions';

const iconById = {
  blocks: Blocks,
  sparkles: Sparkles,
  bot: Bot,
  radio: Radio,
  'list-music': ListMusic,
  heart: Heart,
  bookmark: Bookmark,
  zap: Zap,
} as const;

export const WorkshopPlayerBarActionButtons = (): JSX.Element => {
  const actions = useSyncExternalStore(
    subscribeWorkshopPlayerBarActions,
    getWorkshopPlayerBarActions,
    getWorkshopPlayerBarActions,
  );

  return (
    <>
      {actions.map((action) => {
        const ActionIcon = iconById[action.icon];
        const label = `${action.pluginName}：${action.title}`;
        return (
          <button
            className="icon-button workshop-player-action"
            type="button"
            key={action.key}
            aria-label={label}
            title={action.description ? `${label} — ${action.description}` : label}
            disabled={!action.ready}
            onClick={() => void action.run()}
          >
            <ActionIcon size={17} aria-hidden="true" />
          </button>
        );
      })}
    </>
  );
};
