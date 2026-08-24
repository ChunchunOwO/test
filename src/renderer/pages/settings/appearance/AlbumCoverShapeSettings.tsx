import type { TranslationKey } from '../../../i18n/locales';
import type { AppearancePreferences } from '../../../preferences/appearancePreferences';
import { ChipButton, SettingRow } from '../components/SettingsPrimitives';

type Translate = (
  key: TranslationKey,
  options?: Record<string, string | number>,
) => string;

type AlbumCoverShapeSettingsProps = {
  highlighted: boolean;
  onChange: (preferences: AppearancePreferences) => void;
  preferences: AppearancePreferences;
  t: Translate;
};

export const AlbumCoverShapeSettings = ({
  highlighted,
  onChange,
  preferences,
  t,
}: AlbumCoverShapeSettingsProps): JSX.Element => (
  <SettingRow
    id="settings-row-album-cover-shape"
    highlighted={highlighted}
    title={t('settings.appearance.albumCoverShape.title')}
    description={t('settings.appearance.albumCoverShape.description')}
  >
    <div className="settings-chip-row settings-chip-row--left">
      <ChipButton
        active={preferences.albumCoverShape !== 'square'}
        onClick={() => onChange({ ...preferences, albumCoverShape: 'rounded' })}
      >
        {t('settings.appearance.albumCoverShape.rounded')}
      </ChipButton>
      <ChipButton
        active={preferences.albumCoverShape === 'square'}
        onClick={() => onChange({ ...preferences, albumCoverShape: 'square' })}
      >
        {t('settings.appearance.albumCoverShape.square')}
      </ChipButton>
    </div>
  </SettingRow>
);
