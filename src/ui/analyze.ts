// ============================================================================
// FigmaOrganizer UI - Analyze Tab Logic
// ============================================================================

// ─── Types ──────────────────────────────────────────────────────────────────

interface FlatAnalyzeIssue {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  kind: string;
  description: string;
  suggestion?: string;
  width?: number;
  height?: number;
}

// ─── State ──────────────────────────────────────────────────────────────────

let lastAnalysisData: any = null;
let lastAnalyzeIssues: FlatAnalyzeIssue[] = [];

// Kinds that support auto-fix
const FIXABLE_KINDS = new Set([
  "turkish_chars",
  "case_inconsistency",
  "empty_frame",
  "zero_size",
  "missing_safearea_frame",
]);

// ─── Download ───────────────────────────────────────────────────────────────

/**
 * Downloads the last analysis result as a JSON file
 */
export function downloadAnalysisReport(): void {
  if (!lastAnalysisData) return;
  const jsonStr = JSON.stringify(lastAnalysisData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "figma-analysis-" + new Date().toISOString().split("T")[0] + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Run Analysis ───────────────────────────────────────────────────────────

/**
 * Initiates document analysis.
 * Reads scope radio and check-type checkboxes from the UI.
 */
export function runAnalysis(): void {
  const scopeInput = document.querySelector(
    'input[name="analyzeScope"]:checked'
  ) as HTMLInputElement;
  const scope = scopeInput ? scopeInput.value : "current";

  const checkNamingEl = document.getElementById("analyzeCheckNaming") as HTMLInputElement | null;
  const checkSafeAreaEl = document.getElementById("analyzeCheckSafeArea") as HTMLInputElement | null;
  const checkEmptyFramesEl = document.getElementById("analyzeCheckEmptyFrames") as HTMLInputElement | null;
  const checkZeroSizeEl = document.getElementById("analyzeCheckZeroSize") as HTMLInputElement | null;
  const checkNaming = checkNamingEl ? checkNamingEl.checked : true;
  const checkSafeArea = checkSafeAreaEl ? checkSafeAreaEl.checked : true;
  const checkEmptyFrames = checkEmptyFramesEl ? checkEmptyFramesEl.checked : true;
  const checkZeroSize = checkZeroSizeEl ? checkZeroSizeEl.checked : true;

  const btn = document.getElementById("analyzeBtn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "⏳ Scanning...";

  const resultsEl = document.getElementById("analyzeResults")!;
  resultsEl.innerHTML = '<div class="analyze-empty">⏳ Scanning page...</div>';

  // Hide Fix All button while scanning
  const fixAllBtn = document.getElementById("analyzeFixAllBtn") as HTMLButtonElement | null;
  if (fixAllBtn) fixAllBtn.style.display = "none";

  parent.postMessage(
    {
      pluginMessage: {
        type: "analyzeDocument",
        scope,
        checks: { naming: checkNaming, safeArea: checkSafeArea, emptyFrames: checkEmptyFrames, zeroSize: checkZeroSize },
      },
    },
    "*"
  );
}

// ─── Handle Result ──────────────────────────────────────────────────────────

/**
 * Handles analyze result from plugin
 */
export function handleAnalyzeResult(response: any): void {
  const btn = document.getElementById("analyzeBtn") as HTMLButtonElement;
  btn.disabled = false;
  btn.textContent = "🔍 Scan";

  const resultsEl = document.getElementById("analyzeResults")!;

  if (!response.success) {
    resultsEl.innerHTML = `<div class="analyze-empty">❌ Error: ${response.error || "Unknown error"}</div>`;
    lastAnalyzeIssues = [];
    return;
  }

  const data = response.data;
  const { namingIssues, safeAreaIssues, cleanupIssues = [], totalIssues, scannedNodes } = data;

  const emptyFrameIssues = cleanupIssues.filter((i: any) => i.kind === "empty_frame");
  const zeroSizeIssues = cleanupIssues.filter((i: any) => i.kind === "zero_size");

  // Store for download and enable button
  lastAnalysisData = data;
  const downloadBtn = document.getElementById("downloadReportBtn") as HTMLButtonElement;
  if (downloadBtn) downloadBtn.disabled = false;

  // Summary stats
  document.getElementById("analyzedNodes")!.textContent = String(scannedNodes);
  document.getElementById("analyzedIssues")!.textContent = String(totalIssues);
  document.getElementById("analyzedNaming")!.textContent = String(namingIssues.length);
  document.getElementById("analyzedSafeArea")!.textContent = String(safeAreaIssues.length);
  document.getElementById("analyzedEmptyFrames")!.textContent = String(emptyFrameIssues.length);
  document.getElementById("analyzedZeroSize")!.textContent = String(zeroSizeIssues.length);

  // Build flat issue list for fix engine
  lastAnalyzeIssues = [];
  let globalIndex = 0;

  for (const issue of namingIssues) {
    lastAnalyzeIssues.push({
      nodeId: issue.nodeId,
      nodeName: issue.nodeName,
      nodeType: issue.nodeType,
      kind: issue.issue,           // "default_name" | "turkish_chars" | "case_inconsistency"
      description: issue.description,
      suggestion: issue.suggestion,
    });
    globalIndex++;
  }
  for (const issue of safeAreaIssues) {
    lastAnalyzeIssues.push({
      nodeId: issue.nodeId,
      nodeName: issue.nodeName,
      nodeType: issue.nodeType,
      kind: issue.issue,           // "missing_safearea_frame"
      description: issue.description,
      suggestion: issue.suggestion,
      width: issue.width,
      height: issue.height,
    });
    globalIndex++;
  }
  for (const issue of [...emptyFrameIssues, ...zeroSizeIssues]) {
    lastAnalyzeIssues.push({
      nodeId: issue.nodeId,
      nodeName: issue.nodeName,
      nodeType: issue.nodeType,
      kind: issue.kind,            // "empty_frame" | "zero_size"
      description: issue.description,
      suggestion: issue.suggestion,
      width: issue.width,
      height: issue.height,
    });
    globalIndex++;
  }

  if (totalIssues === 0) {
    resultsEl.innerHTML = '<div class="analyze-empty">✅ No issues found! Your page looks clean.</div>';
    lastAnalyzeIssues = [];
    return;
  }

  // Show / hide Fix All button (only if there are fixable issues)
  const fixableCount = lastAnalyzeIssues.filter((i) => FIXABLE_KINDS.has(i.kind)).length;
  const fixAllBtn = document.getElementById("analyzeFixAllBtn") as HTMLButtonElement | null;
  if (fixAllBtn) {
    fixAllBtn.style.display = fixableCount > 0 ? "inline-block" : "none";
    fixAllBtn.disabled = false;
    fixAllBtn.textContent = `🔧 Fix All (${fixableCount})`;
  }

  // ── Build HTML ──────────────────────────────────────────────────────────
  let html = "";
  let idx = 0;

  if (namingIssues.length > 0) {
    html += buildAccordion(
      "naming",
      `✏️ Naming Issues`,
      namingIssues.length,
      namingIssues
        .map((issue: any) => {
          const card = buildIssueCard(
            getIssueIcon(issue.issue),
            issue.nodeName,
            issue.nodeType,
            issue.nodeId,
            issue.description,
            issue.suggestion,
            idx,
            issue.issue
          );
          idx++;
          return card;
        })
        .join("")
    );
  }

  if (safeAreaIssues.length > 0) {
    html += buildAccordion(
      "safearea",
      `📱 Safe Area Issues`,
      safeAreaIssues.length,
      safeAreaIssues
        .map((issue: any) => {
          const card = buildIssueCard(
            "📱",
            issue.nodeName,
            `${issue.nodeType} · ${issue.width}×${issue.height}`,
            issue.nodeId,
            issue.description,
            issue.suggestion,
            idx,
            issue.issue
          );
          idx++;
          return card;
        })
        .join("")
    );
  }

  if (emptyFrameIssues.length > 0) {
    html += buildAccordion(
      "emptyframes",
      `📭 Empty Frames`,
      emptyFrameIssues.length,
      emptyFrameIssues
        .map((issue: any) => {
          const card = buildIssueCard(
            "📭",
            issue.nodeName,
            `${issue.nodeType} · ${issue.width}×${issue.height}`,
            issue.nodeId,
            issue.description,
            issue.suggestion,
            idx,
            issue.kind
          );
          idx++;
          return card;
        })
        .join("")
    );
  }

  if (zeroSizeIssues.length > 0) {
    html += buildAccordion(
      "zerosize",
      `🔍 Zero-Size Objects`,
      zeroSizeIssues.length,
      zeroSizeIssues
        .map((issue: any) => {
          const card = buildIssueCard(
            "🔍",
            issue.nodeName,
            `${issue.nodeType} · ${issue.width}×${issue.height}`,
            issue.nodeId,
            issue.description,
            issue.suggestion,
            idx,
            issue.kind
          );
          idx++;
          return card;
        })
        .join("")
    );
  }

  resultsEl.innerHTML = html;

  // Accordion toggle
  resultsEl.querySelectorAll(".accordion-header").forEach((header) => {
    header.addEventListener("click", () => {
      const body = header.nextElementSibling as HTMLElement;
      const isOpen = body.style.display !== "none";
      body.style.display = isOpen ? "none" : "block";
      const chevron = header.querySelector(".chevron") as HTMLElement;
      if (chevron) chevron.textContent = isOpen ? "▶" : "▼";
    });
  });

  // Issue card focus — clicking a card focuses the node in Figma
  resultsEl.querySelectorAll(".issue-card[data-node-id]").forEach((card) => {
    card.addEventListener("click", () => {
      const nodeId = (card as HTMLElement).dataset.nodeId;
      if (nodeId) {
        parent.postMessage({ pluginMessage: { type: "focusNode", nodeId } }, "*");
      }
    });
  });

  // Fix button click handlers
  resultsEl.querySelectorAll(".analyze-fix-btn[data-fix-index]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // prevent card focus
      const index = parseInt((btn as HTMLElement).dataset.fixIndex!, 10);
      const issue = lastAnalyzeIssues[index];
      if (!issue) return;

      (btn as HTMLButtonElement).disabled = true;
      (btn as HTMLButtonElement).textContent = "⏳ Fixing...";
      removeFixError(index);

      parent.postMessage({
        pluginMessage: {
          type: "fixAnalyzeIssue",
          issue: {
            nodeId: issue.nodeId,
            nodeName: issue.nodeName,
            nodeType: issue.nodeType,
            kind: issue.kind,
            suggestion: issue.suggestion,
            width: issue.width,
            height: issue.height,
          },
          index,
        },
      }, "*");
    });
  });
}

