import { describe, expect, it } from 'vitest';
import { createContributorConstellation } from './contributorConstellation';

describe('createContributorConstellation', () => {
  it('automatically lays out and connects every contributor', () => {
    const ids = Array.from({ length: 42 }, (_, index) => `contributor-${index + 1}`);
    const constellation = createContributorConstellation(ids);

    expect(constellation.nodes).toHaveLength(ids.length);
    expect(constellation.edges.length).toBeGreaterThanOrEqual(ids.length - 1);
    expect(constellation.density).toBe('crowded');
    expect(constellation.worldWidth).toBeGreaterThan(100);
    expect(constellation.worldHeight).toBeGreaterThan(100);
    expect(constellation.nodes.every(({ x, y }) => (
      x >= 0 && x <= constellation.worldWidth && y >= 0 && y <= constellation.worldHeight
    ))).toBe(true);
    expect(new Set(constellation.nodes.map(({ id }) => id)).size).toBe(ids.length);
  });

  it('keeps the selected ten-person composition as the featured layout', () => {
    const ids = Array.from({ length: 10 }, (_, index) => `contributor-${index + 1}`);
    const constellation = createContributorConstellation(ids);

    expect(constellation.nodes[0]).toMatchObject({ x: 35.5, y: 24.2 });
    expect(constellation.nodes[9]).toMatchObject({ x: 27.2, y: 82.2 });
    expect(constellation).toMatchObject({ worldWidth: 100, worldHeight: 100 });
  });

  it('creates a two-dimensional draggable world once the featured layout is full', () => {
    const ids = Array.from({ length: 12 }, (_, index) => `contributor-${index + 1}`);
    const constellation = createContributorConstellation(ids);

    expect(constellation.worldWidth).toBeGreaterThan(100);
    expect(constellation.worldHeight).toBeGreaterThan(100);
  });
});
