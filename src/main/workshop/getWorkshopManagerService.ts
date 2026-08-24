import { app } from 'electron';
import { getSteamWorkshopService } from '../integrations/steam/SteamworksService';
import { WorkshopCompatibilityService } from './WorkshopCompatibilityService';
import {
  createWorkshopContributionApplyService,
  getActiveWorkshopThemeId,
} from './WorkshopContributionApplyAssembly';
import { createWorkshopDataActivationAssembly } from './WorkshopDataActivationAssembly';
import { WorkshopIngestionService } from './WorkshopIngestionService';
import { WorkshopManagerService } from './WorkshopManagerService';
import { WorkshopMaintenanceService } from './WorkshopMaintenanceService';
import { WorkshopReconcileService } from './WorkshopReconcileService';
import { WorkshopRegistry } from './WorkshopRegistry';
import { WorkshopStagingInstaller } from './WorkshopStagingInstaller';
import { WorkshopAssetResolver, bindWorkshopAssetResolver } from './WorkshopAssetResolver';
import { bindWorkshopPluginService, WorkshopPluginService } from './WorkshopPluginService';
import {
  bindWorkshopPlaybackShareService,
  WorkshopPlaybackShareService,
} from './WorkshopPlaybackShareService';
import {
  bindWorkshopPluginNetworkService,
  WorkshopPluginNetworkService,
} from './WorkshopPluginNetworkService';

let workshopManagerService: WorkshopManagerService | null = null;
let workshopMaintenanceService: WorkshopMaintenanceService | null = null;

export const getWorkshopMaintenanceService = (): WorkshopMaintenanceService => {
  if (!workshopManagerService) getWorkshopManagerService();
  if (!workshopMaintenanceService) throw new Error('workshop_maintenance_unavailable');
  return workshopMaintenanceService;
};

export const getWorkshopSteamSource = () => getSteamWorkshopService();

export const getWorkshopManagerService = (): WorkshopManagerService => {
  if (workshopManagerService) {
    return workshopManagerService;
  }

  const source = getSteamWorkshopService();
  const registry = new WorkshopRegistry();
  workshopMaintenanceService = new WorkshopMaintenanceService(registry);
  bindWorkshopAssetResolver(new WorkshopAssetResolver(registry));
  const installer = new WorkshopStagingInstaller();
  const plugins = new WorkshopPluginService(registry, installer);
  bindWorkshopPluginService(plugins);
  bindWorkshopPlaybackShareService(new WorkshopPlaybackShareService(plugins));
  bindWorkshopPluginNetworkService(new WorkshopPluginNetworkService(plugins));
  const data = createWorkshopDataActivationAssembly({ registry, installer });
  const ingestion = new WorkshopIngestionService({
    source,
    registry,
    installer,
    compatibility: new WorkshopCompatibilityService({ currentEchoVersion: app.getVersion() }),
  });
  const reconcile = new WorkshopReconcileService({
    registry,
    catalog: data.catalog,
    installer,
    handlers: data.handlers,
  });
  const contributionApply = createWorkshopContributionApplyService({
    registry,
    catalog: data.catalog,
  });
  workshopManagerService = new WorkshopManagerService({
    source,
    browse: source,
    registry,
    catalog: data.catalog,
    ingestion,
    activation: data.service,
    reconcile,
    contributionApply,
    plugins,
    getActiveThemeId: getActiveWorkshopThemeId,
  });
  return workshopManagerService;
};
