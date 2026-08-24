const versionPattern = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9a-z]+(?:[.-][0-9a-z]+)*))?$/iu;

type ParsedVersion = {
  core: [number, number, number];
  prerelease: string[] | null;
};

const parseVersion = (value: string): ParsedVersion | null => {
  const match = versionPattern.exec(value.trim());
  if (!match) {
    return null;
  }
  const core = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  if (core.some((part) => !Number.isSafeInteger(part))) {
    return null;
  }
  return {
    core: [core[0], core[1], core[2]],
    prerelease: match[4] ? match[4].split('.') : null,
  };
};

const comparePrereleaseIdentifier = (left: string, right: string): number => {
  const leftNumeric = /^\d+$/u.test(left);
  const rightNumeric = /^\d+$/u.test(right);
  if (leftNumeric && rightNumeric) {
    const normalizedLeft = left.replace(/^0+(?=\d)/u, '');
    const normalizedRight = right.replace(/^0+(?=\d)/u, '');
    if (normalizedLeft.length !== normalizedRight.length) {
      return normalizedLeft.length < normalizedRight.length ? -1 : 1;
    }
    return normalizedLeft === normalizedRight ? 0 : normalizedLeft < normalizedRight ? -1 : 1;
  }
  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1;
  }
  return left === right ? 0 : left < right ? -1 : 1;
};

export const isEchoVersion = (value: string): boolean => parseVersion(value) !== null;

export const compareEchoVersions = (leftInput: string, rightInput: string): number | null => {
  const left = parseVersion(leftInput);
  const right = parseVersion(rightInput);
  if (!left || !right) {
    return null;
  }
  for (let index = 0; index < 3; index += 1) {
    if (left.core[index] !== right.core[index]) {
      return left.core[index] < right.core[index] ? -1 : 1;
    }
  }
  if (!left.prerelease || !right.prerelease) {
    if (!left.prerelease && !right.prerelease) {
      return 0;
    }
    return left.prerelease ? -1 : 1;
  }
  const identifierCount = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < identifierCount; index += 1) {
    const leftIdentifier = left.prerelease[index];
    const rightIdentifier = right.prerelease[index];
    if (leftIdentifier === undefined || rightIdentifier === undefined) {
      return leftIdentifier === undefined ? -1 : 1;
    }
    const comparison = comparePrereleaseIdentifier(leftIdentifier, rightIdentifier);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return 0;
};
