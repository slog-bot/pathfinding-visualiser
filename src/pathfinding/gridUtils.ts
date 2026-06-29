// Pure helpers for working with the grid: key encoding, neighbours, and state
// construction. No DOM access lives here.

import type { CellCoord, PathGraphState } from "./types";

// "x,y" string key used for cells in the various Sets.
export function cellKey(c: CellCoord): string {
  return `${c.x},${c.y}`;
}

export function parseCellKey(key: string): CellCoord {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}

export function coordEquals(a: CellCoord | null, b: CellCoord | null): boolean {
  if (a === null || b === null) return a === b;
  return a.x === b.x && a.y === b.y;
}

// Normalised edge key so that the edge between a and b is identical regardless
// of the order the two cells are passed in. We order endpoints by x, then y.
export function edgeKey(a: CellCoord, b: CellCoord): string {
  const aFirst = a.x < b.x || (a.x === b.x && a.y <= b.y);
  const [p, q] = aFirst ? [a, b] : [b, a];
  return `${p.x},${p.y}|${q.x},${q.y}`;
}

export function inBounds(c: CellCoord, state: PathGraphState): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < state.width && c.y < state.height;
}

// Orthogonal (up/down/left/right) neighbours that fall inside the grid.
// This naturally yields 2 neighbours at corners, 3 along edges, 4 inside.
export function orthogonalNeighbors(
  c: CellCoord,
  state: PathGraphState
): CellCoord[] {
  const candidates: CellCoord[] = [
    { x: c.x, y: c.y - 1 },
    { x: c.x, y: c.y + 1 },
    { x: c.x - 1, y: c.y },
    { x: c.x + 1, y: c.y },
  ];
  return candidates.filter((n) => inBounds(n, state));
}

export function areNeighbors(
  a: CellCoord,
  b: CellCoord,
  state: PathGraphState
): boolean {
  return orthogonalNeighbors(a, state).some((n) => coordEquals(n, b));
}

// Build a fresh, empty editor state.
export function createInitialState(
  width: number,
  height: number
): PathGraphState {
  return {
    width,
    height,
    activeCells: new Set<string>(),
    blockedEdges: new Set<string>(),
    visitedCells: new Set<string>(),
    startCell: null,
    goalCell: null,
    currentCell: null,
    selectedCellForEdge: null,
    mode: "toggle-active",
    useOneStepLookahead: false,
  };
}
