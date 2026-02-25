// ============================================================================
// FigmaOrganizer UI - Layout Tab Logic
// ============================================================================

import type { LayoutIssue, LayoutIssueKind, LayoutIssueSeverity } from "../analyze/layout";
import type { LayoutConfig } from "../analyze/layoutConfig";
import { DEFAULT_LAYOUT_CONFIG } from "../analyze/layoutConfig";

// ─── State ──────────────────────────────────────────────────────────────────

let lastLayoutData: LayoutIssue[] | null = null;
let currentConfig: LayoutConfig = DEFAULT_LAYOUT_CONFIG;

// ─── Severity / Kind metadata ────────────────────────────────────────────────

const SEVERITY_ICON: Record<LayoutIssueSeverity, string> = {
  high:   "🔴",
  medium: "🟡",
};

const SEVERITY_LABEL: Record<LayoutIssueSeverity, string> = {
  high:   "High",
  medium: "Medium",
};

const KIND_ICON: Record<LayoutIssueKind, string> = {
  corner_constraint_mismatch: "📌",
  edge_constraint_mismatch:   "📌",
  both_edges_not_stretch:     "↔️",
  wide_not_fill:              "↔️",
  tall_not_fill:              "↕️",
  centered_h_not_center:      "⬌",
  centered_v_not_center:      "⬍",
  sibling_fill_candidate:     "🔲",
  full_bleed_not_stretch:     "⬜",
};

const KIND_LABEL: Record<LayoutIssueKind, string> = {
  corner_constraint_mismatch: "Corner Constraint",
  edge_constraint_mismatch:   "Edge Constraint",
  both_edges_not_stretch:     "Both Edges — Not Stretch",
  wide_not_fill:              "Wide — Not Fill",
  tall_not_fill:              "Tall — Not Fill",
  centered_h_not_center:      "Centered H — No CENTER",
  centered_v_not_center:      "Centered V — No CENTER",
  sibling_fill_candidate:     "Sibling Fill Candidate",
  full_bleed_not_stretch:     "Full Bleed — Not Stretch",
};

const KIND_ORDER: LayoutIssueKind[] = [
  "corner_constraint_mismatch",
  "edge_constraint_mismatch",
  "both_edges_not_stretch",
  "sibling_fill_candidate",
  "wide_not_fill",
  "tall_not_fill",
  "full_bleed_not_stretch",
  "centered_h_not_center",
  "centered_v_not_center",
];

// ─── Init ────────────────────────────────────────────────────────────────────

/**
 * Called once when the Layout tab is first opened.
 * Loads stored config from the plugin backend.
 */
export function initLayoutTab(): void {
  parent.postMessage({ pluginMessage: { type: "loadLayoutConfig" } }, "*");
}

// ─── Scan ────────────────────────────────────────────────────────────────────

/**
 * Called when the user clicks "Scan Layout".
 */
