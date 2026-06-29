// Reachability via breadth-first search. Kept independent of rendering.

import type { CellCoord, PathGraphState } from "./types";
import { cellKey, edgeKey, orthogonalNeighbors } from "./gridUtils";

// A cell is "open" for traversal if it is active and not already visited.
// Visited cells are treated as blocked: once stepped through they cannot be
// re-entered during the simulation, so the path planner must respect that too.
function isCellOpen(c: CellCoord, state: PathGraphState): boolean {
  const k = cellKey(c);
  return state.activeCells.has(k) && !state.visitedCells.has(k);
}

// Standard BFS. Returns true if `goal` is reachable from `start` under the
// current state, treating inactive/visited cells as blocked and refusing to
// cross any blocked edge.
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
    for (const next of orthogonalNeighbors(cur, state)) {
      const nextKey = cellKey(next);
      if (seen.has(nextKey)) continue;
      if (!isCellOpen(next, state)) continue;
      // Cannot cross a wall between cur and next.
      if (state.blockedEdges.has(edgeKey(cur, next))) continue;

      if (nextKey === goalKey) return true;
      seen.add(nextKey);
      queue.push(next);
    }
  }

  return false;
}
