import { Activity, ArchiveRestore, ClipboardCopy, Download, Eraser, Play, Plus, Trash2, Upload, Workflow } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  workshopAutomationTriggers,
  type WorkshopAutomationRule,
  type WorkshopAutomationTrigger,
  type WorkshopDiagnosticEntry,
  type WorkshopManagerItem,
  type WorkshopPluginSummary,
  type WorkshopAcceptanceResult,
} from '../../shared/types/workshop';
import { readWorkshopAutomationRules, workshopAutomationsChangedEvent, writeWorkshopAutomationRules } from './WorkshopAutomationStore';
import { applyWorkshopCustomizationProfile, createWorkshopCustomizationProfile } from './WorkshopCustomizationProfile';
import { clearWorkshopDiagnostics, readWorkshopDiagnostics, workshopDiagnosticsChangedEvent } from './WorkshopDiagnosticsStore';
import { buildWorkshopDependencyPlan } from './WorkshopDependencyPlan';
import { workshopTriggerLabelKey, useWorkshopLocale, useWorkshopTranslate } from './workshopI18n';
import '../styles/workshop-control-center.css';

type WorkshopControlCenterProps = {
  items: WorkshopManagerItem[];
  onChanged: () => void;
};

const bytesLabel = (bytes: number): string => bytes < 1024 * 1024
  ? `${Math.max(0, Math.round(bytes / 1024))} KB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const pluginKey = (plugin: WorkshopPluginSummary): string => `${plugin.sourceId}:${plugin.itemId}:${plugin.pluginId}`;

export const WorkshopControlCenter = ({ items, onChanged }: WorkshopControlCenterProps): JSX.Element => {
  const t = useWorkshopTranslate();
  const locale = useWorkshopLocale();
  const bridge = window.echo?.workshop;
  const [plugins, setPlugins] = useState<WorkshopPluginSummary[]>([]);
  const [rules, setRules] = useState<WorkshopAutomationRule[]>(() => readWorkshopAutomationRules());
  const [diagnostics, setDiagnostics] = useState<WorkshopDiagnosticEntry[]>(() => readWorkshopDiagnostics());
  const [selectedPluginKey, setSelectedPluginKey] = useState('');
  const [targetKind, setTargetKind] = useState<'command' | 'agent'>('command');
  const [targetId, setTargetId] = useState('');
  const [trigger, setTrigger] = useState<WorkshopAutomationTrigger>('track-started');
  const [title, setTitle] = useState('');
  const [agentPrompt, setAgentPrompt] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState(15);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [acceptanceItemId, setAcceptanceItemId] = useState('');
  const [acceptanceResult, setAcceptanceResult] = useState<WorkshopAcceptanceResult | null>(null);

  const refreshPlugins = async (): Promise<void> => {
    const snapshot = await bridge?.getPlugins();
    const next = snapshot?.plugins ?? [];
    setPlugins(next);
    setSelectedPluginKey((current) => current || (next[0] ? pluginKey(next[0]) : ''));
  };

  useEffect(() => { void refreshPlugins(); }, []);
  useEffect(() => {
    const onRules = (): void => setRules(readWorkshopAutomationRules());
    const onDiagnostics = (): void => setDiagnostics(readWorkshopDiagnostics());
    window.addEventListener(workshopAutomationsChangedEvent, onRules);
    window.addEventListener(workshopDiagnosticsChangedEvent, onDiagnostics);
    return () => {
      window.removeEventListener(workshopAutomationsChangedEvent, onRules);
      window.removeEventListener(workshopDiagnosticsChangedEvent, onDiagnostics);
    };
  }, []);

  const selectedPlugin = plugins.find((plugin) => pluginKey(plugin) === selectedPluginKey) ?? plugins[0] ?? null;
  const targets = targetKind === 'command' ? selectedPlugin?.commands ?? [] : selectedPlugin?.agents ?? [];
  useEffect(() => {
    setTargetId((current) => targets.some((target) => target.id === current) ? current : targets[0]?.id ?? '');
  }, [selectedPluginKey, targetKind, targets]);

  const dependencyPlan = useMemo(() => buildWorkshopDependencyPlan(plugins), [plugins]);
  const { rows: dependencyRows, compositionOrder, missingRequiredItemIds, bundleItemIds } = dependencyPlan;

  const saveRules = (next: WorkshopAutomationRule[]): void => setRules(writeWorkshopAutomationRules(next));

  const addRule = (): void => {
    if (!selectedPlugin || !targetId) return;
    const target = targets.find((entry) => entry.id === targetId);
    saveRules([...rules, {
      id: crypto.randomUUID(),
      title: title.trim() || `${t(workshopTriggerLabelKey(trigger))} · ${target?.title ?? targetId}`,
      enabled: true,
      trigger,
      intervalMinutes: trigger === 'timer' ? intervalMinutes : null,
      sourceId: selectedPlugin.sourceId,
      itemId: selectedPlugin.itemId,
      pluginId: selectedPlugin.pluginId,
      targetKind,
      targetId,
      agentPrompt: targetKind === 'agent' ? agentPrompt.trim() || null : null,
      cooldownSeconds: 2,
    }]);
    setTitle('');
    setNotice(t('workshop.control.ruleSaved'));
  };

  const runBusy = async (key: string, task: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(key);
    setNotice(null);
    try { await task(); } catch (error) { setNotice(error instanceof Error ? error.message : t('workshop.control.failed')); }
    finally { setBusy(null); }
  };

  const subscribeMissingDependencies = (): void => {
    if (!bridge || missingRequiredItemIds.length === 0 || !window.confirm(t('workshop.control.deps.confirmSubscribe', {
      count: missingRequiredItemIds.length,
    }))) return;
    void runBusy('dependencies', async () => {
      for (const itemId of missingRequiredItemIds) {
        const result = await bridge.subscribe({ sourceId: 'steam', itemId });
        if (!result.ok) throw new Error(result.reason ?? 'dependency-subscription-failed');
      }
      setNotice(t('workshop.control.deps.subscribed', { count: missingRequiredItemIds.length }));
      onChanged();
      await refreshPlugins();
    });
  };

  const copyCompositionBundle = (): void => {
    void runBusy('copy-bundle', async () => {
      await navigator.clipboard.writeText(JSON.stringify({
        type: 'echo-workshop-composition',
        version: 1,
        itemIds: bundleItemIds,
      }, null, 2));
      setNotice(t('workshop.control.deps.bundleCopied', { count: bundleItemIds.length }));
    });
  };

  const rollback = (item: WorkshopManagerItem): void => {
    if (!bridge || !window.confirm(t('workshop.control.confirmRollback', {
      title: item.contentId ?? item.itemId,
      version: item.previousVersion ?? '',
    }))) return;
    void runBusy(`rollback:${item.itemId}`, async () => {
      const result = await bridge.rollback({ sourceId: item.sourceId, itemId: item.itemId });
      if (!result.ok) throw new Error(result.reason ?? 'rollback-failed');
      setNotice(t('workshop.control.rolledBack', { version: item.previousVersion ?? '' }));
      onChanged();
      await refreshPlugins();
    });
  };

  const cleanup = (): void => {
    if (!bridge) return;
    void runBusy('cleanup', async () => {
      const preview = await bridge.previewMaintenanceCleanup();
      if (preview.candidates.length === 0) { setNotice(t('workshop.control.cleanupEmpty')); return; }
      if (!window.confirm(t('workshop.control.confirmCleanup', {
        count: preview.candidates.length,
        bytes: bytesLabel(preview.totalBytes),
      }))) return;
      const result = await bridge.runMaintenanceCleanup(preview.token);
      setNotice(t('workshop.control.cleaned', {
        removed: result.removed,
        bytes: bytesLabel(result.reclaimedBytes),
        failed: result.failed.length ? t('workshop.control.cleanedFailed', { count: result.failed.length }) : '',
      }));
    });
  };

  const exportProfile = (): void => {
    if (!bridge) return;
    void runBusy('export', async () => {
      const path = await bridge.exportCustomizationProfile(createWorkshopCustomizationProfile('My ECHO Workshop setup', plugins));
      setNotice(path ? t('workshop.control.exported') : t('workshop.control.exportCancelled'));
    });
  };

  const importProfile = (): void => {
    if (!bridge) return;
    void runBusy('import', async () => {
      const profile = await bridge.importCustomizationProfile();
      if (!profile) { setNotice(t('workshop.control.importCancelled')); return; }
      const result = applyWorkshopCustomizationProfile(profile, plugins);
      setNotice(t('workshop.control.imported', {
        plugins: result.appliedPlugins,
        rules: result.automations,
        missing: result.missingPlugins.length ? t('workshop.control.importedMissing', { count: result.missingPlugins.length }) : '',
      }));
    });
  };

  const runAcceptance = (): void => {
    if (!bridge || !/^[1-9]\d{0,19}$/u.test(acceptanceItemId.trim())) return;
    if (!window.confirm(t('workshop.control.confirmAcceptance'))) return;
    void runBusy('acceptance', async () => {
      const result = await bridge.runAcceptance({
        itemId: acceptanceItemId.trim(),
        cleanupSubscription: true,
        approveUiRuntime: true,
        timeoutSeconds: 120,
      });
      setAcceptanceResult(result);
      setNotice(result.ok ? t('workshop.control.acceptanceOk') : t('workshop.control.acceptanceFail'));
      onChanged();
    });
  };

  return (
    <section className="workshop-control-center" aria-label={t('workshop.control.aria')}>
      {notice ? <div className="workshop-control-center__notice" role="status">{notice}</div> : null}
      <article>
        <header><Workflow size={18} /><div><h2>{t('workshop.control.deps.title')}</h2><p>{t('workshop.control.deps.description')}</p></div></header>
        {compositionOrder.length > 1 ? <p className="workshop-control-center__order">{t('workshop.control.deps.order', { order: compositionOrder.map((plugin, index) => `${index + 1}. ${plugin.name}`).join(' → ') })}</p> : null}
        <div className="workshop-control-center__actions">
          <button type="button" disabled={Boolean(busy) || missingRequiredItemIds.length === 0} onClick={subscribeMissingDependencies}><Download size={15} />{busy === 'dependencies' ? t('workshop.control.deps.subscribing') : t('workshop.control.deps.subscribeMissing', { count: missingRequiredItemIds.length })}</button>
          <button type="button" disabled={Boolean(busy) || bundleItemIds.length === 0} onClick={copyCompositionBundle}><ClipboardCopy size={15} />{t('workshop.control.deps.copyBundle')}</button>
        </div>
        {dependencyRows.length ? <div className="workshop-control-center__rows">{dependencyRows.map(({ plugin, dependency, conflict }) => (
          <div key={`${pluginKey(plugin)}:${conflict ? 'conflict' : 'dependency'}:${dependency.itemId}`}>
            <strong>{plugin.name}</strong><span>{conflict ? t('workshop.control.deps.conflict') : dependency.optional ? t('workshop.control.deps.optional') : t('workshop.control.deps.required')} · {dependency.itemId}</span>
            <em data-state={conflict ? 'error' : dependency.state}>{conflict ? t('workshop.control.deps.conflictFound') : dependency.state === 'ready' ? t('workshop.control.deps.ready', { version: dependency.installedVersion ?? '' }) : dependency.state === 'missing' ? t('workshop.control.deps.missing') : t('workshop.control.deps.mismatch', { range: dependency.versionRange ?? '' })}</em>
          </div>
        ))}</div> : <p className="workshop-control-center__empty">{t('workshop.control.deps.empty')}</p>}
      </article>

      <article>
        <header><Play size={18} /><div><h2>{t('workshop.control.auto.title')}</h2><p>{t('workshop.control.auto.description')}</p></div></header>
        <div className="workshop-control-center__form">
          <select aria-label={t('workshop.control.auto.plugin')} value={selectedPlugin ? pluginKey(selectedPlugin) : ''} onChange={(event) => setSelectedPluginKey(event.target.value)}>{plugins.map((plugin) => <option key={pluginKey(plugin)} value={pluginKey(plugin)}>{plugin.name}</option>)}</select>
          <select aria-label={t('workshop.control.auto.trigger')} value={trigger} onChange={(event) => setTrigger(event.target.value as WorkshopAutomationTrigger)}>{workshopAutomationTriggers.map((entry) => <option key={entry} value={entry}>{t(workshopTriggerLabelKey(entry))}</option>)}</select>
          <select aria-label={t('workshop.control.auto.targetKind')} value={targetKind} onChange={(event) => setTargetKind(event.target.value as 'command' | 'agent')}><option value="command">{t('workshop.control.auto.command')}</option><option value="agent">{t('workshop.control.auto.agent')}</option></select>
          <select aria-label={t('workshop.control.auto.target')} value={targetId} onChange={(event) => setTargetId(event.target.value)}>{targets.map((target) => <option key={target.id} value={target.id}>{target.title}</option>)}</select>
          {trigger === 'timer' ? <input type="number" min={1} max={1440} value={intervalMinutes} aria-label={t('workshop.control.auto.interval')} onChange={(event) => setIntervalMinutes(Number(event.target.value))} /> : null}
          {targetKind === 'agent' ? <input value={agentPrompt} maxLength={4000} placeholder={t('workshop.control.auto.prompt')} aria-label={t('workshop.control.auto.prompt')} onChange={(event) => setAgentPrompt(event.target.value)} /> : null}
          <input value={title} maxLength={120} placeholder={t('workshop.control.auto.titlePlaceholder')} aria-label={t('workshop.control.auto.titleField')} onChange={(event) => setTitle(event.target.value)} />
          <button type="button" disabled={!selectedPlugin || !targetId} onClick={addRule}><Plus size={15} />{t('workshop.control.auto.add')}</button>
        </div>
        <div className="workshop-control-center__rules">{rules.map((rule) => (
          <div key={rule.id}><button type="button" aria-pressed={rule.enabled} onClick={() => saveRules(rules.map((entry) => entry.id === rule.id ? { ...entry, enabled: !entry.enabled } : entry))}>{rule.enabled ? t('workshop.control.auto.enabled') : t('workshop.control.auto.disabled')}</button><span><strong>{rule.title}</strong><small>{t(workshopTriggerLabelKey(rule.trigger))} → {rule.pluginId}/{rule.targetId}</small></span><button type="button" aria-label={t('workshop.control.auto.delete', { title: rule.title })} onClick={() => saveRules(rules.filter((entry) => entry.id !== rule.id))}><Trash2 size={15} /></button></div>
        ))}{rules.length === 0 ? <p className="workshop-control-center__empty">{t('workshop.control.auto.empty')}</p> : null}</div>
      </article>

      <article>
        <header><ArchiveRestore size={18} /><div><h2>{t('workshop.control.maintain.title')}</h2><p>{t('workshop.control.maintain.description')}</p></div></header>
        <div className="workshop-control-center__actions"><button type="button" disabled={Boolean(busy)} onClick={cleanup}><Eraser size={15} />{t('workshop.control.maintain.cleanup')}</button></div>
        <div className="workshop-control-center__rows">{items.filter((item) => item.previousVersion).map((item) => <div key={`${item.sourceId}:${item.itemId}`}><strong>{item.contentId ?? item.itemId}</strong><span>{t('workshop.control.maintain.current', { current: item.version ?? '', previous: item.previousVersion ?? '' })}</span><button type="button" disabled={Boolean(busy)} onClick={() => rollback(item)}><ArchiveRestore size={14} />{t('workshop.control.maintain.rollback')}</button></div>)}</div>
      </article>

      <article>
        <header><Download size={18} /><div><h2>{t('workshop.control.migrate.title')}</h2><p>{t('workshop.control.migrate.description')}</p></div></header>
        <div className="workshop-control-center__actions"><button type="button" disabled={Boolean(busy)} onClick={exportProfile}><Download size={15} />{t('workshop.control.migrate.export')}</button><button type="button" disabled={Boolean(busy)} onClick={importProfile}><Upload size={15} />{t('workshop.control.migrate.import')}</button></div>
      </article>

      <article>
        <header><Activity size={18} /><div><h2>{t('workshop.control.accept.title')}</h2><p>{t('workshop.control.accept.description')}</p></div></header>
        <div className="workshop-control-center__form">
          <input value={acceptanceItemId} inputMode="numeric" placeholder="Steam PublishedFileID" aria-label={t('workshop.control.accept.item')} onChange={(event) => setAcceptanceItemId(event.target.value)} />
          <button type="button" disabled={Boolean(busy) || !/^[1-9]\d{0,19}$/u.test(acceptanceItemId.trim())} onClick={runAcceptance}><Play size={15} />{busy === 'acceptance' ? t('workshop.control.accept.running') : t('workshop.control.accept.run')}</button>
        </div>
        {acceptanceResult ? <div className="workshop-control-center__rows">{acceptanceResult.steps.map((step) => <div key={step.id}><strong>{step.id}</strong><span>{step.detail}</span><em data-state={step.ok ? 'ready' : 'error'}>{step.ok ? t('workshop.control.accept.pass') : t('workshop.control.accept.fail')}</em></div>)}</div> : null}
      </article>

      <article>
        <header><Activity size={18} /><div><h2>{t('workshop.control.diag.title')}</h2><p>{t('workshop.control.diag.description')}</p></div></header>
        <div className="workshop-control-center__actions"><button type="button" onClick={() => { clearWorkshopDiagnostics(); setDiagnostics([]); }}><Trash2 size={15} />{t('workshop.control.diag.clear')}</button></div>
        <div className="workshop-control-center__diagnostics">{diagnostics.slice(-100).reverse().map((entry) => <div key={entry.id} data-level={entry.level}><time>{new Date(entry.at).toLocaleTimeString(locale)}</time><strong>{entry.pluginId ?? 'Workshop'}</strong><span>{entry.category} · {entry.message}</span><em>{entry.durationMs === null ? '' : `${entry.durationMs} ms`}</em></div>)}{diagnostics.length === 0 ? <p className="workshop-control-center__empty">{t('workshop.control.diag.empty')}</p> : null}</div>
      </article>
    </section>
  );
};
