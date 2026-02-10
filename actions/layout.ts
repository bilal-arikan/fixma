import { LayoutRule, ActionResult, LogEntry } from "../types";

/**
 * Applies Auto Layout rules
 * Converts absolute to auto
 * Applies padding/spacing
 */
export function applyLayout(rule: LayoutRule, logs: LogEntry[]): ActionResult {
  try {
    const targetNode = figma.getNodeById(rule.id) as BaseNode;

    if (!targetNode) {
      throw new Error(`Node ID not found: ${rule.id}`);
    }

    // Auto Layout only works on Frame, Component, and ComponentSet
    if (
      targetNode.type !== "FRAME" &&
      targetNode.type !== "COMPONENT" &&
      targetNode.type !== "COMPONENT_SET"
    ) {
      throw new Error(
        `Auto Layout cannot be applied to: ${targetNode.type}`
      );
    }

    const layoutNode = targetNode as FrameNode | ComponentNode;

    // Check existing layout settings
    const hasAutoLayout = layoutNode.layoutMode !== "NONE";

    if (rule.mode === "auto") {
      // Enable auto layout
      layoutNode.layoutMode = "HORIZONTAL"; // Default to horizontal

      // Apply spacing
      if (rule.spacing !== undefined) {
        layoutNode.itemSpacing = rule.spacing;
      }

      // Apply padding
      if (rule.padding) {
        if (rule.padding.horizontal !== undefined) {
          layoutNode.paddingLeft = rule.padding.horizontal;
          layoutNode.paddingRight = rule.padding.horizontal;
        }
        if (rule.padding.vertical !== undefined) {
          layoutNode.paddingTop = rule.padding.vertical;
          layoutNode.paddingBottom = rule.padding.vertical;
        }
      }

      logs.push({
        timestamp: new Date().toISOString(),
        level: "info",
        message: `Auto Layout applied: ${targetNode.name} (spacing: ${rule.spacing || "default"})`,
        nodeId: rule.id,
      });
    } else if (rule.mode === "absolute") {
      // Convert to absolute layout (disable auto layout)
      layoutNode.layoutMode = "NONE";

      logs.push({
        timestamp: new Date().toISOString(),
        level: "info",
        message: `Converted to absolute layout: ${targetNode.name}`,
        nodeId: rule.id,
      });
    }

    return {
      success: true,
      message: `Layout rule applied: ${rule.mode}`,
      nodeId: rule.id,
      nodeType: targetNode.type,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logs.push({
      timestamp: new Date().toISOString(),
      level: "error",
      message: `Layout rule error: ${errorMessage}`,
      nodeId: rule.id,
    });
    return {
      success: false,
      message: `Error: ${errorMessage}`,
      nodeId: rule.id,
    };
  }
}