// ─── Fix Result Handlers ────────────────────────────────────────────────────

/**
 * Handles a single fix result from the plugin.
 */
export function handleFixAnalyzeIssueResult(response: any): void {
  const result = response.result;
  const index = response.index ?? -1;
  const btn = document.querySelector(`.analyze-fix-btn[data-fix-index="${index}"]`) as HTMLButtonElement | null;

  if (!btn) return;

  if (result.success) {
    btn.textContent = "✅ Fixed";
    btn.classList.add("layout-fix-done");
    btn.disabled = true;
  } else {
    btn.textContent = "🔧 Fix";
    btn.disabled = false;
    showFixError(index, result.error || "Unknown error");
  }
}

/**
 * Handles batch fix result from the plugin.
 */
export function handleFixAllAnalyzeIssuesResult(response: any): void {
  const fixAllBtn = document.getElementById("analyzeFixAllBtn") as HTMLButtonElement | null;
  if (fixAllBtn) {
    fixAllBtn.disabled = false;
    fixAllBtn.textContent = "🔧 Fix All";
  }

  const results: any[] = response.results || [];
  let successCount = 0;
  let failCount = 0;

  // Map results back to global indices
  // The results array corresponds to the fixable issues in order
  let resultIdx = 0;
  for (let i = 0; i < lastAnalyzeIssues.length; i++) {
    const issue = lastAnalyzeIssues[i];
    if (!FIXABLE_KINDS.has(issue.kind)) continue;

    const result = results[resultIdx];
    resultIdx++;
    if (!result) continue;

    const btn = document.querySelector(`.analyze-fix-btn[data-fix-index="${i}"]`) as HTMLButtonElement | null;
    if (!btn) continue;

    if (result.success) {
      successCount++;
      btn.textContent = "✅ Fixed";
      btn.classList.add("layout-fix-done");
      btn.disabled = true;
      removeFixError(i);
    } else {
      failCount++;
      btn.textContent = "🔧 Fix";
      btn.disabled = false;
      showFixError(i, result.error || "Unknown error");
    }
  }

  if (fixAllBtn && successCount > 0) {
    fixAllBtn.textContent = `✅ ${successCount} fixed` + (failCount > 0 ? `, ${failCount} failed` : "");
  }
}

