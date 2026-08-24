import { LastFmService } from './LastFmService';

let lastFmService: LastFmService | null = null;

export const getLastFmService = (): LastFmService => {
  lastFmService ??= new LastFmService();
  return lastFmService;
};

export const disposeLastFmService = async (): Promise<void> => {
  const service = lastFmService;
  lastFmService = null;
  await service?.dispose();
};

export const resetLastFmServiceForTests = (): void => {
  void lastFmService?.dispose();
  lastFmService = null;
};
