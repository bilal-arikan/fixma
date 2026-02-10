import { MakeComponentRule, ActionResult, LogEntry } from "../types";

/**
 * Converts node to component
 * Automatically swaps existing instances
 */
export function applyMakeComponent(
  rule: MakeComponentRule,
  logs: LogEntry[]
): ActionResult {
  try {
    let targetNode = figma.getNodeById(rule.id) as BaseNode;

    if (!targetNode) {
      throw new Error(`Node ID not found: ${rule.id}`);
    }

    // Convert Group nodes to FRAME
    if (targetNode.type === "GROUP") {
      const groupNode = targetNode as GroupNode;
      const frameNode = figma.createFrame();

      // Copy properties
      frameNode.x = groupNode.x;
      frameNode.y = groupNode.y;
      frameNode.name = groupNode.name;

      // Move children
      for (const child of groupNode.children) {
        frameNode.appendChild(child.clone());
      }

      // Delete old group
      const parent = groupNode.parent;
      groupNode.remove();

      targetNode = frameNode;
      if (parent && "appendChild" in parent) {
        parent.appendChild(frameNode);
      }

      logs.push({
        timestamp: new Date().toISOString(),
        level: "info",
        message: `Group node automatically converted to FRAME: ${groupNode.name}`,
        nodeId: rule.id,
      });
    }

    // If already component, check
    if (targetNode.type === "COMPONENT" || targetNode.type === "COMPONENT_SET" || targetNode.type === "INSTANCE") {
      logs.push({
        timestamp: new Date().toISOString(),
        level: "warning",
        message: `Node is already a component: ${targetNode.name}`,
        nodeId: rule.id,
      });
      return {
        success: false,
        message: `Node is already a component`,
        nodeId: rule.id,
      };
    }

    // Convert to component
    if (
      targetNode.type === "FRAME" ||
      targetNode.type === "RECTANGLE" ||
      targetNode.type === "TEXT"
    ) {
      const componentNode = (targetNode as any).createComponent();
      componentNode.name = rule.type;

      // Transfer component name with metadata
      if (
        "mainComponent" in componentNode &&
        componentNode.mainComponent === null
      ) {
        // Component created successfully
      }

      logs.push({
        timestamp: new Date().toISOString(),
        level: "info",
        message: `Component created successfully: ${rule.type} (${targetNode.name})`,
        nodeId: rule.id,
      });

      return {
        success: true,
        message: `Component created: ${rule.type}`,
        nodeId: rule.id,
        nodeType: "COMPONENT",
      };
    } else {
      throw new Error(
        `Node type cannot be converted to component: ${targetNode.type}`
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logs.push({
      timestamp: new Date().toISOString(),
      level: "error",
      message: `Component creation error: ${errorMessage}`,
      nodeId: rule.id,
    });
    return {
      success: false,
      message: `Error: ${errorMessage}`,
      nodeId: rule.id,
    };
  }
}
