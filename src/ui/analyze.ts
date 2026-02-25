// ============================================================================
// FigmaOrganizer UI - Analyze Tab Logic
// ============================================================================

// Stores the last analysis result for download
let lastAnalysisData: any = null;

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

/**
 * Initiates document analysis.
 * Reads scope radio and check-type checkboxes from the UI.
 */
export function runAnalysis(): void {
  const scopeInput = document.querySelector(
    'input[name="analyzeScope"]:checked'
  ) as HTMLInputElement;
  const scope = scopeInput ? scopeInput.value : "current";

  // Read which checks to run
  const checkNamingEl = document.getElementById("analyzeCheckNaming") as HTMLInputElement | null;
  const checkSafeAreaEl = document.getElementById("analyzeCheckSafeArea") as HTMLInputElement | null;
  const checkNaming = checkNamingEl ? checkNamingEl.checked : true;
  const checkSafeArea = checkSafeAreaEl ? checkSafeAreaEl.checked : true;

  const btn = document.getElementById("analyzeBtn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "⏳ Scanning...";

  const resultsEl = document.getElementById("analyzeResults")!;
  resultsEl.innerHTML = '<div class="analyze-empty">⏳ Scanning page...</div>';

  parent.postMessage(
    {
      pluginMessage: {
        type: "analyzeDocument",
        scope,
        checks: { naming: checkNaming, safeArea: checkSafeArea },
      },
    },
    "*"
  );
}

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
    return;
  }

  const data = response.data;
  const { namingIssues, safeAreaIssues, totalIssues, scannedNodes } = data;

  // Store for download and enable button
  lastAnalysisData = data;
  const downloadBtn = document.getElementById("downloadReportBtn") as HTMLButtonElement;
  if (downloadBtn) downloadBtn.disabled = false;

  // Summary stats
  document.getElementById("analyzedNodes")!.textContent = String(scannedNodes);
  document.getElementById("analyzedIssues")!.textContent = String(totalIssues);
  document.getElementById("analyzedNaming")!.textContent = String(namingIssues.length);
  document.getElementById("analyzedSafeArea")!.textContent = String(safeAreaIssues.length);

  if (totalIssues === 0) {
    resultsEl.innerHTML = '<div class="analyze-empty">✅ No issues found! Your page looks clean.</div>';
    return;
  }

  let html = "";

  // ── Naming Issues ──────────────────────────────────────────────────────
  if (namingIssues.length > 0) {
    html += buildAccordion(
      "naming",
      `✏️ Naming Issues`,
      namingIssues.length,
      namingIssues
        .map((issue: any) => buildIssueCard(
          getIssueIcon(issue.issue),
          issue.nodeName,
          issue.nodeType,
          issue.nodeId,
          issue.description,
          issue.suggestion
        ))
        .join("")
    );
  }

  // ── Safe Area Issues ───────────────────────────────────────────────────
  if (safeAreaIssues.length > 0) {
    html += buildAccordion(
      "safearea",
      `📱 Safe Area Issues`,
      safeAreaIssues.length,
      safeAreaIssues
        .map((issue: any) => buildIssueCard(
          "📱",
          issue.nodeName,
          `${issue.nodeType} · ${issue.width}×${issue.height}`,
          issue.nodeId,
          issue.description,
          issue.suggestion
        ))
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
  suggestion?: string
): string {
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
