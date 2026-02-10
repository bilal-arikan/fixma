// ============================================================================
// FigmaOrganizer - Data Collectors (Components, Styles, etc.)
// ============================================================================

import { safeClone } from "../utils";

/**
 * Collects component definitions from pages
 */
export function collectComponents(pages: PageNode[]): any {
  const components: any = {};
  for (const page of pages) {
    try {
      const compNodes = page.findAll(
        (n) => n.type === "COMPONENT"
      ) as ComponentNode[];
      for (const comp of compNodes) {
        components[comp.id] = {
          key: comp.key || "",
          name: comp.name,
          description: comp.description || "",
          remote: comp.remote || false,
          documentationLinks: safeClone(comp.documentationLinks) || [],
        };
      }
    } catch {}
  }
  return components;
}

/**
 * Collects component set definitions from pages
 */
export function collectComponentSets(pages: PageNode[]): any {
  const sets: any = {};
  for (const page of pages) {
    try {
      const setNodes = page.findAll(
        (n) => n.type === "COMPONENT_SET"
      ) as ComponentSetNode[];
      for (const cs of setNodes) {
        sets[cs.id] = {
          key: cs.key || "",
          name: cs.name,
          description: cs.description || "",
        };
      }
    } catch {}
  }
  return sets;
}

/**
 * Collects local styles (text, paint, effect, grid)
 */
export function collectStyles(): any {
  const styles: any = {};
  try {
    const textStyles = figma.getLocalTextStyles();
    for (const s of textStyles) {
      styles[s.id] = {
        key: s.key,
        name: s.name,
        styleType: "TEXT",
        description: s.description || "",
      };
    }
  } catch {}
  try {
    const paintStyles = figma.getLocalPaintStyles();
    for (const s of paintStyles) {
      styles[s.id] = {
        key: s.key,
        name: s.name,
        styleType: "FILL",
        description: s.description || "",
      };
    }
  } catch {}
  try {
    const effectStyles = figma.getLocalEffectStyles();
    for (const s of effectStyles) {
      styles[s.id] = {
        key: s.key,
        name: s.name,
        styleType: "EFFECT",
        description: s.description || "",
      };
    }
  } catch {}
  try {
    const gridStyles = figma.getLocalGridStyles();
    for (const s of gridStyles) {
      styles[s.id] = {
        key: s.key,
        name: s.name,
        styleType: "GRID",
        description: s.description || "",
      };
    }
  } catch {}
  return styles;
}
