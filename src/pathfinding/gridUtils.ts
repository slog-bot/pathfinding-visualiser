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

// The teleport partners of a cell: the other endpoint of every teleport edge
// that includes this cell. No active/visited filtering happens here.
export function teleportPartners(
  cell: CellCoord,
  state: PathGraphState
): CellCoord[] {
  const key = cellKey(cell);
  const partners: CellCoord[] = [];
  for (const edge of state.teleportEdges) {
    const [a, b] = edge.split("|");
    if (a === key) partners.push(parseCellKey(b));
    else if (b === key) partners.push(parseCellKey(a));
  }
  return partners;
}

// All cells reachable from `cell` in a single step. This combines two kinds of
// connection and is the single source of truth used by both pathfinding and the
// movement rules:
//   1. active orthogonal neighbours whose connecting edge is NOT blocked
//   2. active teleport partners (teleports ignore blockedEdges entirely)
// Note: visited cells are intentionally NOT filtered out here; that is a
// traversal concern handled by the callers.
export function getConnectedCells(
  cell: CellCoord,
  state: PathGraphState
): CellCoord[] {
  const connected: CellCoord[] = [];

  for (const neighbor of orthogonalNeighbors(cell, state)) {
    if (!state.activeCells.has(cellKey(neighbor))) continue;
    if (state.blockedEdges.has(edgeKey(cell, neighbor))) continue;
    connected.push(neighbor);
  }

  for (const partner of teleportPartners(cell, state)) {
    if (state.activeCells.has(cellKey(partner))) connected.push(partner);
  }

  return connected;
}

// Every unique edge between two orthogonally-neighbouring active cells.
// We only look at each cell's right and bottom neighbour so every edge is
// counted exactly once.
export function getAllActiveEdges(state: PathGraphState): string[] {
  const edges = new Set<string>();
  for (const key of state.activeCells) {
    const cell = parseCellKey(key);
    const rightNeighbor = { x: cell.x + 1, y: cell.y };
    const downNeighbor = { x: cell.x, y: cell.y + 1 };
    for (const neighbor of [rightNeighbor, downNeighbor]) {
      if (inBounds(neighbor, state) && state.activeCells.has(cellKey(neighbor))) {
        edges.add(edgeKey(cell, neighbor));
      }
    }
  }
  return [...edges];
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
    teleportEdges: new Set<string>(),
    visitedCells: new Set<string>(),
    startCell: null,
    goalCell: null,
    currentCell: null,
    selectedCellForEdge: null,
    selectedCellForTeleport: null,
    mode: "toggle-active",
    useOneStepLookahead: false,
  };
}
