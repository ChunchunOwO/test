import { Save, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { WorkshopPluginSummary } from '../../shared/types/workshop';
import {
  readWorkshopPluginSettings,
  type WorkshopPluginSettingsValues,
  writeWorkshopPluginSettings,
} from './WorkshopPluginStorage';

type WorkshopPluginSettingsDialogProps = {
  plugin: WorkshopPluginSummary;
  onClose: () => void;
  onChanged: (values: WorkshopPluginSettingsValues) => void;
};

export const WorkshopPluginSettingsDialog = ({
  plugin,
  onClose,
  onChanged,
}: WorkshopPluginSettingsDialogProps): JSX.Element => {
  const [values, setValues] = useState<WorkshopPluginSettingsValues>(() => readWorkshopPluginSettings(plugin));
  const [draft, setDraft] = useState<WorkshopPluginSettingsValues>(values);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next = readWorkshopPluginSettings(plugin);
    setValues(next);
    setDraft(next);
    setError(null);
  }, [plugin]);

  const save = (): void => {
    try {
      const next = writeWorkshopPluginSettings(plugin, draft);
      setValues(next);
      setDraft(next);
      setError(null);
      onChanged(next);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'settings-save-failed');
    }
  };

  return (
    <section className="workshop-plugin-settings" role="dialog" aria-modal="true" aria-label={`${plugin.name}：插件设置`}>
      <header>
        <div><SlidersHorizontal size={17} /><strong>插件设置</strong><span>{plugin.name}</span></div>
        <button type="button" aria-label="关闭插件设置" onClick={onClose}><X size={17} /></button>
      </header>
      <div className="workshop-plugin-settings__fields">
        {plugin.settings.map((setting) => (
          <label key={setting.id} className="workshop-plugin-settings__field">
            <span><strong>{setting.title}</strong>{setting.description ? <small>{setting.description}</small> : null}</span>
            {setting.type === 'boolean' ? (
              <input
                type="checkbox"
                aria-label={setting.title}
                checked={draft[setting.id] === true}
                onChange={(event) => setDraft((current) => ({ ...current, [setting.id]: event.target.checked }))}
              />
            ) : setting.type === 'select' ? (
              <select
                aria-label={setting.title}
                value={String(draft[setting.id] ?? '')}
                required={setting.required}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  [setting.id]: !setting.required && event.target.value === '' ? null : event.target.value,
                }))}
              >
                {!setting.required ? <option value="">未选择</option> : null}
                {setting.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : (
              <input
                type={setting.type === 'number' ? 'number' : 'text'}
                aria-label={setting.title}
                value={draft[setting.id] === null ? '' : String(draft[setting.id] ?? '')}
                placeholder={setting.placeholder ?? undefined}
                min={setting.min ?? undefined}
                max={setting.max ?? undefined}
                required={setting.required}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  [setting.id]: setting.type === 'number'
                    ? (event.target.value === '' ? null : Number(event.target.value))
                    : event.target.value,
                }))}
              />
            )}
          </label>
        ))}
      </div>
      {error ? <p role="alert">无法保存：{error}</p> : null}
      <button className="workshop-plugin-settings__save" type="button" onClick={save}><Save size={15} />保存设置</button>
    </section>
  );
};
