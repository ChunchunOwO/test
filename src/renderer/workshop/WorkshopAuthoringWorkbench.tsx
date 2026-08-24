import { CheckCircle2, FlaskConical, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { WorkshopAuthoringKind, WorkshopAuthoringValidation } from '../../shared/types/workshop';
import {
  buildWorkshopAuthoringQualityReport,
  getWorkshopAuthoringFields,
  readWorkshopAuthoringEntryField,
  readWorkshopAuthoringManifestForm,
  workshopAuthoringScenarios,
  writeWorkshopAuthoringEntryField,
  writeWorkshopAuthoringManifestForm,
  type WorkshopAuthoringManifestForm,
} from './WorkshopAuthoringWorkbenchModel';
import { useWorkshopTranslate } from './workshopI18n';

type WorkshopAuthoringWorkbenchProps = {
  kind: WorkshopAuthoringKind;
  manifestText: string;
  entryText: string;
  validation: WorkshopAuthoringValidation | null;
  onManifestTextChange: (value: string) => void;
  onEntryTextChange: (value: string) => void;
};

const describeError = (error: unknown): string => error instanceof Error ? error.message : String(error);

export const WorkshopAuthoringWorkbench = ({
  kind,
  manifestText,
  entryText,
  validation,
  onManifestTextChange,
  onEntryTextChange,
}: WorkshopAuthoringWorkbenchProps): JSX.Element => {
  const t = useWorkshopTranslate();
  const [scenarioId, setScenarioId] = useState(workshopAuthoringScenarios[0].id);
  const [formError, setFormError] = useState<string | null>(null);
  const manifestForm = useMemo(() => {
    try {
      return readWorkshopAuthoringManifestForm(manifestText);
    } catch {
      return null;
    }
  }, [manifestText]);
  const fields = getWorkshopAuthoringFields(kind);
  const scenario = workshopAuthoringScenarios.find((entry) => entry.id === scenarioId) ?? workshopAuthoringScenarios[0];
  const quality = useMemo(() => {
    try {
      return buildWorkshopAuthoringQualityReport(kind, manifestText, entryText, validation);
    } catch (error) {
      return [{ code: 'parse', severity: 'blocker' as const, title: t('workshop.workbench.quality.parse'), detail: describeError(error) }];
    }
  }, [entryText, kind, manifestText, t, validation]);

  const updateManifest = (patch: Partial<WorkshopAuthoringManifestForm>): void => {
    if (!manifestForm) return;
    try {
      onManifestTextChange(writeWorkshopAuthoringManifestForm(manifestText, { ...manifestForm, ...patch }));
      setFormError(null);
    } catch (error) {
      setFormError(describeError(error));
    }
  };

  const updateEntry = (path: string, value: string | number | boolean): void => {
    try {
      onEntryTextChange(writeWorkshopAuthoringEntryField(entryText, path, value));
      setFormError(null);
    } catch (error) {
      setFormError(describeError(error));
    }
  };

  return (
    <section className="workshop-authoring-workbench" aria-label={t('workshop.workbench.aria')}>
      <section className="workshop-authoring-workbench__panel">
        <header><SlidersHorizontal size={16} /><div><strong>{t('workshop.workbench.edit.title')}</strong><span>{t('workshop.workbench.edit.copy')}</span></div></header>
        {manifestForm ? (
          <div className="workshop-authoring-formgrid">
            <label>{t('workshop.workbench.field.title')}<input value={manifestForm.title} onChange={(event) => updateManifest({ title: event.currentTarget.value })} /></label>
            <label>{t('workshop.workbench.field.version')}<input value={manifestForm.version} onChange={(event) => updateManifest({ version: event.currentTarget.value })} /></label>
            <label>{t('workshop.workbench.field.minEcho')}<input value={manifestForm.minEchoVersion} onChange={(event) => updateManifest({ minEchoVersion: event.currentTarget.value })} /></label>
            <label>{t('workshop.workbench.field.maxEcho')}<input placeholder={t('workshop.workbench.field.maxEchoPlaceholder')} value={manifestForm.maxEchoVersion} onChange={(event) => updateManifest({ maxEchoVersion: event.currentTarget.value })} /></label>
            <label>{t('workshop.workbench.field.license')}<input value={manifestForm.licenseId} onChange={(event) => updateManifest({ licenseId: event.currentTarget.value })} /></label>
            <label>{t('workshop.workbench.field.holder')}<input value={manifestForm.licenseHolder} onChange={(event) => updateManifest({ licenseHolder: event.currentTarget.value })} /></label>
            <label className="workshop-authoring-formgrid__wide">{t('workshop.workbench.field.licenseUrl')}<input placeholder="https://…" value={manifestForm.licenseSourceUrl} onChange={(event) => updateManifest({ licenseSourceUrl: event.currentTarget.value })} /></label>
            <label>{t('workshop.workbench.field.dependencies')}<textarea rows={3} placeholder="项目号 | ^1.2.0 | optional" value={manifestForm.dependenciesText} onChange={(event) => updateManifest({ dependenciesText: event.currentTarget.value })} /></label>
            <label>{t('workshop.workbench.field.conflicts')}<textarea rows={3} placeholder="每行一个 Steam Workshop 项目号" value={manifestForm.conflictsText} onChange={(event) => updateManifest({ conflictsText: event.currentTarget.value })} /></label>
            <label className="workshop-authoring-formgrid__wide">{t('workshop.workbench.field.hosts')}<textarea rows={2} placeholder="api.example.org" value={manifestForm.networkHostsText} onChange={(event) => updateManifest({ networkHostsText: event.currentTarget.value })} /></label>
            {fields.map((field) => {
              const value = readWorkshopAuthoringEntryField(entryText, field.path);
              if (field.type === 'boolean') {
                return <label className="workshop-authoring-toggle" key={field.path}><input type="checkbox" checked={value === true} onChange={(event) => updateEntry(field.path, event.currentTarget.checked)} />{field.label}</label>;
              }
              if (field.type === 'select') {
                return <label key={field.path}>{field.label}<select value={typeof value === 'string' ? value : ''} onChange={(event) => updateEntry(field.path, event.currentTarget.value)}>{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>;
              }
              return <label key={field.path}>{field.label}<input type={field.type === 'number' ? 'number' : 'text'} step={field.type === 'number' ? 'any' : undefined} value={typeof value === 'string' || typeof value === 'number' ? value : ''} onChange={(event) => updateEntry(field.path, field.type === 'number' ? Number(event.currentTarget.value) : event.currentTarget.value)} /></label>;
            })}
          </div>
        ) : <p className="workshop-authoring-workbench__empty">{t('workshop.workbench.empty')}</p>}
        {formError ? <p className="workshop-authoring-workbench__error" role="alert">{formError}</p> : null}
      </section>

      <section className="workshop-authoring-workbench__panel">
        <header><FlaskConical size={16} /><div><strong>{t('workshop.workbench.scenario.title')}</strong><span>{t('workshop.workbench.scenario.copy')}</span></div></header>
        <div className="workshop-authoring-scenarios" role="tablist" aria-label={t('workshop.workbench.scenario.aria')}>
          {workshopAuthoringScenarios.map((entry) => <button key={entry.id} type="button" role="tab" aria-selected={entry.id === scenario.id} onClick={() => setScenarioId(entry.id)}>{entry.title}</button>)}
        </div>
        <p>{scenario.description}</p>
        <pre>{JSON.stringify(scenario.payload, null, 2)}</pre>
      </section>

      <section className="workshop-authoring-workbench__panel">
        <header><CheckCircle2 size={16} /><div><strong>{t('workshop.workbench.quality.title')}</strong><span>{t('workshop.workbench.quality.copy')}</span></div></header>
        <ul className="workshop-authoring-quality">
          {quality.map((issue) => <li key={issue.code} data-severity={issue.severity}>{issue.severity === 'blocker' ? <TriangleAlert size={15} /> : <CheckCircle2 size={15} />}<span><strong>{issue.title}</strong><small>{issue.detail}</small></span></li>)}
        </ul>
      </section>
    </section>
  );
};

