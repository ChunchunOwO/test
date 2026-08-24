export const workshopDataIdPattern = /^[a-z0-9](?:[a-z0-9._-]{1,78}[a-z0-9])?$/u;

export const asWorkshopDataRecord = (
  value: unknown,
  errorCode = 'workshop_data_entry_invalid',
): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(errorCode);
  }
  return value as Record<string, unknown>;
};

export const assertWorkshopDataKeys = (
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  errorCode = 'workshop_data_entry_unknown_field',
): void => {
  const allowed = new Set(allowedKeys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error(errorCode);
  }
};

export const readWorkshopDataString = (
  value: unknown,
  field: string,
  maximumLength: number,
): string => {
  if (typeof value !== 'string') {
    throw new Error(`workshop_data_${field}_invalid`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) {
    throw new Error(`workshop_data_${field}_invalid`);
  }
  return normalized;
};

export const readWorkshopDataOptionalString = (
  value: unknown,
  field: string,
  maximumLength: number,
): string | undefined => value === undefined
  ? undefined
  : readWorkshopDataString(value, field, maximumLength);

export const readWorkshopDataNumber = (
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  options: { integer?: boolean } = {},
): number => {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (options.integer === true && !Number.isInteger(value))
  ) {
    throw new Error(`workshop_data_${field}_invalid`);
  }
  return value;
};

export const readWorkshopDataOptionalNumber = (
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
  options: { integer?: boolean } = {},
): number | undefined => value === undefined
  ? undefined
  : readWorkshopDataNumber(value, field, minimum, maximum, options);

export const readWorkshopDataBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== 'boolean') {
    throw new Error(`workshop_data_${field}_invalid`);
  }
  return value;
};

export const readWorkshopDataOptionalBoolean = (
  value: unknown,
  field: string,
): boolean | undefined => value === undefined
  ? undefined
  : readWorkshopDataBoolean(value, field);

export const readWorkshopDataHexColor = (value: unknown, field: string): string => {
  const normalized = readWorkshopDataString(value, field, 7);
  if (!/^#[0-9a-f]{6}$/iu.test(normalized)) {
    throw new Error(`workshop_data_${field}_invalid`);
  }
  return normalized.toLowerCase();
};

export const readWorkshopDataHeader = (
  value: Record<string, unknown>,
  expectedType: string,
  expectedContentId: string,
): { id: string; title: string; description?: string } => {
  if (value.type !== expectedType || value.schemaVersion !== 1) {
    throw new Error('workshop_data_header_invalid');
  }
  const id = readWorkshopDataString(value.id, 'id', 80).toLowerCase();
  if (!workshopDataIdPattern.test(id) || id !== expectedContentId) {
    throw new Error('workshop_data_id_mismatch');
  }
  const title = readWorkshopDataString(value.title, 'title', 120);
  const description = readWorkshopDataOptionalString(value.description, 'description', 300);
  return { id, title, ...(description ? { description } : {}) };
};
