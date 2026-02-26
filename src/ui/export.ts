// ============================================================================
// Fixma UI - Export Tab Logic
// ============================================================================

/**
 * Initiates the Figma page JSON export
 */
export function exportPageJSON(): void {
  const scopeInput = document.querySelector(
    'input[name="exportScope"]:checked'
  ) as HTMLInputElement;
  const scope = scopeInput ? scopeInput.value : "current";
  const includeGeometry = (
    document.getElementById("exportGeometry") as HTMLInputElement
  ).checked;

  // Show loading state
  const statusDiv = document.getElementById("exportStatus")!;
  statusDiv.classList.remove("empty");
  statusDiv.textContent = "⏳ Scanning Figma page...";

  const exportBtn = document.getElementById("exportBtn") as HTMLButtonElement;
  exportBtn.disabled = true;
  exportBtn.textContent = "⏳ Exporting...";

  // Send export request to plugin
  parent.postMessage(
    {
      pluginMessage: {
        type: "exportPageJSON",
        scope: scope,
        includeGeometry: includeGeometry,
      },
    },
    "*"
  );
}

/**
 * Handles the export result message from the plugin
 */
export function handleExportResult(response: any): void {
  const exportBtn = document.getElementById("exportBtn") as HTMLButtonElement;
  exportBtn.disabled = false;
  exportBtn.textContent = "📦 Export JSON";

  const statusDiv = document.getElementById("exportStatus")!;

  if (!response.success) {
    statusDiv.textContent =
      "❌ Export error: " + (response.error || "Unknown error");
    return;
  }

  const data = response.data;
  const jsonStr = JSON.stringify(data, null, "\t");
  const fileSizeBytes = new Blob([jsonStr]).size;
  const fileSize =
    fileSizeBytes > 1024 * 1024
      ? (fileSizeBytes / (1024 * 1024)).toFixed(1) + " MB"
      : (fileSizeBytes / 1024).toFixed(1) + " KB";

  // Update stats
  const pageCount = data.document?.children?.length || 0;
  const compCount = Object.keys(data.components || {}).length;
  const totalNodes = response.totalNodes || 0;

  document.getElementById("exportNodeCount")!.textContent = String(totalNodes);
  document.getElementById("exportPageCount")!.textContent = String(pageCount);
  document.getElementById("exportCompCount")!.textContent = String(compCount);
  document.getElementById("exportFileSize")!.textContent = fileSize;

  // Build status text
  let statusText = "✅ EXPORT COMPLETED\n";
  statusText += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
  statusText += "📄 Document: " + data.name + "\n";
  statusText += "📚 Pages: " + pageCount + "\n";

  if (data.document?.children) {
    data.document.children.forEach(function (page: any, i: number) {
      const childCount = page.children ? page.children.length : 0;
      statusText +=
        "   " +
        (i + 1) +
        ". " +
        page.name +
        " (" +
        childCount +
        " top-level nodes)\n";
    });
  }

  statusText += "\n🎨 Components: " + compCount + "\n";
  statusText += "📏 File Size: " + fileSize + "\n";
  statusText += "⏰ Exported: " + new Date().toLocaleTimeString() + "\n";
  statusText += "\n💾 Downloading JSON file...";

  statusDiv.textContent = statusText;

  // Download the JSON file
  const fileName = data.name
    ? data.name.replace(/[^a-z0-9_-]/gi, "_").toLowerCase()
    : "figma-export";
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    fileName + "-" + new Date().toISOString().split("T")[0] + ".json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
