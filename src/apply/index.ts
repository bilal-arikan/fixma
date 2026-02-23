// ============================================================================
// FigmaOrganizer - Apply Module Entry Point
// ============================================================================

import { previewRenames, applyRenames, RenameRule, RenamePreview, RenameResult } from "./rename";
import {
  previewSafeAreas,
  applySafeAreas,
  SafeAreaRule,
  SafeAreaPreview,
  SafeAreaResult,
} from "./safeArea";

export {
  RenameRule, RenamePreview, RenameResult,
  SafeAreaRule, SafeAreaPreview, SafeAreaResult,
};

export interface RuleSet {
  rename?: RenameRule[];
  addSafeArea?: SafeAreaRule[];
}

export interface PreviewResult {
  renames: RenamePreview[];
  safeAreas: SafeAreaPreview[];
  totalChanges: number;
}

export interface ApplyResult {
  renames: RenameResult[];
  safeAreas: SafeAreaResult[];
  successCount: number;
  failCount: number;
}

/**
 * Preview all rule changes without modifying Figma
 */
export function previewRules(rules: RuleSet): PreviewResult {
  const renames = previewRenames(rules.rename || []);
  const safeAreas = previewSafeAreas(rules.addSafeArea || []);

  return {
    renames,
    safeAreas,
    totalChanges: renames.length + safeAreas.length,
  };
}

/**
 * Apply all rules to Figma
 */
export function applyRules(rules: RuleSet): ApplyResult {
  const renames = applyRenames(rules.rename || []);
  const safeAreas = applySafeAreas(rules.addSafeArea || []);

  const allResults = [
    ...renames.map((r) => r.success),
    ...safeAreas.map((r) => r.success),
  ];

  return {
    renames,
    safeAreas,
    successCount: allResults.filter(Boolean).length,
    failCount: allResults.filter((s) => !s).length,
  };
}
