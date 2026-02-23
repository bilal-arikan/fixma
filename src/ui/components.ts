// ============================================================================
// FigmaOrganizer UI - Components Tab Logic
// ============================================================================

// Last scan results stored for convert step
let lastScanGroups: any[] = [];

// ── Scan ──────────────────────────────────────────────────────────────────────

export function runComponentScan(): void {
  const scopeInput = document.querySelector(
    'input[name="compScope"]:checked'
  ) as HTMLInputElement;
  const scope = scopeInput ? scopeInput.value : "current";

  const scanBtn = document.getElementById("compScanBtn") as HTMLButtonElement;
  scanBtn.disabled = true;
  scanBtn.textContent = "⏳ Scanning...";

  const convertBtn = document.getElementById("compConvertBtn") as HTMLButtonElement;
  convertBtn.disabled = true;

  const resultsEl = document.getElementById("compResults")!;
  resultsEl.innerHTML = '<div class="analyze-empty">⏳ Scanning for similar structures...</div>';

  parent.postMessage(
    { pluginMessage: { type: "scanComponents", scope } },
    "*"
  );
}

// ── Handle scan result ────────────────────────────────────────────────────────

export function handleScanResult(response: any): void {
  const scanBtn = document.getElementById("compScanBtn") as HTMLButtonElement;
  scanBtn.disabled = false;
  scanBtn.textContent = "🔍 Scan";

  const resultsEl = document.getElementById("compResults")!;

  if (!response.success) {
    resultsEl.innerHTML = `<div class="analyze-empty">❌ Error: ${response.error || "Unknown error"}</div>`;
    return;
  }

  const groups: any[] = response.data || [];
  lastScanGroups = groups;

  // Update counter
  document.getElementById("compGroupCount")!.textContent = String(groups.length);
  document.getElementById("compNodeCount")!.textContent = String(
    groups.reduce((s: number, g: any) => s + g.nodes.length, 0)
  );

  if (groups.length === 0) {
    resultsEl.innerHTML = '<div class="analyze-empty">✅ No repeating structures found.</div>';
    return;
  }

  // Build group cards
  const html = groups.map((group: any, idx: number) => buildGroupCard(group, idx)).join("");
  resultsEl.innerHTML = html;

  // Wire up checkbox → convert button state
  resultsEl.querySelectorAll('input[type="checkbox"].group-check').forEach((cb) => {
    cb.addEventListener("change", updateConvertButton);
  });

  // Wire up node row clicks → focus in Figma
  resultsEl.querySelectorAll(".comp-node-focusable").forEach((row) => {
    row.addEventListener("click", (e) => {
      // Don't interfere with checkbox clicks inside the header
      const nodeId = (row as HTMLElement).dataset.nodeId;
      if (!nodeId) return;
      parent.postMessage({ pluginMessage: { type: "focusNode", nodeId } }, "*");
    });
  });

  updateConvertButton();
}

function buildGroupCard(group: any, idx: number): string {
  const nodeRows = group.nodes
    .map((n: any, ni: number) => `
      <div class="comp-node-row ${ni === 0 ? "comp-master-row" : ""} comp-node-focusable"
           data-node-id="${escapeHtml(n.id)}"
           title="Click to focus in Figma">
        <span class="comp-node-icon">${ni === 0 ? "⭐" : "🔗"}</span>
        <span class="comp-node-name">${escapeHtml(n.name)}</span>
        <span class="comp-node-meta">${escapeHtml(n.type)} · ${Math.round(n.width)}×${Math.round(n.height)} · <em>${escapeHtml(n.parentName)}</em></span>
        <span class="comp-focus-hint">🎯</span>
      </div>
    `)
    .join("");

  return `
    <div class="comp-group-card" data-idx="${idx}">
      <div class="comp-group-header">
        <label class="comp-group-label">
          <input type="checkbox" class="group-check" data-idx="${idx}">
          <span class="comp-group-title">${escapeHtml(group.label)}</span>
          <span class="badge">${group.nodes.length} nodes</span>
        </label>
        <span class="comp-pages">${group.pages.map((p: string) => escapeHtml(p)).join(", ")}</span>
      </div>
      <div class="comp-group-body">
        <div class="comp-legend">⭐ = will become master component &nbsp;·&nbsp; 🔗 = will become instance &nbsp;·&nbsp; click row to focus</div>
        ${nodeRows}
      </div>
    </div>
  `;
}

