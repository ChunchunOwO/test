import type { CSSProperties } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import type { EqBand, EqFilterType } from '../../../shared/types/eq';
import { eqFilterTypes, eqMaxFrequencyHz, eqMaxQ, eqMinFrequencyHz, eqMinQ } from '../../../shared/types/eq';
import { useI18n } from '../../i18n/I18nProvider';
import type { TranslationKey } from '../../i18n/locales';
import './eq-pro-band-editor.css';

type EqProBandEditorProps = {
  band: EqBand | undefined;
  displayNumber: number;
  color: string;
  disabled: boolean;
  frequencyUnlocked: boolean;
  gainEditable: boolean;
  qPresets: { wide: number; normal: number; narrow: number };
  onFilterTypeChange: (filterType: EqFilterType) => void;
  onFrequencyChange: (frequencyHz: number) => void;
  onFrequencyCommit: (frequencyHz: number) => void;
  onGainChange: (gainDb: number) => void;
  onGainCommit: (gainDb: number) => void;
  onQChange: (q: number) => void;
  onQCommit: (q: number) => void;
  onQPresetCommit: (q: number) => void;
  onEnabledChange: (enabled: boolean) => void;
  onFrequencySnapChange: (snapped: boolean) => void;
  onReset: () => void;
  onDelete: () => void;
};

const filterLabelKeys: Record<EqFilterType, TranslationKey> = {
  peaking: 'settings.eq.filter.peaking',
  lowShelf: 'settings.eq.filter.lowShelf',
  highShelf: 'settings.eq.filter.highShelf',
  lowPass: 'settings.eq.filter.lowPass',
  highPass: 'settings.eq.filter.highPass',
  notch: 'settings.eq.filter.notch',
};

export const EqProBandEditor = ({
  band,
  displayNumber,
  color,
  disabled,
  frequencyUnlocked,
  gainEditable,
  qPresets,
  onFilterTypeChange,
  onFrequencyChange,
  onFrequencyCommit,
  onGainChange,
  onGainCommit,
  onQChange,
  onQCommit,
  onQPresetCommit,
  onEnabledChange,
  onFrequencySnapChange,
  onReset,
  onDelete,
}: EqProBandEditorProps): JSX.Element | null => {
  const { t } = useI18n();

  if (!band) {
    return null;
  }

  const qChoices = [
    { id: 'wide', value: qPresets.wide, label: t('settings.eq.band.qPresetWide') },
    { id: 'normal', value: qPresets.normal, label: t('settings.eq.band.qPresetNormal') },
    { id: 'narrow', value: qPresets.narrow, label: t('settings.eq.band.qPresetNarrow') },
  ] as const;
  const closestQChoice = qChoices.reduce((closest, choice) => (
    Math.abs(choice.value - band.q) < Math.abs(closest.value - band.q) ? choice : closest
  ));

  return (
    <section
      className="eq-pro-band-editor"
      aria-label={t('settings.eq.band.inspector')}
      data-testid="eq-pro-band-editor"
      data-bypassed={band.enabled === false}
      style={{ '--eq-pro-band-color': color } as CSSProperties}
    >
      <header className="eq-pro-band-editor__header">
        <span className="eq-pro-band-editor__index">{displayNumber}</span>
        <span className="eq-pro-band-editor__title">
          <strong>{t('settings.eq.proEditor.selected', { index: String(displayNumber) })}</strong>
          <small>{t('settings.eq.proEditor.dragHelp')}</small>
        </span>
        <label className="eq-pro-band-editor__enabled">
          <input
            type="checkbox"
            checked={band.enabled !== false}
            disabled={disabled}
            onChange={(event) => onEnabledChange(event.currentTarget.checked)}
          />
          <span>{band.enabled === false ? t('settings.eq.band.bypassed') : t('settings.eq.band.enabled')}</span>
        </label>
        <button
          className="eq-icon-action"
          type="button"
          aria-label={t('settings.eq.action.deleteFilter')}
          title={t('settings.eq.action.deleteFilter')}
          disabled={disabled}
          onClick={onDelete}
        >
          <Trash2 size={15} />
        </button>
      </header>

      <div className="eq-pro-band-editor__main">
        <label className="eq-pro-band-editor__field">
          <span>{t('settings.eq.proEditor.position')}</span>
          <span className="eq-pro-band-editor__number">
            <input
              aria-label={t('settings.eq.band.frequency')}
              type="number"
              min={eqMinFrequencyHz}
              max={eqMaxFrequencyHz}
              step="1"
              value={Math.round(band.frequencyHz)}
              disabled={disabled}
              onChange={(event) => onFrequencyChange(Number(event.currentTarget.value))}
              onBlur={(event) => onFrequencyCommit(Number(event.currentTarget.value))}
            />
            <em>Hz</em>
          </span>
        </label>

        <label className="eq-pro-band-editor__field">
          <span>{t('settings.eq.proEditor.amount')}</span>
          <span className="eq-pro-band-editor__number">
            <input
              aria-label={t('settings.eq.band.gain')}
              type="number"
              min="-12"
              max="12"
              step="0.1"
              value={gainEditable ? band.gainDb : 0}
              disabled={disabled || !gainEditable}
              onChange={(event) => onGainChange(Number(event.currentTarget.value))}
              onBlur={(event) => onGainCommit(Number(event.currentTarget.value))}
            />
            <em>dB</em>
          </span>
        </label>

        <fieldset className="eq-pro-band-editor__width">
          <legend>{t('settings.eq.proEditor.range')}</legend>
          <div role="group" aria-label={t('settings.eq.band.qPresets')}>
            {qChoices.map((choice) => (
              <button
                className="eq-soft-button"
                type="button"
                data-active={closestQChoice.id === choice.id}
                data-q-preset={choice.id}
                disabled={disabled}
                key={choice.id}
                onClick={() => onQPresetCommit(choice.value)}
              >
                {choice.label}
              </button>
            ))}
          </div>
          <small>{t('settings.eq.proEditor.rangeHelp')}</small>
        </fieldset>
      </div>

      <details className="eq-pro-band-editor__advanced">
        <summary>{t('settings.eq.proEditor.advanced')}</summary>
        <div>
          <label>
            <span>{t('settings.eq.band.filterType')}</span>
            <select
              aria-label={t('settings.eq.band.filterType')}
              value={band.filterType ?? 'peaking'}
              disabled={disabled}
              onChange={(event) => onFilterTypeChange(event.currentTarget.value as EqFilterType)}
            >
              {eqFilterTypes.map((filterType) => (
                <option value={filterType} key={filterType}>{t(filterLabelKeys[filterType])}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('settings.eq.band.q')}</span>
            <input
              aria-label={t('settings.eq.band.q')}
              type="number"
              min={eqMinQ}
              max={eqMaxQ}
              step="0.1"
              value={band.q}
              disabled={disabled}
              onChange={(event) => onQChange(Number(event.currentTarget.value))}
              onBlur={(event) => onQCommit(Number(event.currentTarget.value))}
            />
          </label>
          <label className="eq-pro-band-editor__snap">
            <input
              data-testid="eq-pro-frequency-snap"
              type="checkbox"
              checked={!frequencyUnlocked}
              disabled={disabled}
              onChange={(event) => onFrequencySnapChange(event.currentTarget.checked)}
            />
            <span>{t('settings.eq.band.frequencySnapped')}</span>
          </label>
          <button className="eq-soft-button" type="button" disabled={disabled} onClick={onReset}>
            <RotateCcw size={14} />
            {t('settings.eq.action.resetSelected')}
          </button>
        </div>
      </details>
    </section>
  );
};
