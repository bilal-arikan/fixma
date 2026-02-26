// ============================================================================
// Fixma - Analyze Fix Engine
// Applies fixes for issues detected by the Analyze tab.
// Follows the same pattern as layoutFix.ts.
// ============================================================================

// ─── Types ──────────────────────────────────────────────────────────────────

export type AnalyzeFixKind =
  | "turkish_chars"
  | "case_inconsistency"
  | "empty_frame"
  | "zero_size"
  | "missing_safearea_frame";

export interface AnalyzeIssue {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  kind: AnalyzeFixKind;
  suggestion?: string;
  /** Width/height are provided for safe-area and cleanup issues */
  width?: number;
  height?: number;
}

export interface AnalyzeFixResult {
  nodeId: string;
  nodeName: string;
  kind: AnalyzeFixKind;
  success: boolean;
  error?: string;
  detail: string;
}

// ─── Turkish character map ──────────────────────────────────────────────────

const TURKISH_MAP: Record<string, string> = {
  "ç": "c", "Ç": "C",
  "ğ": "g", "Ğ": "G",
  "ı": "i", "İ": "I",
  "ö": "o", "Ö": "O",
  "ş": "s", "Ş": "S",
  "ü": "u", "Ü": "U",
};

const TURKISH_REGEX = /[çğışöüÇĞİŞÖÜ]/g;

// ─── Case conversion helper ────────────────────────────────────────────────

/**
 * Splits a name into words by detecting boundaries:
 * camelCase, PascalCase, snake_case, kebab-case, spaces
 */
function splitWords(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")   // camelCase boundary
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // ABCDef → ABC Def
    .replace(/[_\-\s]+/g, " ")              // separators → space
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function convertCase(name: string, targetCase: string): string {
  const words = splitWords(name);
  if (words.length === 0) return name;

  switch (targetCase) {
    case "snake_case":
      return words.map((w) => w.toLowerCase()).join("_");
    case "camelCase":
      return words
        .map((w, i) => i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join("");
    case "PascalCase":
      return words
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join("");
    case "kebab-case":
      return words.map((w) => w.toLowerCase()).join("-");
    default:
      return name;
  }
}

// ─── Fix Handlers ───────────────────────────────────────────────────────────

const FIX_MAP: Record<AnalyzeFixKind, (node: SceneNode, issue: AnalyzeIssue) => string> = {

  turkish_chars(node, _issue) {
    const oldName = node.name;
    const newName = oldName.replace(TURKISH_REGEX, (ch) => TURKISH_MAP[ch] || ch);
    if (newName === oldName) throw new Error("No Turkish characters found");
    node.name = newName;
    return `Renamed "${oldName}" → "${newName}"`;
  },

  case_inconsistency(node, issue) {
    const suggestion = issue.suggestion;
    if (!suggestion) throw new Error("No suggestion provided for case fix");

    // Suggestion format: "Convert to snake_case" or "Convert to camelCase" etc.
    const targetCase = suggestion.replace(/^Convert to\s*/i, "").trim();
    const oldName = node.name;
    const newName = convertCase(oldName, targetCase);
    if (newName === oldName) throw new Error("Name is already in target case");

    node.name = newName;
    return `Renamed "${oldName}" → "${newName}" (${targetCase})`;
  },

  empty_frame(node, _issue) {
    const name = node.name;
    node.remove();
    return `Removed empty frame "${name}"`;
  },

  zero_size(node, _issue) {
    const name = node.name;
    node.remove();
    return `Removed zero-size object "${name}"`;
  },

  missing_safearea_frame(node, _issue) {
    const APPLICABLE_TYPES = ["FRAME", "COMPONENT"];
    if (!APPLICABLE_TYPES.includes(node.type)) {
      throw new Error(`Only FRAME and COMPONENT nodes are supported (got ${node.type})`);
    }

    const container = node as FrameNode | ComponentNode;

    // Guard: already has a safearea child
    const alreadyExists = container.children.some(
      (c) => c.name.toLowerCase().includes("safe") && c.type === "FRAME"
    );
    if (alreadyExists) {
      throw new Error(`Safe area frame already exists inside "${container.name}"`);
    }

    const parentWidth = container.width;
    const parentHeight = container.height;

    const isAutoLayout = "layoutMode" in container && container.layoutMode !== "NONE";

    // 1. Create the safearea frame
    const safeAreaFrame = figma.createFrame();
    safeAreaFrame.name = "safearea";
    safeAreaFrame.resize(parentWidth, parentHeight);
    safeAreaFrame.x = 0;
    safeAreaFrame.y = 0;
    safeAreaFrame.fills = [];           // transparent
    safeAreaFrame.clipsContent = false; // don't clip overflow
    safeAreaFrame.locked = false;

    // 2. Collect all current children (snapshot before mutation)
    const existingChildren = [...container.children];

    // 3. Insert safearea frame into parent first (required before reparenting)
    container.appendChild(safeAreaFrame);

    // 4. Fill container on both axes (only works inside auto-layout parent)
    if (isAutoLayout) {
      safeAreaFrame.layoutSizingHorizontal = "FILL";
      safeAreaFrame.layoutSizingVertical = "FILL";
    }

    // 5. Move all original children into the safearea frame
    for (let i = 0; i < existingChildren.length; i++) {
      safeAreaFrame.insertChild(i, existingChildren[i]);
    }

    return `Created "safearea" frame (${Math.round(parentWidth)}×${Math.round(parentHeight)}), wrapped ${existingChildren.length} child(ren)`;
  },
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Fix a single analyze issue by applying the suggested change.
 */
export function fixAnalyzeIssue(issue: AnalyzeIssue): AnalyzeFixResult {
  try {
    const node = figma.getNodeById(issue.nodeId) as SceneNode | null;
    if (!node) {
      return {
        nodeId: issue.nodeId,
        nodeName: issue.nodeName,
        kind: issue.kind,
        success: false,
        error: "Node not found (may have been deleted)",
        detail: "",
      };
    }

    const fixFn = FIX_MAP[issue.kind];
    if (!fixFn) {
      return {
        nodeId: issue.nodeId,
        nodeName: issue.nodeName,
        kind: issue.kind,
        success: false,
        error: `No fix handler for kind "${issue.kind}"`,
        detail: "",
      };
    }

    const detail = fixFn(node, issue);

    return {
      nodeId: issue.nodeId,
      nodeName: issue.nodeName,
      kind: issue.kind,
      success: true,
      detail,
    };
  } catch (err: any) {
    return {
      nodeId: issue.nodeId,
      nodeName: issue.nodeName,
      kind: issue.kind,
      success: false,
      error: err.message || String(err),
      detail: "",
    };
  }
}

/**
 * Fix all given analyze issues. Returns individual results.
 */
export function fixAllAnalyzeIssues(issues: AnalyzeIssue[]): AnalyzeFixResult[] {
  return issues.map((issue) => fixAnalyzeIssue(issue));
}
