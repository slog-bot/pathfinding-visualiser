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

// Static help content. It never changes, so it lives outside the render loop.
const INSTRUCTIONS_HTML = `
  <section class="instr-section">
    <h4>&#127919; Purpose</h4>
    <ul>
      <li>A prototype for designing and testing the <strong>progression graph</strong> of a biome or area.</li>
      <li>Each cell is an <strong>arena, room, encounter or instance</strong> &mdash; not an individual combat tile.</li>
      <li>The graph is the underlying data structure modelling progression; it is not necessarily what the player sees in-game.</li>
      <li>Use it to experiment with graph generation, movement rules and pathfinding.</li>
    </ul>
  </section>

  <section class="instr-section">
    <h4>&#9999;&#65039; Editing modes</h4>
    <ul>
      <li><strong>Toggle Active</strong> &mdash; click cells to enable/disable them. Only active cells exist in the graph.</li>
      <li><strong>Set Start</strong> &mdash; choose the entry point into the biome.</li>
      <li><strong>Set Goal</strong> &mdash; choose the destination/exit of the biome.</li>
      <li><strong>Toggle Edge</strong> &mdash; click one active cell, then a <em>neighbouring</em> active cell to create/remove a normal connection. Blocked edges are routes that cannot be travelled.</li>
      <li><strong>Toggle Teleport</strong> &mdash; click one active cell, then <em>any other</em> active cell. Teleports ignore adjacency and act as direct links. Matching colours/labels mark paired locations.</li>
      <li><strong>Simulate</strong> &mdash; progress through the graph by clicking highlighted legal moves. After each move the previous location becomes visited and unavailable, legal moves are recalculated, and any move that would make the goal unreachable is prevented.</li>
    </ul>
  </section>

  <section class="instr-section">
    <h4>&#127922; Randomise edges</h4>
    <ul>
      <li>Randomly blocks normal neighbouring connections.</li>
      <li>A layout is only accepted if a valid path still exists from start to goal.</li>
      <li>Teleports are preserved.</li>
    </ul>
  </section>

  <section class="instr-section">
    <h4>&#127912; Colours &amp; indicators</h4>
    <ul class="legend">
      <li><span class="swatch" style="background:#1e293b;opacity:0.55"></span> Inactive cell</li>
      <li><span class="swatch" style="background:#475569"></span> Active cell</li>
      <li><span class="swatch" style="background:#22c55e"></span> Start (S)</li>
      <li><span class="swatch" style="background:#ef4444"></span> Goal (G)</li>
      <li><span class="swatch" style="background:#3b82f6"></span> Current location (@)</li>
      <li><span class="swatch" style="background:#7c3aed"></span> Visited (unavailable)</li>
      <li><span class="swatch" style="background:#facc15"></span> Legal next move</li>
      <li><span class="swatch swatch-wall"></span> Blocked edge (thick orange wall between cells)</li>
      <li><span class="swatch swatch-edgesel"></span> Toggle Edge: first cell picked (orange outline)</li>
      <li><span class="swatch swatch-telsel"></span> Toggle Teleport: first cell picked (cyan dashed outline)</li>
    </ul>
    <p class="instr-note">
      Teleport pairs share a colour shown as a <strong>T1 / T2 / &hellip;</strong> badge on both
      cells and a dashed line linking them. Colours cycle through:
    </p>
    <div class="teleport-swatches">
      <span class="tp" style="background:#a855f7">T1</span>
      <span class="tp" style="background:#3b82f6">T2</span>
      <span class="tp" style="background:#22c55e">T3</span>
      <span class="tp" style="background:#f97316">T4</span>
      <span class="tp" style="background:#ec4899">T5</span>
      <span class="tp" style="background:#14b8a6">T6</span>
      <span class="tp" style="background:#eab308">T7</span>
      <span class="tp" style="background:#f43f5e">T8</span>
    </div>
  </section>

  <section class="instr-section">
    <h4>&#128190; Export / import</h4>
    <ul>
      <li>Export saves: graph size, active cells, blocked edges, teleports, start and goal.</li>
      <li>Import restores a saved graph.</li>
      <li>Visited cells are <em>not</em> exported &mdash; they belong to the simulation, not the graph.</li>
    </ul>
  </section>

  <section class="instr-section">
    <h4>&#129504; Algorithm</h4>
    <ul>
      <li>A move is permitted only if, after moving, the previous location becomes unavailable <em>and</em> the goal is still reachable (BFS).</li>
      <li>With <strong>One-Step Lookahead</strong> on, moves that immediately force the player into a dead end are also prevented (unless the move lands on the goal).</li>
    </ul>
  </section>
`;

// --- DOM scaffold ---------------------------------------------------------
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div class="top-bar">
    <header class="app-header">
      <h1>Grid Pathfinding Visualiser</h1>
      <p class="hint" id="hint"></p>
      <p class="message" id="message"></p>
    </header>
    <aside class="instructions-panel" id="instructions">
      <div class="instructions-header">
        <h3>&#8505;&#65039; Instructions</h3>
        <button type="button" id="instructions-toggle" aria-expanded="true">Hide</button>
      </div>
      <div class="instructions-body" id="instructions-body">${INSTRUCTIONS_HTML}</div>
    </aside>
  </div>
  <div id="controls" class="controls"></div>
  <main class="workspace">
    <div id="grid" class="grid"></div>
    <aside id="debug" class="debug-panel"></aside>
  </main>
`;

// --- Instructions collapse/expand (static, outside the render loop) --------
const instructionsPanel =
  document.querySelector<HTMLElement>("#instructions")!;
const instructionsToggle =
  document.querySelector<HTMLButtonElement>("#instructions-toggle")!;
instructionsToggle.addEventListener("click", () => {
  const collapsed = instructionsPanel.classList.toggle("collapsed");
  instructionsToggle.textContent = collapsed ? "Show" : "Hide";
  instructionsToggle.setAttribute("aria-expanded", String(!collapsed));
});

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
