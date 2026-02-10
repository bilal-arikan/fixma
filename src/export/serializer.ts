// ============================================================================
// FigmaOrganizer - Scene Node Serializer (REST API compatible)
// ============================================================================

import { safeClone, convertPaintsToRest, getFontWeight } from "../utils";

/**
 * Serializes a SceneNode to REST API compatible JSON format.
 * Property order matches REST API output for consistency.
 */
export function serializeSceneNode(
  node: SceneNode,
  includeGeometry: boolean,
  parentAbsTransform?: number[][]
): any {
  const n = node as any;
  const result: any = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  // Locked (before scrollBehavior, like API)
  if (n.locked) {
    result.locked = n.locked;
  }

  result.scrollBehavior = "SCROLLS";

  // Get this node's absoluteTransform for passing to children
  const nodeAbsTransform =
    "absoluteTransform" in n ? n.absoluteTransform : undefined;

  // Children (recursive) — API places children early, before fills
  if ("children" in n && n.children) {
    result.children = n.children.map((child: SceneNode) =>
      serializeSceneNode(child, includeGeometry, nodeAbsTransform)
    );
  }

  // Blend mode
  if ("blendMode" in n) result.blendMode = n.blendMode;

  // Clips content (Frames)
  if ("clipsContent" in n) result.clipsContent = n.clipsContent;

  // Background + Fills (API order: background then fills)
  if ("fills" in n) {
    const fills = n.fills;
    if (fills !== figma.mixed) {
      const convertedFills = convertPaintsToRest(fills);
      result.background = convertedFills;
      result.fills = convertedFills;
    } else {
      result.background = [];
      result.fills = [];
    }
  } else {
    result.fills = [];
  }

  // Strokes
  if ("strokes" in n) {
    result.strokes = convertPaintsToRest(n.strokes);
  } else {
    result.strokes = [];
  }

  // Stroke weight & align
  if ("strokeWeight" in n) {
    const sw = n.strokeWeight;
    result.strokeWeight = typeof sw === "number" ? sw : 1.0;
  } else {
    result.strokeWeight = 0;
  }
  if ("strokeAlign" in n) {
    result.strokeAlign = n.strokeAlign;
  } else {
    result.strokeAlign = "INSIDE";
  }

  // Background color (for frame-like nodes)
  const frameTypes = [
    "FRAME",
    "COMPONENT",
    "INSTANCE",
    "COMPONENT_SET",
    "SECTION",
  ];
  if (frameTypes.includes(node.type)) {
    try {
      const fills = n.fills;
      if (
        fills &&
        fills !== figma.mixed &&
        fills.length > 0 &&
        fills[0].type === "SOLID"
      ) {
        result.backgroundColor = {
          r: fills[0].color.r,
          g: fills[0].color.g,
          b: fills[0].color.b,
          a: fills[0].opacity !== undefined ? fills[0].opacity : 1.0,
        };
      } else {
        result.backgroundColor = { r: 0, g: 0, b: 0, a: 0 };
      }
    } catch {
      result.backgroundColor = { r: 0, g: 0, b: 0, a: 0 };
    }
  }

  // fillGeometry (optional, API places it after backgroundColor)
  if (includeGeometry && "fillGeometry" in n) {
    result.fillGeometry = safeClone(n.fillGeometry) || [];
  }

  // Stroke join (API places after fillGeometry)
  if ("strokeJoin" in n) {
    const sj = n.strokeJoin;
    result.strokeJoin = typeof sj === "string" ? sj : "MITER";
  }

  // strokeGeometry (optional)
  if (includeGeometry && "strokeGeometry" in n) {
    result.strokeGeometry = safeClone(n.strokeGeometry) || [];
  }

  // Bounding box (axis-aligned, accounts for rotation AND flip like REST API)
  serializeBoundingBox(n, result);

  // Absolute render bounds
  serializeRenderBounds(n, result);

  // Constraints
  serializeConstraints(n, result);

  // Relative transform
  serializeRelativeTransform(n, result, parentAbsTransform);

  // Size
  if ("width" in n && "height" in n) {
    result.size = { x: n.width, y: n.height };
  }

  // Text properties
  if (node.type === "TEXT") {
    serializeTextNode(node as TextNode, result);
  }

  // Effects (API places after text style)
  if ("effects" in n) {
    const effects = safeClone(n.effects) || [];
    for (const eff of effects) {
      if (eff && eff.color && eff.color.a === undefined) {
        eff.color.a = 1;
      }
    }
    result.effects = effects;
  } else {
    result.effects = [];
  }

  // isMask & maskType (API places after effects)
  if ("isMask" in n && n.isMask === true) {
    result.isMask = true;
    if ("maskType" in n) {
      result.maskType = n.maskType;
    }
  }

  // Interactions
  result.interactions = [];

  // Instance → component reference
  if (node.type === "INSTANCE") {
    try {
      const mainComp = (node as InstanceNode).mainComponent;
      if (mainComp) result.componentId = mainComp.id;
    } catch {}
  }

  // --- Plugin-extra properties ---
  serializeExtraProperties(n, node, result);

  return result;
}

