// Core data model for the grid pathfinding visualiser.
// These types are deliberately UI-free so the pathfinding logic can be reused
// independently of any rendering layer.

export type CellCoord = {
  x: number;
  y: number;
};

// The editing/interaction mode the app is currently in.
export type Mode =
  | "toggle-active"
  | "set-start"
  | "set-goal"
  | "toggle-edge"
  | "toggle-teleport"
  | "simulate";

export type PathGraphState = {
  width: number;
  height: number;
  // Cells that are part of the graph. Stored as cell keys ("x,y").
  activeCells: Set<string>;
  // Walls between two neighbouring cells. Stored as normalised edge keys ("x1,y1|x2,y2").
  blockedEdges: Set<string>;
  // Manual connections between any two active cells (not necessarily neighbours).
  // Stored as normalised edge keys, the same format as blockedEdges.
  teleportEdges: Set<string>;
  // Cells already stepped through during a simulation. Stored as cell keys.
  visitedCells: Set<string>;
  startCell: CellCoord | null;
  goalCell: CellCoord | null;
  // Where the player currently stands during a simulation.
  currentCell: CellCoord | null;
  // First cell picked while building an edge in "toggle-edge" mode.
  selectedCellForEdge: CellCoord | null;
  // First cell picked while building a teleport in "toggle-teleport" mode.
  selectedCellForTeleport: CellCoord | null;
  mode: Mode;
  // When true, a move must also leave at least one onward legal move available
  // (unless the move lands on the goal). Blocks trap-entrance cells.
  useOneStepLookahead: boolean;
};

// Shape of an exported/imported map. Note: visitedCells is intentionally
// excluded because it is simulation state, not map data.
export type ExportedMap = {
  width: number;
  height: number;
  activeCells: string[];
  blockedEdges: string[];
  teleportEdges: string[];
  startCell: CellCoord | null;
  goalCell: CellCoord | null;
};
