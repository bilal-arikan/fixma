// ============================================================================
// FigmaOrganizer - Component Converter
//
// Flow for a selected group:
//   1. Take the first node as the "master" — convert it to a COMPONENT in-place
//   2. For every other node in the group:
//        a. Snapshot its text values and fills (diff data from scanner)
//        b. Create an instance of the master component
//        c. Position the instance at the original node's (x, y)
//        d. Insert the instance at the same z-index in the parent
//        e. Remove the original node
//        f. Write back text/fill overrides so content is not lost
// ============================================================================

import { DiffEntry } from "./scanner";

export interface ConvertRequest {
  fingerprint: string;
  label: string;
  /** nodeIds[0] becomes the master component; rest become instances */
  nodeIds: string[];
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

// ── Master conversion ─────────────────────────────────────────────────────────

function nodeToComponent(node: SceneNode): ComponentNode {
  if (!CONVERTIBLE_TYPES.has(node.type)) {
    throw new Error(`Cannot convert ${node.type} to COMPONENT`);
  }

  const parent = node.parent;
  if (!parent || parent.type === "DOCUMENT") {
    throw new Error("Node has no valid parent");
  }

  const name = (node as any).name || "Component";
  const x = (node as any).x ?? 0;
  const y = (node as any).y ?? 0;
  const w = (node as any).width ?? 100;
  const h = (node as any).height ?? 100;
  const idx = (parent as any).children.indexOf(node);

  const comp = figma.createComponent();
  comp.name = name;
  comp.x = x;
  comp.y = y;
  comp.resize(w, h);

  // Move children into component
  if ("children" in node) {
    const children = [...(node as any).children];
    for (const child of children) {
      comp.appendChild(child);
    }
  }

  if ("insertChild" in parent) {
    (parent as any).insertChild(idx, comp);
  } else {
    (parent as any).appendChild(comp);
  }
  node.remove();

  return comp;
}

// ── Override application ──────────────────────────────────────────────────────

/**
 * Applies text and fill overrides to an instance based on diff data.
 * Returns the number of overrides successfully applied.
 */
function applyOverrides(instance: InstanceNode, diff: DiffEntry): number {
  let applied = 0;

  // Text overrides — find TEXT children by name and set characters
  if (diff.textDiffs.length > 0) {
    const textNodes = instance.findAll((n) => n.type === "TEXT") as TextNode[];
    for (const td of diff.textDiffs) {
      const target = textNodes.find((t) => t.name === td.childName);
      if (target) {
        try {
          target.characters = td.value;
          applied++;
        } catch (_) {
          // font may not be loaded — skip silently
        }
      }
    }
  }

  // Fill override — restore original node's fills on the instance
  if (diff.fillDiffs.length > 0 && diff.rawFills && diff.rawFills.length > 0) {
    try {
      (instance as any).fills = diff.rawFills;
      applied++;
    } catch (_) {
      // ignore
    }
  }

  return applied;
}

// ── Main entry ────────────────────────────────────────────────────────────────

export function convertGroups(requests: ConvertRequest[]): ConvertResult[] {
  return requests.map((req) => {
    const errors: string[] = [];
    let masterComponent: ComponentNode | null = null;
    let instanceCount = 0;
    let successCount = 0;
    let overridesApplied = 0;
    let componentName = req.componentName || "";

    if (req.nodeIds.length < 1) {
      return {
        fingerprint: req.fingerprint,
        label: req.label,
        componentId: null,
        componentName: "",
        masterNodeId: "",
        instanceCount: 0,
        successCount: 0,
        overridesApplied: 0,
        errors: ["No node IDs provided"],
      };
    }

    // ── Step 1: Create master component from first node ──────────────────
    const masterNodeId = req.nodeIds[0];
    try {
      const masterNode = figma.getNodeById(masterNodeId) as SceneNode;
      if (!masterNode) throw new Error(`Master node ${masterNodeId} not found`);

      if (masterNode.type === "COMPONENT") {
        masterComponent = masterNode as ComponentNode;
      } else {
        masterComponent = nodeToComponent(masterNode);
      }

      if (!componentName) {
        componentName = masterComponent.name;
      } else {
        masterComponent.name = componentName;
      }
      successCount++;
    } catch (e: any) {
      errors.push(`Master: ${e.message || String(e)}`);
      return {
        fingerprint: req.fingerprint,
        label: req.label,
        componentId: null,
        componentName,
        masterNodeId,
        instanceCount: 0,
        successCount: 0,
        overridesApplied: 0,
        errors,
      };
    }

    // ── Step 2: Replace remaining nodes with instances ───────────────────
    for (let i = 1; i < req.nodeIds.length; i++) {
      const nodeId = req.nodeIds[i];
      // Diff entry for this node (index i-1 because diffs start at nodes[1])
      const diff: DiffEntry | undefined = req.diffs?.[i - 1];

      try {
        const node = figma.getNodeById(nodeId) as SceneNode;
        if (!node) throw new Error(`Node ${nodeId} not found`);

        const parent = node.parent;
        if (!parent || parent.type === "DOCUMENT") throw new Error("No valid parent");

        const x = (node as any).x ?? 0;
        const y = (node as any).y ?? 0;
        const idx = (parent as any).children.indexOf(node);

        // Create instance
        const instance = masterComponent!.createInstance();
        instance.x = x;
        instance.y = y;

        if ("insertChild" in parent) {
          (parent as any).insertChild(idx, instance);
        } else {
          (parent as any).appendChild(instance);
        }

        // Remove original before applying overrides
        node.remove();

        // Apply text/fill overrides to restore original content
        if (diff) {
          overridesApplied += applyOverrides(instance, diff);
        }

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
