import { extname } from 'node:path';
import {
  workshopThemeUiCapabilities,
  type WorkshopThemeUiCapability,
} from '../../shared/types/workshop';
import type { WorkshopThemeUiRuntimeContribution } from './WorkshopDataContributionTypes';
import { normalizeWorkshopRelativePath } from './WorkshopManifest';
import {
  asWorkshopDataRecord,
  assertWorkshopDataKeys,
} from './WorkshopDataValidation';

const capabilitySet = new Set<string>(workshopThemeUiCapabilities);

export const normalizeWorkshopThemeUiRuntime = (
  value: unknown,
): WorkshopThemeUiRuntimeContribution | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const input = asWorkshopDataRecord(value, 'workshop_data_theme_runtime_invalid');
  assertWorkshopDataKeys(
    input,
    ['entry', 'capabilities'],
    'workshop_data_theme_runtime_unknown_field',
  );
  const entry = normalizeWorkshopRelativePath(input.entry, 'theme_runtime_entry');
  if (extname(entry).toLowerCase() !== '.html') {
    throw new Error('workshop_data_theme_runtime_entry_invalid');
  }
  const rawCapabilities = input.capabilities ?? [];
  if (!Array.isArray(rawCapabilities) || rawCapabilities.length > workshopThemeUiCapabilities.length) {
    throw new Error('workshop_data_theme_runtime_capabilities_invalid');
  }
  const capabilities = rawCapabilities.map((capability) =>
    typeof capability === 'string' ? capability.trim().toLowerCase() : '');
  if (
    capabilities.some((capability) => !capabilitySet.has(capability)) ||
    new Set(capabilities).size !== capabilities.length
  ) {
    throw new Error('workshop_data_theme_runtime_capabilities_invalid');
  }
  return {
    entry,
    capabilities: capabilities as WorkshopThemeUiCapability[],
  };
};
