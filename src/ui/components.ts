// ============================================================================
// FigmaOrganizer UI - Components Tab Logic
// ============================================================================

// Last scan results stored for convert step
let lastScanGroups: any[] = [];

// ── Combine Selected as Variants ──────────────────────────────────────────────

/**
 * Reads the current Figma selection (via a plugin message round-trip),
 * then sends "combineAsVariants" to the plugin backend.
 */
export function runCombineAsVariants(): void {
  const btn = document.getElementById("combineVariantsBtn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "⏳ Combining...";

  // Ask the plugin for the current selection IDs
  parent.postMessage({ pluginMessage: { type: "getSelection" } }, "*");
}

export function handleGetSelectionResult(response: any): void {
  const btn = document.getElementById("combineVariantsBtn") as HTMLButtonElement;

  if (!response.success || !response.nodeIds || response.nodeIds.length < 2) {
    btn.disabled = false;
    btn.textContent = "🔀 Combine Selection as Variants";

    const resultsEl = document.getElementById("variantsResults")!;
    resultsEl.innerHTML = `<div class="analyze-empty">⚠️ Please select at least 2 objects in Figma before combining.</div>`;
    return;
  }

  parent.postMessage(
    {
      pluginMessage: {
        type: "combineAsVariants",
        nodeIds: response.nodeIds,
        componentSetName: response.nodeIds.length > 0 ? undefined : "Component",
        propertyName: "State",
      },
    },
    "*"
  );
}

export function handleCombineAsVariantsResult(response: any): void {
  const btn = document.getElementById("combineVariantsBtn") as HTMLButtonElement;
  btn.disabled = false;
  btn.textContent = "🔀 Combine Selection as Variants";

  const resultsEl = document.getElementById("variantsResults")!;

  if (!response.success) {
    const data = response.data;
    const errList = data?.errors?.length
      ? data.errors.map((e: string) => `<div class="preview-row preview-row-error"><span class="preview-icon">❌</span><div class="preview-info"><span class="preview-detail">${escapeHtml(e)}</span></div></div>`).join("")
      : "";
    resultsEl.innerHTML = `
      <div class="apply-summary has-errors">
        ❌ ${escapeHtml(response.error || "Combine as Variants failed")}
      </div>
      ${errList}
    `;
    return;
  }

  const data = response.data;
  const warningHtml = data.errors?.length
    ? data.errors.map((e: string) => `
        <div class="preview-row preview-row-error">
          <span class="preview-icon">⚠️</span>
          <div class="preview-info"><span class="preview-detail">${escapeHtml(e)}</span></div>
        </div>`).join("")
    : "";

  resultsEl.innerHTML = `
    <div class="apply-summary all-success">
      ✅ Combined ${data.variantCount} variant${data.variantCount !== 1 ? "s" : ""} into <strong>${escapeHtml(data.componentSetName)}</strong>
    </div>
    <div class="preview-section">
      <div class="preview-section-title">🔀 Component Set Created</div>
      <div class="preview-row">
        <span class="preview-icon">🧩</span>
        <div class="preview-info">
          <span class="preview-name">${escapeHtml(data.componentSetName)}</span>
          <span class="preview-detail">${data.variantCount} variants · instances placed back on canvas</span>
        </div>
      </div>
      ${warningHtml}
    </div>
  `;
}

// ── Scan ──────────────────────────────────────────────────────────────────────

export function runComponentScan(): void {
  const scopeInput = document.querySelector(
    'input[name="compScope"]:checked'
  ) as HTMLInputElement;
  const scope = scopeInput ? scopeInput.value : "current";

  const includeProtectedInput = document.getElementById("compIncludeProtected") as HTMLInputElement | null;
  const includeProtected = includeProtectedInput?.checked === true;

  const scanBtn = document.getElementById("compScanBtn") as HTMLButtonElement;
  scanBtn.disabled = true;
  scanBtn.textContent = "⏳ Scanning...";

  const convertBtn = document.getElementById("compConvertBtn") as HTMLButtonElement;
  convertBtn.disabled = true;

  const resultsEl = document.getElementById("compResults")!;
  resultsEl.innerHTML = '<div class="analyze-empty">⏳ Scanning for similar structures...</div>';

  parent.postMessage(
    { pluginMessage: { type: "scanComponents", scope, includeProtected } },
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

  // Wire up fold/unfold: clicking the header (but not the checkbox) toggles body
  resultsEl.querySelectorAll(".comp-group-header").forEach((header) => {
    header.addEventListener("click", (e) => {
      // Don't toggle when clicking the checkbox itself
      if ((e.target as HTMLElement).classList.contains("group-check")) return;
      const card = header.closest(".comp-group-card") as HTMLElement;
      if (!card) return;
      const body = card.querySelector(".comp-group-body") as HTMLElement;
      if (!body) return;
      const isOpen = body.style.display !== "none";
      body.style.display = isOpen ? "none" : "block";
      const chevron = header.querySelector(".comp-chevron") as HTMLElement;
      if (chevron) chevron.textContent = isOpen ? "▶" : "▼";
    });
  });

  // Wire up node row clicks → focus in Figma
  resultsEl.querySelectorAll(".comp-node-focusable").forEach((row) => {
    row.addEventListener("click", () => {
      const nodeId = (row as HTMLElement).dataset.nodeId;
      if (!nodeId) return;
      parent.postMessage({ pluginMessage: { type: "focusNode", nodeId } }, "*");
    });
  });

  // Show Convert All button
  const convertAllBtn = document.getElementById("compConvertAllBtn") as HTMLButtonElement | null;
  if (convertAllBtn) {
    convertAllBtn.style.display = groups.length > 0 ? "inline-block" : "none";
    convertAllBtn.disabled = false;
    convertAllBtn.textContent = `🧩 Convert All (${groups.length})`;
  }

  updateConvertButton();
}

// ── Group card builder ────────────────────────────────────────────────────────

function buildGroupCard(group: any, idx: number): string {
  const hasDiffs = !!group.hasDiffs;

  const nodeRows = group.nodes
    .map((n: any, ni: number) => {
      // Diff entry for this node (master = index 0 has no diff entry)
      const diff = ni > 0 ? group.diffs?.[ni - 1] : null;
      const hasTextDiff = diff && diff.textDiffs && diff.textDiffs.length > 0;
      const hasFillDiff = diff && diff.fillDiffs && diff.fillDiffs.length > 0;

      // Build diff hint line
      let diffHtml = "";
      if (hasTextDiff) {
        const texts = diff.textDiffs
          .map((td: any) => `<em>${escapeHtml(td.childName)}</em>: "${escapeHtml(td.value)}"`)
          .join(", ");
        diffHtml += `<span class="comp-diff-hint">✏️ ${texts}</span>`;
      }
      if (hasFillDiff) {
        const swatches = diff.fillDiffs
          .map((fd: any) => `<span class="comp-color-swatch" style="background:${escapeHtml(fd.hex)}" title="${escapeHtml(fd.hex)}"></span>`)
          .join(" ");
        diffHtml += `<span class="comp-diff-hint">🎨 ${swatches} ${diff.fillDiffs.map((fd: any) => escapeHtml(fd.hex)).join(", ")}</span>`;
      }

      const protectedBadge = n.insideProtected
        ? `<span class="badge badge-protected" title="Inside a Component or Instance — will be cloned out">🔓 inside component</span>`
        : "";

      return `
        <div class="comp-node-row ${ni === 0 ? "comp-master-row" : ""} comp-node-focusable"
             data-node-id="${escapeHtml(n.id)}"
             title="Click to focus in Figma">
          <span class="comp-node-icon">${ni === 0 ? "⭐" : "🔗"}</span>
          <div class="comp-node-info">
            <span class="comp-node-name">${escapeHtml(n.name)} ${protectedBadge}</span>
            <span class="comp-node-meta">${escapeHtml(n.type)} · ${Math.round(n.width)}×${Math.round(n.height)} · <em>${escapeHtml(n.parentName)}</em></span>
            ${diffHtml}
          </div>
          <span class="comp-focus-hint">🎯</span>
        </div>
      `;
    })
    .join("");

  const diffBadge = hasDiffs
    ? `<span class="badge badge-warn" title="Text or fill differences detected — overrides will be applied">⚠️ diffs</span>`
    : "";

  return `
    <div class="comp-group-card" data-idx="${idx}">
      <div class="comp-group-header" style="cursor:pointer;">
        <label class="comp-group-label">
          <input type="checkbox" class="group-check" data-idx="${idx}">
          <span class="comp-group-title">${escapeHtml(group.label)}</span>
          <span class="badge">${group.nodes.length} nodes</span>
          ${diffBadge}
        </label>
        <span class="comp-pages">${group.pages.map((p: string) => escapeHtml(p)).join(", ")}</span>
        <span class="comp-chevron chevron" style="margin-left:4px;">▶</span>
      </div>
      <div class="comp-group-body" style="display:none;">
        <div class="comp-legend">⭐ = master &nbsp;·&nbsp; 🔗 = instance &nbsp;·&nbsp; click row to focus${hasDiffs ? " &nbsp;·&nbsp; ⚠️ overrides will restore differing values" : ""}</div>
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
        nodes: group.nodes,         // full metadata (absoluteX/Y for placement)
        diffs: group.diffs || [],   // diffs for override restoration
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
  const totalOverrides = results.reduce((s, r) => s + (r.overridesApplied || 0), 0);
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);

  let summaryExtra = totalOverrides > 0 ? ` · 🔄 ${totalOverrides} override${totalOverrides !== 1 ? "s" : ""} applied` : "";
  let html = `
    <div class="apply-summary ${totalErrors > 0 ? "has-errors" : "all-success"}">
      ✅ ${totalSuccess} node${totalSuccess !== 1 ? "s" : ""} converted${summaryExtra}${totalErrors > 0 ? ` · ❌ ${totalErrors} error${totalErrors !== 1 ? "s" : ""}` : ""}
    </div>
  `;

  for (const result of results) {
    const statusIcon = result.errors.length === 0 ? "🧩" : "⚠️";
    const overrideInfo = result.overridesApplied > 0
      ? ` · ${result.overridesApplied} override${result.overridesApplied !== 1 ? "s" : ""} applied`
      : "";
    html += `
      <div class="preview-section">
        <div class="preview-section-title">${statusIcon} ${escapeHtml(result.label)}</div>
        <div class="preview-row">
          <span class="preview-icon">⭐</span>
          <div class="preview-info">
            <span class="preview-name">Master: ${escapeHtml(result.componentName)}</span>
            <span class="preview-detail">${result.instanceCount} instance${result.instanceCount !== 1 ? "s" : ""} created${overrideInfo}</span>
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

  lastScanGroups = [];
  resultsEl.innerHTML = html;

  document.getElementById("compGroupCount")!.textContent = "-";
  document.getElementById("compNodeCount")!.textContent = "-";
}

// ── Convert All ─────────────────────────────────────────────────────────────

/**
 * Selects all group checkboxes and triggers convert.
 */
export function convertAllComponents(): void {
  // Check all group checkboxes
  document.querySelectorAll('input[type="checkbox"].group-check').forEach((cb) => {
    (cb as HTMLInputElement).checked = true;
  });
  updateConvertButton();
  runConvert();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
