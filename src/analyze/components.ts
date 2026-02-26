// ============================================================================
// Fixma - Component Candidate Analysis
// Finds repeating frame/group structures that could be converted to components
// ============================================================================

export interface ComponentCandidate {
  groupName: string;
  nodeIds: string[];
  nodeNames: string[];
  reason: string;
  parentId: string;
  parentName: string;
}

const SIZE_TOLERANCE = 0.1; // 10% tolerance for size comparison

/**
 * Extracts a base name by stripping trailing numbers/separators
 * e.g. "button_1" → "button", "Card 3" → "Card"
 */
function getBaseName(name: string): string {
  return name
    .replace(/[\s_\-]?\d+$/, "")
    .replace(/[\s_\-]+(default|hover|pressed|active|disabled|selected|focus|normal)$/i, "")
    .trim()
    .toLowerCase();
}

/**
 * Checks if two sizes are within tolerance
 */
function sizesSimilar(
  w1: number, h1: number,
  w2: number, h2: number
): boolean {
  const wDiff = Math.abs(w1 - w2) / Math.max(w1, w2, 1);
  const hDiff = Math.abs(h1 - h2) / Math.max(h1, h2, 1);
  return wDiff <= SIZE_TOLERANCE && hDiff <= SIZE_TOLERANCE;
}

/**
 * Counts direct children of a node (structural fingerprint)
 */
function getChildCount(node: any): number {
  return node.children ? node.children.length : 0;
}

/**
 * Recursively finds component candidates in the document
 */
export function findComponentCandidates(pages: readonly PageNode[]): ComponentCandidate[] {
  const candidates: ComponentCandidate[] = [];
  for (const page of pages) {
    scanForCandidates(page, candidates);
  }
  return candidates;
}

function scanForCandidates(node: any, candidates: ComponentCandidate[]): void {
  if (!node.children || node.children.length < 2) {
    // Still recurse
    if (node.children) {
      for (const child of node.children) {
        scanForCandidates(child, candidates);
      }
    }
    return;
  }

  const eligibleTypes = ["FRAME", "GROUP", "COMPONENT"];
  const eligible = node.children.filter(
    (c: any) => eligibleTypes.includes(c.type)
  );

  if (eligible.length < 2) {
    for (const child of node.children) {
      scanForCandidates(child, candidates);
    }
    return;
  }

  // --- Strategy 1: Same base name grouping ---
  const nameGroups: Record<string, any[]> = {};
  for (const child of eligible) {
    const base = getBaseName(child.name || "");
    if (base && base.length > 0) {
      if (!nameGroups[base]) nameGroups[base] = [];
      nameGroups[base].push(child);
    }
  }

  for (const [base, group] of Object.entries(nameGroups)) {
    if (group.length >= 2) {
      const alreadyAdded = candidates.some(
        (c) => c.parentId === node.id && c.nodeIds.some((id) => group.some((g: any) => g.id === id))
      );
      if (!alreadyAdded) {
        candidates.push({
          groupName: base,
          nodeIds: group.map((g: any) => g.id),
          nodeNames: group.map((g: any) => g.name),
          reason: `${group.length} similar nodes named "${base}" — component candidate`,
          parentId: node.id,
          parentName: node.name,
        });
      }
    }
  }

  // --- Strategy 2: Same size + same child count (structural similarity) ---
  const processed = new Set<string>();
  for (let i = 0; i < eligible.length; i++) {
    const a = eligible[i];
    if (processed.has(a.id)) continue;
    if (!("width" in a)) continue;

    const similarGroup: any[] = [a];

    for (let j = i + 1; j < eligible.length; j++) {
      const b = eligible[j];
      if (processed.has(b.id)) continue;
      if (!("width" in b)) continue;

      // Skip if already caught by name grouping
      if (getBaseName(a.name) === getBaseName(b.name) && getBaseName(a.name).length > 0) continue;

      if (
        sizesSimilar(a.width, a.height, b.width, b.height) &&
        getChildCount(a) === getChildCount(b) &&
        getChildCount(a) > 0
      ) {
        similarGroup.push(b);
        processed.add(b.id);
      }
    }

    if (similarGroup.length >= 2) {
      const alreadyAdded = candidates.some(
        (c) => c.parentId === node.id && c.nodeIds.some((id) => similarGroup.some((g: any) => g.id === id))
      );
      if (!alreadyAdded) {
        candidates.push({
          groupName: `${Math.round(a.width)}×${Math.round(a.height)} structure`,
          nodeIds: similarGroup.map((g) => g.id),
          nodeNames: similarGroup.map((g) => g.name),
          reason: `${similarGroup.length} nodes share the same size (${Math.round(a.width)}×${Math.round(a.height)}) and structure — component candidate`,
          parentId: node.id,
          parentName: node.name,
        });
      }
      processed.add(a.id);
    }
  }

  // Recurse into children
  for (const child of node.children) {
    scanForCandidates(child, candidates);
  }
}
