import type { AppSettings } from '../../shared/types/appSettings';

const areSettingValuesEqual = (left: unknown, right: unknown): boolean =>
  Object.is(left, right) || JSON.stringify(left) === JSON.stringify(right);

export const createSettingsChangePatch = (
  previous: Partial<AppSettings>,
  next: Partial<AppSettings>,
): Partial<AppSettings> => {
  const patch: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);

  keys.forEach((key) => {
    const previousValue = (previous as Record<string, unknown>)[key];
    const nextValue = (next as Record<string, unknown>)[key];
    if (!areSettingValuesEqual(previousValue, nextValue)) {
      patch[key] = nextValue;
    }
  });

  return patch as Partial<AppSettings>;
};
