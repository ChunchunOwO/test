import type { TranslationKey } from '../../i18n/locales';

type Translate = (key: TranslationKey, options?: Record<string, string | number>) => string;

const echoPackageExtension = '.echo';

export const firstEchoPackageFile = (files: File[]): File | null =>
  files.find((file) => file.name.toLowerCase().endsWith(echoPackageExtension)) ?? null;

/** Plugin-enabled products may call this from their drag/drop host. */
export const importAndEnablePluginPackage = (
  file: File,
  onNotice: (message: string) => void,
  t: Translate,
): void => {
  const plugins = window.echo?.plugins;
  if (!plugins) {
    onNotice(t('import.dragDrop.plugin.desktopBridgeUnavailable'));
    return;
  }

  void plugins.importPackage(file)
    .then(async (result) => {
      if (!result) {
        onNotice(t('import.dragDrop.plugin.cancelled'));
        return;
      }

      try {
        await plugins.enable({ pluginId: result.pluginId, trustedPermissions: [] });
        onNotice(t('import.dragDrop.plugin.enabled', { pluginId: result.pluginId }));
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        onNotice(t('import.dragDrop.plugin.importedNeedsReview', { pluginId: result.pluginId, reason }));
      }
      window.dispatchEvent(new Event('plugins:changed'));
    })
    .catch((error) => {
      onNotice(error instanceof Error ? error.message : String(error));
    });
};
