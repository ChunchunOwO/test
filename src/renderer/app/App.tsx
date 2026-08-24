import { lazy, Suspense, useLayoutEffect } from 'react';
import { AppLayout } from './AppLayout';
import { AppProviders } from './AppProviders';
import { appRoutes, preloadPendingAppRoute } from './routes';
import { markStartupAppMounted } from '../startupOverlay';
import { WorkshopThemeBackgroundOverlay } from '../workshop/WorkshopThemeBackgroundOverlay';

const WorkshopUiRuntimeHost = lazy(() => import('../workshop/WorkshopUiRuntimeHost')
  .then((module) => ({ default: module.WorkshopUiRuntimeHost })));
const WorkshopPluginHost = lazy(() => import('../workshop/WorkshopPluginHost')
  .then((module) => ({ default: module.WorkshopPluginHost })));

export const prepareAppStartup = async (): Promise<void> => {
  await preloadPendingAppRoute();
};

export const App = (): JSX.Element => {
  useLayoutEffect(() => {
    markStartupAppMounted();
  }, []);

  return (
    <AppProviders>
      <WorkshopThemeBackgroundOverlay />
      <AppLayout routes={appRoutes} />
      <Suspense fallback={null}>
        <WorkshopUiRuntimeHost />
        <WorkshopPluginHost />
      </Suspense>
    </AppProviders>
  );
};
