// Reachability via breadth-first search. Kept independent of rendering.

import type { CellCoord, PathGraphState } from "./types";
import { cellKey, getAllActiveEdges, getConnectedCells } from "./gridUtils";

const MAX_RANDOMISE_ATTEMPTS = 100;

// A cell is "open" for traversal if it is active and not already visited.
// Visited cells are treated as blocked: once stepped through they cannot be
// re-entered during the simulation, so the path planner must respect that too.
function isCellOpen(c: CellCoord, state: PathGraphState): boolean {
  const k = cellKey(c);
  return state.activeCells.has(k) && !state.visitedCells.has(k);
}

// Standard BFS over getConnectedCells, so both orthogonal edges and teleports
// are followed. Returns true if `goal` is reachable from `start`, treating
// inactive/visited cells as blocked. Blocked edges are already excluded by
// getConnectedCells (teleports are never affected by blocked edges).
export function pathExists(
  start: CellCoord,
  goal: CellCoord,
  state: PathGraphState
): boolean {
  // The start cell itself must be traversable; if it has been marked visited
  // or is inactive there is nowhere to stand.
  if (!isCellOpen(start, state)) return false;

  const startKey = cellKey(start);
  const goalKey = cellKey(goal);
  if (startKey === goalKey) return isCellOpen(goal, state);

  const queue: CellCoord[] = [start];
  const seen = new Set<string>([startKey]);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of getConnectedCells(cur, state)) {
      const nextKey = cellKey(next);
      if (seen.has(nextKey)) continue;
      // Skip cells that cannot be stood on (inactive or already visited).
      if (!isCellOpen(next, state)) continue;

      if (nextKey === goalKey) return true;
      seen.add(nextKey);
      queue.push(next);
    }
  }

  return false;
}

// Produce a new state with randomly blocked edges that still keeps a path from
// startCell to goalCell. Each edge between active neighbours is independently
// blocked with probability `blockChance`. We retry until the layout is solvable
// or we exhaust the attempt budget, in which case we return null so the caller
// can keep the previous state and warn the user.
//
// activeCells, startCell and goalCell are never changed. visitedCells is cleared
// and currentCell is reset to startCell, since the map has effectively changed.
export function randomiseBlockedEdges(
  state: PathGraphState,
  blockChance: number
): PathGraphState | null {
  const { startCell, goalCell } = state;
  if (!startCell || !goalCell) return null;

  const activeEdges = getAllActiveEdges(state);

  for (let attempt = 0; attempt < MAX_RANDOMISE_ATTEMPTS; attempt++) {
    const blockedEdges = new Set<string>();
    for (const edge of activeEdges) {
      if (Math.random() < blockChance) blockedEdges.add(edge);
    }

    const candidate: PathGraphState = {
      ...state,
      blockedEdges,
      visitedCells: new Set<string>(),
      currentCell: startCell,
    };

    if (pathExists(startCell, goalCell, candidate)) {
      return candidate;
    }
  }

  return null;
}
