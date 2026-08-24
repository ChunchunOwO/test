import type { Locale } from '../../../i18n/locales';
import {
  uiScalePercentMax,
  uiScalePercentMin,
  uiScalePercentStep,
} from '../../../../shared/types/appSettings';
import { SettingRow, UiScaleControl } from '../components/SettingsPrimitives';
import { settingsLocaleCopy } from '../settingsSubsections';

type GeneralUiScaleSettingProps = {
  disabled: boolean;
  highlighted: boolean;
  locale: Locale;
  onChange: (value: number) => void;
  value: number;
};

export const GeneralUiScaleSetting = ({
  disabled,
  highlighted,
  locale,
  onChange,
  value,
}: GeneralUiScaleSettingProps): JSX.Element => (
  <SettingRow
    id="settings-row-ui-scale"
    highlighted={highlighted}
    title={settingsLocaleCopy(locale, {
      'zh-CN': '界面缩放', 'zh-TW': '介面縮放', 'ja-JP': 'UI の拡大率', 'en-US': 'UI scale', 'ko-KR': 'UI 배율',
    })}
    description={settingsLocaleCopy(locale, {
      'zh-CN': '调整 ECHO 主窗口的文字、按钮和点击区域；宠物、迷你播放器和桌面歌词保持原尺寸。',
      'zh-TW': '調整 ECHO 主視窗的文字、按鈕和點擊區域；寵物、迷你播放器和桌面歌詞維持原尺寸。',
      'ja-JP': 'ECHO のメインウィンドウだけを拡大縮小します。ペット、ミニプレーヤー、デスクトップ歌詞には影響しません。',
      'en-US': 'Scales the ECHO main window only. The pet, mini player, and desktop lyrics keep their original size.',
      'ko-KR': 'ECHO 메인 창만 확대하거나 축소합니다. 펫, 미니 플레이어와 데스크톱 가사는 원래 크기를 유지합니다.',
    })}
  >
    <UiScaleControl
      min={uiScalePercentMin}
      max={uiScalePercentMax}
      step={uiScalePercentStep}
      value={value}
      disabled={disabled}
      decreaseLabel={settingsLocaleCopy(locale, {
        'zh-CN': '缩小界面', 'zh-TW': '縮小介面', 'ja-JP': '表示を縮小', 'en-US': 'Decrease UI scale', 'ko-KR': 'UI 축소',
      })}
      increaseLabel={settingsLocaleCopy(locale, {
        'zh-CN': '放大界面', 'zh-TW': '放大介面', 'ja-JP': '表示を拡大', 'en-US': 'Increase UI scale', 'ko-KR': 'UI 확대',
      })}
      valueLabel={settingsLocaleCopy(locale, {
        'zh-CN': '当前界面缩放', 'zh-TW': '目前介面縮放', 'ja-JP': '現在の UI 拡大率', 'en-US': 'Current UI scale', 'ko-KR': '현재 UI 배율',
      })}
      presetsLabel={settingsLocaleCopy(locale, {
        'zh-CN': '常用缩放比例', 'zh-TW': '常用縮放比例', 'ja-JP': 'よく使う拡大率', 'en-US': 'Common UI scale sizes', 'ko-KR': '일반 UI 배율',
      })}
      resetLabel={settingsLocaleCopy(locale, {
        'zh-CN': '恢复默认', 'zh-TW': '恢復預設', 'ja-JP': '既定値に戻す', 'en-US': 'Reset to default', 'ko-KR': '기본값 복원',
      })}
      shortcutHint={settingsLocaleCopy(locale, {
        'zh-CN': '快捷键：Ctrl/⌘ 加号或减号逐级调整，Ctrl/⌘ 0 恢复 100%。',
        'zh-TW': '快捷鍵：Ctrl/⌘ 加號或減號逐級調整，Ctrl/⌘ 0 恢復 100%。',
        'ja-JP': 'ショートカット：Ctrl/⌘ と ＋/－ で調整、Ctrl/⌘ 0 で 100% に戻します。',
        'en-US': 'Shortcuts: Ctrl/⌘ plus or minus to adjust, Ctrl/⌘ 0 to return to 100%.',
        'ko-KR': '단축키: Ctrl/⌘ 더하기 또는 빼기로 조절하고 Ctrl/⌘ 0으로 100%로 돌아갑니다.',
      })}
      presets={[
        { value: 100, label: settingsLocaleCopy(locale, { 'zh-CN': '标准', 'zh-TW': '標準', 'ja-JP': '標準', 'en-US': 'Standard', 'ko-KR': '표준' }) },
        { value: 110, label: settingsLocaleCopy(locale, { 'zh-CN': '舒适', 'zh-TW': '舒適', 'ja-JP': '快適', 'en-US': 'Comfortable', 'ko-KR': '편안함' }) },
        { value: 125, label: settingsLocaleCopy(locale, { 'zh-CN': '大号', 'zh-TW': '大號', 'ja-JP': '大きい', 'en-US': 'Large', 'ko-KR': '크게' }) },
        { value: 150, label: settingsLocaleCopy(locale, { 'zh-CN': '特大', 'zh-TW': '特大', 'ja-JP': '最大', 'en-US': 'Extra large', 'ko-KR': '매우 크게' }) },
      ]}
      onChange={onChange}
    />
  </SettingRow>
);
