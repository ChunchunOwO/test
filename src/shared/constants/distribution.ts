export const appDistribution = 'steam' as const;

export const appEditionLabel = 'Steam Ver.' as const;

// Pro is fail-closed until the main process verifies ownership of the configured Steam DLC.
export const distributionUnlocksLocalProFeatures = false as const;
