export type ContributorConstellationNode = {
  id: string;
  x: number;
  y: number;
};

export type ContributorConstellationEdge = {
  from: number;
  to: number;
};

export type ContributorConstellation = {
  nodes: ContributorConstellationNode[];
  edges: ContributorConstellationEdge[];
  density: 'regular' | 'dense' | 'crowded';
  worldWidth: number;
  worldHeight: number;
};

const featuredPositions = [
  { x: 35.5, y: 24.2 },
  { x: 60.9, y: 26.0 },
  { x: 88.0, y: 27.7 },
  { x: 29.8, y: 44.0 },
  { x: 56.4, y: 44.8 },
  { x: 84.6, y: 50.2 },
  { x: 32.8, y: 59.8 },
  { x: 62.4, y: 66.0 },
  { x: 81.6, y: 81.0 },
  { x: 27.2, y: 82.2 },
] as const;

type ContributorConstellationLayout = {
  positions: Array<{ x: number; y: number }>;
  worldWidth: number;
  worldHeight: number;
};

const createScalableLayout = (count: number): ContributorConstellationLayout => {
  const columns = Math.max(4, Math.ceil(Math.sqrt(count * 1.45)));
  const rows = Math.ceil(count / columns);
  const horizontalStep = count > 36 ? 19 : 22;
  const verticalStep = count > 36 ? 20 : 34;
  const worldWidth = Math.max(100, 30 + (columns - 1) * horizontalStep + 30);
  const worldHeight = Math.max(128, 24 + (rows - 1) * verticalStep + 30);

  const positions = Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const itemsInRow = Math.min(columns, count - row * columns);
    const centeredOffset = ((columns - itemsInRow) * horizontalStep) / 2;
    const stagger = row % 2 === 0 || itemsInRow === 1 ? 0 : horizontalStep * 0.22;

    return {
      x: 30 + centeredOffset + column * horizontalStep + stagger,
      y: rows === 1 ? worldHeight / 2 : 24 + row * verticalStep,
    };
  });

  return { positions, worldWidth, worldHeight };
};

const edgeKey = (from: number, to: number): string =>
  from < to ? `${from}:${to}` : `${to}:${from}`;

const distanceSquared = (
  first: ContributorConstellationNode,
  second: ContributorConstellationNode,
): number => {
  const x = first.x - second.x;
  const y = (first.y - second.y) * 0.72;
  return x * x + y * y;
};

const createEdges = (nodes: ContributorConstellationNode[]): ContributorConstellationEdge[] => {
  if (nodes.length < 2) return [];

  const edges: ContributorConstellationEdge[] = [];
  const connected = new Set<number>([0]);
  const used = new Set<string>();

  // A minimum spanning tree keeps every new contributor in the constellation.
  while (connected.size < nodes.length) {
    let nearest: { from: number; to: number; distance: number } | undefined;

    for (const from of connected) {
      for (let to = 0; to < nodes.length; to += 1) {
        if (connected.has(to)) continue;
        const distance = distanceSquared(nodes[from], nodes[to]);
        if (!nearest || distance < nearest.distance) nearest = { from, to, distance };
      }
    }

    if (!nearest) break;
    edges.push({ from: nearest.from, to: nearest.to });
    used.add(edgeKey(nearest.from, nearest.to));
    connected.add(nearest.to);
  }

  // A few short secondary links make the graph read like a constellation,
  // without requiring a manually maintained connection list.
  const candidates: Array<{ from: number; to: number; distance: number }> = [];
  for (let from = 0; from < nodes.length; from += 1) {
    for (let to = from + 1; to < nodes.length; to += 1) {
      if (used.has(edgeKey(from, to))) continue;
      candidates.push({ from, to, distance: distanceSquared(nodes[from], nodes[to]) });
    }
  }

  candidates.sort((first, second) => first.distance - second.distance);
  const degree = Array.from({ length: nodes.length }, () => 0);
  for (const edge of edges) {
    degree[edge.from] += 1;
    degree[edge.to] += 1;
  }

  const extraEdgeCount = Math.floor(nodes.length / 3);
  for (const candidate of candidates) {
    if (edges.length >= nodes.length - 1 + extraEdgeCount) break;
    if (degree[candidate.from] >= 3 || degree[candidate.to] >= 3) continue;
    edges.push({ from: candidate.from, to: candidate.to });
    degree[candidate.from] += 1;
    degree[candidate.to] += 1;
  }

  return edges;
};

export const createContributorConstellation = (
  contributorIds: readonly string[],
): ContributorConstellation => {
  const layout = contributorIds.length <= featuredPositions.length
    ? {
        positions: featuredPositions.slice(0, contributorIds.length),
        worldWidth: 100,
        worldHeight: 100,
      }
    : createScalableLayout(contributorIds.length);
  const { positions, worldWidth, worldHeight } = layout;
  const nodes = contributorIds.map((id, index) => ({ id, ...positions[index] }));

  return {
    nodes,
    edges: createEdges(nodes),
    density: contributorIds.length > 36 ? 'crowded' : contributorIds.length > 20 ? 'dense' : 'regular',
    worldWidth,
    worldHeight,
  };
};