/**
 * Computes axis-aligned bounding box from absolute transform
 */
function serializeBoundingBox(n: any, result: any): void {
  try {
    if ("absoluteTransform" in n && "width" in n) {
      const t = n.absoluteTransform;
      const w = n.width;
      const h = n.height;
      const m00 = t[0][0],
        m01 = t[0][1],
        tx = t[0][2];
      const m10 = t[1][0],
        m11 = t[1][1],
        ty = t[1][2];

      const corners = [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: w, y: h },
        { x: 0, y: h },
      ];
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const corner of corners) {
        const px = m00 * corner.x + m01 * corner.y + tx;
        const py = m10 * corner.x + m11 * corner.y + ty;
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
      }
      result.absoluteBoundingBox = {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    }
  } catch {}
}

/**
 * Serializes absolute render bounds
 */
function serializeRenderBounds(n: any, result: any): void {
  try {
    if ("absoluteRenderBounds" in n) {
      const rb = n.absoluteRenderBounds;
      if (rb) {
        result.absoluteRenderBounds = {
          x: rb.x,
          y: rb.y,
          width: rb.width,
          height: rb.height,
        };
      } else {
        result.absoluteRenderBounds = null;
      }
    }
  } catch {}
}

/**
 * Serializes layout constraints with API-compatible naming
 */
function serializeConstraints(n: any, result: any): void {
  if ("constraints" in n) {
    try {
      const verticalMap: Record<string, string> = {
        MIN: "TOP",
        MAX: "BOTTOM",
        CENTER: "CENTER",
        STRETCH: "TOP_BOTTOM",
        SCALE: "SCALE",
      };
      const horizontalMap: Record<string, string> = {
        MIN: "LEFT",
        MAX: "RIGHT",
        CENTER: "CENTER",
        STRETCH: "LEFT_RIGHT",
        SCALE: "SCALE",
      };
      result.constraints = {
        vertical:
          verticalMap[n.constraints.vertical] || n.constraints.vertical,
        horizontal:
          horizontalMap[n.constraints.horizontal] || n.constraints.horizontal,
      };
    } catch {}
  }
}

/**
 * Computes relative transform as inv(parent.absoluteTransform) * node.absoluteTransform
 */
function serializeRelativeTransform(
  n: any,
  result: any,
  parentAbsTransform?: number[][]
): void {
  if ("absoluteTransform" in n && parentAbsTransform) {
    try {
      const nt = n.absoluteTransform;
      const pt = parentAbsTransform;
      const pa = pt[0][0],
        pc = pt[0][1],
        ptx = pt[0][2];
      const pb = pt[1][0],
        pd = pt[1][1],
        pty = pt[1][2];
      const det = pa * pd - pc * pb;
      if (Math.abs(det) > 0.0001) {
        const ia = pd / det,
          ic = -pc / det;
        const ib = -pb / det,
          id_ = pa / det;
        const itx = (pc * pty - pd * ptx) / det;
        const ity = (pb * ptx - pa * pty) / det;
        const na = nt[0][0],
          nc = nt[0][1],
          ntx = nt[0][2];
        const nb = nt[1][0],
          nd = nt[1][1],
          nty = nt[1][2];
        result.relativeTransform = [
          [
            ia * na + ic * nb,
            ia * nc + ic * nd,
            ia * ntx + ic * nty + itx,
          ],
          [
            ib * na + id_ * nb,
            ib * nc + id_ * nd,
            ib * ntx + id_ * nty + ity,
          ],
        ];
      } else {
        result.relativeTransform = safeClone(n.relativeTransform);
      }
    } catch {
      result.relativeTransform = safeClone(n.relativeTransform);
    }
  } else if ("relativeTransform" in n) {
    result.relativeTransform = safeClone(n.relativeTransform);
  }
}

/**
 * Serializes TEXT node specific properties
 */
