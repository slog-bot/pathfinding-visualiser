// Rules that decide which moves the player is allowed to make during a
// simulation. This builds on top of pathExists and is kept DOM-free.

import type { CellCoord, PathGraphState } from "./types";
import { cellKey, coordEquals, getConnectedCells } from "./gridUtils";
import { pathExists } from "./pathfinding";

// Produce the hypothetical state that would result from moving the player from
// the current cell to `candidate`: the old current cell becomes visited and the
// player now stands on the candidate.
function stateAfterMove(
  state: PathGraphState,
  current: CellCoord,
  candidate: CellCoord
): PathGraphState {
  const visitedCells = new Set(state.visitedCells);
  visitedCells.add(cellKey(current));
  return { ...state, visitedCells, currentCell: candidate };
}

// The base movement rule, WITHOUT one-step lookahead.
// A move from currentCell to `candidate` is legal when:
//   - there is a current cell and a goal
//   - candidate is connected to currentCell (an unblocked orthogonal neighbour
//     OR a teleport partner); getConnectedCells also guarantees it is active
//   - candidate is not already visited
//   - after pretending the move happened (current -> visited, stand on
//     candidate), the goal is still reachable from candidate.
function canMoveBase(candidate: CellCoord, state: PathGraphState): boolean {
  const current = state.currentCell;
  const goal = state.goalCell;
  if (!current || !goal) return false;

  const connected = getConnectedCells(current, state);
  if (!connected.some((c) => coordEquals(c, candidate))) return false;

  if (state.visitedCells.has(cellKey(candidate))) return false;

  // After the move, can we still reach the goal from the candidate cell?
  const simState = stateAfterMove(state, current, candidate);
  return pathExists(candidate, goal, simState);
}

// The full movement rule, applying one-step lookahead when enabled.
// With lookahead on, a move is only allowed if, after entering the candidate,
// there is at least one onward legal move available -- unless the candidate is
// the goal itself. This lets the tool block trap-entrance cells.
export function canMoveTo(candidate: CellCoord, state: PathGraphState): boolean {
  if (!canMoveBase(candidate, state)) return false;

  if (!state.useOneStepLookahead) return true;

  const goal = state.goalCell!;
  if (coordEquals(candidate, goal)) return true;

  const current = state.currentCell!;
  const simState = stateAfterMove(state, current, candidate);

  // Is there at least one legal onward move from the candidate? We use the base
  // rule here (no recursive lookahead) to mean "at least one onward step that
  // still preserves a path to the goal". Onward moves include teleports.
  return getConnectedCells(candidate, simState).some((next) =>
    canMoveBase(next, simState)
  );
}

// All currently allowed moves from the current cell, including teleport
// destinations. Used both for the "allowed next move" highlight and to gate
// clicks during simulation, so the visuals and the rules can never disagree.
export function getAllowedMoves(state: PathGraphState): CellCoord[] {
  if (!state.currentCell) return [];
  return getConnectedCells(state.currentCell, state).filter((n) =>
    canMoveTo(n, state)
  );
}
