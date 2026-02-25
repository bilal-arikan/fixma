// ============================================================================
// FigmaOrganizer - Variant Combiner
//
// Takes a list of selected node IDs and combines them into a single
// ComponentSet (Figma Variants) where each node becomes a variant.
//
// Flow:
//   1. Resolve each node by ID from the current page. Snapshot parent/position.
//   2. Convert each node into a ComponentNode.
//   3. Group all components into a ComponentSet via figma.combineAsVariants().
//   4. Name each variant's property: "State=Default", "State=Variant2", etc.
//   5. Place the ComponentSet below the first node's parent frame (or off-canvas).
//   6. Replace each original position with an instance of its own specific variant.
// ============================================================================

const VARIANT_OFFSET_PX = 500;
const CONVERTIBLE_TYPES = new Set(["FRAME", "GROUP", "RECTANGLE", "ELLIPSE", "VECTOR", "COMPONENT"]);

export interface CombineAsVariantsRequest {
  /** IDs of the selected nodes to combine */
  nodeIds: string[];
  /** Name for the resulting ComponentSet (defaults to first node's name) */
  componentSetName?: string;
  /** Property name for variants (defaults to "State") */
  propertyName?: string;
}

export interface CombineAsVariantsResult {
  success: boolean;
  componentSetId: string | null;
  componentSetName: string;
  variantCount: number;
  errors: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if the node is inside a COMPONENT or INSTANCE. */
function isInsideProtected(node: BaseNode): boolean {
  let current = node.parent;
  while (current) {
    if (current.type === "INSTANCE" || current.type === "COMPONENT") return true;
    current = (current as any).parent;
  }
  return false;
}

/** Returns true if the node is inside an INSTANCE. */
function isInsideInstance(node: BaseNode): boolean {
  let current = node.parent;
  while (current) {
    if (current.type === "INSTANCE") return true;
    current = (current as any).parent;
  }
  return false;
}

/**
 * Converts a SceneNode into a standalone ComponentNode.
 *
 * Strategy differs by node type:
 *  - FRAME / COMPONENT_SET: children are moved directly (safe, Figma keeps them).
 *  - GROUP: children are CLONED into the component first, then the original group
 *    is removed. Moving GROUP children directly causes Figma to auto-delete the
 *    empty group and can silently drop children in some API versions.
 *  - Leaf nodes (RECT, ELLIPSE, VECTOR …): the node itself is cloned into the
 *    component, then the original is removed.
 *
 * Visual properties (fills, strokes, effects, opacity, blendMode, corner radii,
 * auto-layout) are copied before children are added so layout modes are active
 * when children arrive.
 */
function nodeToComponent(node: SceneNode): ComponentNode {
  if (!CONVERTIBLE_TYPES.has(node.type)) {
    throw new Error(`Cannot convert node type "${node.type}" to a Component`);
  }

  if (isInsideProtected(node)) {
    throw new Error(
      `"${(node as any).name || node.id}" is inside a component or instance. Detach it first.`
    );
  }

  // Already a component — return as-is; caller moves it to page root
  if (node.type === "COMPONENT") {
    return node as ComponentNode;
  }

  const n = node as any;
  const w = n.width ?? 100;
  const h = n.height ?? 100;

  const comp = figma.createComponent();
  comp.name = n.name || "Component";

  // ── Copy shared visual properties ──────────────────────────────────────────
  if (typeof n.opacity === "number") try { comp.opacity = n.opacity; } catch (_) {}
  if (n.blendMode) try { comp.blendMode = n.blendMode; } catch (_) {}
  if (n.effects?.length) try { comp.effects = n.effects; } catch (_) {}

  // ── Copy FRAME-specific properties ────────────────────────────────────────
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
    }
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
    // Paint
    if (n.fills) try { comp.fills = n.fills; } catch (_) {}
    if (n.strokes) try { comp.strokes = n.strokes; } catch (_) {}
    if (n.strokeWeight !== undefined) try { comp.strokeWeight = n.strokeWeight; } catch (_) {}
  }

  comp.resize(w, h);

  // ── Populate component with children ───────────────────────────────────────
  if ("children" in node && n.children?.length) {
    const isAutoLayout = node.type === "FRAME" && n.layoutMode && n.layoutMode !== "NONE";
    const isGroup = node.type === "GROUP";

    if (isGroup) {
      // GROUP: clone each child into the component, then remove the original group.
      // Direct move is unsafe — Figma auto-deletes empty groups and may swallow
      // children unpredictably.
      const clones: Array<{ clone: SceneNode; x: number; y: number }> = [];
      for (const child of [...n.children] as SceneNode[]) {
        const clone = (child as SceneNode).clone();
        clones.push({ clone, x: (child as any).x, y: (child as any).y });
      }
      for (const { clone, x, y } of clones) {
        comp.appendChild(clone);
        try { (clone as any).x = x; (clone as any).y = y; } catch (_) {}
      }
      // Remove the original group (now safe — we cloned, not moved)
      try { node.remove(); } catch (_) {}
    } else if (isAutoLayout) {
      // Auto-layout FRAME: move children, Figma manages their positions
      for (const child of [...n.children]) comp.appendChild(child);
    } else {
      // Non-auto-layout FRAME / other containers: move children, restore positions
      const children = [...n.children];
      const positions = children.map((c: any) => ({ x: c.x, y: c.y }));
      for (let i = 0; i < children.length; i++) {
        comp.appendChild(children[i]);
        try {
          children[i].x = positions[i].x;
          children[i].y = positions[i].y;
        } catch (_) {}
      }
      // Remove original after children are moved
      try {
        const stillExists = figma.getNodeById(node.id);
        if (stillExists) node.remove();
      } catch (_) {}
    }

    // Re-lock size after children arrive
    if (isAutoLayout) {
      const hFixed = n.primaryAxisSizingMode === "FIXED";
      const vFixed = n.counterAxisSizingMode === "FIXED";
      if (hFixed || vFixed) comp.resize(hFixed ? w : comp.width, vFixed ? h : comp.height);
    } else {
      comp.resize(w, h);
    }
  } else if (!("children" in node)) {
    // Leaf node (RECTANGLE, ELLIPSE, VECTOR …): clone into component, remove original
    const clone = node.clone();
    comp.appendChild(clone);
    try { (clone as any).x = 0; (clone as any).y = 0; } catch (_) {}
    comp.resize(w, h);
    try { node.remove(); } catch (_) {}
  }

  return comp;
}

