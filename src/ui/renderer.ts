// DOM rendering only. Reads from PathGraphState but never mutates it; all input
// is reported back through the onCellClick callback.

import type { CellCoord, PathGraphState } from "../pathfinding/types";
import {
  cellKey,
  coordEquals,
  edgeKey,
  getConnectedCells,
} from "../pathfinding/gridUtils";
import { getAllowedMoves } from "../pathfinding/moveRules";

export type CellClickHandler = (coord: CellCoord) => void;

const SVG_NS = "http://www.w3.org/2000/svg";

// A distinct colour per teleport pair. Index wraps around if there are more
// teleports than colours.
const TELEPORT_COLORS = [
  "#a855f7", // purple
  "#3b82f6", // blue
  "#22c55e", // green
  "#f97316", // orange
  "#ec4899", // pink
  "#14b8a6", // teal
  "#eab308", // yellow
  "#f43f5e", // rose
];

function teleportColor(index: number): string {
  return TELEPORT_COLORS[index % TELEPORT_COLORS.length];
}

// Map each cell key to the list of teleport indices it participates in, using a
// stable ordering (sorted edge keys) so T1/T2/... stay consistent across
// re-renders.
function teleportIndexByCell(state: PathGraphState): Map<string, number[]> {
  const byCell = new Map<string, number[]>();
  const edges = [...state.teleportEdges].sort();
  edges.forEach((edge, index) => {
    const [a, b] = edge.split("|");
    for (const endpoint of [a, b]) {
      const list = byCell.get(endpoint) ?? [];
      list.push(index);
      byCell.set(endpoint, list);
    }
  });
  return byCell;
}

// Rebuild the entire grid. For a small grid this full re-render is simple and
// keeps the visuals perfectly in sync with state.
export function renderGrid(
  container: HTMLElement,
  state: PathGraphState,
  onCellClick: CellClickHandler
): void {
  container.innerHTML = "";
  // Needed so the absolutely-positioned teleport line overlay anchors here.
  container.style.position = "relative";
  container.style.gridTemplateColumns = `repeat(${state.width}, var(--cell-size))`;
  container.style.gridTemplateRows = `repeat(${state.height}, var(--cell-size))`;

  const allowed = new Set(getAllowedMoves(state).map(cellKey));
  const teleportsByCell = teleportIndexByCell(state);
  const cellElements = new Map<string, HTMLElement>();

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
      if (coordEquals(state.selectedCellForTeleport, coord)) {
        cell.classList.add("teleport-selected");
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

      // Teleport badges (T1, T2, ...) coloured to match their partner.
      const indices = teleportsByCell.get(key);
      if (indices && indices.length > 0) {
        const badges = document.createElement("div");
        badges.className = "teleport-badges";
        for (const index of indices) {
          const badge = document.createElement("span");
          badge.className = "teleport-badge";
          badge.style.background = teleportColor(index);
          badge.textContent = `T${index + 1}`;
          badges.appendChild(badge);
        }
        cell.appendChild(badges);
      }

      cell.addEventListener("click", () => onCellClick(coord));
      container.appendChild(cell);
      cellElements.set(key, cell);
    }
  }

  // Connecting lines are a nice-to-have on top of the badges.
  drawTeleportLines(container, state, cellElements);
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

// Draw a dashed curved line between each teleport pair, colour-matched to the
// badges. Coordinates come from the laid-out cell elements so this stays
// correct regardless of the CSS cell size.
function drawTeleportLines(
  container: HTMLElement,
  state: PathGraphState,
  cellElements: Map<string, HTMLElement>
): void {
  if (state.teleportEdges.size === 0) return;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "teleport-overlay");
  svg.style.position = "absolute";
  svg.style.left = "0";
  svg.style.top = "0";
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.style.overflow = "visible";
  svg.style.pointerEvents = "none";

  const center = (el: HTMLElement) => ({
    x: el.offsetLeft + el.offsetWidth / 2,
    y: el.offsetTop + el.offsetHeight / 2,
  });

  const edges = [...state.teleportEdges].sort();
  edges.forEach((edge, index) => {
    const [aKey, bKey] = edge.split("|");
    const aEl = cellElements.get(aKey);
    const bEl = cellElements.get(bKey);
    if (!aEl || !bEl) return;

    const a = center(aEl);
    const b = center(bEl);

    // Bow the line outward a little so two-way pairs are easy to read.
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(40, len * 0.2);
    const ctrlX = midX + (-dy / len) * bow;
    const ctrlY = midY + (dx / len) * bow;

    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", `M ${a.x} ${a.y} Q ${ctrlX} ${ctrlY} ${b.x} ${b.y}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", teleportColor(index));
    path.setAttribute("stroke-width", "2.5");
    path.setAttribute("stroke-dasharray", "5 4");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("opacity", "0.85");
    svg.appendChild(path);
  });

  container.appendChild(svg);
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
  const connectedCells = state.currentCell
    ? getConnectedCells(state.currentCell, state).map(cellKey).sort()
    : [];

  const rows: Array<[string, string]> = [
    ["mode", state.mode],
    ["one-step lookahead", String(state.useOneStepLookahead)],
    ["startCell", formatCoord(state.startCell)],
    ["goalCell", formatCoord(state.goalCell)],
    ["currentCell", formatCoord(state.currentCell)],
    ["activeCells", JSON.stringify(sortedKeys(state.activeCells))],
    ["blockedEdges", JSON.stringify(sortedKeys(state.blockedEdges))],
    ["teleportEdges", JSON.stringify(sortedKeys(state.teleportEdges))],
    ["visitedCells", JSON.stringify(sortedKeys(state.visitedCells))],
    ["connectedCells", JSON.stringify(connectedCells)],
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
