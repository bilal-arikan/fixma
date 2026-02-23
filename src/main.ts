// ============================================================================
// FigmaOrganizer - Plugin Entry Point
// All modules are bundled into a single code.js by esbuild at build time
// ============================================================================

import { exportDocumentJSON } from "./export";
import { analyzeDocument } from "./analyze";
import { previewRules, applyRules } from "./apply";

// Show the plugin UI
figma.showUI(__html__, {
  width: 600,
  height: 700,
});

// UI message handler
figma.ui.onmessage = (msg: any) => {
  // ── Export ──────────────────────────────────────────────────────────────
  if (msg.type === "exportPageJSON") {
    try {
      const scope = msg.scope || "current";
      const includeGeometry = msg.includeGeometry !== false;
      const { exportData, totalNodes } = exportDocumentJSON(scope, includeGeometry);
      figma.ui.postMessage({
        type: "exportResult",
        success: true,
        data: exportData,
        totalNodes: totalNodes,
      });
    } catch (error: any) {
      figma.ui.postMessage({
        type: "exportResult",
        success: false,
        error: error.message || String(error),
      });
    }
  }

  // ── Analyze ─────────────────────────────────────────────────────────────
  if (msg.type === "analyzeDocument") {
    try {
      const scope = msg.scope || "current";
      const result = analyzeDocument(scope);
      figma.ui.postMessage({
        type: "analyzeResult",
        success: true,
        data: result,
      });
    } catch (error: any) {
      figma.ui.postMessage({
        type: "analyzeResult",
        success: false,
        error: error.message || String(error),
      });
    }
  }

  // ── Preview Rules ────────────────────────────────────────────────────────
  if (msg.type === "previewRules") {
    try {
      const result = previewRules(msg.rules || {});
      figma.ui.postMessage({
        type: "previewResult",
        success: true,
        data: result,
      });
    } catch (error: any) {
      figma.ui.postMessage({
        type: "previewResult",
        success: false,
        error: error.message || String(error),
      });
    }
  }

  // ── Apply Rules ──────────────────────────────────────────────────────────
  if (msg.type === "applyRules") {
    try {
      const result = applyRules(msg.rules || {});
      figma.ui.postMessage({
        type: "applyResult",
        success: true,
        data: result,
      });
    } catch (error: any) {
      figma.ui.postMessage({
        type: "applyResult",
        success: false,
        error: error.message || String(error),
      });
    }
  }
};