// ── Snapshot helper ───────────────────────────────────────────────────────────

interface NodeSnapshot {
  parentId: string | null;
  relX: number;
  relY: number;
  zIndex: number;
  parentIsInstance: boolean;
  absoluteX: number;
  absoluteY: number;
}

function snapshotNode(node: SceneNode): NodeSnapshot {
  const parent = node.parent as any;
  const zIndex = parent?.children ? parent.children.indexOf(node) : -1;
  const absoluteBounds = (node as any).absoluteBoundingBox;
  return {
    parentId: parent?.id ?? null,
    relX: (node as any).x ?? 0,
    relY: (node as any).y ?? 0,
    zIndex,
    parentIsInstance: parent?.type === "INSTANCE" || isInsideInstance(parent),
    absoluteX: absoluteBounds?.x ?? (node as any).x ?? 0,
    absoluteY: absoluteBounds?.y ?? (node as any).y ?? 0,
  };
}

// ── Main entry ────────────────────────────────────────────────────────────────

export function combineAsVariants(req: CombineAsVariantsRequest): CombineAsVariantsResult {
  const page = figma.currentPage;
  const errors: string[] = [];

  const propertyName = req.propertyName || "State";

  if (!req.nodeIds || req.nodeIds.length < 2) {
    return {
      success: false,
      componentSetId: null,
      componentSetName: "",
      variantCount: 0,
      errors: ["At least 2 nodes are required to combine as variants"],
    };
  }

  // ── Step 1: Resolve nodes and take snapshots BEFORE conversion ────────────
  interface Entry {
    originalId: string;
    originalName: string;
    snapshot: NodeSnapshot;
    variantName: string;
  }

  const entries: Entry[] = [];

  for (let i = 0; i < req.nodeIds.length; i++) {
    const nodeId = req.nodeIds[i];
    const node = figma.getNodeById(nodeId) as SceneNode | null;

    if (!node) {
      errors.push(`Node ${nodeId} not found — skipped`);
      continue;
    }

    if (isInsideProtected(node)) {
      errors.push(`"${(node as any).name || nodeId}" is inside a component/instance — skipped. Detach it first.`);
      continue;
    }

    const variantName = i === 0 ? "Default" : `Variant${i + 1}`;

    entries.push({
      originalId: nodeId,
      originalName: (node as any).name || "Component",
      snapshot: snapshotNode(node),
      variantName,
    });
  }

  if (entries.length < 2) {
    return {
      success: false,
      componentSetId: null,
      componentSetName: "",
      variantCount: 0,
      errors: [...errors, "Not enough valid nodes to create a variant set (need at least 2)"],
    };
  }

  // ── Step 2: Determine placement position for the ComponentSet ────────────
  // Prefer: below the first node's top-level parent frame on canvas.
  // Fallback: to the right of all canvas content.
  const firstSnap = entries[0].snapshot;
  const firstParentNode = firstSnap.parentId
    ? figma.getNodeById(firstSnap.parentId) as any
    : null;

  // Walk up to find the top-level page child (the "frame" on the canvas)
  let topLevelAncestor: SceneNode | null = null;
  if (firstParentNode && firstParentNode.id !== page.id) {
    let cursor: any = firstParentNode;
    while (cursor && cursor.parent && cursor.parent.id !== page.id) {
      cursor = cursor.parent;
    }
    if (cursor && cursor.parent && cursor.parent.id === page.id) {
      topLevelAncestor = cursor as SceneNode;
    }
  }

  let placeX: number;
  let placeY: number;

  if (topLevelAncestor) {
    const bounds = (topLevelAncestor as any).absoluteBoundingBox;
    placeX = bounds ? bounds.x : (topLevelAncestor as any).x;
    placeY = bounds
      ? bounds.y + bounds.height + VARIANT_OFFSET_PX
      : (topLevelAncestor as any).y + (topLevelAncestor as any).height + VARIANT_OFFSET_PX;
  } else {
    // Fallback: right of all canvas content
    let maxRight = -Infinity;
    let firstAbsY = 0;
    for (const child of page.children) {
      const bounds = (child as any).absoluteBoundingBox;
      if (bounds) {
        const right = bounds.x + bounds.width;
        if (right > maxRight) maxRight = right;
        if (firstAbsY === 0) firstAbsY = bounds.y;
      }
    }
    placeX = maxRight === -Infinity ? 0 : maxRight + VARIANT_OFFSET_PX;
    placeY = firstAbsY;
  }

  // ── Step 3: Convert each node to a ComponentNode ──────────────────────────
  const components: ComponentNode[] = [];

  for (const entry of entries) {
    const node = figma.getNodeById(entry.originalId) as SceneNode | null;
    if (!node) {
      errors.push(`Node ${entry.originalId} disappeared before conversion`);
      continue;
    }

    try {
      // If already a COMPONENT, detach from parent first so combineAsVariants can use it
      let comp: ComponentNode;
      if (node.type === "COMPONENT") {
        comp = node as ComponentNode;
        page.appendChild(comp); // move to page root if nested
      } else {
        comp = nodeToComponent(node);
        page.appendChild(comp);
      }

      // Set variant name BEFORE combining so Figma picks up the property
      comp.name = `${propertyName}=${entry.variantName}`;
      components.push(comp);
    } catch (e: any) {
      errors.push(`Convert failed for ${entry.originalId}: ${e.message || String(e)}`);
    }
  }

  if (components.length < 2) {
    // Clean up any created components
    for (const c of components) {
      try { c.remove(); } catch (_) {}
    }
    return {
      success: false,
      componentSetId: null,
      componentSetName: "",
      variantCount: 0,
      errors: [...errors, "Conversion failed — not enough components created"],
    };
  }

  // ── Step 4: Combine into a ComponentSet ───────────────────────────────────
  let componentSet: ComponentSetNode;
  try {
    componentSet = figma.combineAsVariants(components, page);
  } catch (e: any) {
    for (const c of components) {
      try { c.remove(); } catch (_) {}
    }
    return {
      success: false,
      componentSetId: null,
      componentSetName: "",
      variantCount: 0,
      errors: [...errors, `combineAsVariants failed: ${e.message || String(e)}`],
    };
  }

  // ── Step 5: Name and position the ComponentSet ────────────────────────────
  // Use the first original node's name (captured before conversion)
  const setName = req.componentSetName || entries[0]?.originalName || "Component";
  componentSet.name = setName;
  componentSet.x = placeX;
  componentSet.y = placeY;

  // ── Step 6: Replace each original position with its own variant's instance ─
  // components[i] corresponds to entries[i] (same order guaranteed by sequential push).
  // Each original node was already consumed by nodeToComponent (removed from canvas),
  // so we just create the matching instance at the snapshot position.
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const comp = components[i];
    if (!comp) continue;

    const snap = entry.snapshot;

    try {
      // Create instance of THIS specific variant (not always the first/master)
      const instance = comp.createInstance();
      const originalParent = snap.parentId ? figma.getNodeById(snap.parentId) as any : null;

      const canInsert =
        originalParent &&
        typeof originalParent.appendChild === "function" &&
        !snap.parentIsInstance;

      if (canInsert) {
        originalParent.appendChild(instance);
        if (snap.zIndex >= 0 && typeof originalParent.insertChild === "function") {
          try { originalParent.insertChild(snap.zIndex, instance); } catch (_) {}
        }
        instance.x = snap.relX;
        instance.y = snap.relY;
      } else {
        page.appendChild(instance);
        instance.x = snap.absoluteX;
        instance.y = snap.absoluteY;
      }
    } catch (e: any) {
      errors.push(`Instance placement failed for variant "${entry.variantName}": ${e.message || String(e)}`);
    }
  }

  return {
    success: true,
    componentSetId: componentSet.id,
    componentSetName: componentSet.name,
    variantCount: components.length,
    errors,
  };
}
