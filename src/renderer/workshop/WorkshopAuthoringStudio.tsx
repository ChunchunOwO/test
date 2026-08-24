import { BookOpen, CheckCircle2, Download, ExternalLink, FileJson2, FolderOpen, Play, Plus, Save, TriangleAlert, Upload } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  workshopAuthoringKinds,
  type WorkshopAuthoringDraft,
  type WorkshopAuthoringKind,
  type WorkshopAuthoringPreparedSummary,
  type WorkshopAuthoringValidation,
} from '../../shared/types/workshop';
import { WorkshopAuthoringWorkbench } from './WorkshopAuthoringWorkbench';
import { buildWorkshopAuthoringQualityReport } from './WorkshopAuthoringWorkbenchModel';
import { workshopAuthoringKindLabelKey, workshopVisibilityLabelKey, useWorkshopTranslate } from './workshopI18n';
import '../styles/workshop-authoring-studio.css';

const describeError = (error: unknown): string => error instanceof Error ? error.message : String(error);
const workshopSdkStarterUrl = 'https://steamcommunity.com/sharedfiles/filedetails/?id=3784997717';

export const WorkshopAuthoringStudio = (): JSX.Element => {
  const t = useWorkshopTranslate();
  const bridge = window.echo?.workshop;
  const [draft, setDraft] = useState<WorkshopAuthoringDraft | null>(null);
  const [manifestText, setManifestText] = useState('');
  const [entryText, setEntryText] = useState('');
  const [kind, setKind] = useState<WorkshopAuthoringKind>('plugin-package');
  const [id, setId] = useState('my-echo-extension');
  const [title, setTitle] = useState('My ECHO Extension');
  const [licenseHolder, setLicenseHolder] = useState('Workshop author');
  const [validation, setValidation] = useState<WorkshopAuthoringValidation | null>(null);
  const [prepared, setPrepared] = useState<WorkshopAuthoringPreparedSummary | null>(null);
  const [publication, setPublication] = useState<WorkshopAuthoringDraft['publication'] | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDraft = (next: WorkshopAuthoringDraft): void => {
    setDraft(next);
    setManifestText(next.manifestText);
    setEntryText(next.entryText);
    setPrepared(null);
    setPublication({ ...next.publication, tags: [...next.publication.tags] });
    setRightsConfirmed(false);
    setNotice(t('workshop.author.opened', { title: next.title }));
  };

  useEffect(() => {
    if (!draft || !bridge) {
      setValidation(null);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void bridge.validateAuthoringDraft({ manifestText, entryText })
        .then(setValidation)
        .catch((reason) => setValidation({ ok: false, kind: null, id: null, title: null, normalizedContribution: null, error: describeError(reason) }));
    }, 260);
    return () => window.clearTimeout(timer);
  }, [bridge, draft, entryText, manifestText]);

  const previewText = useMemo(() => validation?.ok
    ? JSON.stringify(validation.normalizedContribution, null, 2)
    : '', [validation]);
  const dirty = Boolean(draft && publication && (
    manifestText !== draft.manifestText || entryText !== draft.entryText
    || JSON.stringify(publication) !== JSON.stringify(draft.publication)
  ));
  const qualityBlocked = useMemo(() => {
    if (!draft) return true;
    try {
      return buildWorkshopAuthoringQualityReport(draft.kind, manifestText, entryText, validation)
        .some((issue) => issue.severity === 'blocker');
    } catch {
      return true;
    }
  }, [draft, entryText, manifestText, validation]);

  const changeManifestText = (value: string): void => {
    setManifestText(value);
    setPrepared(null);
  };

  const changeEntryText = (value: string): void => {
    setEntryText(value);
    setPrepared(null);
  };

  const run = async (key: string, action: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setBusy(null);
    }
  };

  const createProject = (): void => {
    if (!bridge) return;
    void run('create', async () => {
      const next = await bridge.createAuthoringProject({
        kind,
        id,
        title,
        licenseHolder,
        minEchoVersion: '26.8.15',
      });
      if (next) loadDraft(next);
    });
  };

  const openProject = (): void => {
    if (!bridge) return;
    void run('open', async () => {
      const next = await bridge.openAuthoringProject();
      if (next) loadDraft(next);
    });
  };

  const copySdk = (): void => {
    if (!bridge) return;
    void run('copy-sdk', async () => {
      const result = await bridge.copyAuthoringSdk();
      if (result) setNotice(t('workshop.author.sdkCopied', { version: result.sdkVersion }));
    });
  };

  const openSdkStarter = (): void => {
    void run('open-sdk', async () => {
      await window.echo?.app.openExternalUrl(workshopSdkStarterUrl);
    });
  };

  const saveDraft = (): void => {
    if (!bridge || !draft) return;
    void run('save', async () => {
      const next = await bridge.saveAuthoringDraft({
        rootDirectory: draft.rootDirectory,
        manifestText,
        entryText,
        ...(publication ? { publication } : {}),
      });
      loadDraft(next);
      setNotice(t('workshop.author.saved'));
    });
  };

  const publishProject = (): void => {
    if (!bridge || !draft || !prepared || !publication || !rightsConfirmed) return;
    const visibilityLabel = t(workshopVisibilityLabelKey(publication.visibility));
    if (!window.confirm(t('workshop.author.confirmPublish', { title: draft.title, visibility: visibilityLabel }))) return;
    void run('publish', async () => {
      const result = await bridge.publishAuthoringProject({
        rootDirectory: draft.rootDirectory,
        rightsConfirmation: 'owned-or-authorized',
        publicationConfirmation: 'publish-to-steam-workshop',
      });
      const nextPublication = { ...publication, publishedFileId: result.itemId };
      setPublication(nextPublication);
      setDraft({ ...draft, publication: nextPublication });
      setRightsConfirmed(false);
      setNotice(t(result.created ? 'workshop.author.published.created' : 'workshop.author.published.updated', {
        itemId: result.itemId,
        visibility: t(workshopVisibilityLabelKey(result.visibility)),
        suffix: result.needsToAcceptAgreement ? t('workshop.author.published.agreement') : t('workshop.author.published.done'),
      }));
    });
  };

  const prepareProject = (): void => {
    if (!bridge || !draft) return;
    void run('prepare', async () => {
      const next = await bridge.prepareAuthoringProject(draft.rootDirectory);
      setPrepared(next);
      setNotice(t('workshop.author.prepared'));
    });
  };

  return (
    <section className="workshop-authoring-studio" aria-label={t('workshop.author.aria')}>
      <header className="workshop-authoring-studio__header">
        <div>
          <span>{t('workshop.author.kicker')}</span>
          <h2>{t('workshop.author.title')}</h2>
          <p>{t('workshop.author.description')}</p>
        </div>
        <div className="workshop-authoring-studio__actions">
          <button className="workshop-button" type="button" disabled={!bridge || Boolean(busy)} onClick={copySdk}>
            <Download size={15} />{busy === 'copy-sdk' ? t('workshop.author.copyingSdk') : t('workshop.author.copySdk')}
          </button>
          <button className="workshop-button" type="button" disabled={Boolean(busy)} onClick={openSdkStarter}>
            <BookOpen size={15} />{t('workshop.author.sdkStarter')}
          </button>
          <button className="workshop-button" type="button" disabled={!bridge || Boolean(busy)} onClick={openProject}>
            <FolderOpen size={15} />{t('workshop.author.openProject')}
          </button>
        </div>
      </header>

      {!draft ? (
        <div className="workshop-authoring-create">
          <label>{t('workshop.author.kind')}<select value={kind} onChange={(event) => setKind(event.target.value as WorkshopAuthoringKind)}>
            {workshopAuthoringKinds.map((entry) => <option key={entry} value={entry}>{t(workshopAuthoringKindLabelKey(entry))}</option>)}
          </select></label>
          <label>{t('workshop.author.contentId')}<input value={id} maxLength={80} onChange={(event) => setId(event.target.value)} /></label>
          <label>{t('workshop.author.displayName')}<input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label>
          <label>{t('workshop.author.rightsHolder')}<input value={licenseHolder} maxLength={160} onChange={(event) => setLicenseHolder(event.target.value)} /></label>
          <button className="workshop-button workshop-button--primary" type="button" disabled={!bridge || Boolean(busy) || !id.trim() || !title.trim() || !licenseHolder.trim()} onClick={createProject}>
            <Plus size={15} />{busy === 'create' ? t('workshop.author.creating') : t('workshop.author.create')}
          </button>
        </div>
      ) : (
        <>
          <div className="workshop-authoring-projectbar">
            <div><FileJson2 size={18} /><span><strong>{draft.title}</strong><small>{draft.kind} · {draft.entryPath}</small></span></div>
            <div>
              <button type="button" disabled={Boolean(busy)} onClick={() => void bridge?.openAuthoringFolder(draft.rootDirectory)}><FolderOpen size={14} />{t('workshop.author.folder')}</button>
              <button type="button" disabled={Boolean(busy) || validation?.ok !== true} onClick={saveDraft}><Save size={14} />{busy === 'save' ? t('workshop.author.saving') : t('workshop.author.save')}</button>
              <button type="button" disabled={Boolean(busy) || validation?.ok !== true || dirty || qualityBlocked} onClick={prepareProject}><Play size={14} />{busy === 'prepare' ? t('workshop.author.preparing') : t('workshop.author.prepare')}</button>
              <button type="button" disabled={Boolean(busy) || !prepared || dirty} onClick={() => void bridge?.openAuthoringPreview(draft.rootDirectory)}><ExternalLink size={14} />{t('workshop.author.preview')}</button>
              <button type="button" disabled={Boolean(busy) || !prepared || dirty || !rightsConfirmed} onClick={publishProject}><Upload size={14} />{busy === 'publish' ? t('workshop.author.publishing') : t('workshop.author.publish')}</button>
            </div>
          </div>
          {dirty ? <div className="workshop-authoring-dirty" role="status">{t('workshop.author.dirty')}</div> : null}
          <WorkshopAuthoringWorkbench
            kind={draft.kind}
            manifestText={manifestText}
            entryText={entryText}
            validation={validation}
            onManifestTextChange={changeManifestText}
            onEntryTextChange={changeEntryText}
          />
          {publication ? <section className="workshop-authoring-publication" aria-label={t('workshop.author.publishAria')}>
            <header><strong>{t('workshop.author.publishTitle')}</strong><span>PublishedFileID {publication.publishedFileId === '0' ? t('workshop.author.publishIdPending') : publication.publishedFileId}</span></header>
            <div>
              <label>{t('workshop.author.visibility')}<select value={publication.visibility} onChange={(event) => setPublication({ ...publication, visibility: event.target.value as typeof publication.visibility })}>
                <option value="private">{t('workshop.author.visibility.private')}</option>
                <option value="friends-only">{t('workshop.author.visibility.friends')}</option>
                <option value="unlisted">{t('workshop.author.visibility.unlisted')}</option>
                <option value="public">{t('workshop.author.visibility.public')}</option>
              </select></label>
              <label>{t('workshop.author.tags')}<input value={publication.tags.join(', ')} onChange={(event) => setPublication({ ...publication, tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} /></label>
              <label className="workshop-authoring-publication__wide">{t('workshop.author.descriptionField')}<textarea value={publication.description} onChange={(event) => setPublication({ ...publication, description: event.target.value })} /></label>
              <label className="workshop-authoring-publication__wide">{t('workshop.author.changeNote')}<textarea value={publication.changeNote} onChange={(event) => setPublication({ ...publication, changeNote: event.target.value })} /></label>
            </div>
            <label className="workshop-authoring-publication__rights"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} />{t('workshop.author.rightsConfirm')}</label>
          </section> : null}
          <div className="workshop-authoring-editors">
            <label><span>{t('workshop.author.rawManifest')}</span><textarea spellCheck={false} value={manifestText} onChange={(event) => changeManifestText(event.target.value)} /></label>
            <label><span>{t('workshop.author.rawEntry', { path: draft.entryPath })}</span><textarea spellCheck={false} value={entryText} onChange={(event) => changeEntryText(event.target.value)} /></label>
            <section className="workshop-authoring-preview" aria-label={t('workshop.author.previewAria')}>
              <header>
                {validation?.ok ? <CheckCircle2 size={16} /> : <TriangleAlert size={16} />}
                <strong>{validation?.ok ? t('workshop.author.previewOk') : t('workshop.author.previewWait')}</strong>
              </header>
              {validation?.ok ? <pre>{previewText}</pre> : <p>{validation?.error ?? t('workshop.author.previewHint')}</p>}
              {prepared
                ? <footer>{t('workshop.author.preparedFooter', { count: prepared.fileCount, bytes: prepared.totalBytes, version: prepared.version })}</footer>
                : <footer>{t('workshop.author.previewFooter')}</footer>}
            </section>
          </div>
        </>
      )}
      {notice ? <div className="workshop-banner workshop-banner--success" role="status"><CheckCircle2 size={15} />{notice}</div> : null}
      {error ? <div className="workshop-banner workshop-banner--warning" role="alert"><TriangleAlert size={15} />{error}</div> : null}
    </section>
  );
};
