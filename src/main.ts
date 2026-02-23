// ============================================================================
// FigmaOrganizer - Plugin Entry Point
// All modules are bundled into a single code.js by esbuild at build time
// ============================================================================

import { exportDocumentJSON } from "./export";
import { analyzeDocument } from "./analyze";
import { previewRules, applyRules } from "./apply";
import { scanComponentCandidates, convertGroups } from "./components";

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

  // ── Scan Component Candidates ────────────────────────────────────────────
  if (msg.type === "scanComponents") {
    try {
      const scope = msg.scope || "current";
      const pages: readonly PageNode[] =
        scope === "all" ? figma.root.children : [figma.currentPage];
      const groups = scanComponentCandidates(pages);
      figma.ui.postMessage({
        type: "scanComponentsResult",
        success: true,
        data: groups,
      });
    } catch (error: any) {
      figma.ui.postMessage({
        type: "scanComponentsResult",
        success: false,
        error: error.message || String(error),
      });
    }
  }

  // ── Convert Components ───────────────────────────────────────────────────
  if (msg.type === "convertComponents") {
    try {
      const results = convertGroups(msg.requests || []);
      figma.ui.postMessage({
        type: "convertComponentsResult",
        success: true,
        data: results,
      });
    } catch (error: any) {
      figma.ui.postMessage({
        type: "convertComponentsResult",
        success: false,
        error: error.message || String(error),
      });
    }
  }

  // ── Focus Node ───────────────────────────────────────────────────────────
  if (msg.type === "focusNode") {
    try {
      const node = figma.getNodeById(msg.nodeId) as SceneNode | null;
      if (node) {
        figma.viewport.scrollAndZoomIntoView([node]);
        figma.currentPage.selection = [node];
      }
    } catch (_) {
      // silently ignore — node may have been deleted
    }
  }
};
