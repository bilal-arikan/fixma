// ============================================================================
// Fixma - Layout Intent Analysis
// Detects mismatches between a node's visual position/size and its
// constraints / Auto-Layout sizing settings.
// ============================================================================

import { LayoutConfig, DEFAULT_LAYOUT_CONFIG } from "./layoutConfig";

export type LayoutIssueKind =
  | "corner_constraint_mismatch"   // near a corner but wrong constraints
  | "edge_constraint_mismatch"     // near one edge but wrong constraint for that axis
  | "both_edges_not_stretch"       // near both left+right or top+bottom edges but not STRETCH
  | "wide_not_fill"                // occupies most of parent width but is FIXED
  | "tall_not_fill"                // occupies most of parent height but is FIXED
  | "centered_h_not_center"        // horizontally centred but not CENTER constraint
  | "centered_v_not_center"        // vertically centred but not CENTER constraint
  | "sibling_fill_candidate"       // widest child in Auto Layout but layoutGrow=0
  | "full_bleed_not_stretch";      // almost fills parent on both axes but not STRETCH

export type LayoutIssueSeverity = "high" | "medium";

export interface LayoutIssue {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  parentId: string;
  parentName: string;
  kind: LayoutIssueKind;
  severity: LayoutIssueSeverity;
  description: string;
  suggestion: string;
  /** Human-readable detail: what is set vs what is expected */
  actual: string;
  expected: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function isAutoLayoutChild(node: SceneNode): boolean {
  const p = node.parent;
  return !!(p && "layoutMode" in p && (p as FrameNode).layoutMode !== "NONE");
}

function parentOf(node: SceneNode): FrameNode | ComponentNode | null {
  const p = node.parent;
  if (!p) return null;
  if (p.type === "FRAME" || p.type === "COMPONENT") return p as FrameNode | ComponentNode;
  return null;
}

/**
 * Effective inner dimensions of a frame, accounting for padding.
 */
function innerSize(f: FrameNode | ComponentNode): { w: number; h: number; pl: number; pt: number } {
  const pl = ("paddingLeft"   in f ? (f as FrameNode).paddingLeft   : 0) ?? 0;
  const pr = ("paddingRight"  in f ? (f as FrameNode).paddingRight  : 0) ?? 0;
  const pt = ("paddingTop"    in f ? (f as FrameNode).paddingTop    : 0) ?? 0;
  const pb = ("paddingBottom" in f ? (f as FrameNode).paddingBottom : 0) ?? 0;
  return {
    w: f.width  - pl - pr,
    h: f.height - pt - pb,
    pl,
    pt,
  };
}

function hConstraint(node: SceneNode): string {
  if ("constraints" in node) return (node as FrameNode).constraints.horizontal ?? "MIN";
  return "MIN";
}

function vConstraint(node: SceneNode): string {
  if ("constraints" in node) return (node as FrameNode).constraints.vertical ?? "MIN";
  return "MIN";
}

function layoutGrow(node: SceneNode): number {
  return ("layoutGrow" in node ? (node as any).layoutGrow : 0) ?? 0;
}

function layoutAlign(node: SceneNode): string {
  return ("layoutAlign" in node ? (node as any).layoutAlign : "INHERIT") ?? "INHERIT";
}

/**
 * Returns true if the node's constraints / sizing are still at Figma's
 * out-of-the-box defaults — i.e. the designer never touched them.
 *
 * Frame / non-auto-layout: default is H: MIN, V: MIN
 * Auto-Layout child:       default is layoutGrow: 0, layoutAlign: INHERIT
 */
function hasDefaultValues(node: SceneNode): boolean {
  if (isAutoLayoutChild(node)) {
    // Auto-layout children default to Fixed (grow=0) and INHERIT align
    return layoutGrow(node) === 0 && layoutAlign(node) === "INHERIT";
  }
  if ("constraints" in node) {
    const c = (node as FrameNode).constraints;
    return c.horizontal === "MIN" && c.vertical === "MIN";
  }
  return true; // no constraints property → treat as default
}

// ─── Detection Functions ────────────────────────────────────────────────────

/**
 * HEURISTIC 1 + 2: Edge / Corner proximity vs constraints.
 * Only for nodes NOT inside an Auto-Layout parent.
 */
function detectEdgeConstraintMismatch(
  node: SceneNode,
  parent: FrameNode | ComponentNode,
  cfg: LayoutConfig
): LayoutIssue | null {
  if (!cfg.checks.cornerConstraint && !cfg.checks.edgeConstraint) return null;
  if (isAutoLayoutChild(node)) return null;
  if (!("constraints" in node)) return null;

  const { w: pw, h: ph, pl, pt } = innerSize(parent);
  if (pw <= 0 || ph <= 0) return null;

  const nx = (node as any).x - pl;
  const ny = (node as any).y - pt;
  const nw = node.width;
  const nh = node.height;

  const gapLeft   = nx;
  const gapRight  = pw - (nx + nw);
  const gapTop    = ny;
  const gapBottom = ph - (ny + nh);

  const prox = cfg.edgeProximityRatio;

  const nearLeft   = gapLeft   >= 0 && gapLeft   < pw * prox;
  const nearRight  = gapRight  >= 0 && gapRight  < pw * prox;
  const nearTop    = gapTop    >= 0 && gapTop    < ph * prox;
  const nearBottom = gapBottom >= 0 && gapBottom < ph * prox;

  const hc = hConstraint(node);
  const vc = vConstraint(node);

  // ── Corner cases ──────────────────────────────────────────────────────
  if (cfg.checks.cornerConstraint) {
    if (nearRight && nearBottom && hc !== "MAX" && vc !== "MAX") {
      return {
        nodeId: node.id, nodeName: node.name, nodeType: node.type,
        parentId: parent.id, parentName: parent.name,
        kind: "corner_constraint_mismatch", severity: "high",
        description: `"${node.name}" sits in the bottom-right corner but is not pinned there`,
        suggestion: "Set horizontal constraint to RIGHT and vertical to BOTTOM",
        actual: `H: ${hc}, V: ${vc}`,
        expected: "H: RIGHT, V: BOTTOM",
      };
    }
    if (nearRight && nearTop && hc !== "MAX" && vc !== "MIN") {
      return {
        nodeId: node.id, nodeName: node.name, nodeType: node.type,
        parentId: parent.id, parentName: parent.name,
        kind: "corner_constraint_mismatch", severity: "high",
        description: `"${node.name}" sits in the top-right corner but is not pinned there`,
        suggestion: "Set horizontal constraint to RIGHT and vertical to TOP",
        actual: `H: ${hc}, V: ${vc}`,
        expected: "H: RIGHT, V: TOP",
      };
    }
    if (nearLeft && nearBottom && hc !== "MIN" && vc !== "MAX") {
      return {
        nodeId: node.id, nodeName: node.name, nodeType: node.type,
        parentId: parent.id, parentName: parent.name,
        kind: "corner_constraint_mismatch", severity: "high",
        description: `"${node.name}" sits in the bottom-left corner but is not pinned there`,
        suggestion: "Set horizontal constraint to LEFT and vertical to BOTTOM",
        actual: `H: ${hc}, V: ${vc}`,
        expected: "H: LEFT, V: BOTTOM",
      };
    }
  }

  // ── Both-edges cases (node touches left+right or top+bottom → STRETCH) ─
  if (cfg.checks.edgeConstraint) {
    if (nearLeft && nearRight && hc !== "STRETCH" && hc !== "SCALE") {
      return {
        nodeId: node.id, nodeName: node.name, nodeType: node.type,
        parentId: parent.id, parentName: parent.name,
        kind: "both_edges_not_stretch", severity: "high",
        description: `"${node.name}" spans from left (${Math.round(gapLeft)}px) to right (${Math.round(gapRight)}px) edge but won't stretch on resize`,
        suggestion: "Set horizontal constraint to LEFT & RIGHT (STRETCH) so it fills the width on all screen sizes",
        actual: `H: ${hc}`,
        expected: "H: STRETCH",
      };
    }
    if (nearTop && nearBottom && vc !== "STRETCH" && vc !== "SCALE") {
      return {
        nodeId: node.id, nodeName: node.name, nodeType: node.type,
        parentId: parent.id, parentName: parent.name,
        kind: "both_edges_not_stretch", severity: "high",
        description: `"${node.name}" spans from top (${Math.round(gapTop)}px) to bottom (${Math.round(gapBottom)}px) edge but won't stretch on resize`,
        suggestion: "Set vertical constraint to TOP & BOTTOM (STRETCH) so it fills the height on all screen sizes",
        actual: `V: ${vc}`,
        expected: "V: STRETCH",
      };
    }
  }

  // ── Single-edge cases ─────────────────────────────────────────────────
  if (cfg.checks.edgeConstraint) {
    if (nearRight && !nearLeft && hc !== "MAX" && hc !== "STRETCH") {
      return {
        nodeId: node.id, nodeName: node.name, nodeType: node.type,
        parentId: parent.id, parentName: parent.name,
        kind: "edge_constraint_mismatch", severity: "high",
        description: `"${node.name}" is close to the right edge (${Math.round(gapRight)}px gap) but pinned to the left`,
        suggestion: "Set horizontal constraint to RIGHT so it stays anchored when the screen resizes",
        actual: `H: ${hc}`,
        expected: "H: RIGHT",
      };
    }
    if (nearBottom && !nearTop && vc !== "MAX" && vc !== "STRETCH") {
      return {
        nodeId: node.id, nodeName: node.name, nodeType: node.type,
        parentId: parent.id, parentName: parent.name,
        kind: "edge_constraint_mismatch", severity: "high",
        description: `"${node.name}" is close to the bottom edge (${Math.round(gapBottom)}px gap) but pinned to the top`,
        suggestion: "Set vertical constraint to BOTTOM so it stays anchored when the screen resizes",
        actual: `V: ${vc}`,
        expected: "V: BOTTOM",
      };
    }
  }

  return null;
}

/**
 * HEURISTIC 3: Wide node that should be FILL / STRETCH.
 */
function detectWideNotFill(
  node: SceneNode,
  parent: FrameNode | ComponentNode,
  cfg: LayoutConfig
): LayoutIssue | null {
  if (!cfg.checks.wideTall) return null;

  const { w: pw } = innerSize(parent);
  if (pw <= 0) return null;
  if (node.width / pw < cfg.fillRatio) return null;

  if (isAutoLayoutChild(node)) {
    const parentFrame = parent as FrameNode;
    if (parentFrame.layoutMode === "HORIZONTAL" && layoutGrow(node) === 0) {
      return {
        nodeId: node.id, nodeName: node.name, nodeType: node.type,
        parentId: parent.id, parentName: parent.name,
        kind: "wide_not_fill", severity: "medium",
        description: `"${node.name}" takes ${Math.round((node.width / pw) * 100)}% of the row width but has layoutGrow = 0 (Fixed)`,
        suggestion: "Set to Fill container (layoutGrow = 1) so it expands when siblings are added",
        actual: "layoutGrow: 0 (Fixed)",
        expected: "layoutGrow: 1 (Fill)",
      };
    }
    if (parentFrame.layoutMode === "VERTICAL" && layoutAlign(node) !== "STRETCH") {
      return {
        nodeId: node.id, nodeName: node.name, nodeType: node.type,
        parentId: parent.id, parentName: parent.name,
        kind: "wide_not_fill", severity: "medium",
        description: `"${node.name}" spans ${Math.round((node.width / pw) * 100)}% of the container width but layoutAlign is not STRETCH`,
        suggestion: "Set layoutAlign to STRETCH so it fills the container width",
        actual: `layoutAlign: ${layoutAlign(node)}`,
        expected: "layoutAlign: STRETCH",
      };
    }
  } else {
    const hc = hConstraint(node);
    if (hc !== "STRETCH" && hc !== "SCALE") {
      return {
        nodeId: node.id, nodeName: node.name, nodeType: node.type,
        parentId: parent.id, parentName: parent.name,
        kind: "wide_not_fill", severity: "medium",
        description: `"${node.name}" covers ${Math.round((node.width / pw) * 100)}% of parent width but horizontal constraint is not SCALE/STRETCH`,
        suggestion: "Set horizontal constraint to SCALE or LEFT & RIGHT to fill on resize",
        actual: `H: ${hc}`,
        expected: "H: SCALE or LEFT & RIGHT",
      };
    }
  }
  return null;
}

/**
 * HEURISTIC 4: Centred node without CENTER constraint.
 */
function detectCenteredNotCenter(
  node: SceneNode,
  parent: FrameNode | ComponentNode,
  cfg: LayoutConfig
): LayoutIssue | null {
  if (!cfg.checks.centeredNotCenter) return null;
  if (isAutoLayoutChild(node)) return null;
  if (!("constraints" in node)) return null;

  const { w: pw, h: ph, pl, pt } = innerSize(parent);
  if (pw <= 0 || ph <= 0) return null;

  const nx = (node as any).x - pl;
  const ny = (node as any).y - pt;
  const nw = node.width;
  const nh = node.height;

  const nodeCenterH  = nx + nw / 2;
  const nodeCenterV  = ny + nh / 2;
  const parentCenterH = pw / 2;
  const parentCenterV = ph / 2;

  const hc = hConstraint(node);
  const vc = vConstraint(node);
  const tol = cfg.centerTolerancePx;

  if (
    Math.abs(nodeCenterH - parentCenterH) <= tol &&
    hc !== "CENTER" && hc !== "STRETCH" && hc !== "SCALE"
  ) {
    return {
      nodeId: node.id, nodeName: node.name, nodeType: node.type,
      parentId: parent.id, parentName: parent.name,
      kind: "centered_h_not_center", severity: "medium",
      description: `"${node.name}" is horizontally centred (${Math.round(Math.abs(nodeCenterH - parentCenterH))}px off) but constraint is ${hc}`,
      suggestion: "Set horizontal constraint to CENTER so it stays centred on all screen widths",
      actual: `H: ${hc}`,
      expected: "H: CENTER",
    };
  }

  if (
    Math.abs(nodeCenterV - parentCenterV) <= tol &&
    vc !== "CENTER" && vc !== "STRETCH" && vc !== "SCALE"
  ) {
    return {
      nodeId: node.id, nodeName: node.name, nodeType: node.type,
      parentId: parent.id, parentName: parent.name,
      kind: "centered_v_not_center", severity: "medium",
      description: `"${node.name}" is vertically centred (${Math.round(Math.abs(nodeCenterV - parentCenterV))}px off) but constraint is ${vc}`,
      suggestion: "Set vertical constraint to CENTER so it stays centred on all screen heights",
      actual: `V: ${vc}`,
      expected: "V: CENTER",
    };
  }

  return null;
}

/**
 * HEURISTIC 5: Widest child in an Auto Layout row is Fixed instead of Fill.
 */
function detectSiblingFillCandidate(
  parent: FrameNode | ComponentNode,
  cfg: LayoutConfig
): LayoutIssue[] {
  if (!cfg.checks.siblingFill) return [];
  if (!("layoutMode" in parent)) return [];
  const frame = parent as FrameNode;
  if (frame.layoutMode !== "HORIZONTAL") return [];
  if (!frame.children || frame.children.length < 2) return [];

  const children = frame.children.filter(
    (c) => c.type !== "VECTOR" && c.type !== "BOOLEAN_OPERATION"
  ) as SceneNode[];
  if (children.length < 2) return [];

  const totalWidth = children.reduce((s, c) => s + c.width, 0);
  const maxWidth   = Math.max(...children.map((c) => c.width));
  const issues: LayoutIssue[] = [];

  for (const child of children) {
    if (child.width !== maxWidth) continue;
    if (child.width / totalWidth < 0.50) continue;
    if (layoutGrow(child) !== 0) continue;
    // When onlyDefaults is on, skip children whose sizing was already customised
    if (cfg.onlyDefaults && !hasDefaultValues(child)) continue;
    const hasSmallerSibling = children.some(
      (c) => c !== child && c.width < child.width * 0.6
    );
    if (!hasSmallerSibling) continue;

    issues.push({
      nodeId: child.id, nodeName: child.name, nodeType: child.type,
      parentId: parent.id, parentName: parent.name,
      kind: "sibling_fill_candidate", severity: "high",
      description: `"${child.name}" is the widest item (${Math.round(child.width)}px, ${Math.round((child.width / totalWidth) * 100)}% of row) in an Auto Layout row but is Fixed`,
      suggestion: "Set to Fill container (layoutGrow = 1) — smaller siblings stay fixed while this one expands",
      actual: "layoutGrow: 0 (Fixed)",
      expected: "layoutGrow: 1 (Fill)",
    });
  }

  return issues;
}

/**
 * HEURISTIC 6: Node almost fills parent on both axes but is not STRETCH/SCALE.
 */
function detectFullBleedNotStretch(
  node: SceneNode,
  parent: FrameNode | ComponentNode,
  cfg: LayoutConfig
): LayoutIssue | null {
  if (!cfg.checks.fullBleed) return null;
  if (isAutoLayoutChild(node)) return null;
  if (!("constraints" in node)) return null;

  const { w: pw, h: ph } = innerSize(parent);
  if (pw <= 0 || ph <= 0) return null;

  const ratio = cfg.fullBleedRatio;
  if (node.width / pw < ratio || node.height / ph < ratio) return null;

  const hc = hConstraint(node);
  const vc = vConstraint(node);
  if ((hc === "STRETCH" || hc === "SCALE") && (vc === "STRETCH" || vc === "SCALE")) return null;

  return {
    nodeId: node.id, nodeName: node.name, nodeType: node.type,
    parentId: parent.id, parentName: parent.name,
    kind: "full_bleed_not_stretch", severity: "medium",
    description: `"${node.name}" covers ${Math.round((node.width / pw) * 100)}% × ${Math.round((node.height / ph) * 100)}% of its parent but won't stretch on resize`,
    suggestion: "Set both constraints to SCALE (or LEFT & RIGHT + TOP & BOTTOM) so it fills the container on all screen sizes",
    actual: `H: ${hc}, V: ${vc}`,
    expected: "H: SCALE or STRETCH, V: SCALE or STRETCH",
  };
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Recursively scans all nodes on the given pages and returns layout issues.
 * @param pages  Pages to scan
 * @param config Optional config — falls back to DEFAULT_LAYOUT_CONFIG
 */
export function checkLayout(
  pages: readonly PageNode[],
  config: LayoutConfig = DEFAULT_LAYOUT_CONFIG
): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const seen = new Set<string>();

  function addIfNew(issue: LayoutIssue | null) {
    if (!issue) return;
    const key = `${issue.nodeId}::${issue.kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(issue);
  }

  function scanNode(node: SceneNode | PageNode) {
    if (node.type === "PAGE") {
      if ("children" in node) {
        for (const child of (node as PageNode).children) scanNode(child);
      }
      return;
    }

    const par = parentOf(node as SceneNode);

    // When onlyDefaults is on, skip nodes whose constraints were already customised
    if (par && !(config.onlyDefaults && !hasDefaultValues(node as SceneNode))) {
      addIfNew(detectEdgeConstraintMismatch(node as SceneNode, par, config));
      addIfNew(detectWideNotFill(node as SceneNode, par, config));
      addIfNew(detectCenteredNotCenter(node as SceneNode, par, config));
      addIfNew(detectFullBleedNotStretch(node as SceneNode, par, config));
    }

    if (
      (node.type === "FRAME" || node.type === "COMPONENT") &&
      "layoutMode" in node
    ) {
      for (const si of detectSiblingFillCandidate(
        node as FrameNode | ComponentNode, config
      )) addIfNew(si);
    }

    if ("children" in node) {
      for (const child of (node as FrameNode).children) {
        scanNode(child as SceneNode);
      }
    }
  }

  for (const page of pages) scanNode(page);
  return issues;
}
