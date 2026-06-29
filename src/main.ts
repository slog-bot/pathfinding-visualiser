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
import { randomiseBlockedEdges } from "./pathfinding/pathfinding";
import { renderDebug, renderGrid } from "./ui/renderer";
import { renderControls } from "./ui/controls";

const GRID_SIZE = 5;

let state = createInitialState(GRID_SIZE, GRID_SIZE);

// UI-only setting (not part of the saved map): probability used by "Randomise
// edges" to block each active edge.
let randomBlockChance = 0.3;

// --- DOM scaffold ---------------------------------------------------------
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="app-header">
    <h1>Grid Pathfinding Visualiser</h1>
    <p class="hint" id="hint"></p>
    <p class="message" id="message"></p>
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
const messageEl = document.querySelector<HTMLParagraphElement>("#message")!;

function showMessage(text: string, kind: "info" | "error" = "info"): void {
  messageEl.textContent = text;
  messageEl.classList.toggle("message-error", kind === "error");
}

function clearMessage(): void {
  messageEl.textContent = "";
  messageEl.classList.remove("message-error");
}

const HINTS: Record<Mode, string> = {
  "toggle-active": "Click cells to add/remove them from the graph.",
  "set-start": "Click an active cell to set the start.",
  "set-goal": "Click an active cell to set the goal.",
  "toggle-edge":
    "Click one active cell, then a neighbouring active cell to toggle the wall between them.",
  "toggle-teleport":
    "Click one active cell, then any other active cell to toggle a teleport between them.",
  simulate:
    "Click a highlighted neighbour or teleport to move. Allowed moves keep the goal reachable.",
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
    case "toggle-teleport":
      handleTeleportClick(coord);
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
    if (coordEquals(state.selectedCellForTeleport, coord)) {
      state.selectedCellForTeleport = null;
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

// Two-click teleport flow: pick a first active cell, then any other active cell
// to toggle a teleport between them. Teleports do not need to be neighbours and
// cannot connect a cell to itself.
function handleTeleportClick(coord: CellCoord): void {
  if (!state.activeCells.has(cellKey(coord))) return;

  const first = state.selectedCellForTeleport;
  if (!first) {
    state.selectedCellForTeleport = coord;
    return;
  }

  if (coordEquals(first, coord)) {
    // Clicking the same cell again deselects it (no self-teleport).
    state.selectedCellForTeleport = null;
    return;
  }

  const key = edgeKey(first, coord);
  if (state.teleportEdges.has(key)) {
    state.teleportEdges.delete(key);
  } else {
    state.teleportEdges.add(key);
  }
  state.selectedCellForTeleport = null;
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
  state.selectedCellForTeleport = null;
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
  state.selectedCellForTeleport = null;
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

// Randomly block edges between active neighbours while guaranteeing the goal
// stays reachable from the start. Active cells, start and goal are untouched.
function randomiseEdges(): void {
  const startKey = state.startCell ? cellKey(state.startCell) : null;
  const goalKey = state.goalCell ? cellKey(state.goalCell) : null;
  const startActive = startKey !== null && state.activeCells.has(startKey);
  const goalActive = goalKey !== null && state.activeCells.has(goalKey);

  if (!startActive || !goalActive) {
    showMessage("Set a start and goal before randomising edges.", "error");
    return;
  }

  const result = randomiseBlockedEdges(state, randomBlockChance);
  if (!result) {
    showMessage(
      "Could not generate a valid random edge layout. Try reducing the block chance.",
      "error"
    );
    return;
  }

  // randomiseBlockedEdges already cleared visitedCells and seated currentCell
  // at the start, as required.
  state = result;
  clearMessage();
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
    teleportEdges: new Set(map.teleportEdges),
    visitedCells: new Set(),
    startCell: map.startCell,
    goalCell: map.goalCell,
    currentCell: null,
    selectedCellForEdge: null,
    selectedCellForTeleport: null,
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
    getBlockChance: () => randomBlockChance,
    onSetMode: setMode,
    onSetLookahead: (enabled) => {
      state.useOneStepLookahead = enabled;
      update();
    },
    // Persist the value only; avoid a full re-render so dragging the slider is
    // not interrupted.
    onSetBlockChance: (chance) => {
      randomBlockChance = chance;
    },
    onRandomiseEdges: randomiseEdges,
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
