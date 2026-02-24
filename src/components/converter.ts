// ============================================================================
// FigmaOrganizer - Component Converter
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
 * Creates a ComponentNode from an existing SceneNode.
 * - If the node is NOT inside an instance: moves children directly (no clone needed).
 * - If the node IS inside an instance: clones each child (direct move is forbidden
 *   by Figma API — "Cannot move node. Node is inside of an instance").
 * Does NOT insert into any parent — caller is responsible for appending and positioning.
 * The original node is removed.
 */
function extractToComponent(node: SceneNode): ComponentNode {
  if (!CONVERTIBLE_TYPES.has(node.type)) {
    throw new Error(`Cannot convert ${node.type} to COMPONENT`);
  }

  // Figma does not allow removing or moving nodes inside COMPONENT/INSTANCE trees
  if (isInsideProtected(node)) {
    throw new Error(
      `"${(node as any).name || node.id}" is inside a component or instance and cannot be converted. ` +
      `Detach the containing instance first.`
    );
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
    try {
      // Recover the first node's original parent via parentId from metadata
      const firstParent = masterMeta.parentId
        ? (figma.getNodeById(masterMeta.parentId) as any)
        : null;

      const firstInst = masterComponent.createInstance();

      const firstParentIsInstance =
        firstParent?.type === "INSTANCE" || (firstParent && isInsideInstance(firstParent));

      if (firstParent && typeof firstParent.appendChild === "function" && !firstParentIsInstance) {
        // Insert into original parent; use relative x/y from metadata
        firstParent.appendChild(firstInst);
        firstInst.x = masterMeta.relativeX ?? masterMeta.absoluteX;
        firstInst.y = masterMeta.relativeY ?? masterMeta.absoluteY;
      } else {
        // Parent is an instance or not found — use absolute canvas coords
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

        // Guard: cannot remove nodes inside a COMPONENT or INSTANCE
        if (isInsideProtected(node)) {
          throw new Error(
            `"${(node as any).name || nodeId}" is inside a component or instance. Detach it first.`
          );
        }

        // Snapshot parent and relative position BEFORE removal
        const nodeParent = node.parent as any;
        const relX = (node as any).x ?? 0;
        const relY = (node as any).y ?? 0;
        const zIndex = nodeParent && nodeParent.children
          ? nodeParent.children.indexOf(node)
          : -1;
        // Check if parent is an instance (cannot appendChild into an instance)
        const parentIsInstance = nodeParent?.type === "INSTANCE" || isInsideInstance(nodeParent);

        node.remove();

        const instance = masterComponent!.createInstance();

        const canInsertIntoParent =
          nodeParent &&
          typeof nodeParent.appendChild === "function" &&
          !parentIsInstance;

        if (canInsertIntoParent) {
          // Re-insert at same z-index within original parent
          nodeParent.appendChild(instance);
          if (zIndex >= 0 && typeof nodeParent.insertChild === "function") {
            nodeParent.insertChild(zIndex, instance);
          }
          instance.x = relX;
          instance.y = relY;
        } else {
          // Parent is an instance or page root — use absolute canvas coords
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
