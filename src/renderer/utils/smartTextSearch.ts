import { pinyin } from 'pinyin-pro';

export type SearchAliasLookup = Map<string, Set<string>>;

export type ScoreSearchTextOptions = {
  aliasLookup?: SearchAliasLookup;
  extraQueryVariants?: readonly string[];
  title?: string;
};

const hanRunPattern = /\p{Script=Han}+/gu;

export const normalizeSearchText = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim();

export const compactSearchText = (value: string): string => normalizeSearchText(value).replace(/\s+/g, '');

export const createSearchAliasLookup = (groups: readonly (readonly string[])[]): SearchAliasLookup => {
  const lookup: SearchAliasLookup = new Map();

  groups.forEach((group) => {
    const aliases = new Set(
      group.map((alias) => compactSearchText(alias)).filter(Boolean),
    );
    aliases.forEach((key) => {
      if (!lookup.has(key)) {
        lookup.set(key, aliases);
      }
    });
  });

  return lookup;
};

const getPinyinVariants = (value: string): string[] => {
  const variants: string[] = [];
  for (const match of value.matchAll(hanRunPattern)) {
    const syllables = pinyin(match[0], { toneType: 'none', type: 'array' })
      .map((item) => compactSearchText(item))
      .filter(Boolean);

    if (!syllables.length) {
      continue;
    }

    variants.push(syllables.join(''));
    if (syllables.length >= 2) {
      variants.push(syllables.map((syllable) => syllable[0] ?? '').join(''));
      variants.push(...syllables);
    }
  }

  return variants;
};

export const getBaseSearchVariants = (value: string): Set<string> => {
  const normalized = normalizeSearchText(value);
  const compact = compactSearchText(value);
  const terms = normalized.split(/\s+/).filter(Boolean);
  return new Set<string>([normalized, compact, ...terms.map(compactSearchText), ...getPinyinVariants(value)]);
};

const keepSearchVariant = (variant: string, compactQuery: string): boolean => {
  if (!variant) {
    return false;
  }

  // Single-letter pinyin initials from a Han query ("我" → "w") match almost
  // every setting whose pinyin happens to start with that letter.
  if (variant.length === 1 && /^[a-z]$/.test(variant) && compactQuery !== variant) {
    return false;
  }

  return true;
};

export const expandSearchText = (value: string, aliasLookup?: SearchAliasLookup): string[] => {
  const compact = compactSearchText(value);
  const terms = normalizeSearchText(value).split(/\s+/).filter(Boolean);
  const variants = getBaseSearchVariants(value);

  if (compact.length >= 2 && aliasLookup) {
    terms.forEach((term) => {
      aliasLookup.get(compactSearchText(term))?.forEach((alias) => variants.add(alias));
    });
    aliasLookup.get(compact)?.forEach((alias) => variants.add(alias));
  }

  return Array.from(variants).filter((variant) => keepSearchVariant(variant, compact));
};

const isShortLatinVariant = (variant: string): boolean => variant.length <= 3 && /^[a-z0-9]+$/.test(variant);

const variantMatchesText = (variant: string, normalizedText: string, compactText: string, textVariants: string[]): boolean => {
  if (!variant) {
    return false;
  }

  if (/[\p{Script=Han}]/u.test(variant)) {
    return normalizedText.includes(variant) || compactText.includes(variant);
  }

  if (isShortLatinVariant(variant)) {
    return textVariants.includes(variant);
  }

  return (
    normalizedText.includes(variant) ||
    compactText.includes(variant) ||
    textVariants.some((textVariant) => textVariant.includes(variant))
  );
};

const isSubsequenceMatch = (needle: string, haystack: string): boolean => {
  if (needle.length < 4) {
    return false;
  }

  let needleIndex = 0;
  for (const character of haystack) {
    if (character === needle[needleIndex]) {
      needleIndex += 1;
      if (needleIndex >= needle.length) {
        return true;
      }
    }
  }

  return false;
};

export const scoreSearchText = (query: string, searchText: string, options: ScoreSearchTextOptions = {}): number => {
  const normalizedQuery = normalizeSearchText(query);
  const compactQuery = compactSearchText(query);
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const queryVariants = Array.from(new Set([
    ...expandSearchText(query, options.aliasLookup),
    ...(options.extraQueryVariants ?? []).flatMap((variant) => expandSearchText(variant)),
  ])).filter((variant) => keepSearchVariant(variant, compactQuery));
  const directQueryVariants = Array.from(getBaseSearchVariants(query)).filter((variant) => queryVariants.includes(variant));

  if (!terms.length) {
    return 0;
  }

  const normalizedText = normalizeSearchText(searchText);
  const compactText = compactSearchText(searchText);
  const textVariants = Array.from(getBaseSearchVariants(searchText)).filter(Boolean);
  const directHit = directQueryVariants.some((variant) => variantMatchesText(variant, normalizedText, compactText, textVariants));
  const aliasHit = queryVariants.some((variant) => variantMatchesText(variant, normalizedText, compactText, textVariants));
  let score = directHit ? 16 : (aliasHit ? 8 : 0);
  const compactTitle = compactSearchText(options.title ?? '');

  if (score === 0) {
    return 0;
  }

  if (compactTitle && compactTitle === compactQuery) {
    score += 48;
  } else if (compactTitle && compactTitle.startsWith(compactQuery)) {
    score += 30;
  } else if (compactTitle && compactTitle.includes(compactQuery)) {
    score += 20;
  }

  if (compactText.includes(compactQuery) || textVariants.includes(compactQuery)) {
    score += 12;
  }

  for (const term of terms) {
    const termDirectVariants = Array.from(getBaseSearchVariants(term)).filter(Boolean);
    const termVariants = expandSearchText(term, options.aliasLookup);
    const bestDirect = termDirectVariants.find((variant) => variantMatchesText(variant, normalizedText, compactText, textVariants));

    if (bestDirect) {
      score += normalizedText.startsWith(term) || compactText.startsWith(bestDirect) || textVariants.some((textVariant) => textVariant.startsWith(bestDirect)) ? 8 : 5;
      continue;
    }

    const bestAlias = termVariants.find((variant) => variantMatchesText(variant, normalizedText, compactText, textVariants));
    if (bestAlias) {
      score += 3;
      continue;
    }

    const fuzzyVariant = termVariants.find((variant) => isSubsequenceMatch(variant, compactText) || textVariants.some((textVariant) => isSubsequenceMatch(variant, textVariant)));
    if (fuzzyVariant) {
      score += 2;
      continue;
    }

    return 0;
  }

  return score;
};

export const matchesSearchText = (query: string, searchText: string, options?: ScoreSearchTextOptions): boolean =>
  scoreSearchText(query, searchText, options) > 0;

export const matchesSearchFields = (
  query: string,
  fields: Array<string | null | undefined>,
  options?: ScoreSearchTextOptions,
): boolean => matchesSearchText(query, fields.filter((field): field is string => Boolean(field)).join(' '), options);
