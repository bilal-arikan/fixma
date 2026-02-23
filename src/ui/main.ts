// ============================================================================
// FigmaOrganizer UI - Entry Point
// Wires up all tab event handlers and message routing
// ============================================================================

import { exportPageJSON, handleExportResult } from "./export";
import { runAnalysis, handleAnalyzeResult, downloadAnalysisReport } from "./analyze";
import {
  handleRulesUpload,
  previewRulesUI,
  applyRulesUI,
  handlePreviewResult,
  handleApplyResult,
} from "./edit";
import {
  runComponentScan,
  handleScanResult,
  runConvert,
  handleConvertResult,
} from "./components";

// ── Expose functions to global scope for inline onclick handlers ──────────
(window as any).exportPageJSON = exportPageJSON;
(window as any).runAnalysis = runAnalysis;
(window as any).downloadAnalysisReport = downloadAnalysisReport;
(window as any).previewRulesUI = previewRulesUI;
(window as any).applyRulesUI = applyRulesUI;
(window as any).runComponentScan = runComponentScan;
(window as any).runConvert = runConvert;

// ── Tab switching ─────────────────────────────────────────────────────────
function switchTab(tabName: string): void {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    (panel as HTMLElement).style.display = "none";
  });

  const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
  const activePanel = document.getElementById(`tab-${tabName}`);
  if (activeBtn) activeBtn.classList.add("active");
  if (activePanel) activePanel.style.display = "block";
}

(window as any).switchTab = switchTab;

// ── Rules file upload handler ─────────────────────────────────────────────
const rulesInput = document.getElementById("rulesFileInput") as HTMLInputElement | null;
if (rulesInput) {
  rulesInput.addEventListener("change", handleRulesUpload);
}

// ── Listen for messages from the Figma plugin ─────────────────────────────
window.onmessage = (event: MessageEvent) => {
  const response = event.data.pluginMessage;
  if (!response) return;

  switch (response.type) {
    case "exportResult":
      handleExportResult(response);
      break;
    case "analyzeResult":
      handleAnalyzeResult(response);
      break;
    case "previewResult":
      handlePreviewResult(response);
      break;
    case "applyResult":
      handleApplyResult(response);
      break;
    case "scanComponentsResult":
      handleScanResult(response);
      break;
    case "convertComponentsResult":
      handleConvertResult(response);
      break;
  }
};
