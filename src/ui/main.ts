// ============================================================================
// Fixma UI - Entry Point
// Wires up all tab event handlers and message routing
// ============================================================================

import { exportPageJSON, handleExportResult } from "./export";
import { runAnalysis, handleAnalyzeResult, downloadAnalysisReport } from "./analyze";
import {
  runLayoutScan,
  handleLayoutResult,
  handleLoadLayoutConfig,
  handleSaveLayoutConfig,
  saveLayoutConfig,
  resetLayoutConfig,
  toggleLayoutConfig,
  initLayoutTab,
  handleFixLayoutIssueResult,
  handleFixAllLayoutIssuesResult,
  fixAllLayoutIssues,
} from "./layout";
import {
  handleFixAnalyzeIssueResult,
  handleFixAllAnalyzeIssuesResult,
  fixAllAnalyzeIssues as fixAllAnalyze,
} from "./analyze";
import {
  runComponentScan,
  handleScanResult,
  runConvert,
  handleConvertResult,
  convertAllComponents,
  runCombineAsVariants,
  handleGetSelectionResult,
  handleCombineAsVariantsResult,
} from "./components";

// ── Expose functions to global scope for inline onclick handlers ──────────
(window as any).exportPageJSON = exportPageJSON;
(window as any).runAnalysis = runAnalysis;
(window as any).downloadAnalysisReport = downloadAnalysisReport;
(window as any).runLayoutScan         = runLayoutScan;
(window as any).toggleLayoutConfig    = toggleLayoutConfig;
(window as any).saveLayoutConfig      = saveLayoutConfig;
(window as any).resetLayoutConfig     = resetLayoutConfig;
(window as any).fixAllLayoutIssues    = fixAllLayoutIssues;
(window as any).fixAllAnalyzeIssues   = fixAllAnalyze;
(window as any).runComponentScan = runComponentScan;
(window as any).runConvert = runConvert;
(window as any).convertAllComponents = convertAllComponents;
(window as any).runCombineAsVariants = runCombineAsVariants;

// ── Tab switching ─────────────────────────────────────────────────────────
let layoutTabInitialized = false;

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

  // Load config from storage on first visit to Layout tab
  if (tabName === "layout" && !layoutTabInitialized) {
    layoutTabInitialized = true;
    initLayoutTab();
  }
}

(window as any).switchTab = switchTab;

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
    case "analyzeLayoutResult":
      handleLayoutResult(response);
      break;
    case "loadLayoutConfigResult":
      handleLoadLayoutConfig(response);
      break;
    case "saveLayoutConfigResult":
      handleSaveLayoutConfig(response);
      break;
    case "fixLayoutIssueResult":
      handleFixLayoutIssueResult(response);
      break;
    case "fixAllLayoutIssuesResult":
      handleFixAllLayoutIssuesResult(response);
      break;
    case "fixAnalyzeIssueResult":
      handleFixAnalyzeIssueResult(response);
      break;
    case "fixAllAnalyzeIssuesResult":
      handleFixAllAnalyzeIssuesResult(response);
      break;
    case "scanComponentsResult":
      handleScanResult(response);
      break;
    case "convertComponentsResult":
      handleConvertResult(response);
      break;
    case "getSelectionResult":
      handleGetSelectionResult(response);
      break;
    case "combineAsVariantsResult":
      handleCombineAsVariantsResult(response);
      break;
  }
};
