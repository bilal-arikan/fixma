// ============================================================================
// FigmaOrganizer - Plugin Entry Point
// All modules are bundled into a single code.js by esbuild at build time
// ============================================================================

import { exportDocumentJSON } from "./export";
import { analyzeDocument } from "./analyze";
import { checkLayout } from "./analyze/layout";
import {
  DEFAULT_LAYOUT_CONFIG,
  LAYOUT_CONFIG_STORAGE_KEY,
  mergeWithDefaults,
} from "./analyze/layoutConfig";
import { previewRules, applyRules } from "./apply";
import { fixLayoutIssue, fixAllLayoutIssues } from "./apply/layoutFix";
import { scanComponentCandidates, convertGroups, combineAsVariants } from "./components";

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
      const checks = {
        naming:      msg.checks?.naming      !== false,
        safeArea:    msg.checks?.safeArea    !== false,
        layout:      msg.checks?.layout      !== false,
        emptyFrames: msg.checks?.emptyFrames !== false,
        zeroSize:    msg.checks?.zeroSize    !== false,
      };
      const result = analyzeDocument(scope, checks);
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
      const includeProtected = msg.includeProtected === true;
      const pages: readonly PageNode[] =
        scope === "all" ? figma.root.children : [figma.currentPage];
      const groups = scanComponentCandidates(pages, includeProtected);
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

      // Focus all successfully created master components
      const createdNodes: SceneNode[] = [];
      for (const r of results) {
        if (r.componentId) {
          const node = figma.getNodeById(r.componentId) as SceneNode | null;
          if (node) createdNodes.push(node);
        }
      }
      if (createdNodes.length > 0) {
        figma.currentPage.selection = createdNodes;
        figma.viewport.scrollAndZoomIntoView(createdNodes);
      }

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

  // ── Get Current Selection ─────────────────────────────────────────────────
  if (msg.type === "getSelection") {
    try {
      const selection = figma.currentPage.selection;
      const nodeIds = selection.map((n) => n.id);
      figma.ui.postMessage({
        type: "getSelectionResult",
        success: true,
        nodeIds,
      });
    } catch (error: any) {
      figma.ui.postMessage({
        type: "getSelectionResult",
        success: false,
        nodeIds: [],
        error: error.message || String(error),
      });
    }
  }

  // ── Combine Selected as Variants ─────────────────────────────────────────
  if (msg.type === "combineAsVariants") {
    try {
      const result = combineAsVariants({
        nodeIds: msg.nodeIds || [],
        componentSetName: msg.componentSetName,
        propertyName: msg.propertyName,
      });

      // Focus the created ComponentSet
      if (result.success && result.componentSetId) {
        const node = figma.getNodeById(result.componentSetId) as SceneNode | null;
        if (node) {
          figma.currentPage.selection = [node];
          figma.viewport.scrollAndZoomIntoView([node]);
        }
      }

      figma.ui.postMessage({
        type: "combineAsVariantsResult",
        success: result.success,
        data: result,
      });
    } catch (error: any) {
      figma.ui.postMessage({
        type: "combineAsVariantsResult",
        success: false,
        error: error.message || String(error),
      });
    }
  }

  // ── Analyze Layout ───────────────────────────────────────────────────────
  if (msg.type === "analyzeLayout") {
    (async () => {
      try {
        const scope = msg.scope || "current";
        const pages: readonly PageNode[] =
          scope === "all" ? figma.root.children : [figma.currentPage];

        // Load stored config and merge with defaults
        const stored = await figma.clientStorage.getAsync(LAYOUT_CONFIG_STORAGE_KEY);
        const config = stored ? mergeWithDefaults(stored) : DEFAULT_LAYOUT_CONFIG;

        const issues = checkLayout(pages, config);
        figma.ui.postMessage({
          type: "analyzeLayoutResult",
          success: true,
          data: issues,
          config,          // send active config back so UI can show it
        });
      } catch (error: any) {
        figma.ui.postMessage({
          type: "analyzeLayoutResult",
          success: false,
          error: error.message || String(error),
        });
      }
    })();
  }

  // ── Load Layout Config ───────────────────────────────────────────────────
  if (msg.type === "loadLayoutConfig") {
    (async () => {
      try {
        const stored = await figma.clientStorage.getAsync(LAYOUT_CONFIG_STORAGE_KEY);
        const config = stored ? mergeWithDefaults(stored) : DEFAULT_LAYOUT_CONFIG;
        figma.ui.postMessage({ type: "loadLayoutConfigResult", success: true, config });
      } catch (error: any) {
        figma.ui.postMessage({
          type: "loadLayoutConfigResult",
          success: false,
          config: DEFAULT_LAYOUT_CONFIG,
          error: error.message || String(error),
        });
      }
    })();
  }

  // ── Save Layout Config ───────────────────────────────────────────────────
  if (msg.type === "saveLayoutConfig") {
    (async () => {
      try {
        const config = mergeWithDefaults(msg.config ?? {});
        await figma.clientStorage.setAsync(LAYOUT_CONFIG_STORAGE_KEY, config);
        figma.ui.postMessage({ type: "saveLayoutConfigResult", success: true, config });
      } catch (error: any) {
        figma.ui.postMessage({
          type: "saveLayoutConfigResult",
          success: false,
          error: error.message || String(error),
        });
      }
    })();
  }

  // ── Reset Layout Config ──────────────────────────────────────────────────
  if (msg.type === "resetLayoutConfig") {
    (async () => {
      try {
        await figma.clientStorage.setAsync(LAYOUT_CONFIG_STORAGE_KEY, DEFAULT_LAYOUT_CONFIG);
        figma.ui.postMessage({
          type: "saveLayoutConfigResult",
          success: true,
          config: DEFAULT_LAYOUT_CONFIG,
        });
      } catch (error: any) {
        figma.ui.postMessage({
          type: "saveLayoutConfigResult",
          success: false,
          error: error.message || String(error),
        });
      }
    })();
  }

  // ── Fix Layout Issue (single) ────────────────────────────────────────────
  if (msg.type === "fixLayoutIssue") {
    try {
      const result = fixLayoutIssue(msg.issue);
      figma.ui.postMessage({ type: "fixLayoutIssueResult", result });
    } catch (error: any) {
      figma.ui.postMessage({
        type: "fixLayoutIssueResult",
        result: {
          nodeId: msg.issue?.nodeId ?? "",
          nodeName: msg.issue?.nodeName ?? "",
          kind: msg.issue?.kind ?? "",
          success: false,
          error: error.message || String(error),
          detail: "",
        },
      });
    }
  }

  // ── Fix All Layout Issues ──────────────────────────────────────────────
  if (msg.type === "fixAllLayoutIssues") {
    try {
      const results = fixAllLayoutIssues(msg.issues);
      figma.ui.postMessage({ type: "fixAllLayoutIssuesResult", results });
    } catch (error: any) {
      figma.ui.postMessage({
        type: "fixAllLayoutIssuesResult",
        results: [],
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