export function runLayoutScan(): void {
  const scopeInput = document.querySelector(
    'input[name="layoutScope"]:checked'
  ) as HTMLInputElement | null;
  const scope = scopeInput ? scopeInput.value : "current";

  const btn = document.getElementById("layoutScanBtn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "⏳ Scanning...";

  const resultsEl = document.getElementById("layoutResults")!;
  resultsEl.innerHTML = '<div class="analyze-empty">⏳ Scanning layout…</div>';

  parent.postMessage(
    { pluginMessage: { type: "analyzeLayout", scope } },
    "*"
  );
}

export function handleLayoutResult(response: any): void {
  const btn = document.getElementById("layoutScanBtn") as HTMLButtonElement;
  btn.disabled = false;
  btn.textContent = "📐 Scan Layout";

  const resultsEl = document.getElementById("layoutResults")!;

  if (!response.success) {
    resultsEl.innerHTML = `<div class="analyze-empty">❌ Error: ${escapeHtml(response.error || "Unknown error")}</div>`;
    return;
  }

  // Update local config if backend echoed it back
  if (response.config) {
    currentConfig = response.config;
    populateConfigPanel(currentConfig);
  }

  const issues: LayoutIssue[] = response.data ?? [];
  lastLayoutData = issues;

  const highCount   = issues.filter((i) => i.severity === "high").length;
  const mediumCount = issues.filter((i) => i.severity === "medium").length;

  (document.getElementById("layoutTotal")  as HTMLElement).textContent = String(issues.length);
  (document.getElementById("layoutHigh")   as HTMLElement).textContent = String(highCount);
  (document.getElementById("layoutMedium") as HTMLElement).textContent = String(mediumCount);

  if (issues.length === 0) {
    resultsEl.innerHTML = '<div class="analyze-empty">✅ No layout issues found! Constraints look good.</div>';
    return;
  }

  const grouped = new Map<LayoutIssueKind, LayoutIssue[]>();
  for (const kind of KIND_ORDER) grouped.set(kind, []);
  for (const issue of issues) {
    if (!grouped.has(issue.kind)) grouped.set(issue.kind, []);
    grouped.get(issue.kind)!.push(issue);
  }

  let html = "";
  for (const [kind, group] of grouped) {
    if (group.length === 0) continue;
    const icon  = KIND_ICON[kind] ?? "⚠️";
    const label = KIND_LABEL[kind] ?? kind;
    html += buildAccordion(
      `layout-${kind}`,
      `${icon} ${label}`,
      group.length,
      group.map((issue) => buildLayoutCard(issue, issues.indexOf(issue))).join("")
    );
  }

  resultsEl.innerHTML = html;

  resultsEl.querySelectorAll(".accordion-header").forEach((header) => {
    header.addEventListener("click", () => {
      const body   = header.nextElementSibling as HTMLElement;
      const isOpen = body.style.display !== "none";
      body.style.display = isOpen ? "none" : "block";
      const chevron = header.querySelector(".chevron") as HTMLElement;
      if (chevron) chevron.textContent = isOpen ? "▶" : "▼";
    });
  });

  resultsEl.querySelectorAll(".issue-card[data-node-id]").forEach((card) => {
    card.addEventListener("click", () => {
      const nodeId = (card as HTMLElement).dataset.nodeId;
      if (nodeId) {
        parent.postMessage({ pluginMessage: { type: "focusNode", nodeId } }, "*");
      }
    });
  });

  // ── Fix button listeners ──────────────────────────────────────────────
  resultsEl.querySelectorAll(".layout-fix-btn[data-fix-index]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt((btn as HTMLElement).dataset.fixIndex ?? "", 10);
      if (isNaN(idx) || !lastLayoutData || !lastLayoutData[idx]) return;
      (btn as HTMLButtonElement).disabled = true;
      (btn as HTMLButtonElement).textContent = "⏳…";
      parent.postMessage({
        pluginMessage: { type: "fixLayoutIssue", issue: lastLayoutData[idx] },
      }, "*");
    });
  });

  // ── Fix All button visibility ─────────────────────────────────────────
  const fixAllBtn = document.getElementById("layoutFixAllBtn") as HTMLButtonElement | null;
  if (fixAllBtn) {
    fixAllBtn.style.display = issues.length > 0 ? "block" : "none";
    fixAllBtn.disabled = false;
    fixAllBtn.textContent = `🔧 Fix All (${issues.length})`;
  }
}

// ─── Fix Result Handlers ─────────────────────────────────────────────────────

export function handleFixLayoutIssueResult(response: any): void {
  const result = response.result;
  if (!result) return;

  const resultsEl = document.getElementById("layoutResults")!;

  const cards = resultsEl.querySelectorAll(`.issue-card[data-node-id="${result.nodeId}"]`);
  cards.forEach((card) => {
    const btn = card.querySelector(".layout-fix-btn") as HTMLButtonElement | null;
    if (result.success) {
      if (btn) {
        btn.textContent = "✅ Fixed";
        btn.disabled = true;
        btn.classList.add("layout-fix-done");
      }
      (card as HTMLElement).style.opacity = "0.5";
      removeFixError(card as HTMLElement);
    } else {
      if (btn) {
        btn.textContent = "🔧 Fix";
        btn.disabled = false;
      }
      showFixError(card as HTMLElement, result.error || "Unknown error");
    }
  });
}

