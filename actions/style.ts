import { StyleRule, ActionResult, LogEntry } from "../types";

/**
 * Applies style to node
 * Applies text style or fill color
 */
export function applyStyle(rule: StyleRule, logs: LogEntry[]): ActionResult {
  try {
    const targetNode = figma.getNodeById(rule.id) as BaseNode;

    if (!targetNode) {
      throw new Error(`Node ID not found: ${rule.id}`);
    }

    let styleApplied = false;

    // Apply text style
    if (rule.textStyle && targetNode.type === "TEXT") {
      const textNode = targetNode as TextNode;

      // Search for existing text styles
      const textStyles = figma.getLocalTextStyles();
      let targetStyle = textStyles.find((s) => s.name === rule.textStyle);

      if (!targetStyle) {
        // Warn if style not found
        logs.push({
          timestamp: new Date().toISOString(),
          level: "warning",
          message: `Text style not found: ${rule.textStyle}`,
          nodeId: rule.id,
        });
      } else {
        textNode.fillStyleId = targetStyle.id;
        styleApplied = true;

        logs.push({
          timestamp: new Date().toISOString(),
          level: "info",
          message: `Text style applied: ${rule.textStyle}`,
          nodeId: rule.id,
        });
      }
    }

    // Apply fill color
    if (rule.fillColor && "fills" in targetNode) {
      const color: any = {
        r: rule.fillColor.r / 255,
        g: rule.fillColor.g / 255,
        b: rule.fillColor.b / 255,
        a: 1,
      };

      const fills: any[] = [
        {
          type: "SOLID",
          color: color,
        },
      ];

      (targetNode as any).fills = fills;
      styleApplied = true;

      logs.push({
        timestamp: new Date().toISOString(),
        level: "info",
        message: `Fill color applied: rgb(${rule.fillColor.r}, ${rule.fillColor.g}, ${rule.fillColor.b})`,
        nodeId: rule.id,
      });
    }

    if (!styleApplied) {
      throw new Error(`No applicable style rule found`);
    }

    return {
      success: true,
      message: `Style applied successfully`,
      nodeId: rule.id,
      nodeType: targetNode.type,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logs.push({
      timestamp: new Date().toISOString(),
      level: "error",
      message: `Style application error: ${errorMessage}`,
      nodeId: rule.id,
    });
    return {
      success: false,
      message: `Error: ${errorMessage}`,
      nodeId: rule.id,
    };
  }
}
