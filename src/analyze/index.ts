// ============================================================================
// FigmaOrganizer - Analysis Module Entry Point
// ============================================================================

import { checkNaming, NamingIssue } from "./naming";
import { findComponentCandidates, ComponentCandidate } from "./components";
import { checkSafeArea, SafeAreaIssue } from "./safeArea";

export { NamingIssue, ComponentCandidate, SafeAreaIssue };

export interface AnalysisResult {
  namingIssues: NamingIssue[];
  componentCandidates: ComponentCandidate[];
  safeAreaIssues: SafeAreaIssue[];
  totalIssues: number;
  scannedNodes: number;
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
 * Runs all analysis checks on the current document
 */
export function analyzeDocument(scope: "current" | "all"): AnalysisResult {
  const pages: readonly PageNode[] =
    scope === "all" ? figma.root.children : [figma.currentPage];

  const namingIssues: NamingIssue[] = [];
  for (const page of pages) {
    namingIssues.push(...checkNaming(page));
  }

  const componentCandidates = findComponentCandidates(pages);
  const safeAreaIssues = checkSafeArea(pages);
  const scannedNodes = countAllNodes(pages);

  return {
    namingIssues,
    componentCandidates,
    safeAreaIssues,
    totalIssues:
      namingIssues.length +
      componentCandidates.length +
      safeAreaIssues.length,
    scannedNodes,
  };
}
