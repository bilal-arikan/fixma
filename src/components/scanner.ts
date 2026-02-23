// ============================================================================
// FigmaOrganizer - Component Scanner
//
// Strategy: hierarchical fingerprinting
//   Each node gets a "structural fingerprint" that encodes:
//     - node type
//     - rounded size (snapped to 4px grid to tolerate minor size diffs)
//     - child count
//     - recursive child fingerprints (sorted, to ignore Z-order differences)
//
//   Nodes with the same fingerprint are considered visually/structurally
//   equivalent and are grouped as component candidates.
//
//   Minimum group size: 2 nodes.
//   Skips: COMPONENT_SET, already-COMPONENT masters, text-only leaves.
// ============================================================================

export interface ComponentGroup {
  /** Unique fingerprint shared by all nodes in the group */
  fingerprint: string;
  /** Display label derived from common names or size */
  label: string;
  /** All matching nodes */
  nodes: ComponentNode_[];
  /** Page name where nodes were found */
  pages: string[];
}

export interface ComponentNode_ {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
  parentId: string;
  parentName: string;
  pageName: string;
}

// How many px to snap to when building fingerprint (reduces noise)
const SNAP = 4;

function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP;
}

/**
 * Builds a hierarchical structural fingerprint for a node.
 * The fingerprint is a compact string, e.g.:
 *   "FRAME:80x40[TEXT:120x20,RECTANGLE:80x2]"
 */
function buildFingerprint(node: any, depth = 0): string {
  const maxDepth = 4; // don't go too deep — too unique at deep levels
  const type = node.type as string;
  const w = snap(node.width ?? 0);
  const h = snap(node.height ?? 0);
  const base = `${type}:${w}x${h}`;

  if (depth >= maxDepth || !node.children || node.children.length === 0) {
    return base;
  }

  // Build child fingerprints and sort them (ignore Z-order)
  const childFps: string[] = node.children
    .map((c: any) => buildFingerprint(c, depth + 1))
    .sort();

  return `${base}[${childFps.join(",")}]`;
}

const SCANNABLE_TYPES = new Set(["FRAME", "GROUP", "COMPONENT", "INSTANCE"]);
const CANDIDATE_TYPES = new Set(["FRAME", "GROUP"]); // what we want to offer for conversion

/**
 * Scans all pages (or current page) and returns groups of structurally
 * similar nodes. Each group has at least 2 nodes.
 */
export function scanComponentCandidates(pages: readonly PageNode[]): ComponentGroup[] {
  // fingerprint → list of matching nodes
  const fpMap = new Map<string, ComponentNode_[]>();

  for (const page of pages) {
    scanNode(page, page.name, fpMap);
  }

  const groups: ComponentGroup[] = [];
  for (const [fp, nodes] of fpMap.entries()) {
    if (nodes.length < 2) continue;

    const pageNames = [...new Set(nodes.map((n) => n.pageName))];
    const label = deriveLabel(nodes, fp);

    groups.push({ fingerprint: fp, label, nodes, pages: pageNames });
  }

  // Sort: largest groups first, then by label
  groups.sort((a, b) => b.nodes.length - a.nodes.length || a.label.localeCompare(b.label));

  return groups;
}

function scanNode(node: any, pageName: string, fpMap: Map<string, ComponentNode_[]>): void {
  // Only fingerprint candidate types (FRAME / GROUP) that have at least 1 child
  if (CANDIDATE_TYPES.has(node.type)) {
    const hasChildren = node.children && node.children.length > 0;
    if (hasChildren) {
      const fp = buildFingerprint(node);
      if (!fpMap.has(fp)) fpMap.set(fp, []);
      fpMap.get(fp)!.push({
        id: node.id,
        name: node.name ?? "",
        type: node.type,
        width: node.width ?? 0,
        height: node.height ?? 0,
        parentId: node.parent?.id ?? "",
        parentName: node.parent?.name ?? "",
        pageName,
      });
    }
  }

  // Recurse
  if (node.children) {
    for (const child of node.children) {
      scanNode(child, pageName, fpMap);
    }
  }
}

/**
 * Derives a human-readable label from the group nodes.
 * Uses common base name if available, otherwise size string.
 */
function deriveLabel(nodes: ComponentNode_[], fp: string): string {
  // Try to find a common prefix in node names
  const names = nodes.map((n) => n.name.trim().toLowerCase());
  const first = names[0];

  // Check if all names share the same base (strip trailing numbers/state words)
  const base = first
    .replace(/[\s_\-]?\d+$/, "")
    .replace(/[\s_\-]+(default|hover|pressed|active|disabled|selected|focus|normal)$/i, "")
    .trim();

  const allShareBase = base.length > 0 && names.every((n) =>
    n === base ||
    n.startsWith(base + " ") ||
    n.startsWith(base + "_") ||
    n.startsWith(base + "-") ||
    n.match(new RegExp(`^${escapeRegex(base)}[\\s_\\-]?\\d+$`))
  );

  if (allShareBase && base.length > 0) {
    return base;
  }

  // Fallback: use size from first node
  const n = nodes[0];
  return `${Math.round(n.width)}×${Math.round(n.height)} frame`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
