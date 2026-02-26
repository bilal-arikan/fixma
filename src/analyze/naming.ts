// ============================================================================
// Fixma - Naming Analysis
// Detects default Figma names, Turkish characters, and case inconsistencies
// ============================================================================

export interface NamingIssue {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  issue: "default_name" | "turkish_chars" | "case_inconsistency";
  description: string;
  suggestion?: string;
}

// Default Figma name pattern: "Frame 12", "Rectangle 3", etc.
const DEFAULT_NAME_PATTERN =
  /^(Frame|Rectangle|Group|Ellipse|Line|Vector|Text|Image|Component|Instance|Polygon|Star|BooleanOperation|Slice|Section)\s+\d+$/i;

// Turkish character detection
const TURKISH_CHARS_PATTERN = /[çğışöüÇĞİŞÖÜ]/;

/**
 * Determines the naming case style of a string
 */
function detectCase(name: string): "snake_case" | "camelCase" | "PascalCase" | "kebab-case" | "mixed" | "none" {
  if (!name || name.length === 0) return "none";
  const clean = name.replace(/[^a-zA-Z0-9_\-]/g, "");
  if (clean.includes("_")) return "snake_case";
  if (clean.includes("-")) return "kebab-case";
  if (clean[0] === clean[0].toUpperCase() && /[a-z]/.test(clean)) return "PascalCase";
  if (clean[0] === clean[0].toLowerCase() && /[A-Z]/.test(clean)) return "camelCase";
  return "none";
}

/**
 * Recursively checks all nodes for naming issues
 */
export function checkNaming(node: SceneNode | PageNode): NamingIssue[] {
  const issues: NamingIssue[] = [];
  collectNamingIssues(node, issues);
  return issues;
}

function collectNamingIssues(node: any, issues: NamingIssue[]): void {
  if (!node || node.type === "DOCUMENT") return;

  const name: string = node.name || "";
  const id: string = node.id || "";
  const type: string = node.type || "";

  // Skip page nodes themselves (type CANVAS)
  if (type !== "CANVAS") {
    // Check for default Figma name
    if (DEFAULT_NAME_PATTERN.test(name)) {
      issues.push({
        nodeId: id,
        nodeName: name,
        nodeType: type,
        issue: "default_name",
        description: `"${name}" is using a default Figma name`,
        suggestion: "Give it a meaningful name, e.g. 'btn_primary', 'card_user'",
      });
    }

    // Check for Turkish characters
    if (TURKISH_CHARS_PATTERN.test(name)) {
      issues.push({
        nodeId: id,
        nodeName: name,
        nodeType: type,
        issue: "turkish_chars",
        description: `"${name}" contains non-Latin characters`,
        suggestion: "Use ASCII equivalents: ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u",
      });
    }
  }

  // Check children for case inconsistency among siblings
  if (node.children && node.children.length > 1) {
    const childCases = node.children
      .filter((c: any) => c.type !== "TEXT")
      .map((c: any) => ({
        node: c,
        caseStyle: detectCase(c.name || ""),
      }))
      .filter((x: any) => x.caseStyle !== "none");

    if (childCases.length > 1) {
      const uniqueCases = new Set(childCases.map((x: any) => x.caseStyle));
      if (uniqueCases.size > 1) {
        // Flag only children that differ from the majority
        const caseCount: Record<string, number> = {};
        for (const { caseStyle } of childCases) {
          caseCount[caseStyle] = (caseCount[caseStyle] || 0) + 1;
        }
        const dominant = Object.entries(caseCount).sort((a, b) => b[1] - a[1])[0][0];

        for (const { node: child, caseStyle } of childCases) {
          if (caseStyle !== dominant && !DEFAULT_NAME_PATTERN.test(child.name)) {
            // Avoid duplicate issues
            const alreadyFlagged = issues.some(
              (i) => i.nodeId === child.id && i.issue === "case_inconsistency"
            );
            if (!alreadyFlagged) {
              issues.push({
                nodeId: child.id,
                nodeName: child.name,
                nodeType: child.type,
                issue: "case_inconsistency",
                description: `"${child.name}" uses a different case style than its siblings (${caseStyle} vs ${dominant})`,
                suggestion: `Convert to ${dominant}`,
              });
            }
          }
        }
      }
    }

    // Recurse into children
    for (const child of node.children) {
      collectNamingIssues(child, issues);
    }
  } else if (node.children) {
    for (const child of node.children) {
      collectNamingIssues(child, issues);
    }
  }
}
