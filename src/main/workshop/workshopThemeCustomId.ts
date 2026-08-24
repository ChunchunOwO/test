import { createHash } from 'node:crypto';

export const buildWorkshopThemeCustomId = (
  sourceId: string,
  itemId: string,
  contentId: string,
): string => {
  const digest = createHash('sha256')
    .update(`${sourceId}\0${itemId}\0${contentId}`)
    .digest('hex')
    .slice(0, 20);
  return `workshop:${digest}`;
};
