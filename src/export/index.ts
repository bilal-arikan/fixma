// ============================================================================
// Fixma - Document Export (REST API compatible JSON)
// ============================================================================

import { countNodes, safeClone } from "../utils";
import { serializeSceneNode } from "./serializer";
import {
  collectComponents,
  collectComponentSets,
  collectStyles,
} from "./collectors";

/**
 * Serializes a PageNode to CANVAS format (matching REST API)
 */
function serializePageNode(page: PageNode, includeGeometry: boolean): any {
  let backgroundColor = { r: 0.8, g: 0.8, b: 0.8, a: 1.0 };
  try {
    const bgs = (page as any).backgrounds;
    if (bgs && bgs.length > 0 && bgs[0].type === "SOLID") {
      backgroundColor = {
        r: bgs[0].color.r,
        g: bgs[0].color.g,
        b: bgs[0].color.b,
        a: bgs[0].opacity !== undefined ? bgs[0].opacity : 1.0,
      };
    }
  } catch {}

  let prototypeStartNodeID: string | null = null;
  let flowStartingPoints: any[] = [];
  try {
    const fsp = (page as any).flowStartingPoints;
    if (fsp && fsp.length > 0) {
      flowStartingPoints = safeClone(fsp) || [];
      prototypeStartNodeID = fsp[0].nodeId || null;
    }
  } catch {}

  return {
    id: page.id,
    name: page.name,
    type: "CANVAS",
    scrollBehavior: "SCROLLS",
    children: page.children.map((child: SceneNode) =>
      serializeSceneNode(child, includeGeometry)
    ),
    backgroundColor: backgroundColor,
    prototypeStartNodeID: prototypeStartNodeID,
    flowStartingPoints: flowStartingPoints,
    prototypeDevice: { type: "NONE", rotation: "NONE" },
  };
}

/**
 * Main export function - builds REST API compatible JSON
 * @param scope - "current" for current page, "all" for all pages
 * @param includeGeometry - whether to include fillGeometry/strokeGeometry
 */
export function exportDocumentJSON(
  scope: string,
  includeGeometry: boolean
): any {
  const pages: PageNode[] =
    scope === "all" ? [...figma.root.children] : [figma.currentPage];

  // Count total nodes for progress
  let totalNodes = 0;
  for (const page of pages) {
    totalNodes += countNodes(page);
  }

  figma.notify(`⏳ Exporting ${totalNodes} nodes...`);

  const documentData = {
    id: "0:0",
    name: "Document",
    type: "DOCUMENT",
    scrollBehavior: "SCROLLS",
    children: pages.map((page) => serializePageNode(page, includeGeometry)),
  };

  const result = {
    document: documentData,
    components: collectComponents(pages),
    componentSets: collectComponentSets(pages),
    schemaVersion: 0,
    styles: collectStyles(),
    name: figma.root.name,
    lastModified: new Date().toISOString(),
    version: "0",
    role: "owner",
    editorType: "figma",
    linkAccess: "view",
  };

  figma.notify(`✅ Export complete: ${totalNodes} nodes exported`);
  return { exportData: result, totalNodes: totalNodes };
}
