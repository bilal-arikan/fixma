// ============================================================================
// FigmaOrganizer UI - Edit Tab Logic
// ============================================================================

let loadedRules: any = null;

/**
 * Handles rules JSON file upload
 */
export function handleRulesUpload(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target?.result as string;
      const rules = JSON.parse(text);
      loadedRules = rules;

      // Show file info
      document.getElementById("rulesFileName")!.textContent = file.name;
      document.getElementById("rulesFileInfo")!.style.display = "flex";

      // Count rules
      const renameCount = (rules.rename || []).length;
      const safeAreaCount = (rules.addSafeArea || []).length;
      const total = renameCount + safeAreaCount;

      document.getElementById("rulesFileSummary")!.textContent =
        `${total} rules: ${renameCount} rename, ${safeAreaCount} safe area`;

      // Enable preview button
      const previewBtn = document.getElementById("previewBtn") as HTMLButtonElement;
      previewBtn.disabled = false;

      // Reset apply button & results
      const applyBtn = document.getElementById("applyBtn") as HTMLButtonElement;
      applyBtn.disabled = true;

      document.getElementById("editResults")!.innerHTML =
        '<div class="analyze-empty">📋 Rules file loaded. Click Preview to inspect changes.</div>';
    } catch (err: any) {
      document.getElementById("editResults")!.innerHTML =
        `<div class="analyze-empty">❌ JSON parse error: ${err.message}</div>`;
      loadedRules = null;
    }
  };
  reader.readAsText(file);
}

/**
 * Request preview of rules (without applying)
 */
export function previewRulesUI(): void {
  if (!loadedRules) return;

  const previewBtn = document.getElementById("previewBtn") as HTMLButtonElement;
  previewBtn.disabled = true;
  previewBtn.textContent = "⏳ Loading...";

  document.getElementById("editResults")!.innerHTML =
    '<div class="analyze-empty">⏳ Calculating preview...</div>';

  parent.postMessage(
    { pluginMessage: { type: "previewRules", rules: loadedRules } },
    "*"
  );
}

/**
 * Apply the loaded rules to Figma
 */
export function applyRulesUI(): void {
  if (!loadedRules) return;

  const applyBtn = document.getElementById("applyBtn") as HTMLButtonElement;
  applyBtn.disabled = true;
  applyBtn.textContent = "⏳ Applying...";

  parent.postMessage(
    { pluginMessage: { type: "applyRules", rules: loadedRules } },
    "*"
  );
}

/**
 * Handle preview result from plugin
 */
export function handlePreviewResult(response: any): void {
  const previewBtn = document.getElementById("previewBtn") as HTMLButtonElement;
  previewBtn.disabled = false;
  previewBtn.textContent = "👁 Preview";

  const resultsEl = document.getElementById("editResults")!;

  if (!response.success) {
    resultsEl.innerHTML = `<div class="analyze-empty">❌ Preview error: ${response.error || "Unknown error"}</div>`;
    return;
  }

  const data = response.data;
  const { renames, safeAreas, totalChanges } = data;

  if (totalChanges === 0) {
    resultsEl.innerHTML = '<div class="analyze-empty">ℹ️ No changes to apply.</div>';
    return;
  }

  let html = `<div class="preview-summary">📋 <strong>${totalChanges}</strong> changes will be applied</div>`;

  // Rename preview
  if (renames.length > 0) {
    html += buildPreviewSection("✏️ Rename", renames.map((r: any) => {
      if (!r.found) {
        return buildPreviewRow("❌", r.nodeId, `Node not found`, "", true);
      }
      return buildPreviewRow("✏️", r.oldName, `→ <strong>${escapeHtml(r.newName)}</strong>`, r.nodeType);
    }).join(""));
  }

  // Safe area preview
  if (safeAreas.length > 0) {
    html += buildPreviewSection("📱 Safe Area", safeAreas.map((s: any) => {
      if (!s.found || !s.applicable) {
        return buildPreviewRow("❌", s.nodeName || s.nodeId, s.reason || "Not applicable", s.nodeType, true);
      }
      return buildPreviewRow("📱", s.nodeName, s.reason, s.nodeType);
    }).join(""));
  }

  resultsEl.innerHTML = html;

  // Enable apply button
  const applyBtn = document.getElementById("applyBtn") as HTMLButtonElement;
  applyBtn.disabled = false;
}

/**
 * Handle apply result from plugin
 */
export function handleApplyResult(response: any): void {
  const applyBtn = document.getElementById("applyBtn") as HTMLButtonElement;
  applyBtn.disabled = false;
  applyBtn.textContent = "✅ Apply to Figma";

  const resultsEl = document.getElementById("editResults")!;

  if (!response.success) {
    resultsEl.innerHTML = `<div class="analyze-empty">❌ Apply error: ${response.error || "Unknown error"}</div>`;
    return;
  }

  const data = response.data;
  const { successCount, failCount } = data;

  let html = `
    <div class="apply-summary ${failCount > 0 ? "has-errors" : "all-success"}">
      ✅ ${successCount} succeeded${failCount > 0 ? `, ❌ ${failCount} failed` : ""}
    </div>
  `;

  // Show rename results
  if (data.renames?.length > 0) {
    html += buildApplySection("✏️ Rename", data.renames.map((r: any) =>
      buildApplyRow(r.success, r.oldName, r.success ? `→ ${r.newName}` : r.error || "Error")
    ).join(""));
  }

  // Show safe area results
  if (data.safeAreas?.length > 0) {
    html += buildApplySection("📱 Safe Area", data.safeAreas.map((s: any) =>
      buildApplyRow(s.success, s.nodeName, s.success ? s.changes || "Updated" : s.error || "Error")
    ).join(""));
  }

  resultsEl.innerHTML = html;

  // Disable apply button after applying (prevent double-apply)
  const applyBtn2 = document.getElementById("applyBtn") as HTMLButtonElement;
  applyBtn2.disabled = true;
}

function buildPreviewSection(title: string, rows: string): string {
  return `
    <div class="preview-section">
      <div class="preview-section-title">${title}</div>
      ${rows}
    </div>
  `;
}

function buildPreviewRow(icon: string, name: string, detail: string, type: string, isError = false): string {
  return `
    <div class="preview-row ${isError ? "preview-row-error" : ""}">
      <span class="preview-icon">${icon}</span>
      <div class="preview-info">
        <span class="preview-name">${escapeHtml(name)}</span>
        <span class="preview-detail">${detail}${type ? ` <em>${escapeHtml(type)}</em>` : ""}</span>
      </div>
    </div>
  `;
}

function buildApplySection(title: string, rows: string): string {
  return `
    <div class="preview-section">
      <div class="preview-section-title">${title}</div>
      ${rows}
    </div>
  `;
}

function buildApplyRow(success: boolean, name: string, detail: string): string {
  return `
    <div class="preview-row ${success ? "" : "preview-row-error"}">
      <span class="preview-icon">${success ? "✅" : "❌"}</span>
      <div class="preview-info">
        <span class="preview-name">${escapeHtml(name)}</span>
        <span class="preview-detail">${escapeHtml(detail)}</span>
      </div>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
