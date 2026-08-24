import type { PluginLyricsCandidate } from '../../shared/types/plugins';
import type { WorkshopPluginLyricsProviderSummary, WorkshopPluginSummary } from '../../shared/types/workshop';

export type WorkshopLyricsProviderTrack = {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  durationSeconds: number | null;
};

export type WorkshopLyricsProviderRequest = {
  track: WorkshopLyricsProviderTrack;
  query?: string;
};

export type WorkshopLyricsProviderCandidate = PluginLyricsCandidate & {
  id: string;
};

export type WorkshopLyricsProviderDescriptor = WorkshopPluginLyricsProviderSummary & {
  key: string;
  pluginId: string;
  pluginName: string;
  sourceId: string;
  itemId: string;
  ready: boolean;
};

type ProviderInvoker = (
  provider: WorkshopLyricsProviderDescriptor,
  request: WorkshopLyricsProviderRequest,
) => Promise<WorkshopLyricsProviderCandidate[]>;

let providers: WorkshopLyricsProviderDescriptor[] = [];
let invoker: ProviderInvoker | null = null;
let generation = 0;
const listeners = new Set<() => void>();

export const workshopLyricsProviderKey = (plugin: WorkshopPluginSummary, providerId: string): string =>
  `${plugin.sourceId}:${plugin.itemId}:${plugin.pluginId}:${plugin.version}:${providerId}`;

const emit = (): void => listeners.forEach((listener) => listener());

export const publishWorkshopLyricsProviders = (
  nextProviders: WorkshopLyricsProviderDescriptor[],
  nextInvoker: ProviderInvoker,
): (() => void) => {
  const ownerGeneration = generation + 1;
  generation = ownerGeneration;
  providers = nextProviders;
  invoker = nextInvoker;
  emit();
  return () => {
    if (generation !== ownerGeneration) return;
    providers = [];
    invoker = null;
    emit();
  };
};

export const subscribeWorkshopLyricsProviders = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getWorkshopLyricsProvidersSnapshot = (): WorkshopLyricsProviderDescriptor[] => providers;

export const searchWorkshopLyricsProvider = async (
  providerKey: string,
  request: WorkshopLyricsProviderRequest,
): Promise<WorkshopLyricsProviderCandidate[]> => {
  const provider = providers.find((entry) => entry.key === providerKey);
  if (!provider || !provider.ready || !invoker) throw new Error('lyrics-provider-not-ready');
  return invoker(provider, request);
};
