// ============================================================================
// FigmaOrganizer - Analysis Module Entry Point
// ============================================================================

import { checkNaming, NamingIssue } from "./naming";
import { checkSafeArea, SafeAreaIssue } from "./safeArea";
import { checkLayout, LayoutIssue } from "./layout";
import { checkCleanup, CleanupIssue, CleanupChecks } from "./cleanup";

export { NamingIssue, SafeAreaIssue, LayoutIssue, CleanupIssue };

export interface AnalysisResult {
  namingIssues: NamingIssue[];
  safeAreaIssues: SafeAreaIssue[];
  layoutIssues: LayoutIssue[];
  cleanupIssues: CleanupIssue[];
  totalIssues: number;
  scannedNodes: number;
}

/** Which analysis checks to run */
export interface AnalysisChecks {
  naming: boolean;
  safeArea: boolean;
  layout: boolean;
  emptyFrames: boolean;
  zeroSize: boolean;
}

/**
 * Counts total nodes across all pages
 */
function countAllNodes(pages: readonly PageNode[]): number {
  let count = 0;
  function recurse(node: any) {
    count++;
    if (node.children) {
      for (const child of node.children) recurse(child);
    }
  }
  for (const page of pages) {
    for (const child of page.children) {
      recurse(child);
    }
  }
  return count;
}

/**
 * Runs selected analysis checks on the current document.
 * @param scope   "current" or "all"
 * @param checks  Which checks to run (all enabled by default)
 */
export function analyzeDocument(
  scope: "current" | "all",
  checks: AnalysisChecks = { naming: true, safeArea: true, layout: true, emptyFrames: true, zeroSize: true }
): AnalysisResult {
  const pages: readonly PageNode[] =
    scope === "all" ? figma.root.children : [figma.currentPage];

  const namingIssues: NamingIssue[] = [];
  if (checks.naming) {
    for (const page of pages) {
      namingIssues.push(...checkNaming(page));
    }
  }

  const safeAreaIssues  = checks.safeArea ? checkSafeArea(pages) : [];
  const layoutIssues    = checks.layout   ? checkLayout(pages)   : [];

  const cleanupChecks: CleanupChecks = {
    emptyFrames: checks.emptyFrames,
    zeroSize: checks.zeroSize,
  };
  const cleanupIssues = (checks.emptyFrames || checks.zeroSize)
    ? checkCleanup(pages, cleanupChecks)
    : [];

  const scannedNodes = countAllNodes(pages);

  return {
    namingIssues,
    safeAreaIssues,
    layoutIssues,
    cleanupIssues,
    totalIssues: namingIssues.length + safeAreaIssues.length + layoutIssues.length + cleanupIssues.length,
    scannedNodes,
  };
}
