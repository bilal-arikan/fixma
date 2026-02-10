import { VariantRule, ActionResult, LogEntry } from "../types";

/**
 * Creates variants
 * Finds base component and creates its variants
 */
export function applyVariant(rule: VariantRule, logs: LogEntry[]): ActionResult {
  try {
    // Search for base component by name
    const baseComponent = findComponentByName(rule.base);

    if (!baseComponent) {
      throw new Error(`Base component not found: ${rule.base}`);
    }

    // Create component set for variants
    // Note: Direct createComponentSet doesn't exist in Figma API, ComponentSet is created separately
    const componentSet = figma.createComponent();
    componentSet.name = rule.base;

    // Base component properties
    // componentSet sizing is handled automatically by Figma API

    const variantCreatedCount: string[] = [];

    // Create variant for each prop
    for (const prop of rule.props) {
      try {
        const variant = createVariantComponent(
          baseComponent,
          rule.base,
          prop,
          componentSet
        );
        variantCreatedCount.push(prop);

        logs.push({
          timestamp: new Date().toISOString(),
          level: "info",
          message: `Variant created: ${rule.base}#${prop}`,
        });
      } catch (variantError) {
        const msg =
          variantError instanceof Error ? variantError.message : String(variantError);
        logs.push({
          timestamp: new Date().toISOString(),
          level: "warning",
          message: `Variant creation failed: ${rule.base}#${prop} - ${msg}`,
        });
      }
    }

    if (variantCreatedCount.length === 0) {
      throw new Error(`No variants could be created`);
    }

    logs.push({
      timestamp: new Date().toISOString(),
      level: "info",
      message: `${variantCreatedCount.length} variants created successfully: ${rule.base}`,
    });

    return {
      success: true,
      message: `${variantCreatedCount.length} variants created: ${variantCreatedCount.join(", ")}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logs.push({
      timestamp: new Date().toISOString(),
      level: "error",
      message: `Variant creation error: ${errorMessage}`,
    });
    return {
      success: false,
      message: `Error: ${errorMessage}`,
    };
  }
}

/**
 * Find component by name
 */
function findComponentByName(name: string): ComponentNode | null {
  const root = figma.currentPage;

  function search(node: BaseNode): ComponentNode | null {
    if (
      (node.type === "COMPONENT" || node.type === "COMPONENT_SET") &&
      node.name === name
    ) {
      return node as ComponentNode;
    }

    if ("children" in node) {
      for (const child of (node as ChildrenMixin).children) {
        const result = search(child);
        if (result) return result;
      }
    }

    return null;
  }

  return search(root);
}

/**
 * Create variant component from base component
 */
function createVariantComponent(
  baseComponent: BaseNode,
  baseName: string,
  variantName: string,
  componentSet: BaseNode
): ComponentNode {
  // Clone new component
  const variant = (baseComponent as any).clone?.() || baseComponent as any;
  variant.name = `${baseName}=${variantName}`;

  // Add to component set
  if ("appendChild" in componentSet) {
    (componentSet as ChildrenMixin).appendChild(variant);
  }

  return variant;
}
