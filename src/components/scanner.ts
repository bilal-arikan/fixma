// ============================================================================
// Fixma - Component Scanner
//
// Strategy: hierarchical fingerprinting
//   Each node gets a "structural fingerprint" that encodes:
//     - node type
//     - rounded size (snapped to 4px grid to tolerate minor size diffs)
//     - child count
//     - recursive child fingerprints (sorted, to ignore Z-order differences)
//
//   Nodes with the same fingerprint are grouped as component candidates.
//   Minimum group size: 2 nodes, each with at least 1 child.
//
//   After grouping, diffs between nodes (text content, fill colors) are
//   computed so the UI can warn the user and the converter can restore them
//   as instance overrides.
// ============================================================================

export interface ComponentNode_ {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
  /** Absolute canvas X (from absoluteTransform matrix) */
  absoluteX: number;
  /** Absolute canvas Y (from absoluteTransform matrix) */
  absoluteY: number;
  /** X relative to parent (node.x) — used for placement inside parent frame */
  relativeX: number;
  /** Y relative to parent (node.y) — used for placement inside parent frame */
  relativeY: number;
  parentId: string;
  parentName: string;
  pageName: string;
  /** True if the node lives inside a COMPONENT or INSTANCE */
  insideProtected?: boolean;
}

/** Text content difference for a single node vs the master */
export interface TextDiff {
  /** The name of the TEXT child node (used to match in the instance) */
  childName: string;
  /** The text value in this node (different from master) */
  value: string;
}

/** Fill color difference for a single node vs the master */
export interface FillDiff {
  /** Index in fills array */
  fillIndex: number;
  /** CSS-style hex color for display */
  hex: string;
  /** Raw RGBA for writing back */
  r: number;
  g: number;
  b: number;
  a: number;
}

/** All differences for one non-master node in a group */
export interface DiffEntry {
  nodeId: string;
  nodeName: string;
  textDiffs: TextDiff[];
  fillDiffs: FillDiff[];
  /** Raw fills array of this node (to restore as override) */
  rawFills: readonly Paint[];
}

export interface ComponentGroup {
  fingerprint: string;
  label: string;
  nodes: ComponentNode_[];
  pages: string[];
  /** True if any non-master node has different text or fills than the master */
  hasDiffs: boolean;
  /** Diff entries for non-master nodes (index aligns with nodes[1..]) */
  diffs: DiffEntry[];
}

// ── Fingerprint ───────────────────────────────────────────────────────────────

const SNAP = 4;

function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP;
}

function buildFingerprint(node: any, depth = 0): string {
  const maxDepth = 4;
  const type = node.type as string;
  const w = snap(node.width ?? 0);
  const h = snap(node.height ?? 0);
  const base = `${type}:${w}x${h}`;

  if (depth >= maxDepth || !node.children || node.children.length === 0) {
    return base;
  }

  const childFps: string[] = node.children
    .map((c: any) => buildFingerprint(c, depth + 1))
    .sort();

  return `${base}[${childFps.join(",")}]`;
}

const CANDIDATE_TYPES = new Set(["FRAME", "GROUP"]);

// ── Diff computation ──────────────────────────────────────────────────────────

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function fillsEqual(a: readonly Paint[], b: readonly Paint[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const fa = a[i] as any;
    const fb = b[i] as any;
    if (fa.type !== fb.type) return false;
    if (fa.type === "SOLID") {
      if (
        Math.abs(fa.color.r - fb.color.r) > 0.01 ||
        Math.abs(fa.color.g - fb.color.g) > 0.01 ||
        Math.abs(fa.color.b - fb.color.b) > 0.01 ||
        Math.abs((fa.opacity ?? 1) - (fb.opacity ?? 1)) > 0.01
      ) return false;
    }
  }
  return true;
}

