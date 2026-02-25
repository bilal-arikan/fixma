// ============================================================================
// FigmaOrganizer - Layout Fix Engine
// Applies constraint / sizing changes to fix detected layout issues.
// ============================================================================

import type { LayoutIssue, LayoutIssueKind } from "../analyze/layout";

// ─── Result Types ────────────────────────────────────────────────────────────

export interface LayoutFixResult {
  nodeId: string;
  nodeName: string;
  kind: LayoutIssueKind;
  success: boolean;
  error?: string;
  /** What was changed (human-readable) */
  detail: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isAutoLayoutChild(node: SceneNode): boolean {
  const p = node.parent;
  return !!(p && "layoutMode" in p && (p as FrameNode).layoutMode !== "NONE");
}

// ─── Fix Dispatch ────────────────────────────────────────────────────────────

const FIX_MAP: Record<LayoutIssueKind, (node: SceneNode, issue: LayoutIssue) => string> = {

  corner_constraint_mismatch(node, issue) {
    if (!("constraints" in node)) throw new Error("Node has no constraints property");
    const frame = node as FrameNode;
    const expected = issue.expected; // e.g. "H: RIGHT, V: BOTTOM"
    const { h, v } = parseExpectedConstraints(expected);
    frame.constraints = { horizontal: h, vertical: v };
    return `Set constraints to H: ${h}, V: ${v}`;
  },

  edge_constraint_mismatch(node, issue) {
    if (!("constraints" in node)) throw new Error("Node has no constraints property");
    const frame = node as FrameNode;
    const expected = issue.expected; // e.g. "H: RIGHT" or "V: BOTTOM"
    const current = { ...frame.constraints };

    if (expected.startsWith("H:")) {
      current.horizontal = parseConstraintValue(expected.replace("H:", "").trim()) as ConstraintType;
    } else if (expected.startsWith("V:")) {
      current.vertical = parseConstraintValue(expected.replace("V:", "").trim()) as ConstraintType;
    }

    frame.constraints = current;
    return `Set constraint ${expected}`;
  },

  both_edges_not_stretch(node, issue) {
    if (!("constraints" in node)) throw new Error("Node has no constraints property");
    const frame = node as FrameNode;
    const expected = issue.expected; // "H: STRETCH" or "V: STRETCH"
    const current = { ...frame.constraints };

    if (expected.startsWith("H:")) {
      current.horizontal = "STRETCH";
    } else if (expected.startsWith("V:")) {
      current.vertical = "STRETCH";
    }

    frame.constraints = current;
    return `Set constraint ${expected}`;
  },

  wide_not_fill(node, issue) {
    const expected = issue.expected;

    // Auto-layout child: layoutGrow or layoutAlign
    if (expected.includes("layoutGrow")) {
      (node as any).layoutGrow = 1;
      return "Set layoutGrow = 1 (Fill container)";
    }
    if (expected.includes("layoutAlign")) {
      (node as any).layoutAlign = "STRETCH";
      return "Set layoutAlign = STRETCH";
    }

    // Non-auto-layout: set horizontal constraint to STRETCH
    if ("constraints" in node) {
      const frame = node as FrameNode;
      frame.constraints = { horizontal: "STRETCH", vertical: frame.constraints.vertical };
      return "Set horizontal constraint to LEFT & RIGHT (STRETCH)";
    }

    throw new Error("Cannot determine fix for wide_not_fill");
  },

  tall_not_fill(node, issue) {
    const expected = issue.expected;

    // Auto-layout child: layoutGrow or layoutAlign
    if (expected.includes("layoutGrow")) {
      (node as any).layoutGrow = 1;
      return "Set layoutGrow = 1 (Fill container)";
    }
    if (expected.includes("layoutAlign")) {
      (node as any).layoutAlign = "STRETCH";
      return "Set layoutAlign = STRETCH";
    }

    // Non-auto-layout: set vertical constraint to STRETCH
    if ("constraints" in node) {
      const frame = node as FrameNode;
      frame.constraints = { horizontal: frame.constraints.horizontal, vertical: "STRETCH" };
      return "Set vertical constraint to TOP & BOTTOM (STRETCH)";
    }

    throw new Error("Cannot determine fix for tall_not_fill");
  },

  centered_h_not_center(node, _issue) {
    if (!("constraints" in node)) throw new Error("Node has no constraints property");
    const frame = node as FrameNode;
    frame.constraints = { horizontal: "CENTER", vertical: frame.constraints.vertical };
    return "Set horizontal constraint to CENTER";
  },

  centered_v_not_center(node, _issue) {
    if (!("constraints" in node)) throw new Error("Node has no constraints property");
    const frame = node as FrameNode;
    frame.constraints = { horizontal: frame.constraints.horizontal, vertical: "CENTER" };
    return "Set vertical constraint to CENTER";
  },

  sibling_fill_candidate(node, _issue) {
    (node as any).layoutGrow = 1;
    return "Set layoutGrow = 1 (Fill container)";
  },

  full_bleed_not_stretch(node, _issue) {
    if (!("constraints" in node)) throw new Error("Node has no constraints property");
    const frame = node as FrameNode;
    frame.constraints = { horizontal: "SCALE", vertical: "SCALE" };
    return "Set constraints to H: SCALE, V: SCALE";
  },
};

// ─── Parsing helpers ─────────────────────────────────────────────────────────

function parseConstraintValue(raw: string): ConstraintType {
  const val = raw.trim().toUpperCase();
  const VALID: ConstraintType[] = ["MIN", "CENTER", "MAX", "STRETCH", "SCALE"];
  if (VALID.includes(val as ConstraintType)) return val as ConstraintType;
  // Map friendly names
  if (val === "LEFT" || val === "TOP") return "MIN";
  if (val === "RIGHT" || val === "BOTTOM") return "MAX";
  return "MIN";
}

function parseExpectedConstraints(expected: string): { h: ConstraintType; v: ConstraintType } {
  // expected format: "H: RIGHT, V: BOTTOM" or "H: SCALE or STRETCH, V: SCALE or STRETCH"
  let h: ConstraintType = "MIN";
  let v: ConstraintType = "MIN";

  const hMatch = expected.match(/H:\s*([A-Z_]+)/);
  const vMatch = expected.match(/V:\s*([A-Z_]+)/);

  if (hMatch) h = parseConstraintValue(hMatch[1]);
  if (vMatch) v = parseConstraintValue(vMatch[1]);

  return { h, v };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Fix a single layout issue by applying the suggested change.
 */
export function fixLayoutIssue(issue: LayoutIssue): LayoutFixResult {
  try {
    const node = figma.getNodeById(issue.nodeId) as SceneNode | null;
    if (!node) {
      return {
        nodeId: issue.nodeId,
        nodeName: issue.nodeName,
        kind: issue.kind,
        success: false,
        error: "Node not found (may have been deleted)",
        detail: "",
      };
    }

    const fixFn = FIX_MAP[issue.kind];
    if (!fixFn) {
      return {
        nodeId: issue.nodeId,
        nodeName: issue.nodeName,
        kind: issue.kind,
        success: false,
        error: `No fix handler for kind "${issue.kind}"`,
        detail: "",
      };
    }

    const detail = fixFn(node, issue);

    return {
      nodeId: issue.nodeId,
      nodeName: issue.nodeName,
      kind: issue.kind,
      success: true,
      detail,
    };
  } catch (err: any) {
    return {
      nodeId: issue.nodeId,
      nodeName: issue.nodeName,
      kind: issue.kind,
      success: false,
      error: err.message || String(err),
      detail: "",
    };
  }
}

/**
 * Fix all given layout issues. Returns individual results.
 */
export function fixAllLayoutIssues(issues: LayoutIssue[]): LayoutFixResult[] {
  return issues.map((issue) => fixLayoutIssue(issue));
}
