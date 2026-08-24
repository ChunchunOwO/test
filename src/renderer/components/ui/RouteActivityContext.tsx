import { createContext, useContext } from 'react';
import type { PropsWithChildren } from 'react';

const RouteActivityContext = createContext(true);

type RouteActivityProviderProps = PropsWithChildren<{
  isActive: boolean;
}>;

export const RouteActivityProvider = ({ children, isActive }: RouteActivityProviderProps): JSX.Element => (
  <RouteActivityContext.Provider value={isActive}>
    {children}
  </RouteActivityContext.Provider>
);

export const useRouteActivity = (): boolean => useContext(RouteActivityContext);
