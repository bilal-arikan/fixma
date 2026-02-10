import { RenameRule, ActionResult, LogEntry } from "../types";

/**
 * Renames node by ID
 * Falls back to name-based search if not found
 */
export function applyRename(rule: RenameRule, logs: LogEntry[]): ActionResult {
  try {
    let targetNode = figma.getNodeById(rule.id);

    // If not found by ID, fallback to name-based search
    if (!targetNode) {
      const searchResult = searchNodeByName(rule.id);
      if (searchResult) {
        targetNode = searchResult;
        logs.push({
          timestamp: new Date().toISOString(),
          level: "warning",
          message: `Node ID '${rule.id}' not found. Using name-based fallback: ${targetNode.name}`,
          nodeId: rule.id,
        });
      } else {
        throw new Error(`Node ID not found: ${rule.id}`);
      }
    }

    // Check if locked
    if ((targetNode as any).locked) {
      logs.push({
        timestamp: new Date().toISOString(),
        level: "warning",
        message: `Node '${targetNode.name}' is locked, cannot rename`,
        nodeId: rule.id,
      });
      return {
        success: false,
        message: `Node is locked: ${targetNode.name}`,
        nodeId: rule.id,
      };
    }

    const oldName = targetNode.name;
    targetNode.name = rule.name;

    logs.push({
      timestamp: new Date().toISOString(),
      level: "info",
      message: `Node renamed successfully: '${oldName}' → '${rule.name}'`,
      nodeId: rule.id,
    });

    return {
      success: true,
      message: `Renamed successfully: ${oldName} → ${rule.name}`,
      nodeId: rule.id,
      nodeType: targetNode.type,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logs.push({
      timestamp: new Date().toISOString(),
      level: "error",
      message: `Rename error: ${errorMessage}`,
      nodeId: rule.id,
    });
    return {
      success: false,
      message: `Error: ${errorMessage}`,
      nodeId: rule.id,
    };
  }
}

/**
 * Search for node by name
 */
function searchNodeByName(searchId: string): BaseNode | null {
  const root = figma.currentPage;

  function search(node: BaseNode): BaseNode | null {
    // Search group nodes
    if ("name" in node && node.name.includes(searchId)) {
      return node;
    }

    if ("children" in node) {
      for (const child of node.children) {
        const result = search(child);
        if (result) return result;
      }
    }

    return null;
  }

  return search(root);
}
