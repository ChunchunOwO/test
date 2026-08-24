export const isWorkshopAssetProtocolUrl = (value: string | undefined | null): value is string =>
  typeof value === 'string' && value.startsWith('echo-workshop://asset/');
