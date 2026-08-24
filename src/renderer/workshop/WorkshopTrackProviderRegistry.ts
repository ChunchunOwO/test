import type { PluginCoverCandidate, PluginMetadataCandidate } from '../../shared/types/plugins';

export type WorkshopTrackProviderRequest = {
  track: {
    id: string;
    title: string;
    artist: string | null;
    album: string | null;
    albumArtist: string | null;
    durationSeconds: number;
  };
};

type WorkshopTrackProviderBase = {
  key: string;
  pluginName: string;
  providerId: string;
  title: string;
  description: string | null;
  ready: boolean;
};

export type WorkshopMetadataProviderRuntime = WorkshopTrackProviderBase & {
  lookup: (request: WorkshopTrackProviderRequest) => Promise<PluginMetadataCandidate[]>;
};

export type WorkshopCoverProviderRuntime = WorkshopTrackProviderBase & {
  lookup: (request: WorkshopTrackProviderRequest) => Promise<PluginCoverCandidate[]>;
};

export type WorkshopTrackProviderSnapshot = {
  metadataProviders: WorkshopMetadataProviderRuntime[];
  coverProviders: WorkshopCoverProviderRuntime[];
};

type Listener = () => void;

let snapshot: WorkshopTrackProviderSnapshot = { metadataProviders: [], coverProviders: [] };
const listeners = new Set<Listener>();

export const getWorkshopTrackProviderSnapshot = (): WorkshopTrackProviderSnapshot => snapshot;

export const publishWorkshopTrackProviders = (next: WorkshopTrackProviderSnapshot): void => {
  snapshot = next;
  listeners.forEach((listener) => listener());
};

export const subscribeWorkshopTrackProviders = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const clearWorkshopTrackProvidersForTests = (): void => {
  publishWorkshopTrackProviders({ metadataProviders: [], coverProviders: [] });
};
