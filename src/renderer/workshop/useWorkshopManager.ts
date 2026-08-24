import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  WorkshopManagerItem,
  WorkshopManagerSnapshot,
  WorkshopPluginSummary,
  WorkshopReconcileReport,
} from '../../shared/types/workshop';
import {
  workshopActionRequestLabelKey,
  workshopCapabilityLabelKey,
  workshopFailureLabelKey,
  useWorkshopTranslate,
  type WorkshopTranslate,
} from './workshopI18n';
import {
  formatWorkshopActionNotice,
  workshopItemKey,
  type WorkshopItemAction,
} from './workshopItemModel';

const confirmUiRuntime = (t: WorkshopTranslate): boolean =>
  window.confirm(t('workshop.manager.confirm.uiRuntime'));

const pluginCapabilityLabel = (capability: string, t: WorkshopTranslate): string => {
  const key = workshopCapabilityLabelKey(capability);
  return key ? t(key) : capability;
};

const pluginContributionCount = (plugin: {
  commands: unknown[];
  panels: unknown[];
  agents: unknown[];
  sourceProviders?: unknown[];
  lyricsProviders?: unknown[];
  metadataProviders?: unknown[];
  coverProviders?: unknown[];
  themePresets?: unknown[];
}): number =>
  plugin.commands.length + plugin.panels.length + plugin.agents.length
  + (plugin.sourceProviders?.length ?? 0) + (plugin.lyricsProviders?.length ?? 0)
  + (plugin.metadataProviders?.length ?? 0) + (plugin.coverProviders?.length ?? 0)
  + (plugin.themePresets?.length ?? 0);

const confirmPluginCapabilities = (
  name: string,
  capabilities: string[],
  networkHosts: string[],
  t: WorkshopTranslate,
  previous?: {
    version: string;
    permissions: string[];
    commands: unknown[];
    panels: unknown[];
    agents: unknown[];
    sourceProviders?: unknown[];
    lyricsProviders?: unknown[];
    metadataProviders?: unknown[];
    coverProviders?: unknown[];
    themePresets?: unknown[];
  } | null,
  nextVersion?: string,
  nextContributionCount?: number,
): boolean => {
  const details = capabilities.length > 0
    ? capabilities.map((capability) => t('workshop.manager.confirm.capabilityItem', {
        label: pluginCapabilityLabel(capability, t),
      })).join('\n')
    : t('workshop.manager.confirm.noCapabilities');
  const destinations = networkHosts.length > 0
    ? t('workshop.manager.confirm.networkHosts', {
        hosts: networkHosts.map((host) => t('workshop.manager.confirm.hostItem', { host })).join('\n'),
      })
    : '';
  const added = previous ? capabilities.filter((capability) => !previous.permissions.includes(capability)) : [];
  const removed = previous ? previous.permissions.filter((capability) => !capabilities.includes(capability)) : [];
  const joiner = t('workshop.manager.confirm.listJoiner');
  const updateDiff = previous && nextVersion && previous.version !== nextVersion
    ? t('workshop.manager.confirm.updateDiff', {
        from: previous.version,
        to: nextVersion,
        added: added.length ? added.join(joiner) : t('workshop.manager.confirm.none'),
        removed: removed.length ? removed.join(joiner) : t('workshop.manager.confirm.none'),
        fromCount: pluginContributionCount(previous),
        toCount: nextContributionCount ?? 0,
      })
    : '';
  return window.confirm(t('workshop.manager.confirm.plugin', { name, details, destinations, updateDiff }));
};

