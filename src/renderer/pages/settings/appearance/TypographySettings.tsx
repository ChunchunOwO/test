import type { TranslationKey } from '../../../i18n/locales';
import type { AppearancePreferences } from '../../../preferences/appearancePreferences';
import {
  NumberRangeField,
  SettingRow,
} from '../components/SettingsPrimitives';
import type { FontPickerTarget } from './fontSettingsModel';

type Translate = (
  key: TranslationKey,
  options?: Record<string, string | number>,
) => string;

type TypographySettingsProps = {
  onChange: (preferences: AppearancePreferences) => void;
  onFontPickerOpen: (target: FontPickerTarget) => void;
  preferences: AppearancePreferences;
  t: Translate;
};

export const TypographySettings = ({
  onChange,
  onFontPickerOpen,
  preferences,
  t,
}: TypographySettingsProps): JSX.Element => (
  <div className="settings-typography-panel" id="settings-row-appearance-typography">
    <div className="settings-expandable-content settings-expandable-content--typography">
      <SettingRow
        title={t('settings.appearance.font.main.title')}
        description={t('settings.appearance.font.main.description')}
      >
        <button
          className="settings-font-picker-button"
          type="button"
          onClick={() => onFontPickerOpen('main')}
        >
          <span
            style={{
              fontFamily: `"${preferences.mainFontFamily}", var(--echo-font-family)`,
            }}
          >
            {preferences.mainFontFamily}
          </span>
          <em>{t('settings.appearance.font.choose')}</em>
        </button>
      </SettingRow>
      <SettingRow
        title={t('settings.appearance.font.chinese.title')}
        description={t('settings.appearance.font.chinese.description')}
      >
        <button
          className="settings-font-picker-button"
          type="button"
          onClick={() => onFontPickerOpen('chinese')}
        >
          <span
            style={{
              fontFamily: `"${preferences.chineseFontFamily}", var(--echo-font-family)`,
            }}
          >
            {preferences.chineseFontFamily}
          </span>
          <em>{t('settings.appearance.font.choose')}</em>
        </button>
      </SettingRow>
      <SettingRow
        title={t('settings.appearance.font.fallback.title')}
        description={t('settings.appearance.font.fallback.description')}
      >
        <button
          className="settings-font-picker-button"
          type="button"
          onClick={() => onFontPickerOpen('fallback')}
        >
          <span
            style={{
              fontFamily: `"${preferences.fallbackFontFamily}", var(--echo-font-family)`,
            }}
          >
            {preferences.fallbackFontFamily}
          </span>
          <em>{t('settings.appearance.font.choose')}</em>
        </button>
      </SettingRow>
      <SettingRow
        title={t('settings.appearance.fontSize.title')}
        description={t('settings.appearance.fontSize.description')}
      >
        <NumberRangeField
          min={12}
          max={18}
          step={1}
          suffix="px"
          value={preferences.baseFontSize}
          onChange={(baseFontSize) => onChange({ ...preferences, baseFontSize })}
        />
      </SettingRow>
      <SettingRow
        title={t('settings.appearance.lineHeight.title')}
        description={t('settings.appearance.lineHeight.description')}
      >
        <NumberRangeField
          min={1.1}
          max={1.8}
          step={0.05}
          suffix=""
          value={preferences.lineHeight}
          onChange={(lineHeight) => onChange({ ...preferences, lineHeight })}
        />
      </SettingRow>
      <SettingRow
        title={t('settings.appearance.textDepth.title')}
        description={t('settings.appearance.textDepth.description')}
      >
        <NumberRangeField
          min={35}
          max={100}
          step={1}
          suffix="%"
          value={preferences.textDepth}
          onChange={(textDepth) => onChange({ ...preferences, textDepth })}
        />
      </SettingRow>
    </div>
  </div>
);
