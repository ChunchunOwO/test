import { AlertCircle, Blocks, Check, Power, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import '../styles/mods-page.css';

const loaderBaseUrl = 'http://127.0.0.1:17862';

type ModSummary = {
  id: string;
  name: string;
  version: string;
  description: string;
  iconDataUrl: string | null;
  configFile: string;
  enabled: boolean;
};

const requestLoader = async <T,>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${loaderBaseUrl}${path}`, options);
  const value = await response.json() as T & { error?: string };
  if (!response.ok) {
    throw new Error(value.error || `Loader request failed (${response.status})`);
  }
  return value;
};

const fileAsBase64 = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export const ModsPage = (): JSX.Element => {
  const [mods, setMods] = useState<ModSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [configOpen, setConfigOpen] = useState<string | null>(null);
  const [configText, setConfigText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      const result = await requestLoader<{ mods: ModSummary[] }>('/api/mods');
      setMods(result.mods);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const importMod = async (file: File): Promise<void> => {
    setBusyId('import');
    try {
      await requestLoader('/api/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data: await fileAsBase64(file) }),
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const setEnabled = async (mod: ModSummary): Promise<void> => {
    setBusyId(mod.id);
    try {
      await requestLoader(`/api/mod/${encodeURIComponent(mod.id)}/${mod.enabled ? 'disable' : 'enable'}`, { method: 'POST' });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  };

  const editConfig = async (mod: ModSummary): Promise<void> => {
    if (configOpen === mod.id) {
      setConfigOpen(null);
      return;
    }
    setBusyId(mod.id);
    try {
      const result = await requestLoader<{ config: unknown }>(`/api/mod/${encodeURIComponent(mod.id)}/config`);
      setConfigText(JSON.stringify(result.config ?? {}, null, 2));
      setConfigOpen(mod.id);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  };

  const saveConfig = async (mod: ModSummary): Promise<void> => {
    setBusyId(mod.id);
    try {
      const config = JSON.parse(configText) as unknown;
      await requestLoader(`/api/mod/${encodeURIComponent(mod.id)}/config`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      setConfigOpen(null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  };

  const uninstall = async (mod: ModSummary): Promise<void> => {
    if (!window.confirm(`Uninstall ${mod.name}?`)) return;
    setBusyId(mod.id);
    try {
      await requestLoader(`/api/mod/${encodeURIComponent(mod.id)}`, { method: 'DELETE' });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="mods-page page-stack" aria-labelledby="mods-title">
      <header className="mods-header">
        <div>
          <span className="mods-kicker"><Blocks size={15} aria-hidden="true" /> External loader</span>
          <h1 id="mods-title">Mods</h1>
          <p>ECHOSteam external mods</p>
        </div>
        <div className="mods-actions">
          <input ref={fileInputRef} className="mods-file-input" type="file" accept=".echomod,application/json" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importMod(file);
          }} />
          <button className="mods-button mods-button--primary" type="button" disabled={busyId !== null} onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} aria-hidden="true" /> Import .echomod
          </button>
          <button className="mods-icon-button" type="button" title="Refresh" aria-label="Refresh" disabled={refreshing} onClick={() => void refresh()}>
            <RefreshCw size={17} aria-hidden="true" className={refreshing ? 'mods-spin' : undefined} />
          </button>
        </div>
      </header>

      {error ? <div className="mods-message mods-message--error" role="alert"><AlertCircle size={17} aria-hidden="true" /><span>{error}. Start ECHOSteam with the external Mod Loader installed.</span></div> : null}

      <section className="mods-grid" aria-label="Installed mods">
        {mods.map((mod) => (
          <article className="mods-card" key={mod.id}>
            <div className="mods-card__top">
              <div className="mods-icon">
                {mod.iconDataUrl ? <img src={mod.iconDataUrl} alt="" /> : <Blocks size={25} aria-hidden="true" />}
              </div>
              <div className="mods-card__identity">
                <h2>{mod.name}</h2>
                <span>{mod.id} · v{mod.version}</span>
              </div>
              <span className={`mods-status ${mod.enabled ? 'mods-status--on' : ''}`}><Check size={13} aria-hidden="true" /> {mod.enabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            <p className="mods-card__description">{mod.description || 'No description.'}</p>
            <div className="mods-card__actions">
              <button className="mods-button" type="button" disabled={busyId !== null} onClick={() => void setEnabled(mod)}>
                <Power size={15} aria-hidden="true" /> {mod.enabled ? 'Disable' : 'Enable'}
              </button>
              <button className="mods-button" type="button" disabled={busyId !== null} onClick={() => void editConfig(mod)}>
                <Blocks size={15} aria-hidden="true" /> {configOpen === mod.id ? 'Close config' : 'Edit config'}
              </button>
              <button className="mods-button mods-button--danger" type="button" disabled={busyId !== null} onClick={() => void uninstall(mod)}>
                <Trash2 size={15} aria-hidden="true" /> Uninstall
              </button>
            </div>
            {configOpen === mod.id ? (
              <div className="mods-config-editor">
                <label htmlFor={`mod-config-${mod.id}`}>{mod.configFile}</label>
                <textarea id={`mod-config-${mod.id}`} value={configText} onChange={(event) => setConfigText(event.target.value)} spellCheck={false} />
                <button className="mods-button mods-button--primary" type="button" disabled={busyId !== null} onClick={() => void saveConfig(mod)}>
                  <Check size={15} aria-hidden="true" /> Save config
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </section>

      {!error && mods.length === 0 ? <div className="mods-empty"><Blocks size={25} aria-hidden="true" /><strong>No external mods installed</strong><span>Import an .echomod package to get started.</span></div> : null}
    </main>
  );
};
