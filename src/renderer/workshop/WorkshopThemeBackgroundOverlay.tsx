import { useEffect } from 'react';
import { useLowSpecModeEnabled } from '../performance/useLowSpecModeEnabled';
import '../styles/workshop-theme-background.css';
import '../styles/workshop-theme-skin.css';
import { useActiveWorkshopThemeBackground } from './useActiveWorkshopThemeBackground';
import { useActiveWorkshopThemeSelection } from './useActiveWorkshopThemeSelection';
import { WorkshopProtocolImage } from './WorkshopProtocolImage';
import {
  applyWorkshopThemeSkin,
  clearWorkshopThemeSkin,
  workshopThemeSkinWatermarkUrl,
} from './workshopThemeSkinDom';
import { isWorkshopAssetProtocolUrl } from './workshopAssetUrl';

export const WorkshopThemeBackgroundOverlay = (): JSX.Element | null => {
  const background = useActiveWorkshopThemeBackground();
  const lowSpecModeEnabled = useLowSpecModeEnabled();
  const active = useActiveWorkshopThemeSelection(background);
  const watermark = active && background ? workshopThemeSkinWatermarkUrl(background) : null;

  useEffect(() => {
    const root = document.documentElement;
    if (!active || !background) {
      clearWorkshopThemeSkin(root);
      return undefined;
    }
    applyWorkshopThemeSkin(root, background);
    return () => clearWorkshopThemeSkin(root);
  }, [active, background]);

  if (!active || !background || lowSpecModeEnabled) {
    return null;
  }

  return (
    <>
      {isWorkshopAssetProtocolUrl(background.url ?? background.assets.background)
        ? <div className="workshop-theme-background-overlay" aria-hidden="true" />
        : null}
      <div className="workshop-theme-skin-overlay" aria-hidden="true">
        <span className="workshop-theme-skin-layer workshop-theme-skin-layer--mist" />
        <span className="workshop-theme-skin-layer workshop-theme-skin-layer--bloom" />
        <span className="workshop-theme-skin-layer workshop-theme-skin-layer--spotlight" />
        <span className="workshop-theme-skin-layer workshop-theme-skin-layer--frost" />
      </div>
      {watermark
        ? <WorkshopProtocolImage className="workshop-theme-watermark" src={watermark} />
        : null}
    </>
  );
};
