// Application entry point. Owns the single source of truth (PathGraphState),
// dispatches user input by mode, and re-renders everything on each change.

import "./style.css";
import type { CellCoord, ExportedMap, Mode } from "./pathfinding/types";
import {
  areNeighbors,
  cellKey,
  coordEquals,
  createInitialState,
  edgeKey,
} from "./pathfinding/gridUtils";
import { canMoveTo } from "./pathfinding/moveRules";
import { renderDebug, renderGrid } from "./ui/renderer";
import { renderControls } from "./ui/controls";

const GRID_SIZE = 5;

let state = createInitialState(GRID_SIZE, GRID_SIZE);

// --- DOM scaffold ---------------------------------------------------------
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="app-header">
    <h1>Grid Pathfinding Visualiser</h1>
    <p class="hint" id="hint"></p>
  </header>
  <div id="controls" class="controls"></div>
  <main class="workspace">
    <div id="grid" class="grid"></div>
    <aside id="debug" class="debug-panel"></aside>
  </main>
`;

const controlsEl = document.querySelector<HTMLDivElement>("#controls")!;
const gridEl = document.querySelector<HTMLDivElement>("#grid")!;
const debugEl = document.querySelector<HTMLDivElement>("#debug")!;
const hintEl = document.querySelector<HTMLParagraphElement>("#hint")!;

const HINTS: Record<Mode, string> = {
  "toggle-active": "Click cells to add/remove them from the graph.",
  "set-start": "Click an active cell to set the start.",
  "set-goal": "Click an active cell to set the goal.",
  "toggle-edge":
    "Click one active cell, then a neighbouring active cell to toggle the wall between them.",
  simulate:
    "Click a highlighted neighbour to move. Allowed moves keep the goal reachable.",
};

// --- Per-mode click handling ----------------------------------------------
function handleCellClick(coord: CellCoord): void {
  switch (state.mode) {
    case "toggle-active":
      toggleActive(coord);
      break;
    case "set-start":
      if (state.activeCells.has(cellKey(coord))) state.startCell = coord;
      break;
    case "set-goal":
      if (state.activeCells.has(cellKey(coord))) state.goalCell = coord;
      break;
    case "toggle-edge":
      handleEdgeClick(coord);
      break;
    case "simulate":
      handleSimulateClick(coord);
      break;
  }
  update();
}

function toggleActive(coord: CellCoord): void {
  const key = cellKey(coord);
  if (state.activeCells.has(key)) {
    state.activeCells.delete(key);
    // Clear any references that pointed at this now-inactive cell.
    if (coordEquals(state.startCell, coord)) state.startCell = null;
    if (coordEquals(state.goalCell, coord)) state.goalCell = null;
    if (coordEquals(state.currentCell, coord)) state.currentCell = null;
    if (coordEquals(state.selectedCellForEdge, coord)) {
      state.selectedCellForEdge = null;
    }
  } else {
    state.activeCells.add(key);
  }
}

// Two-click edge flow: pick a first active cell, then a neighbouring active
// cell to toggle the wall. A non-neighbour second click just re-selects.
function handleEdgeClick(coord: CellCoord): void {
  if (!state.activeCells.has(cellKey(coord))) return;

  const first = state.selectedCellForEdge;
  if (!first) {
    state.selectedCellForEdge = coord;
    return;
  }

  if (coordEquals(first, coord)) {
    // Clicking the same cell again deselects it.
    state.selectedCellForEdge = null;
    return;
  }

  if (areNeighbors(first, coord, state)) {
    const key = edgeKey(first, coord);
    if (state.blockedEdges.has(key)) {
      state.blockedEdges.delete(key);
    } else {
      state.blockedEdges.add(key);
    }
    state.selectedCellForEdge = null;
  } else {
    // Not a neighbour: replace the selection with the new cell.
    state.selectedCellForEdge = coord;
  }
}

function handleSimulateClick(coord: CellCoord): void {
  // Seat the player at the start if the simulation has not begun yet.
  if (!state.currentCell) {
    if (state.startCell && state.activeCells.has(cellKey(state.startCell))) {
      state.currentCell = state.startCell;
    }
    return;
  }

  // Otherwise only allow legal moves; on a move the old cell becomes visited.
  if (canMoveTo(coord, state)) {
    state.visitedCells.add(cellKey(state.currentCell));
    state.currentCell = coord;
  }
}

// --- Toolbar actions ------------------------------------------------------
function setMode(mode: Mode): void {
  state.mode = mode;
  state.selectedCellForEdge = null;
  if (mode === "simulate" && !state.currentCell && state.startCell) {
    state.currentCell = state.startCell;
  }
  update();
}

function resetSimulation(): void {
  state.visitedCells.clear();
  state.currentCell = state.mode === "simulate" ? state.startCell : null;
  update();
}

function clearActive(): void {
  state.activeCells.clear();
  state.visitedCells.clear();
  state.startCell = null;
  state.goalCell = null;
  state.currentCell = null;
  state.selectedCellForEdge = null;
  update();
}

function activateAll(): void {
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      state.activeCells.add(cellKey({ x, y }));
    }
  }
  update();
}

function clearEdges(): void {
  state.blockedEdges.clear();
  update();
}

// Rebuild the editor state from imported map data. Simulation state (visited /
// current) is reset because it is not part of map data.
function importMap(map: ExportedMap): void {
  state = {
    width: map.width,
    height: map.height,
    activeCells: new Set(map.activeCells),
    blockedEdges: new Set(map.blockedEdges),
    visitedCells: new Set(),
    startCell: map.startCell,
    goalCell: map.goalCell,
    currentCell: null,
    selectedCellForEdge: null,
    mode: state.mode,
    useOneStepLookahead: state.useOneStepLookahead,
  };
  update();
}

// --- Render loop ----------------------------------------------------------
function update(): void {
  hintEl.textContent = HINTS[state.mode];
  renderControls(controlsEl, state, {
    getState: () => state,
    onSetMode: setMode,
    onSetLookahead: (enabled) => {
      state.useOneStepLookahead = enabled;
      update();
    },
    onResetSimulation: resetSimulation,
    onClearActive: clearActive,
    onActivateAll: activateAll,
    onClearEdges: clearEdges,
    onImport: importMap,
  });
  renderGrid(gridEl, state, handleCellClick);
  renderDebug(debugEl, state);
}

update();
