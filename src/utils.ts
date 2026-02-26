// ============================================================================
// Fixma - Utility / Helper Functions
// ============================================================================

/**
 * Counts total nodes in a tree for progress tracking
 */
export function countNodes(node: any): number {
  let count = 1;
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

/**
 * Maps font style name to numeric weight
 */
export function getFontWeight(styleName: string): number {
  const map: { [key: string]: number } = {
    Thin: 100,
    ExtraLight: 200,
    UltraLight: 200,
    Light: 300,
    Regular: 400,
    Normal: 400,
    Medium: 500,
    SemiBold: 600,
    DemiBold: 600,
    Bold: 700,
    ExtraBold: 800,
    UltraBold: 800,
    Black: 900,
    Heavy: 900,
  };
  return map[styleName] || 400;
}

/**
 * Safely deep-clones a Figma property to plain JSON
 */
export function safeClone(value: any): any {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

/**
 * Converts Plugin API paint array to REST API compatible format.
 * Maps scaleMode "CROP" -> "FILL" (REST API equivalent).
 * Ensures color.a (alpha) is always present (defaults to 1).
 * Renames imageHash -> imageRef for IMAGE fills.
 */
export function convertPaintsToRest(
  paints: readonly Paint[] | typeof figma.mixed
): any[] {
  if (!paints || paints === figma.mixed) return [];
  const cloned = safeClone(paints);
  if (!Array.isArray(cloned)) return [];
  for (const paint of cloned) {
    if (!paint) continue;
    // scaleMode: CROP -> FILL
    if (paint.scaleMode === "CROP") {
      paint.scaleMode = "FILL";
    }
    // Ensure color.a exists
    if (paint.color && paint.color.a === undefined) {
      paint.color.a = paint.opacity !== undefined ? paint.opacity : 1;
    }
    // Ensure gradientStops colors have alpha
    if (paint.gradientStops && Array.isArray(paint.gradientStops)) {
      for (const stop of paint.gradientStops) {
        if (stop.color && stop.color.a === undefined) {
          stop.color.a = 1;
        }
      }
    }
    // imageHash -> imageRef (REST API key name)
    if (paint.imageHash && !paint.imageRef) {
      paint.imageRef = paint.imageHash;
      delete paint.imageHash;
    }
  }
  return cloned;
}
