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

/**
 * Creates a ComponentNode from an existing SceneNode.
 * Moves all children into the component. Does NOT insert into any parent —
 * caller is responsible for appending and positioning.
 * The original node is removed.
 */
function extractToComponent(node: SceneNode): ComponentNode {
  if (!CONVERTIBLE_TYPES.has(node.type)) {
    throw new Error(`Cannot convert ${node.type} to COMPONENT`);
  }

  const name = (node as any).name || "Component";
  const w = (node as any).width ?? 100;
  const h = (node as any).height ?? 100;

  const comp = figma.createComponent();
  comp.name = name;
  comp.resize(w, h);

  // Move children
  if ("children" in node) {
    const children = [...(node as any).children];
    for (const child of children) {
      comp.appendChild(child);
    }
  }

  node.remove();
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

      if (firstParent && typeof firstParent.appendChild === "function") {
        // Insert into original parent; use relative x/y from metadata
        firstParent.appendChild(firstInst);
        firstInst.x = masterMeta.relativeX ?? masterMeta.absoluteX;
        firstInst.y = masterMeta.relativeY ?? masterMeta.absoluteY;
      } else {
        // Fallback: page root with absolute coords
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

        // Snapshot parent and relative position BEFORE removal
        const nodeParent = node.parent as any;
        const relX = (node as any).x ?? 0;
        const relY = (node as any).y ?? 0;
        const zIndex = nodeParent && nodeParent.children
          ? nodeParent.children.indexOf(node)
          : -1;

        node.remove();

        const instance = masterComponent!.createInstance();

        if (nodeParent && typeof nodeParent.appendChild === "function") {
          // Re-insert at same z-index within original parent
          nodeParent.appendChild(instance);
          if (zIndex >= 0 && typeof nodeParent.insertChild === "function") {
            nodeParent.insertChild(zIndex, instance);
          }
          instance.x = relX;
          instance.y = relY;
        } else {
          // Fallback: page root with absolute coords from metadata
          page.appendChild(instance);
          instance.x = nodeMeta?.absoluteX ?? 0;
          instance.y = nodeMeta?.absoluteY ?? 0;
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