function computeDiffs(nodes: ComponentNode_[]): DiffEntry[] {
  if (nodes.length < 2) return [];

  const masterNode = figma.getNodeById(nodes[0].id) as FrameNode | null;
  if (!masterNode) return [];

  // Collect master text values keyed by TEXT child name
  const masterTexts = new Map<string, string>();
  masterNode.findAll((n) => n.type === "TEXT").forEach((t) => {
    masterTexts.set(t.name, (t as TextNode).characters);
  });

  const masterFills: readonly Paint[] = (masterNode as any).fills ?? [];

  const diffs: DiffEntry[] = [];

  for (let i = 1; i < nodes.length; i++) {
    const node = figma.getNodeById(nodes[i].id) as FrameNode | null;
    if (!node) {
      diffs.push({ nodeId: nodes[i].id, nodeName: nodes[i].name, textDiffs: [], fillDiffs: [], rawFills: [] });
      continue;
    }

    // Text diffs
    const textDiffs: TextDiff[] = [];
    node.findAll((n) => n.type === "TEXT").forEach((t) => {
      const textNode = t as TextNode;
      const masterValue = masterTexts.get(textNode.name);
      if (masterValue !== undefined && masterValue !== textNode.characters) {
        textDiffs.push({ childName: textNode.name, value: textNode.characters });
      }
    });

    // Fill diffs
    const nodeFills: readonly Paint[] = (node as any).fills ?? [];
    const fillDiffs: FillDiff[] = [];
    if (!fillsEqual(masterFills, nodeFills)) {
      nodeFills.forEach((fill: any, idx) => {
        if (fill.type === "SOLID") {
          fillDiffs.push({
            fillIndex: idx,
            hex: rgbToHex(fill.color.r, fill.color.g, fill.color.b),
            r: fill.color.r,
            g: fill.color.g,
            b: fill.color.b,
            a: fill.opacity ?? 1,
          });
        }
      });
    }

    diffs.push({
      nodeId: nodes[i].id,
      nodeName: nodes[i].name,
      textDiffs,
      fillDiffs,
      rawFills: nodeFills,
    });
  }

  return diffs;
}

// ── Scan ─────────────────────────────────────────────────────────────────────

export function scanComponentCandidates(
  pages: readonly PageNode[],
  includeProtected = false
): ComponentGroup[] {
  const fpMap = new Map<string, ComponentNode_[]>();

  for (const page of pages) {
    scanNode(page, page.name, fpMap, includeProtected);
  }

  const groups: ComponentGroup[] = [];
  for (const [fp, nodes] of fpMap.entries()) {
    if (nodes.length < 2) continue;

    const pageNames = [...new Set(nodes.map((n) => n.pageName))];
    const label = deriveLabel(nodes);

    // Compute diffs between all nodes vs master
    const diffs = computeDiffs(nodes);
    const hasDiffs = diffs.some((d) => d.textDiffs.length > 0 || d.fillDiffs.length > 0);

    groups.push({ fingerprint: fp, label, nodes, pages: pageNames, hasDiffs, diffs });
  }

  groups.sort((a, b) => b.nodes.length - a.nodes.length || a.label.localeCompare(b.label));

  return groups;
}

// Node types whose children we must NOT descend into in default (safe) mode.
const PROTECTED_TYPES = new Set(["COMPONENT", "INSTANCE"]);

function scanNode(
  node: any,
  pageName: string,
  fpMap: Map<string, ComponentNode_[]>,
  includeProtected: boolean
): void {
  // Candidate types: FRAME or GROUP with at least 1 child
  if (CANDIDATE_TYPES.has(node.type)) {
    const hasChildren = node.children && node.children.length > 0;
    const inside = isInsideProtected(node);

    // Include node if:
    //  - it is NOT inside a protected ancestor, OR
    //  - includeProtected is true (user opted in to scan inside components)
    if (hasChildren && (!inside || includeProtected)) {
      const fp = buildFingerprint(node);
      if (!fpMap.has(fp)) fpMap.set(fp, []);
      fpMap.get(fp)!.push({
        id: node.id,
        name: node.name ?? "",
        type: node.type,
        width: node.width ?? 0,
        height: node.height ?? 0,
        absoluteX: node.absoluteTransform?.[0]?.[2] ?? 0,
        absoluteY: node.absoluteTransform?.[1]?.[2] ?? 0,
        relativeX: node.x ?? 0,
        relativeY: node.y ?? 0,
        parentId: node.parent?.id ?? "",
        parentName: node.parent?.name ?? "",
        pageName,
        insideProtected: inside,
      });
    }
  }

  // In default mode: do NOT recurse into COMPONENT or INSTANCE nodes.
  // In includeProtected mode: recurse everywhere.
  if (!includeProtected && PROTECTED_TYPES.has(node.type)) return;

  if (node.children) {
    for (const child of node.children) {
      scanNode(child, pageName, fpMap, includeProtected);
    }
  }
}

/** Returns true if the node has a COMPONENT or INSTANCE ancestor. */
function isInsideProtected(node: any): boolean {
  let current = node.parent;
  while (current) {
    if (PROTECTED_TYPES.has(current.type)) return true;
    current = current.parent;
  }
  return false;
}

// ── Label derivation ──────────────────────────────────────────────────────────

function deriveLabel(nodes: ComponentNode_[]): string {
  const names = nodes.map((n) => n.name.trim().toLowerCase());
  const first = names[0];

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

  if (allShareBase && base.length > 0) return base;

  const n = nodes[0];
  return `${Math.round(n.width)}×${Math.round(n.height)} frame`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
