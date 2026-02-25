// ============================================================================
// FigmaOrganizer - Layout Analysis Configuration
// All tunable thresholds and check toggles live here.
// Stored persistently via Figma clientStorage (key: "layoutConfig").
// ============================================================================

/** Toggle individual heuristic checks on or off */
export interface LayoutChecks {
  /** Corner constraint mismatch (e.g. bottom-right positioned but pinned left) */
  cornerConstraint: boolean;
  /** Single-edge constraint mismatch (near right/bottom but pinned to opposite) */
  edgeConstraint: boolean;
  /** Widest child in Auto Layout row is Fixed instead of Fill */
  siblingFill: boolean;
  /** Node covers most of parent width/height but is not FILL/STRETCH */
  wideTall: boolean;
  /** Node covers almost all of parent on both axes but is not STRETCH/SCALE */
  fullBleed: boolean;
  /** Node is visually centred but has no CENTER constraint */
  centeredNotCenter: boolean;
}

/** All configurable thresholds and toggles for layout analysis */
export interface LayoutConfig {
  /**
   * A node is considered "near" an edge when its gap to that edge
   * is less than (parent dimension × edgeProximityRatio).
   * Range: 0.05 – 0.40   Default: 0.15
   */
  edgeProximityRatio: number;

  /**
   * A node is a "wide / tall Fill candidate" when it covers at least
   * this fraction of the parent's inner width or height.
   * Range: 0.40 – 0.95   Default: 0.70
   */
  fillRatio: number;

  /**
   * A node is "full-bleed" when it covers at least this fraction of
   * the parent on BOTH axes simultaneously.
   * Range: 0.50 – 0.99   Default: 0.80
   */
  fullBleedRatio: number;

  /**
   * Maximum pixel distance from the parent's centre for a node to be
   * considered "centred" (horizontally or vertically).
   * Range: 1 – 32   Default: 6
   */
  centerTolerancePx: number;

  /**
   * When true, only report nodes whose constraints are still at their
   * Figma default values (H: MIN, V: MIN for frames; layoutGrow: 0 for
   * Auto-Layout children).  This filters out intentionally-configured nodes
   * and only surfaces "untouched" ones.
   * Default: false
   */
  onlyDefaults: boolean;

  /** Which individual checks are enabled */
  checks: LayoutChecks;
}

// ─── Defaults ───────────────────────────────────────────────────────────────

export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  edgeProximityRatio: 0.15,
  fillRatio:          0.70,
  fullBleedRatio:     0.80,
  centerTolerancePx:  6,
  onlyDefaults:       false,
  checks: {
    cornerConstraint:  true,
    edgeConstraint:    true,
    siblingFill:       true,
    wideTall:          true,
    fullBleed:         true,
    centeredNotCenter: true,
  },
};

/** Storage key used with figma.clientStorage */
export const LAYOUT_CONFIG_STORAGE_KEY = "layoutConfig";

// ─── Merge helper ────────────────────────────────────────────────────────────

/**
 * Merges a (potentially partial / outdated) stored config with the current
 * defaults so that new fields are always present.
 */
export function mergeWithDefaults(stored: Partial<LayoutConfig>): LayoutConfig {
  return {
    ...DEFAULT_LAYOUT_CONFIG,
    ...stored,
    checks: {
      ...DEFAULT_LAYOUT_CONFIG.checks,
      ...(stored.checks ?? {}),
    },
  };
}
