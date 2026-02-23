// ============================================================================
// FigmaOrganizer - Apply: Add Safe Area Frame
//
// Strategy:
//   Takes all existing children of the target FRAME or COMPONENT and wraps
//   them inside a new child frame named "safearea". The safearea frame:
//     - fills the entire parent (x:0, y:0, width/height same as parent)
//     - has clipsContent = false
//     - has fills = [] (transparent)
//     - is inserted as the only direct child of the parent
//   This is purely a structural wrapper — no padding manipulation.
// ============================================================================

export interface SafeAreaRule {
  id: string;
}

export interface SafeAreaPreview {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  found: boolean;
  applicable: boolean;
  childCount: number;
  reason: string;
}

export interface SafeAreaResult {
  nodeId: string;
  nodeName: string;
  success: boolean;
  safeAreaFrameId?: string;
  changes?: string;
  error?: string;
}

const APPLICABLE_TYPES = ["FRAME", "COMPONENT"];

/**
 * Preview safe area frame insertion without applying
 */
export function previewSafeAreas(rules: SafeAreaRule[]): SafeAreaPreview[] {
  return rules.map((rule) => {
    try {
      const node = figma.getNodeById(rule.id);

      if (!node) {
        return {
          nodeId: rule.id,
          nodeName: "?",
          nodeType: "UNKNOWN",
          found: false,
          applicable: false,
          childCount: 0,
          reason: "Node not found",
        };
      }

      if (!APPLICABLE_TYPES.includes(node.type)) {
        return {
          nodeId: rule.id,
          nodeName: (node as any).name || "",
          nodeType: node.type,
          found: true,
          applicable: false,
          childCount: 0,
          reason: `Only FRAME and COMPONENT nodes are supported (got ${node.type})`,
        };
      }

      const container = node as FrameNode | ComponentNode;

      // Check if safearea frame already exists
      const alreadyExists = container.children.some(
        (c) => c.name === "safearea" && c.type === "FRAME"
      );
      if (alreadyExists) {
        return {
          nodeId: rule.id,
          nodeName: container.name,
          nodeType: node.type,
          found: true,
          applicable: false,
          childCount: container.children.length,
          reason: `"safearea" frame already exists inside "${container.name}"`,
        };
      }

      return {
        nodeId: rule.id,
        nodeName: container.name,
        nodeType: node.type,
        found: true,
        applicable: true,
        childCount: container.children.length,
        reason: `A fullscreen "safearea" frame will wrap ${container.children.length} child(ren) inside "${container.name}"`,
      };
    } catch (e: any) {
      return {
        nodeId: rule.id,
        nodeName: "?",
        nodeType: "UNKNOWN",
        found: false,
        applicable: false,
        childCount: 0,
        reason: e.message || String(e),
      };
    }
  });
}

/**
 * Creates a "safearea" frame inside the target node that wraps all existing children.
 *
 * Before:
 *   ParentFrame
 *     ├── child_a
 *     └── child_b
 *
 * After:
 *   ParentFrame
 *     └── safearea  (x:0 y:0, same size as parent, transparent)
 *           ├── child_a
 *           └── child_b
 */
export function applySafeAreas(rules: SafeAreaRule[]): SafeAreaResult[] {
  return rules.map((rule) => {
    try {
      const node = figma.getNodeById(rule.id);

      if (!node) {
        return { nodeId: rule.id, nodeName: "?", success: false, error: "Node not found" };
      }

      if (!APPLICABLE_TYPES.includes(node.type)) {
        return {
          nodeId: rule.id,
          nodeName: (node as any).name || "",
          success: false,
          error: `Only FRAME and COMPONENT nodes are supported (got ${node.type})`,
        };
      }

      const container = node as FrameNode | ComponentNode;

      // Guard: already has a safearea child
      const alreadyExists = container.children.some(
        (c) => c.name === "safearea" && c.type === "FRAME"
      );
      if (alreadyExists) {
        return {
          nodeId: rule.id,
          nodeName: container.name,
          success: false,
          error: `"safearea" frame already exists inside "${container.name}"`,
        };
      }

      const parentWidth = container.width;
      const parentHeight = container.height;

      // 1. Create the safearea frame
      const safeAreaFrame = figma.createFrame();
      safeAreaFrame.name = "safearea";
      safeAreaFrame.resize(parentWidth, parentHeight);
      safeAreaFrame.x = 0;
      safeAreaFrame.y = 0;
      safeAreaFrame.fills = [];           // transparent
      safeAreaFrame.clipsContent = false; // don't clip overflow
      safeAreaFrame.locked = false;

      // 2. Collect all current children (snapshot before mutation)
      const existingChildren = [...container.children];

      // 3. Insert safearea frame into parent first (required before reparenting)
      container.appendChild(safeAreaFrame);

      // 4. Move all original children into the safearea frame
      //    Use insertChild to preserve Z-order
      for (let i = 0; i < existingChildren.length; i++) {
        safeAreaFrame.insertChild(i, existingChildren[i]);
      }

      return {
        nodeId: rule.id,
        nodeName: container.name,
        success: true,
        safeAreaFrameId: safeAreaFrame.id,
        changes: `"safearea" frame created (${Math.round(parentWidth)}×${Math.round(parentHeight)}), wrapped ${existingChildren.length} child(ren)`,
      };
    } catch (e: any) {
      return {
        nodeId: rule.id,
        nodeName: "?",
        success: false,
        error: e.message || String(e),
      };
    }
  });
}