function serializeTextNode(textNode: TextNode, result: any): void {
  result.characters = textNode.characters;

  try {
    result.characterStyleOverrides = [];
    result.styleOverrideTable = {};
    result.lineTypes = ["NONE"];
    result.lineIndentations = [0];
  } catch {}

  try {
    const fontSize = textNode.fontSize;
    const fontName = textNode.fontName;
    const letterSpacing = textNode.letterSpacing;
    const lineHeight = textNode.lineHeight;

    let letterSpacingValue = 0;
    if (letterSpacing !== figma.mixed) {
      letterSpacingValue = (letterSpacing as any).value || 0;
    }

    let lineHeightPx = 0;
    let lineHeightPercent = 100;
    let lineHeightUnit = "INTRINSIC_%";
    if (lineHeight !== figma.mixed) {
      const lh = lineHeight as any;
      if (lh.unit === "PIXELS") {
        lineHeightPx = lh.value || 0;
        lineHeightUnit = "PIXELS";
        lineHeightPercent =
          fontSize !== figma.mixed && fontSize > 0
            ? Math.round((lh.value / (fontSize as number)) * 100)
            : 100;
      } else if (lh.unit === "PERCENT") {
        lineHeightPercent = lh.value || 100;
        lineHeightUnit = "FONT_SIZE_%";
        lineHeightPx =
          fontSize !== figma.mixed
            ? (fontSize as number) * (lh.value / 100)
            : 0;
      } else {
        lineHeightUnit = "INTRINSIC_%";
        lineHeightPx =
          fontSize !== figma.mixed ? (fontSize as number) * 1.2 : 0;
        lineHeightPercent = 100;
      }
    }

    const fontStyle =
      fontName !== figma.mixed ? (fontName as FontName).style : "Regular";

    result.style = {
      fontFamily:
        fontName !== figma.mixed ? (fontName as FontName).family : "Mixed",
      fontPostScriptName:
        fontName !== figma.mixed
          ? `${(fontName as FontName).family}-${(fontName as FontName).style}`
          : "Mixed",
      fontStyle: fontStyle,
      fontWeight:
        fontName !== figma.mixed
          ? getFontWeight((fontName as FontName).style)
          : 400,
      textAutoResize: (textNode as any).textAutoResize || "NONE",
      fontSize: fontSize !== figma.mixed ? fontSize : 12,
      textAlignHorizontal: textNode.textAlignHorizontal,
      textAlignVertical: textNode.textAlignVertical,
      letterSpacing: letterSpacingValue,
      lineHeightPx: lineHeightPx,
      lineHeightPercent: lineHeightPercent,
      lineHeightUnit: lineHeightUnit,
    };
  } catch {
    result.style = {};
  }
}

/**
 * Serializes extra plugin-specific properties (visibility, auto-layout, corners, etc.)
 */
function serializeExtraProperties(n: any, node: SceneNode, result: any): void {
  // Visibility & opacity
  result.visible = node.visible;
  if ("opacity" in n) result.opacity = n.opacity;

  // Stroke cap & dash pattern
  if ("strokeCap" in n) {
    const sc = n.strokeCap;
    result.strokeCap = typeof sc === "string" ? sc : "NONE";
  }
  if ("dashPattern" in n) {
    result.dashPattern = safeClone(n.dashPattern) || [];
  }

  // Auto Layout properties
  if ("layoutMode" in n && n.layoutMode && n.layoutMode !== "NONE") {
    result.layoutMode = n.layoutMode;
    result.itemSpacing = n.itemSpacing;
    result.paddingLeft = n.paddingLeft;
    result.paddingRight = n.paddingRight;
    result.paddingTop = n.paddingTop;
    result.paddingBottom = n.paddingBottom;
    if ("primaryAxisSizingMode" in n)
      result.primaryAxisSizingMode = n.primaryAxisSizingMode;
    if ("counterAxisSizingMode" in n)
      result.counterAxisSizingMode = n.counterAxisSizingMode;
    if ("primaryAxisAlignItems" in n)
      result.primaryAxisAlignItems = n.primaryAxisAlignItems;
    if ("counterAxisAlignItems" in n)
      result.counterAxisAlignItems = n.counterAxisAlignItems;
  }

  // Layout positioning
  if ("layoutAlign" in n) result.layoutAlign = n.layoutAlign;
  if ("layoutGrow" in n) result.layoutGrow = n.layoutGrow;

  // Corner radius
  if ("cornerRadius" in n) {
    const cr = n.cornerRadius;
    if (typeof cr === "number") result.cornerRadius = cr;
  }
  if ("topLeftRadius" in n) {
    result.rectangleCornerRadii = [
      n.topLeftRadius || 0,
      n.topRightRadius || 0,
      n.bottomRightRadius || 0,
      n.bottomLeftRadius || 0,
    ];
  }

  // Export settings
  if (
    "exportSettings" in n &&
    n.exportSettings &&
    n.exportSettings.length > 0
  ) {
    result.exportSettings = safeClone(n.exportSettings);
  }
}
