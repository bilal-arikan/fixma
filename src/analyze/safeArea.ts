// ============================================================================
// Fixma - Safe Area Analysis
// Detects FRAME / COMPONENT nodes that are missing a "safearea" child frame
// ============================================================================

export interface SafeAreaIssue {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  width: number;
  height: number;
  issue: "missing_safearea_frame";
  description: string;
  suggestion: string;
}

// Common mobile screen widths (portrait)
const MOBILE_WIDTH_MIN = 320;
const MOBILE_WIDTH_MAX = 430;
const MOBILE_HEIGHT_MIN = 580;

/**
 * Returns true if the node looks like a mobile screen or is a top-level
 * COMPONENT/FRAME large enough to warrant a safe area wrapper.
 */
function isCandidate(node: FrameNode | ComponentNode): boolean {
  const w = node.width;
  const h = node.height;
  return (
    w >= MOBILE_WIDTH_MIN &&
    w <= MOBILE_WIDTH_MAX &&
    h >= MOBILE_HEIGHT_MIN
  );
}

/**
 * Returns true if the node already contains a direct child whose name
 * includes "safearea" or "safe" (case-insensitive).
 */
function hasSafeAreaFrame(node: FrameNode | ComponentNode): boolean {
  return node.children.some((c) => {
    const lower = c.name.toLowerCase();
    return lower.includes("safearea") || lower.includes("safe");
  });
}

/**
 * Recursively scans for FRAME / COMPONENT nodes that are missing a safearea frame
 */
export function checkSafeArea(pages: readonly PageNode[]): SafeAreaIssue[] {
  const issues: SafeAreaIssue[] = [];
  for (const page of pages) {
    scanSafeArea(page, issues);
  }
  return issues;
}

function scanSafeArea(node: any, issues: SafeAreaIssue[]): void {
  const applicableTypes = ["FRAME", "COMPONENT"];

  if (applicableTypes.includes(node.type)) {
    const container = node as FrameNode | ComponentNode;

    if (isCandidate(container)) {
      if (hasSafeAreaFrame(container)) {
        // Already has safearea — skip scanning children entirely
        return;
      }

      issues.push({
        nodeId: container.id,
        nodeName: container.name,
        nodeType: container.type,
        width: Math.round(container.width),
        height: Math.round(container.height),
        issue: "missing_safearea_frame",
        description: `"${container.name}" (${Math.round(container.width)}×${Math.round(container.height)}) has no "safearea" child frame`,
        suggestion: `Add this node to addSafeArea rules — a fullscreen "safearea" frame will wrap its children`,
      });
    }
  }

  // Recurse
  if (node.children) {
    for (const child of node.children) {
      scanSafeArea(child, issues);
    }
  }
}
