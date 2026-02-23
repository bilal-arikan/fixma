// ============================================================================
// FigmaOrganizer - Apply: Rename Nodes
// ============================================================================

export interface RenameRule {
  id: string;
  name: string;
}

export interface RenamePreview {
  nodeId: string;
  oldName: string;
  newName: string;
  nodeType: string;
  found: boolean;
}

export interface RenameResult {
  nodeId: string;
  oldName: string;
  newName: string;
  success: boolean;
  error?: string;
}

/**
 * Preview rename operations without applying them
 */
export function previewRenames(rules: RenameRule[]): RenamePreview[] {
  return rules.map((rule) => {
    try {
      const node = figma.getNodeById(rule.id);
      if (!node) {
        return {
          nodeId: rule.id,
          oldName: "?",
          newName: rule.name,
          nodeType: "UNKNOWN",
          found: false,
        };
      }
      return {
        nodeId: rule.id,
        oldName: (node as any).name || "",
        newName: rule.name,
        nodeType: node.type,
        found: true,
      };
    } catch {
      return {
        nodeId: rule.id,
        oldName: "?",
        newName: rule.name,
        nodeType: "UNKNOWN",
        found: false,
      };
    }
  });
}

/**
 * Apply rename operations to Figma nodes
 */
export function applyRenames(rules: RenameRule[]): RenameResult[] {
  return rules.map((rule) => {
    try {
      const node = figma.getNodeById(rule.id);
      if (!node) {
        return {
          nodeId: rule.id,
          oldName: "?",
          newName: rule.name,
          success: false,
          error: "Node not found",
        };
      }
      const oldName = (node as any).name || "";
      (node as any).name = rule.name;
      return {
        nodeId: rule.id,
        oldName,
        newName: rule.name,
        success: true,
      };
    } catch (e: any) {
      return {
        nodeId: rule.id,
        oldName: "?",
        newName: rule.name,
        success: false,
        error: e.message || String(e),
      };
    }
  });
}
