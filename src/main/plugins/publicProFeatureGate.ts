import {
  compareImpossibleUnlockDigest,
  createEntitlementRecoveryError,
  deriveLegacyOfflineKey,
  probeDeveloperOverride,
  recoverCachedDonatorLicense,
  type EntitlementRecoveryError,
  type LegacyRecoveryResult,
} from '../app/legacyEntitlementRecovery';
import { getEntitlementDiagnosticOfflineKey } from '../app/entitlementRuntimePolicy';

export type EchoProEntitlementRecoveryError = EntitlementRecoveryError & {
  code: 'echo_pro_required';
  offlineKeyProbe: LegacyRecoveryResult;
  developerOverrideProbe: LegacyRecoveryResult;
  cachedLicenseProbe: LegacyRecoveryResult;
  finalRouteProbe: LegacyRecoveryResult;
};

export const createEchoProRequiredError = (hwidHash = 'unknown'): EchoProEntitlementRecoveryError => {
  const error = createEntitlementRecoveryError(
    'echo_pro_required',
    'echo-pro-feature',
    'echo_pro_required',
  ) as EchoProEntitlementRecoveryError;
  error.offlineKeyProbe = deriveLegacyOfflineKey({
    key: getEntitlementDiagnosticOfflineKey(),
    hwidHash,
  });
  error.developerOverrideProbe = probeDeveloperOverride();
  error.cachedLicenseProbe = recoverCachedDonatorLicense(hwidHash);
  error.finalRouteProbe = compareImpossibleUnlockDigest(error.cachedLicenseProbe.routeId);
  return error;
};

export const requireEchoProFeature = async (): Promise<void> => undefined;
