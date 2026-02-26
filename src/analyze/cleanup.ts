// ============================================================================
// Fixma - Cleanup Analysis
// Detects empty frames/groups and zero-size objects
// ============================================================================

export type CleanupIssueKind = "empty_frame" | "zero_size";

export interface CleanupIssue {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  kind: CleanupIssueKind;
  description: string;
  suggestion: string;
  /** Width of the node (relevant for zero_size) */
  width: number;
  /** Height of the node (relevant for zero_size) */
  height: number;
}

// ─── Node types that can have children ─────────────────────────────────────

const CONTAINER_TYPES = new Set([
  "FRAME",
  "GROUP",
  "COMPONENT",
  "COMPONENT_SET",
  "SECTION",
]);

// ─── Node types that have meaningful dimensions ────────────────────────────

const SIZED_TYPES = new Set([
  "FRAME",
  "GROUP",
  "RECTANGLE",
  "ELLIPSE",
  "POLYGON",
  "STAR",
  "VECTOR",
  "TEXT",
  "LINE",
  "COMPONENT",
  "INSTANCE",
  "BOOLEAN_OPERATION",
  "SLICE",
]);

// ─── Core logic ────────────────────────────────────────────────────────────

function collectCleanupIssues(node: any, issues: CleanupIssue[], checks: CleanupChecks): void {
  if (!node || node.type === "DOCUMENT" || node.type === "CANVAS") {
    // Recurse into pages / document children
    if (node?.children) {
      for (const child of node.children) {
        collectCleanupIssues(child, issues, checks);
      }
    }
    return;
  }

  const name: string = node.name || "";
  const id: string = node.id || "";
  const type: string = node.type || "";
  const w: number = node.width ?? 0;
  const h: number = node.height ?? 0;

  // ── Check: Empty container (frame / group with 0 children) ─────────
  if (checks.emptyFrames && CONTAINER_TYPES.has(type) && node.children && node.children.length === 0) {
    issues.push({
      nodeId: id,
      nodeName: name,
      nodeType: type,
      kind: "empty_frame",
      description: `"${name}" is an empty ${type.toLowerCase()} with no children`,
      suggestion: "Remove this empty container or add content to it",
      width: w,
      height: h,
    });
  }

  // ── Check: Zero-size object (width=0 or height=0) ──────────────────
  if (checks.zeroSize && SIZED_TYPES.has(type) && (w === 0 || h === 0)) {
    issues.push({
      nodeId: id,
      nodeName: name,
      nodeType: type,
      kind: "zero_size",
      description: `"${name}" has zero dimensions (${w}×${h})`,
      suggestion: "Remove this invisible object or give it a valid size",
      width: w,
      height: h,
    });
  }

  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      collectCleanupIssues(child, issues, checks);
    }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Which cleanup checks to run */
export interface CleanupChecks {
  emptyFrames: boolean;
  zeroSize: boolean;
}

/**
 * Scans pages for cleanup issues: empty frames and zero-size objects.
 */
export function checkCleanup(
  pages: readonly PageNode[],
  checks: CleanupChecks = { emptyFrames: true, zeroSize: true },
): CleanupIssue[] {
  const issues: CleanupIssue[] = [];
  for (const page of pages) {
    collectCleanupIssues(page, issues, checks);
  }
  return issues;
}
