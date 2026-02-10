// ============================================================================
// FigmaOrganizer UI - Entry Point
// Wires up export event handlers
// ============================================================================

import { exportPageJSON, handleExportResult } from "./export";

// Expose functions to global scope for inline onclick handlers in HTML
(window as any).exportPageJSON = exportPageJSON;

// Listen for messages from the Figma plugin
window.onmessage = (event: MessageEvent) => {
  const response = event.data.pluginMessage;
  if (!response) return;

  // Handle export results
  if (response.type === "exportResult") {
    handleExportResult(response);
  }
};
