// Toolbar / action UI. Owns the map file I/O (export download, import file
// reading) but defers all state mutation to the callbacks in ControlsApi.

import type { ExportedMap, Mode, PathGraphState } from "../pathfinding/types";

export type ControlsApi = {
  getState(): PathGraphState;
  onSetMode(mode: Mode): void;
  onSetLookahead(enabled: boolean): void;
  onResetSimulation(): void;
  onClearActive(): void;
  onActivateAll(): void;
  onClearEdges(): void;
  onImport(map: ExportedMap): void;
};

const MODES: Array<{ mode: Mode; label: string }> = [
  { mode: "toggle-active", label: "Toggle active" },
  { mode: "set-start", label: "Set start" },
  { mode: "set-goal", label: "Set goal" },
  { mode: "toggle-edge", label: "Toggle edge" },
  { mode: "simulate", label: "Simulate" },
];

// Build the exportable map object. visitedCells is deliberately omitted because
// it is simulation state rather than map data.
function serializeMap(state: PathGraphState): ExportedMap {
  return {
    width: state.width,
    height: state.height,
    activeCells: [...state.activeCells].sort(),
    blockedEdges: [...state.blockedEdges].sort(),
    startCell: state.startCell,
    goalCell: state.goalCell,
  };
}

// Validate and coerce parsed JSON into an ExportedMap. Throws on bad input.
function parseMap(raw: unknown): ExportedMap {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Map JSON must be an object");
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.width !== "number" || typeof obj.height !== "number") {
    throw new Error("Map JSON requires numeric width and height");
  }
  if (!Array.isArray(obj.activeCells) || !Array.isArray(obj.blockedEdges)) {
    throw new Error("Map JSON requires activeCells and blockedEdges arrays");
  }
  return {
    width: obj.width,
    height: obj.height,
    activeCells: obj.activeCells.map(String),
    blockedEdges: obj.blockedEdges.map(String),
    startCell: (obj.startCell as ExportedMap["startCell"]) ?? null,
    goalCell: (obj.goalCell as ExportedMap["goalCell"]) ?? null,
  };
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function makeButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

// Full re-render of the toolbar so the active-mode highlight and checkbox stay
// in sync with state.
export function renderControls(
  container: HTMLElement,
  state: PathGraphState,
  api: ControlsApi
): void {
  container.innerHTML = "";

  // --- Mode buttons -------------------------------------------------------
  const modeGroup = document.createElement("div");
  modeGroup.className = "control-group";
  const modeTitle = document.createElement("span");
  modeTitle.className = "control-title";
  modeTitle.textContent = "Mode";
  modeGroup.appendChild(modeTitle);

  for (const { mode, label } of MODES) {
    const btn = makeButton(label, () => api.onSetMode(mode));
    if (state.mode === mode) btn.classList.add("active-mode");
    modeGroup.appendChild(btn);
  }
  container.appendChild(modeGroup);

  // --- One-step lookahead toggle -----------------------------------------
  const lookaheadGroup = document.createElement("div");
  lookaheadGroup.className = "control-group";
  const checkboxLabel = document.createElement("label");
  checkboxLabel.className = "checkbox-label";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = state.useOneStepLookahead;
  checkbox.addEventListener("change", () =>
    api.onSetLookahead(checkbox.checked)
  );
  checkboxLabel.appendChild(checkbox);
  checkboxLabel.appendChild(document.createTextNode(" Use one-step lookahead"));
  lookaheadGroup.appendChild(checkboxLabel);
  container.appendChild(lookaheadGroup);

  // --- Actions ------------------------------------------------------------
  const actionGroup = document.createElement("div");
  actionGroup.className = "control-group";
  const actionTitle = document.createElement("span");
  actionTitle.className = "control-title";
  actionTitle.textContent = "Actions";
  actionGroup.appendChild(actionTitle);

  actionGroup.appendChild(
    makeButton("Reset simulation", () => api.onResetSimulation())
  );
  actionGroup.appendChild(makeButton("Clear active", () => api.onClearActive()));
  actionGroup.appendChild(makeButton("Activate all", () => api.onActivateAll()));
  actionGroup.appendChild(makeButton("Clear edges", () => api.onClearEdges()));
  actionGroup.appendChild(
    makeButton("Export JSON", () =>
      downloadJson("grid-map.json", serializeMap(api.getState()))
    )
  );

  // Import via a hidden file input.
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json,.json";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const map = parseMap(JSON.parse(text));
      api.onImport(map);
    } catch (err) {
      alert(`Failed to import map: ${(err as Error).message}`);
    } finally {
      fileInput.value = "";
    }
  });
  actionGroup.appendChild(
    makeButton("Import JSON", () => fileInput.click())
  );
  actionGroup.appendChild(fileInput);

  container.appendChild(actionGroup);
}
