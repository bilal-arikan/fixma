// ============================================================================
// FigmaOrganizer - Plugin Entry Point
// All modules are bundled into a single code.js by esbuild at build time
// ============================================================================

import { exportDocumentJSON } from "./export";

// Show the plugin UI
figma.showUI(__html__, {
  width: 600,
  height: 700,
});

// UI message handler
figma.ui.onmessage = (msg: any) => {
  if (msg.type === "exportPageJSON") {
    try {
      const scope = msg.scope || "current";
      const includeGeometry = msg.includeGeometry !== false;
      const { exportData, totalNodes } = exportDocumentJSON(
        scope,
        includeGeometry
      );
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
};