function updateConvertButton(): void {
  const checked = document.querySelectorAll('input[type="checkbox"].group-check:checked').length;
  const convertBtn = document.getElementById("compConvertBtn") as HTMLButtonElement;
  convertBtn.disabled = checked === 0;
  convertBtn.textContent = checked > 0
    ? `🧩 Create Components (${checked} group${checked > 1 ? "s" : ""})`
    : "🧩 Create Components";
}

// ── Convert ───────────────────────────────────────────────────────────────────

export function runConvert(): void {
  const checkboxes = document.querySelectorAll('input[type="checkbox"].group-check:checked');
  if (checkboxes.length === 0) return;

  const selected: any[] = [];
  checkboxes.forEach((cb: any) => {
    const idx = parseInt(cb.dataset.idx, 10);
    const group = lastScanGroups[idx];
    if (group) {
      selected.push({
        fingerprint: group.fingerprint,
        label: group.label,
        nodeIds: group.nodes.map((n: any) => n.id),
      });
    }
  });

  const convertBtn = document.getElementById("compConvertBtn") as HTMLButtonElement;
  convertBtn.disabled = true;
  convertBtn.textContent = "⏳ Converting...";

  parent.postMessage(
    { pluginMessage: { type: "convertComponents", requests: selected } },
    "*"
  );
}

// ── Handle convert result ─────────────────────────────────────────────────────

export function handleConvertResult(response: any): void {
  const convertBtn = document.getElementById("compConvertBtn") as HTMLButtonElement;
  convertBtn.disabled = false;
  convertBtn.textContent = "🧩 Create Components";

  const resultsEl = document.getElementById("compResults")!;

  if (!response.success) {
    resultsEl.innerHTML = `<div class="analyze-empty">❌ Error: ${response.error || "Unknown error"}</div>`;
    return;
  }

  const results: any[] = response.data || [];
  const totalSuccess = results.reduce((s, r) => s + r.successCount, 0);
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

  let html = `
    <div class="apply-summary ${totalErrors > 0 ? "has-errors" : "all-success"}">
      ✅ ${totalSuccess} node${totalSuccess !== 1 ? "s" : ""} converted${totalErrors > 0 ? ` · ❌ ${totalErrors} error${totalErrors !== 1 ? "s" : ""}` : ""}
    </div>
  `;

  for (const result of results) {
    const statusIcon = result.errors.length === 0 ? "🧩" : "⚠️";
    html += `
      <div class="preview-section">
        <div class="preview-section-title">${statusIcon} ${escapeHtml(result.label)}</div>
        <div class="preview-row">
          <span class="preview-icon">⭐</span>
          <div class="preview-info">
            <span class="preview-name">Master: ${escapeHtml(result.componentName)}</span>
            <span class="preview-detail">ID: ${escapeHtml(result.componentId || "?")} · ${result.instanceCount} instance${result.instanceCount !== 1 ? "s" : ""} created</span>
          </div>
        </div>
        ${result.errors.map((e: string) => `
          <div class="preview-row preview-row-error">
            <span class="preview-icon">❌</span>
            <div class="preview-info">
              <span class="preview-detail">${escapeHtml(e)}</span>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  // After convert, reset scan data so user re-scans
  lastScanGroups = [];
  resultsEl.innerHTML = html;

  // Reset scan stats
  document.getElementById("compGroupCount")!.textContent = "-";
  document.getElementById("compNodeCount")!.textContent = "-";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
