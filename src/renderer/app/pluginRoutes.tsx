import { PanelTop } from 'lucide-react';
import type { PluginSummary } from '../../shared/types/plugins';
import { PluginPanelPage } from '../components/plugins/PluginPanelPage';
import type { AppRoute } from './routes';

/**
 * Plugin-enabled products may opt into these routes explicitly. The Steam
 * renderer never imports this module, so plugin panels and their host bridge do
 * not enter its route graph or production chunks.
 */
export const createPluginPanelRoutes = (plugins: PluginSummary[]): AppRoute[] =>
  plugins.flatMap((plugin) => {
    if (!plugin.enabled || plugin.disabledByHost || plugin.status === 'error') {
      return [];
    }

    const declaredPanels = plugin.contributes.panels ?? [];
    const contributedPanels = declaredPanels.filter((panel) => Boolean(panel.path));
    const panels = declaredPanels.length > 0
      ? contributedPanels
      : plugin.panel
        ? [{ id: 'main', title: plugin.name, placement: 'main' as const }]
        : [];

    return panels.map((panel): AppRoute => ({
      id: `plugin:${encodeURIComponent(plugin.id)}:${encodeURIComponent(panel.id)}`,
      label: panel.title,
      description: `${plugin.name} 插件面板`,
      icon: PanelTop,
      placement: panel.placement === 'utility' ? 'utility' : 'main',
      element: <PluginPanelPage plugin={plugin} panel={panel} />,
    }));
  });
