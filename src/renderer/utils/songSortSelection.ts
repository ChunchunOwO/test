import type { LibrarySort } from '../../shared/types/library';

const directionalSortFamilies: LibrarySort[][] = [
  ['titleAsc', 'titleDesc'],
  ['yearAsc', 'yearDesc'],
  ['playCountAsc', 'playCountDesc'],
  ['bpmAsc', 'bpmDesc'],
  ['audioSpecAsc', 'audioSpecDesc'],
  ['qualityAsc', 'qualityDesc'],
  ['durationAsc', 'durationDesc'],
  ['createdAsc', 'createdDesc'],
  ['fileModifiedAsc', 'fileModifiedDesc'],
];

const standaloneSorts = new Set<LibrarySort>(['default', 'random']);

export const toggleSongMultiSort = (current: LibrarySort[], selected: LibrarySort): LibrarySort[] => {
  if (standaloneSorts.has(selected)) {
    return current.length === 1 && current[0] === selected ? ['default'] : [selected];
  }

  const withoutStandalone = current.filter((sort) => !standaloneSorts.has(sort));
  const selectedIndex = withoutStandalone.indexOf(selected);
  if (selectedIndex >= 0) {
    const next = withoutStandalone.filter((_, index) => index !== selectedIndex);
    return next.length > 0 ? next : ['default'];
  }

  const family = directionalSortFamilies.find((values) => values.includes(selected));
  const oppositeIndex = family
    ? withoutStandalone.findIndex((sort) => family.includes(sort))
    : -1;
  if (oppositeIndex >= 0) {
    return withoutStandalone.map((sort, index) => index === oppositeIndex ? selected : sort);
  }

  return [...withoutStandalone, selected];
};
