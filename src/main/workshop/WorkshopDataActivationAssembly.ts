import {
  WorkshopDataActivationService,
  type WorkshopDataActivationServiceOptions,
} from './WorkshopDataActivationService';
import { WorkshopDataCatalog } from './WorkshopDataCatalog';
import { createWorkshopDataHandlerRegistry } from './WorkshopDataHandlers';
import type { WorkshopRegistry } from './WorkshopRegistry';
import type { WorkshopStagingInstaller } from './WorkshopStagingInstaller';

export type WorkshopDataActivationAssemblyOptions = {
  registry: WorkshopRegistry;
  installer: WorkshopStagingInstaller;
  catalogFilePath?: string;
  now?: WorkshopDataActivationServiceOptions['now'];
};

export const createWorkshopDataActivationAssembly = (
  options: WorkshopDataActivationAssemblyOptions,
): {
  handlers: ReturnType<typeof createWorkshopDataHandlerRegistry>;
  catalog: WorkshopDataCatalog;
  service: WorkshopDataActivationService;
} => {
  const handlers = createWorkshopDataHandlerRegistry();
  const catalog = new WorkshopDataCatalog({
    filePath: options.catalogFilePath,
    handlers,
  });
  return {
    handlers,
    catalog,
    service: new WorkshopDataActivationService({
      registry: options.registry,
      installer: options.installer,
      catalog,
      handlers,
      now: options.now,
    }),
  };
};
