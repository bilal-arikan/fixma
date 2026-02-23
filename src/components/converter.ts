// ============================================================================
// FigmaOrganizer - Component Converter
//
// Flow for a selected group:
//   1. Take the first node as the "master" — convert it to a COMPONENT in-place
//   2. For every other node in the group:
//        a. Create an instance of the master component (createInstance)
//        b. Position the instance at the original node's (x, y)
//        c. Insert the instance at the same z-index in the parent
//        d. Remove the original node
//
// The caller passes a list of ConvertRequest objects, one per group to process.
// Each ConvertRequest includes the fingerprint and the ordered nodeIds to convert
// (first = master, rest = instances).
// ============================================================================

export interface ConvertRequest {
  fingerprint: string;
  label: string;
  /** nodeIds[0] becomes the master component; rest become instances */
  nodeIds: string[];
  /** Optional name to give the component (defaults to first node name) */
  componentName?: string;
}

export interface ConvertResult {
  fingerprint: string;
  label: string;
  componentId: string | null;
  componentName: string;
  masterNodeId: string;
  instanceCount: number;
  successCount: number;
  errors: string[];
}

const CONVERTIBLE_TYPES = new Set(["FRAME", "GROUP", "RECTANGLE", "ELLIPSE", "VECTOR"]);

/**
 * Converts a FRAME/GROUP into a ComponentNode in-place.
 * Returns the new ComponentNode, or throws on failure.
 */
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

  // Insert at original z-index, then remove original
  if ("insertChild" in parent) {
    (parent as any).insertChild(idx, comp);
  } else {
    (parent as any).appendChild(comp);
  }
  node.remove();

  return comp;
}

/**
 * Processes a list of ConvertRequests.
 * For each group: first node → COMPONENT master, rest → instances.
 */
export function convertGroups(requests: ConvertRequest[]): ConvertResult[] {
  return requests.map((req) => {
    const errors: string[] = [];
    let masterComponent: ComponentNode | null = null;
    let instanceCount = 0;
    let successCount = 0;
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
        errors: ["No node IDs provided"],
      };
    }

    // ── Step 1: Create master component from first node ──────────────────
    const masterNodeId = req.nodeIds[0];
    try {
      const masterNode = figma.getNodeById(masterNodeId) as SceneNode;
      if (!masterNode) throw new Error(`Master node ${masterNodeId} not found`);

      // If it's already a COMPONENT, just use it as-is
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
        errors,
      };
    }

    // ── Step 2: Replace remaining nodes with instances ───────────────────
    for (let i = 1; i < req.nodeIds.length; i++) {
      const nodeId = req.nodeIds[i];
      try {
        const node = figma.getNodeById(nodeId) as SceneNode;
        if (!node) throw new Error(`Node ${nodeId} not found`);

        const parent = node.parent;
        if (!parent || parent.type === "DOCUMENT") {
          throw new Error("No valid parent");
        }

        const x = (node as any).x ?? 0;
        const y = (node as any).y ?? 0;
        const idx = (parent as any).children.indexOf(node);

        // Create instance of master
        const instance = masterComponent!.createInstance();
        instance.x = x;
        instance.y = y;

        // Insert at same z-index
        if ("insertChild" in parent) {
          (parent as any).insertChild(idx, instance);
        } else {
          (parent as any).appendChild(instance);
        }

        // Remove original
        node.remove();

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
      errors,
    };
  });
}