const formatReconcileNotice = (report: WorkshopReconcileReport | null, t: WorkshopTranslate): string => {
  if (!report) {
    return t('workshop.manager.reconcile.done');
  }
  const details = [
    report.examined > 0 ? t('workshop.manager.reconcile.examined', { count: report.examined }) : null,
    report.stagedRecovered > 0 ? t('workshop.manager.reconcile.staged', { count: report.stagedRecovered }) : null,
    report.catalogRestored > 0 ? t('workshop.manager.reconcile.restored', { count: report.catalogRestored }) : null,
    report.catalogPruned > 0 ? t('workshop.manager.reconcile.pruned', { count: report.catalogPruned }) : null,
    report.quarantined > 0 ? t('workshop.manager.reconcile.quarantined', { count: report.quarantined }) : null,
  ].filter(Boolean);
  if (details.length === 0) {
    return t('workshop.manager.reconcile.done');
  }
  return t('workshop.manager.reconcile.doneWithDetails', {
    details: details.join(t('workshop.manager.reconcile.joiner')),
  });
};

const actionFailureMessage = (reason: string | null | undefined, t: WorkshopTranslate): string => {
  if (!reason) {
    return 'unknown';
  }
  const key = workshopFailureLabelKey(reason);
  return key ? t(key) : reason;
};

