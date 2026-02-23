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
 * Initiates document analysis
 */
export function runAnalysis(): void {
  const scopeInput = document.querySelector(
    'input[name="analyzeScope"]:checked'
  ) as HTMLInputElement;
  const scope = scopeInput ? scopeInput.value : "current";

  const btn = document.getElementById("analyzeBtn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "⏳ Scanning...";

  const resultsEl = document.getElementById("analyzeResults")!;
  resultsEl.innerHTML = '<div class="analyze-empty">⏳ Scanning page...</div>';

  parent.postMessage(
    { pluginMessage: { type: "analyzeDocument", scope } },
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
  const { namingIssues, componentCandidates, safeAreaIssues, totalIssues, scannedNodes } = data;

  // Store for download and enable button
  lastAnalysisData = data;
  const downloadBtn = document.getElementById("downloadReportBtn") as HTMLButtonElement;
  if (downloadBtn) downloadBtn.disabled = false;

  // Summary stats
  document.getElementById("analyzedNodes")!.textContent = String(scannedNodes);
  document.getElementById("analyzedIssues")!.textContent = String(totalIssues);
  document.getElementById("analyzedNaming")!.textContent = String(namingIssues.length);
  document.getElementById("analyzedComponents")!.textContent = String(componentCandidates.length);
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

  // ── Component Candidates ───────────────────────────────────────────────
  if (componentCandidates.length > 0) {
    html += buildAccordion(
      "components",
      `🧩 Component Candidates`,
      componentCandidates.length,
      componentCandidates
        .map((c: any) => buildIssueCard(
          "🔁",
          c.groupName,
          `${c.nodeIds.length} node`,
          c.nodeIds[0],
          c.reason,
          `Nodes: ${c.nodeNames.slice(0, 3).join(", ")}${c.nodeNames.length > 3 ? "..." : ""}`
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
          getSafeAreaIcon(issue.issue),
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
}

function getIssueIcon(issue: string): string {
  switch (issue) {
    case "default_name": return "🏷️";
    case "turkish_chars": return "🇹🇷";
    case "case_inconsistency": return "🔀";
    default: return "⚠️";
  }
}

function getSafeAreaIcon(_issue: string): string {
  return "📱";
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
  id: string,
  description: string,
  suggestion?: string
): string {
  return `
    <div class="issue-card">
      <div class="issue-header">
        <span class="issue-icon">${icon}</span>
        <div class="issue-meta">
          <span class="issue-name">${escapeHtml(name)}</span>
          <span class="issue-type">${escapeHtml(type)} · ${escapeHtml(id)}</span>
        </div>
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
