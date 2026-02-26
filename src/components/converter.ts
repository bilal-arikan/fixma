// ============================================================================
// Fixma - Component Converter
//
// Flow (offset placement + parent preservation):
//   1. Compute maxRight across ALL nodes in ALL requests (canvas-space).
//   2. For each group:
//        a. Snapshot the first node's parent, relative x/y, and z-index BEFORE
//           extraction. Then extract its children into a fresh COMPONENT appended
//           to the page root at maxRight + OFFSET.
//        b. Create an instance for the FIRST node and re-insert it into the
//           original parent at the same z-index and relative x/y position.
//        c. For every other node: snapshot parent + relative x/y + z-index,
//           remove node, create instance, insertChild into original parent.
//           Apply text/fill overrides so content is not lost.
//
//   Result: design canvas structure is preserved (instances stay inside their
//           original parent frames), master components are placed off-canvas.
// ============================================================================

import { DiffEntry, ComponentNode_ } from "./scanner";

const OFFSET_PX = 500; // gap between rightmost canvas content and first master

export interface ConvertRequest {
  fingerprint: string;
  label: string;
  /** nodeIds[0] becomes the master; ALL nodeIds become instances */
  nodeIds: string[];
  /** Full node metadata from scanner (carries absoluteX/Y) */
  nodes: ComponentNode_[];
  /** Optional name to give the component (defaults to first node name) */
  componentName?: string;
  /** Diff data from scanner — index aligns with nodeIds[1..] */
  diffs?: DiffEntry[];
}

export interface ConvertResult {
  fingerprint: string;
  label: string;
  componentId: string | null;
  componentName: string;
  masterNodeId: string;
  instanceCount: number;
  successCount: number;
  overridesApplied: number;
  errors: string[];
}