export const useWorkshopManager = () => {
  const t = useWorkshopTranslate();
  const bridge = window.echo?.workshop;
  const [snapshot, setSnapshot] = useState<WorkshopManagerSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingUseCount, setPendingUseCount] = useState(0);
  const busyKeyRef = useRef<string | null>(null);
  const pendingUseRef = useRef(new Set<string>());
  busyKeyRef.current = busyKey;

  const refresh = useCallback(async (mode: 'initial' | 'user' | 'poll' = 'user'): Promise<void> => {
    if (!bridge) {
      setError(t('workshop.manager.error.bridge'));
      setLoading(false);
      return;
    }
    if ((mode === 'poll' || mode === 'user') && busyKeyRef.current) {
      return;
    }
    if (mode === 'user') {
      setRefreshing(true);
    }
    try {
      setSnapshot(await bridge.getSnapshot());
      if (mode !== 'poll') {
        setError(null);
      }
    } catch {
      if (mode !== 'poll') {
        setError(t('workshop.manager.error.read'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bridge, t]);

  useEffect(() => {
    void refresh('initial');
  }, [refresh]);

  const shouldPoll = pendingUseCount > 0 || Boolean(snapshot?.items.some((item) =>
    item.subscription?.downloading || item.subscription?.downloadPending));

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }
    const timer = window.setInterval(() => void refresh('poll'), 3_000);
    return () => window.clearInterval(timer);
  }, [refresh, shouldPoll]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 5_200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const reconcile = useCallback(async (): Promise<void> => {
    if (!bridge || busyKeyRef.current) {
      return;
    }
    setBusyKey('reconcile');
    setNotice(null);
    try {
      const result = await bridge.reconcile();
      setSnapshot(result.snapshot);
      setError(result.ok ? null : t('workshop.manager.error.repairIncomplete', {
        reason: actionFailureMessage(result.reason, t),
      }));
      if (result.ok) {
        setNotice(formatReconcileNotice(result.snapshot.reconcile.lastReport, t));
      }
    } catch {
      setError(t('workshop.manager.error.repairRequest'));
    } finally {
      setBusyKey(null);
    }
  }, [bridge, t]);

  const runItemAction = useCallback(async (
    action: WorkshopItemAction,
    item: WorkshopManagerItem,
    approveUiRuntime = false,
  ): Promise<void> => {
    if (!bridge || busyKeyRef.current) {
      return;
    }
    const key = `${action}:${item.sourceId}:${item.itemId}`;
    setBusyKey(key);
    setNotice(null);
    try {
      let previousPlugin: WorkshopPluginSummary | null = null;
      if (action === 'use' && item.subscription?.needsUpdate) {
        try {
          const before = await bridge.getPlugins();
          previousPlugin = before.plugins.find((entry) => entry.sourceId === item.sourceId && entry.itemId === item.itemId) ?? null;
        } catch {
          previousPlugin = null;
        }
      }
      const request = {
        sourceId: item.sourceId,
        itemId: item.itemId,
        ...((action === 'use' || action === 'apply') && approveUiRuntime
          ? { approveUiRuntime: true }
          : {}),
      };
      const actionMethods = {
        download: bridge.requestDownload,
        ingest: bridge.ingest,
        enable: bridge.enable,
        disable: bridge.disable,
        apply: bridge.apply,
        use: bridge.use,
        subscribe: bridge.subscribe,
        unsubscribe: bridge.unsubscribe,
        'open-in-steam': bridge.openInSteam,
      } satisfies Record<WorkshopItemAction, typeof bridge.enable>;
      let result = await actionMethods[action](request);
      if (!result.ok && result.reason === 'ui-runtime-confirmation-required') {
        setSnapshot(result.snapshot);
        if (!confirmUiRuntime(t)) {
          setError(null);
          return;
        }
        result = await bridge.apply({
          sourceId: item.sourceId,
          itemId: item.itemId,
          approveUiRuntime: true,
        });
      }
      if (!result.ok && result.reason === 'plugin-capabilities-confirmation-required') {
        setSnapshot(result.snapshot);
        const pluginSnapshot = await bridge.getPlugins();
        const plugin = pluginSnapshot.plugins.find((entry) =>
          entry.sourceId === item.sourceId && entry.itemId === item.itemId);
        if (!plugin || plugin.error || !confirmPluginCapabilities(
          plugin.name,
          plugin.permissions,
          plugin.networkHosts,
          t,
          previousPlugin,
          plugin.version,
          pluginContributionCount(plugin),
        )) {
          setError(plugin?.error ? t('workshop.manager.error.pluginEnable', { reason: plugin.error }) : null);
          return;
        }
        result = await actionMethods[action]({
          sourceId: item.sourceId,
          itemId: item.itemId,
          approvePluginCapabilities: plugin.permissions,
        });
      }
      setSnapshot(result.snapshot);
      setError(result.ok ? null : (
        workshopFailureLabelKey(result.reason ?? '')
          ? actionFailureMessage(result.reason, t)
          : t('workshop.notice.actionFailed', {
              action: t(workshopActionRequestLabelKey(action)),
              reason: result.reason ?? 'unknown',
            })
      ));
      if (action === 'use') {
        const pendingKey = workshopItemKey(item);
        if (result.ok && result.reason === 'download-started') {
          pendingUseRef.current.add(pendingKey);
        } else {
          pendingUseRef.current.delete(pendingKey);
        }
        setPendingUseCount(pendingUseRef.current.size);
      }
      if (result.ok) {
        setNotice(formatWorkshopActionNotice(action, item, result.reason, t));
      }
    } catch {
      if (action === 'use') {
        pendingUseRef.current.delete(workshopItemKey(item));
        setPendingUseCount(pendingUseRef.current.size);
      }
      setError(t('workshop.notice.requestFailed', { action: t(workshopActionRequestLabelKey(action)) }));
    } finally {
      setBusyKey(null);
    }
  }, [bridge, t]);

  useEffect(() => {
    if (!snapshot || busyKey || pendingUseRef.current.size === 0) {
      return;
    }
    let pendingChanged = false;
    for (const key of pendingUseRef.current) {
      const item = snapshot.items.find((entry) => workshopItemKey(entry) === key);
      if (!item || item.state === 'error' || item.state === 'quarantined') {
        pendingUseRef.current.delete(key);
        pendingChanged = true;
        continue;
      }
      const subscription = item.subscription;
      if (subscription?.downloading || subscription?.downloadPending) {
        continue;
      }
      if (!subscription?.installed || subscription.needsUpdate) {
        continue;
      }
      void runItemAction('use', item);
      break;
    }
    if (pendingChanged) {
      setPendingUseCount(pendingUseRef.current.size);
    }
  }, [busyKey, runItemAction, snapshot]);

  return {
    snapshot,
    loading,
    refreshing,
    busyKey,
    error,
    notice,
    refresh: () => refresh('user'),
    reconcile,
    runItemAction,
    announce: (message: string) => setNotice(message),
    dismissError: () => setError(null),
    dismissNotice: () => setNotice(null),
  };
};