export function handleFixAllLayoutIssuesResult(response: any): void {
  const results: any[] = response.results ?? [];
  const successCount = results.filter((r: any) => r.success).length;
  const failCount = results.filter((r: any) => !r.success).length;

  const resultsEl = document.getElementById("layoutResults")!;

  // Update individual cards
  for (const result of results) {
    const cards = resultsEl.querySelectorAll(`.issue-card[data-node-id="${result.nodeId}"]`);
    cards.forEach((card) => {
      const btn = card.querySelector(".layout-fix-btn") as HTMLButtonElement | null;
      if (result.success) {
        if (btn) {
          btn.textContent = "✅ Fixed";
          btn.disabled = true;
          btn.classList.add("layout-fix-done");
        }
        (card as HTMLElement).style.opacity = "0.5";
        removeFixError(card as HTMLElement);
      } else {
        if (btn) {
          btn.textContent = "🔧 Fix";
          btn.disabled = false;
        }
        showFixError(card as HTMLElement, result.error || "Unknown error");
      }
    });
  }

  // Update Fix All button
  const fixAllBtn = document.getElementById("layoutFixAllBtn") as HTMLButtonElement | null;
  if (fixAllBtn) {
    if (failCount === 0) {
      fixAllBtn.textContent = `✅ All Fixed (${successCount})`;
      fixAllBtn.disabled = true;
    } else {
      fixAllBtn.textContent = `⚠️ ${successCount} fixed, ${failCount} failed`;
      fixAllBtn.disabled = false;
    }
  }
}

/**
 * Called when the user clicks "Fix All".
 */
export function fixAllLayoutIssues(): void {
  if (!lastLayoutData || lastLayoutData.length === 0) return;

  const fixAllBtn = document.getElementById("layoutFixAllBtn") as HTMLButtonElement | null;
  if (fixAllBtn) {
    fixAllBtn.disabled = true;
    fixAllBtn.textContent = "⏳ Fixing…";
  }

  parent.postMessage({
    pluginMessage: { type: "fixAllLayoutIssues", issues: lastLayoutData },
  }, "*");
}

// ─── Config panel ────────────────────────────────────────────────────────────

/** Toggle config panel visibility */
export function toggleLayoutConfig(): void {
  const panel = document.getElementById("layoutConfigPanel") as HTMLElement;
  const btn   = document.getElementById("layoutConfigToggle") as HTMLButtonElement;
  const isHidden = panel.style.display === "none" || panel.style.display === "";
  panel.style.display = isHidden ? "block" : "none";
  btn.textContent = isHidden ? "▲ Hide Config" : "⚙️ Config";
}

/** Populate all config panel inputs from a LayoutConfig object */
export function populateConfigPanel(cfg: LayoutConfig): void {
  currentConfig = cfg;

  setNum("cfgEdgeProximity",   cfg.edgeProximityRatio);
  setNum("cfgFillRatio",       cfg.fillRatio);
  setNum("cfgFullBleedRatio",  cfg.fullBleedRatio);
  setNum("cfgCenterTolerance", cfg.centerTolerancePx);

  setChk("cfgOnlyDefaults",   cfg.onlyDefaults);

  setChk("cfgCheckCorner",    cfg.checks.cornerConstraint);
  setChk("cfgCheckEdge",      cfg.checks.edgeConstraint);
  setChk("cfgCheckSibling",   cfg.checks.siblingFill);
  setChk("cfgCheckWideTall",  cfg.checks.wideTall);
  setChk("cfgCheckFullBleed", cfg.checks.fullBleed);
  setChk("cfgCheckCentered",  cfg.checks.centeredNotCenter);
}

/** Called when backend sends the loaded config */
export function handleLoadLayoutConfig(response: any): void {
  if (response.config) populateConfigPanel(response.config);
}