const CONVERTIBLE_TYPES = new Set(["FRAME", "GROUP", "RECTANGLE", "ELLIPSE", "VECTOR"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if the node has a COMPONENT or INSTANCE ancestor. */
function isInsideProtected(node: BaseNode): boolean {
  let current = node.parent;
  while (current) {
    if (current.type === "INSTANCE" || current.type === "COMPONENT") return true;
    current = (current as any).parent;
  }
  return false;
}

/** Returns true if the node is directly or indirectly inside an instance. */
function isInsideInstance(node: BaseNode): boolean {
  let current = node.parent;
  while (current) {
    if (current.type === "INSTANCE") return true;
    current = (current as any).parent;
  }
  return false;
}

/**
 * Handles conversion of a node that lives inside a COMPONENT or INSTANCE tree.
 *
 * Strategy:
 *  1. Clone the node to the page root (clone escapes the protected tree).
 *  2. Build a new ComponentNode from the clone (children can be freely moved).
 *  3. Replace the original node inside its parent component/instance with an
 *     instance of the new master component (so the containing component still
 *     shows the correct visual at that position).
 *
 * Returns the new ComponentNode (NOT yet appended to any parent — caller does that).
 */
function extractFromProtected(node: SceneNode): ComponentNode {
  const page = figma.currentPage;
  const n = node as any;
  const w = n.width ?? 100;
  const h = n.height ?? 100;
  const relX = n.x ?? 0;
  const relY = n.y ?? 0;
  const originalParent = node.parent as any;
  const zIndex = originalParent?.children ? originalParent.children.indexOf(node) : -1;

  // Step 1: Clone to page root so we can freely move its children
  const cloned = node.clone() as any;
  page.appendChild(cloned);

  // Step 2: Build component from the clone
  const comp = figma.createComponent();
  comp.name = n.name || "Component";

  // Copy visual properties
  if (typeof cloned.opacity === "number") try { comp.opacity = cloned.opacity; } catch (_) {}
  if (cloned.blendMode) try { comp.blendMode = cloned.blendMode; } catch (_) {}
  if (cloned.effects?.length) try { comp.effects = cloned.effects; } catch (_) {}

  if (cloned.type === "FRAME") {
    if (cloned.layoutMode && cloned.layoutMode !== "NONE") {
      comp.layoutMode = cloned.layoutMode;
      if (cloned.primaryAxisSizingMode) comp.primaryAxisSizingMode = cloned.primaryAxisSizingMode;
      if (cloned.counterAxisSizingMode) comp.counterAxisSizingMode = cloned.counterAxisSizingMode;
      if (cloned.primaryAxisAlignItems) comp.primaryAxisAlignItems = cloned.primaryAxisAlignItems;
      if (cloned.counterAxisAlignItems) comp.counterAxisAlignItems = cloned.counterAxisAlignItems;
      if (typeof cloned.itemSpacing === "number") comp.itemSpacing = cloned.itemSpacing;
      if (typeof cloned.paddingLeft === "number") comp.paddingLeft = cloned.paddingLeft;
      if (typeof cloned.paddingRight === "number") comp.paddingRight = cloned.paddingRight;
      if (typeof cloned.paddingTop === "number") comp.paddingTop = cloned.paddingTop;
      if (typeof cloned.paddingBottom === "number") comp.paddingBottom = cloned.paddingBottom;
      if (typeof cloned.itemReverseZIndex === "boolean") comp.itemReverseZIndex = cloned.itemReverseZIndex;
    }
    if (typeof cloned.clipsContent === "boolean") comp.clipsContent = cloned.clipsContent;
    if (typeof cloned.cornerRadius === "number") try { comp.cornerRadius = cloned.cornerRadius; } catch (_) {}
    if (cloned.topLeftRadius !== undefined) {
      try {
        comp.topLeftRadius = cloned.topLeftRadius;
        comp.topRightRadius = cloned.topRightRadius;
        comp.bottomLeftRadius = cloned.bottomLeftRadius;
        comp.bottomRightRadius = cloned.bottomRightRadius;
      } catch (_) {}
    }
    if (cloned.fills) try { comp.fills = cloned.fills; } catch (_) {}
    if (cloned.strokes) try { comp.strokes = cloned.strokes; } catch (_) {}
    if (cloned.strokeWeight !== undefined) try { comp.strokeWeight = cloned.strokeWeight; } catch (_) {}
  }

  comp.resize(w, h);

  // Move children from clone into component
  if (cloned.children?.length) {
    const isAutoLayout = cloned.type === "FRAME" && cloned.layoutMode && cloned.layoutMode !== "NONE";
    if (isAutoLayout) {
      for (const child of [...cloned.children]) comp.appendChild(child);
    } else {
      const children = [...cloned.children];
      const positions = children.map((c: any) => ({ x: c.x, y: c.y }));
      for (let i = 0; i < children.length; i++) {
        comp.appendChild(children[i]);
        try { children[i].x = positions[i].x; children[i].y = positions[i].y; } catch (_) {}
      }
    }
    if (cloned.type === "FRAME" && cloned.layoutMode && cloned.layoutMode !== "NONE") {
      const hFixed = cloned.primaryAxisSizingMode === "FIXED";
      const vFixed = cloned.counterAxisSizingMode === "FIXED";
      if (hFixed || vFixed) comp.resize(hFixed ? w : comp.width, vFixed ? h : comp.height);
    } else {
      comp.resize(w, h);
    }
  }

  // Remove the temporary clone
  try { cloned.remove(); } catch (_) {}

  // Step 3: Replace original node inside the protected parent with an instance
  // (so the containing component still looks correct)
  try {
    if (originalParent && typeof originalParent.appendChild === "function") {
      const instance = comp.createInstance();
      if (zIndex >= 0 && typeof originalParent.insertChild === "function") {
        originalParent.insertChild(zIndex, instance);
      } else {
        originalParent.appendChild(instance);
      }
      instance.x = relX;
      instance.y = relY;
    }
    node.remove();
  } catch (_) {
    // If removal fails the component is still valid — continue
  }

  return comp;
}

/**
 * Creates a ComponentNode from an existing SceneNode.
 *
 * Two strategies depending on whether the node lives inside a COMPONENT/INSTANCE:
 *
 * A) Free node (not inside protected):
 *    - Move children directly into new component, remove original.
 *
 * B) Protected node (inside COMPONENT or INSTANCE):
 *    - Clone the entire node to page root first (escapes the protected tree).
 *    - Build component from the clone (children can be moved freely).
 *    - Replace the original inside the component with an instance of the new master.
 *
 * Does NOT insert into any parent — caller is responsible for appending and positioning.
 */
function extractToComponent(node: SceneNode): ComponentNode {
  if (!CONVERTIBLE_TYPES.has(node.type)) {
    throw new Error(`Cannot convert ${node.type} to COMPONENT`);
  }

  // ── Protected path: node lives inside a COMPONENT or INSTANCE ────────────
  if (isInsideProtected(node)) {
    return extractFromProtected(node);
  }

  const n = node as any;
  const name = n.name || "Component";
  const w = n.width ?? 100;
  const h = n.height ?? 100;

  const comp = figma.createComponent();
  comp.name = name;

  // ── Copy Frame-specific layout properties BEFORE adding children ──────────
  // This ensures auto-layout and sizing modes are in place when children arrive,
  // preventing the component from resizing itself based on its own rules.
  if (node.type === "FRAME") {
    // Auto-layout
    if (n.layoutMode && n.layoutMode !== "NONE") {
      comp.layoutMode = n.layoutMode;
      if (n.primaryAxisSizingMode) comp.primaryAxisSizingMode = n.primaryAxisSizingMode;
      if (n.counterAxisSizingMode) comp.counterAxisSizingMode = n.counterAxisSizingMode;
      if (n.primaryAxisAlignItems) comp.primaryAxisAlignItems = n.primaryAxisAlignItems;
      if (n.counterAxisAlignItems) comp.counterAxisAlignItems = n.counterAxisAlignItems;
      if (typeof n.itemSpacing === "number") comp.itemSpacing = n.itemSpacing;
      if (typeof n.paddingLeft === "number") comp.paddingLeft = n.paddingLeft;
      if (typeof n.paddingRight === "number") comp.paddingRight = n.paddingRight;
      if (typeof n.paddingTop === "number") comp.paddingTop = n.paddingTop;
      if (typeof n.paddingBottom === "number") comp.paddingBottom = n.paddingBottom;
      if (typeof n.itemReverseZIndex === "boolean") comp.itemReverseZIndex = n.itemReverseZIndex;
    }
    // Clip content
    if (typeof n.clipsContent === "boolean") comp.clipsContent = n.clipsContent;
    // Corner radius
    if (typeof n.cornerRadius === "number") {
      try { comp.cornerRadius = n.cornerRadius; } catch (_) {}
    }
    if (n.topLeftRadius !== undefined) {
      try {
        comp.topLeftRadius = n.topLeftRadius;
        comp.topRightRadius = n.topRightRadius;
        comp.bottomLeftRadius = n.bottomLeftRadius;
        comp.bottomRightRadius = n.bottomRightRadius;
      } catch (_) {}
    }
    // Fills, strokes, effects
    if (n.fills) try { comp.fills = n.fills; } catch (_) {}
    if (n.strokes) try { comp.strokes = n.strokes; } catch (_) {}
    if (n.strokeWeight !== undefined) try { comp.strokeWeight = n.strokeWeight; } catch (_) {}
    if (n.effects) try { comp.effects = n.effects; } catch (_) {}
  }

  // Set size BEFORE adding children so auto-layout sees the target size
  comp.resize(w, h);

  // ── Move children ──────────────────────────────────────────────────────────
  const isAutoLayout = node.type === "FRAME" && n.layoutMode && n.layoutMode !== "NONE";

  if ("children" in node) {
    const children = [...n.children];

    if (isAutoLayout) {
      // Auto-layout manages child positions — just move them, don't touch x/y
      for (const child of children) {
        comp.appendChild(child);
      }
    } else {
      // Non-auto-layout: snapshot each child's x/y BEFORE move, restore AFTER.
      // appendChild can shift coordinates when the component's origin differs.
      const positions = children.map((c: any) => ({ x: c.x, y: c.y }));
      for (let i = 0; i < children.length; i++) {
        comp.appendChild(children[i]);
        try {
          children[i].x = positions[i].x;
          children[i].y = positions[i].y;
        } catch (_) {}
      }
    }
  }

  // ── Re-lock size after children are moved ─────────────────────────────────
  if (isAutoLayout) {
    const hFixed = n.primaryAxisSizingMode === "FIXED";
    const vFixed = n.counterAxisSizingMode === "FIXED";
    if (hFixed || vFixed) {
      comp.resize(hFixed ? w : comp.width, vFixed ? h : comp.height);
    }
  } else {
    comp.resize(w, h);
  }

  // ── Remove original node ───────────────────────────────────────────────────
  // After moving all children, the original node may have been implicitly invalidated
  // (e.g. auto-layout frames can self-destruct when emptied).
  try {
    const stillExists = figma.getNodeById(node.id);
    if (stillExists) node.remove();
  } catch (_) {
    // Already gone — that's fine, continue
  }
  return comp;
}

/**
 * Applies text and fill overrides to an instance based on diff data.
 */
function applyOverrides(instance: InstanceNode, diff: DiffEntry): number {
  let applied = 0;

  if (diff.textDiffs.length > 0) {
    const textNodes = instance.findAll((n) => n.type === "TEXT") as TextNode[];
    for (const td of diff.textDiffs) {
      const target = textNodes.find((t) => t.name === td.childName);
      if (target) {
        try { target.characters = td.value; applied++; } catch (_) { /* font not loaded */ }
      }
    }
  }

  if (diff.fillDiffs.length > 0 && diff.rawFills && diff.rawFills.length > 0) {
    try { (instance as any).fills = diff.rawFills; applied++; } catch (_) {}
  }

  return applied;
}

// ── Main entry ────────────────────────────────────────────────────────────────

export function convertGroups(requests: ConvertRequest[]): ConvertResult[] {
  const page = figma.currentPage;

  // ── Step 1: Find rightmost canvas edge across all nodes in all requests ──
  let maxRight = -Infinity;
  let firstAbsY = 0;
  let hasFirst = false;

  for (const req of requests) {
    for (const meta of req.nodes) {
      const right = meta.absoluteX + meta.width;
      if (right > maxRight) maxRight = right;
      if (!hasFirst) { firstAbsY = meta.absoluteY; hasFirst = true; }
    }
  }

  // Fallback if nothing found
  if (!hasFirst) { maxRight = 0; firstAbsY = 0; }

  let placementY = firstAbsY; // y cursor for stacking masters

  // ── Step 2: Process each group ───────────────────────────────────────────
  return requests.map((req) => {
    const errors: string[] = [];
    let masterComponent: ComponentNode | null = null;
    let instanceCount = 0;
    let successCount = 0;
    let overridesApplied = 0;
    let componentName = req.componentName || "";

    if (!req.nodeIds || req.nodeIds.length < 1) {
      return {
        fingerprint: req.fingerprint, label: req.label,
        componentId: null, componentName: "", masterNodeId: "",
        instanceCount: 0, successCount: 0, overridesApplied: 0,
        errors: ["No node IDs provided"],
      };
    }

    const masterNodeId = req.nodeIds[0];
    const masterMeta = req.nodes[0];

    // ── 2a: Snapshot first node's parent context, then create master ─────
    try {
      const masterNode = figma.getNodeById(masterNodeId) as SceneNode | null;
      if (!masterNode) throw new Error(`Master node ${masterNodeId} not found`);

      if (masterNode.type === "COMPONENT") {
        // Already a component — just move it to the offset position
        masterComponent = masterNode as ComponentNode;
        masterNode.parent && page.appendChild(masterComponent);
      } else {
        masterComponent = extractToComponent(masterNode);
        // extractToComponent removes the original; append to page root
        page.appendChild(masterComponent);
      }

      componentName = componentName || masterComponent.name;
      if (req.componentName) masterComponent.name = req.componentName;

      // Place master to the right of all canvas content
      masterComponent.x = maxRight + OFFSET_PX;
      masterComponent.y = placementY;
      placementY += masterComponent.height + 40;

      successCount++;
    } catch (e: any) {
      errors.push(`Master: ${e.message || String(e)}`);
      return {
        fingerprint: req.fingerprint, label: req.label,
        componentId: null, componentName,
        masterNodeId, instanceCount: 0, successCount: 0,
        overridesApplied: 0, errors,
      };
    }

    // ── 2b: Create instance for the FIRST node and place in original parent
    // Note: extractFromProtected already placed an instance inside protected
    // parents, so here we only need to handle the case where the parent is
    // a free (non-instance, non-component) container.
    try {
      const firstParent = masterMeta.parentId
        ? (figma.getNodeById(masterMeta.parentId) as any)
        : null;

      const firstInst = masterComponent.createInstance();

      // INSTANCE parents cannot receive appendChild — skip them.
      // COMPONENT parents CAN receive appendChild (protected path already
      // placed the instance inside via extractFromProtected, so this branch
      // only runs for free nodes whose parent is a regular FRAME/GROUP/page).
      const firstParentIsInstance = firstParent ? isInsideInstance(firstParent) : false;

      if (firstParent && typeof firstParent.appendChild === "function" && !firstParentIsInstance) {
        firstParent.appendChild(firstInst);
        firstInst.x = masterMeta.relativeX ?? masterMeta.absoluteX;
        firstInst.y = masterMeta.relativeY ?? masterMeta.absoluteY;
      } else {
        page.appendChild(firstInst);
        firstInst.x = masterMeta.absoluteX;
        firstInst.y = masterMeta.absoluteY;
      }

      instanceCount++;
      successCount++;
    } catch (e: any) {
      errors.push(`First instance: ${e.message || String(e)}`);
    }

    // ── 2c: Replace remaining nodes with instances ───────────────────────
    for (let i = 1; i < req.nodeIds.length; i++) {
      const nodeId = req.nodeIds[i];
      const nodeMeta = req.nodes[i];
      const diff: DiffEntry | undefined = req.diffs?.[i - 1];

      try {
        const node = figma.getNodeById(nodeId) as SceneNode | null;
        if (!node) throw new Error(`Node ${nodeId} not found`);

        // Snapshot parent and relative position BEFORE any removal
        const nodeParent = node.parent as any;
        const relX = (node as any).x ?? 0;
        const relY = (node as any).y ?? 0;
        const zIndex = nodeParent && nodeParent.children
          ? nodeParent.children.indexOf(node)
          : -1;

        if (isInsideProtected(node)) {
          // Protected node: extractToComponent → extractFromProtected already
          // clones it out and replaces it with an instance inside the parent.
          // We still need to track it as a converted instance.
          extractToComponent(node);
          // The instance was placed by extractFromProtected — count it.
          instanceCount++;
          successCount++;
          continue;
        }

        // Free node: remove and replace with instance of master
        const parentIsInstance = isInsideInstance(nodeParent);
        node.remove();

        const instance = masterComponent!.createInstance();

        const canInsertIntoParent =
          nodeParent &&
          typeof nodeParent.appendChild === "function" &&
          !parentIsInstance;

        if (canInsertIntoParent) {
          nodeParent.appendChild(instance);
          if (zIndex >= 0 && typeof nodeParent.insertChild === "function") {
            nodeParent.insertChild(zIndex, instance);
          }
          instance.x = relX;
          instance.y = relY;
        } else {
          page.appendChild(instance);
          instance.x = nodeMeta?.absoluteX ?? relX;
          instance.y = nodeMeta?.absoluteY ?? relY;
        }

        if (diff) overridesApplied += applyOverrides(instance, diff);

        instanceCount++;
        successCount++;
      } catch (e: any) {
        errors.push(`Node ${nodeId}: ${e.message || String(e)}`);
      }
    }

    return {
      fingerprint: req.fingerprint,
      label: req.label,
      componentId: masterComponent.id,
      componentName: masterComponent.name,
      masterNodeId,
      instanceCount,
      successCount,
      overridesApplied,
      errors,
    };
  });
}