/**
 * Sends all fixable analyze issues for batch fix.
 * Called from the global scope via onclick.
 */
export function fixAllAnalyzeIssues(): void {
  const fixable = lastAnalyzeIssues
    .filter((i) => FIXABLE_KINDS.has(i.kind))
    .map((i) => ({
      nodeId: i.nodeId,
      nodeName: i.nodeName,
      nodeType: i.nodeType,
      kind: i.kind,
      suggestion: i.suggestion,
      width: i.width,
      height: i.height,
    }));

  if (fixable.length === 0) return;

  const fixAllBtn = document.getElementById("analyzeFixAllBtn") as HTMLButtonElement | null;
  if (fixAllBtn) {
    fixAllBtn.disabled = true;
    fixAllBtn.textContent = "⏳ Fixing...";
  }

  // Disable all individual fix buttons
  document.querySelectorAll(".analyze-fix-btn").forEach((btn) => {
    (btn as HTMLButtonElement).disabled = true;
  });

  parent.postMessage({
    pluginMessage: {
      type: "fixAllAnalyzeIssues",
      issues: fixable,
    },
  }, "*");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function showFixError(index: number, message: string): void {
  removeFixError(index);
  const btn = document.querySelector(`.analyze-fix-btn[data-fix-index="${index}"]`) as HTMLElement | null;
  if (!btn) return;
  const errEl = document.createElement("div");
  errEl.className = "layout-fix-error";
  errEl.dataset.fixErrorIndex = String(index);
  errEl.textContent = `❌ ${message}`;
  btn.insertAdjacentElement("afterend", errEl);
}

function removeFixError(index: number): void {
  const existing = document.querySelector(`.layout-fix-error[data-fix-error-index="${index}"]`);
  if (existing) existing.remove();
}

function getIssueIcon(issue: string): string {
  switch (issue) {
    case "default_name": return "🏷️";
    case "turkish_chars": return "🇹🇷";
    case "case_inconsistency": return "🔀";
    default: return "⚠️";
  }
}

function buildAccordion(id: string, title: string, count: number, content: string): string {
  return `
    <div class="accordion">
      <div class="accordion-header">
        <span>${title} <span class="badge">${count}</span></span>
        <span class="chevron">▼</span>
      </div>
      <div class="accordion-body" id="accordion-${id}">
        ${content}
      </div>
    </div>
  `;
}

function buildIssueCard(
  icon: string,
  name: string,
  type: string,
  nodeId: string,
  description: string,
  suggestion: string | undefined,
  globalIndex: number,
  kind: string
): string {
  const isFixable = FIXABLE_KINDS.has(kind);
  const fixBtnHtml = isFixable
    ? `<button class="layout-fix-btn analyze-fix-btn" data-fix-index="${globalIndex}">🔧 Fix</button>`
    : "";

  return `
    <div class="issue-card" data-node-id="${escapeHtml(nodeId)}" title="Click to focus in Figma">
      <div class="issue-header">
        <span class="issue-icon">${icon}</span>
        <div class="issue-meta">
          <span class="issue-name">${escapeHtml(name)}</span>
          <span class="issue-type">${escapeHtml(type)}</span>
        </div>
        <span class="issue-focus-hint">🎯</span>
      </div>
      <div class="issue-desc">${escapeHtml(description)}</div>
      ${suggestion ? `<div class="issue-suggestion">💡 ${escapeHtml(suggestion)}</div>` : ""}
      ${fixBtnHtml}
    </div>
  `;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