/** Reads current panel values and sends saveLayoutConfig to backend */
export function saveLayoutConfig(): void {
  const cfg: LayoutConfig = {
    edgeProximityRatio: getNum("cfgEdgeProximity",   DEFAULT_LAYOUT_CONFIG.edgeProximityRatio),
    fillRatio:          getNum("cfgFillRatio",        DEFAULT_LAYOUT_CONFIG.fillRatio),
    fullBleedRatio:     getNum("cfgFullBleedRatio",   DEFAULT_LAYOUT_CONFIG.fullBleedRatio),
    centerTolerancePx:  getNum("cfgCenterTolerance",  DEFAULT_LAYOUT_CONFIG.centerTolerancePx),
    onlyDefaults:       getChk("cfgOnlyDefaults"),
    checks: {
      cornerConstraint:  getChk("cfgCheckCorner"),
      edgeConstraint:    getChk("cfgCheckEdge"),
      siblingFill:       getChk("cfgCheckSibling"),
      wideTall:          getChk("cfgCheckWideTall"),
      fullBleed:         getChk("cfgCheckFullBleed"),
      centeredNotCenter: getChk("cfgCheckCentered"),
    },
  };

  currentConfig = cfg;
  parent.postMessage({ pluginMessage: { type: "saveLayoutConfig", config: cfg } }, "*");

  // Visual feedback
  const btn = document.getElementById("layoutConfigSaveBtn") as HTMLButtonElement;
  const orig = btn.textContent ?? "Save";
  btn.textContent = "✅ Saved!";
  btn.disabled = true;
  setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
}

/** Sends resetLayoutConfig to backend, then repopulates panel */
export function resetLayoutConfig(): void {
  parent.postMessage({ pluginMessage: { type: "resetLayoutConfig" } }, "*");
}

/** Called when backend confirms save/reset */
export function handleSaveLayoutConfig(response: any): void {
  if (response.config) populateConfigPanel(response.config);
}

// ─── DOM helpers ─────────────────────────────────────────────────────────────

function setNum(id: string, val: number): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.value = String(val);
}

function getNum(id: string, fallback: number): number {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (!el) return fallback;
  const v = parseFloat(el.value);
  return isNaN(v) ? fallback : v;
}

function setChk(id: string, val: boolean): void {
  const el = document.getElementById(id) as HTMLInputElement | null;
  if (el) el.checked = val;
}

function getChk(id: string): boolean {
  const el = document.getElementById(id) as HTMLInputElement | null;
  return el ? el.checked : true;
}

// ─── Card / accordion builders ───────────────────────────────────────────────

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

function buildLayoutCard(issue: LayoutIssue, index: number): string {
  const sevIcon = SEVERITY_ICON[issue.severity] ?? "⚠️";

  return `
    <div class="issue-card layout-card-${issue.severity}" data-node-id="${escapeHtml(issue.nodeId)}" data-issue-index="${index}" title="Click to focus in Figma">
      <div class="issue-header">
        <span class="issue-icon">${sevIcon}</span>
        <div class="issue-meta">
          <span class="issue-name">${escapeHtml(issue.nodeName)}</span>
          <span class="issue-type">${escapeHtml(issue.nodeType)} · in "${escapeHtml(issue.parentName)}"</span>
        </div>
        <span class="issue-focus-hint">🎯</span>
      </div>
      <div class="issue-desc">${escapeHtml(issue.description)}</div>
      <div class="layout-diff-row">
        <span class="layout-diff-label">Now:</span>
        <span class="layout-diff-actual">${escapeHtml(issue.actual)}</span>
        <span class="layout-diff-label">→</span>
        <span class="layout-diff-expected">${escapeHtml(issue.expected)}</span>
      </div>
      <div class="issue-suggestion">💡 ${escapeHtml(issue.suggestion)}</div>
      <button class="layout-fix-btn" data-fix-index="${index}" title="Apply this fix">🔧 Fix</button>
    </div>
  `;
}

function showFixError(card: HTMLElement, message: string): void {
  removeFixError(card);
  const el = document.createElement("div");
  el.className = "layout-fix-error";
  el.textContent = `❌ ${message}`;
  card.appendChild(el);
}

function removeFixError(card: HTMLElement): void {
  const existing = card.querySelector(".layout-fix-error");
  if (existing) existing.remove();
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
