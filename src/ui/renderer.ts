// DOM rendering only. Reads from PathGraphState but never mutates it; all input
// is reported back through the onCellClick callback.

import type { CellCoord, PathGraphState } from "../pathfinding/types";
import { cellKey, coordEquals, edgeKey } from "../pathfinding/gridUtils";
import { getAllowedMoves } from "../pathfinding/moveRules";

export type CellClickHandler = (coord: CellCoord) => void;

// Rebuild the entire grid. For a small grid this full re-render is simple and
// keeps the visuals perfectly in sync with state.
export function renderGrid(
  container: HTMLElement,
  state: PathGraphState,
  onCellClick: CellClickHandler
): void {
  container.innerHTML = "";
  container.style.gridTemplateColumns = `repeat(${state.width}, var(--cell-size))`;
  container.style.gridTemplateRows = `repeat(${state.height}, var(--cell-size))`;

  const allowed = new Set(getAllowedMoves(state).map(cellKey));

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const coord: CellCoord = { x, y };
      const key = cellKey(coord);
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);

      const isActive = state.activeCells.has(key);
      cell.classList.add(isActive ? "active" : "inactive");

      if (allowed.has(key)) cell.classList.add("allowed-next");
      if (state.visitedCells.has(key)) cell.classList.add("visited");
      if (coordEquals(state.startCell, coord)) cell.classList.add("start");
      if (coordEquals(state.goalCell, coord)) cell.classList.add("goal");
      if (coordEquals(state.currentCell, coord)) cell.classList.add("current");
      if (coordEquals(state.selectedCellForEdge, coord)) {
        cell.classList.add("edge-selected");
      }

      // Draw walls on whichever sides have a blocked edge with that neighbour.
      // Checking all four sides means a wall is visible from both cells.
      addWallClasses(cell, coord, state);

      // A small label to disambiguate special cells at a glance.
      const label = cellLabel(coord, state);
      if (label) {
        const span = document.createElement("span");
        span.className = "cell-label";
        span.textContent = label;
        cell.appendChild(span);
      }

      cell.addEventListener("click", () => onCellClick(coord));
      container.appendChild(cell);
    }
  }
}

function addWallClasses(
  cell: HTMLElement,
  coord: CellCoord,
  state: PathGraphState
): void {
  const { x, y } = coord;
  const sides: Array<[string, CellCoord]> = [
    ["wall-top", { x, y: y - 1 }],
    ["wall-bottom", { x, y: y + 1 }],
    ["wall-left", { x: x - 1, y }],
    ["wall-right", { x: x + 1, y }],
  ];
  for (const [cls, neighbor] of sides) {
    if (state.blockedEdges.has(edgeKey(coord, neighbor))) {
      cell.classList.add(cls);
    }
  }
}

function cellLabel(coord: CellCoord, state: PathGraphState): string {
  if (coordEquals(state.currentCell, coord)) return "@";
  if (coordEquals(state.startCell, coord)) return "S";
  if (coordEquals(state.goalCell, coord)) return "G";
  return "";
}

function formatCoord(c: CellCoord | null): string {
  return c ? `(${c.x}, ${c.y})` : "none";
}

function sortedKeys(set: Set<string>): string[] {
  return [...set].sort();
}

// Render the debug panel beside the grid.
export function renderDebug(panel: HTMLElement, state: PathGraphState): void {
  const allowedMoves = getAllowedMoves(state).map(cellKey).sort();

  const rows: Array<[string, string]> = [
    ["mode", state.mode],
    ["one-step lookahead", String(state.useOneStepLookahead)],
    ["startCell", formatCoord(state.startCell)],
    ["goalCell", formatCoord(state.goalCell)],
    ["currentCell", formatCoord(state.currentCell)],
    ["activeCells", JSON.stringify(sortedKeys(state.activeCells))],
    ["blockedEdges", JSON.stringify(sortedKeys(state.blockedEdges))],
    ["visitedCells", JSON.stringify(sortedKeys(state.visitedCells))],
    ["allowedMoves", JSON.stringify(allowedMoves)],
  ];

  panel.innerHTML = "";
  const heading = document.createElement("h2");
  heading.textContent = "Debug";
  panel.appendChild(heading);

  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "debug-row";

    const name = document.createElement("div");
    name.className = "debug-key";
    name.textContent = label;

    const val = document.createElement("pre");
    val.className = "debug-value";
    val.textContent = value;

    row.appendChild(name);
    row.appendChild(val);
    panel.appendChild(row);
  }
}
