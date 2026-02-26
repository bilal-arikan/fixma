// ============================================================================
// Fixma - Apply: Convert to Component
// Converts FRAME or GROUP nodes into Figma Components
// ============================================================================

export interface MakeComponentRule {
  id: string;
}

export interface MakeComponentPreview {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  found: boolean;
  convertible: boolean;
  reason?: string;
}

export interface MakeComponentResult {
  nodeId: string;
  nodeName: string;
  newComponentId?: string;
  success: boolean;
  error?: string;
}

const CONVERTIBLE_TYPES = ["FRAME", "GROUP", "RECTANGLE", "ELLIPSE", "VECTOR"];

/**
 * Preview component conversion without applying
 */
export function previewMakeComponents(rules: MakeComponentRule[]): MakeComponentPreview[] {
  return rules.map((rule) => {
    try {
      const node = figma.getNodeById(rule.id);
      if (!node) {
        return {
          nodeId: rule.id,
          nodeName: "?",
          nodeType: "UNKNOWN",
          found: false,
          convertible: false,
          reason: "Node not found",
        };
      }

      const convertible = CONVERTIBLE_TYPES.includes(node.type);
      return {
        nodeId: rule.id,
        nodeName: (node as any).name || "",
        nodeType: node.type,
        found: true,
        convertible,
        reason: convertible
          ? `${node.type} → COMPONENT conversion will be applied`
          : `${node.type} type cannot be converted to a component`,
      };
    } catch (e: any) {
      return {
        nodeId: rule.id,
        nodeName: "?",
        nodeType: "UNKNOWN",
        found: false,
        convertible: false,
        reason: e.message,
      };
    }
  });
}

/**
 * Apply component conversion to Figma nodes.
 * Strategy: create a new COMPONENT, move children into it, replace original.
 */
export function applyMakeComponents(rules: MakeComponentRule[]): MakeComponentResult[] {
  return rules.map((rule) => {
    try {
      const node = figma.getNodeById(rule.id) as SceneNode;
      if (!node) {
        return { nodeId: rule.id, nodeName: "?", success: false, error: "Node not found" };
      }

      if (!CONVERTIBLE_TYPES.includes(node.type)) {
        return {
          nodeId: rule.id,
          nodeName: (node as any).name || "",
          success: false,
          error: `${node.type} type cannot be converted`,
        };
      }

      const parent = node.parent;
      if (!parent || parent.type === "DOCUMENT") {
        return {
          nodeId: rule.id,
          nodeName: (node as any).name || "",
          success: false,
          error: "No valid parent node",
        };
      }

      const nodeName = (node as any).name || "Component";
      const nodeIndex = parent.children.indexOf(node as any);

      // Get position and size from original node
      const x = (node as any).x ?? 0;
      const y = (node as any).y ?? 0;
      const w = (node as any).width ?? 100;
      const h = (node as any).height ?? 100;

      // Create a new component
      const component = figma.createComponent();
      component.name = nodeName;
      component.x = x;
      component.y = y;
      component.resize(w, h);

      // Move children into component (for FRAME/GROUP)
      if ("children" in node && (node as any).children.length > 0) {
        const children = [...(node as any).children];
        for (const child of children) {
          component.appendChild(child);
        }
      }

      // Insert component at the same position in parent
      if ("insertChild" in parent) {
        (parent as any).insertChild(nodeIndex, component);
      } else {
        (parent as any).appendChild(component);
      }

      // Remove original node
      node.remove();

      return {
        nodeId: rule.id,
        nodeName,
        newComponentId: component.id,
        success: true,
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
