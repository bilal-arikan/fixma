// ============================================================================
// FigmaOrganizer - Apply Module Entry Point
// ============================================================================

import { previewRenames, applyRenames, RenameRule, RenamePreview, RenameResult } from "./rename";
import {
  previewMakeComponents,
  applyMakeComponents,
  MakeComponentRule,
  MakeComponentPreview,
  MakeComponentResult,
} from "./makeComponent";
import {
  previewSafeAreas,
  applySafeAreas,
  SafeAreaRule,
  SafeAreaPreview,
  SafeAreaResult,
} from "./safeArea";

export {
  RenameRule, RenamePreview, RenameResult,
  MakeComponentRule, MakeComponentPreview, MakeComponentResult,
  SafeAreaRule, SafeAreaPreview, SafeAreaResult,
};

export interface RuleSet {
  rename?: RenameRule[];
  makeComponent?: MakeComponentRule[];
  addSafeArea?: SafeAreaRule[];
}

export interface PreviewResult {
  renames: RenamePreview[];
  makeComponents: MakeComponentPreview[];
  safeAreas: SafeAreaPreview[];
  totalChanges: number;
}

export interface ApplyResult {
  renames: RenameResult[];
  makeComponents: MakeComponentResult[];
  safeAreas: SafeAreaResult[];
  successCount: number;
  failCount: number;
}

/**
 * Preview all rule changes without modifying Figma
 */
export function previewRules(rules: RuleSet): PreviewResult {
  const renames = previewRenames(rules.rename || []);
  const makeComponents = previewMakeComponents(rules.makeComponent || []);
  const safeAreas = previewSafeAreas(rules.addSafeArea || []);

  return {
    renames,
    makeComponents,
    safeAreas,
    totalChanges: renames.length + makeComponents.length + safeAreas.length,
  };
}

/**
 * Apply all rules to Figma
 */
export function applyRules(rules: RuleSet): ApplyResult {
  const renames = applyRenames(rules.rename || []);
  const makeComponents = applyMakeComponents(rules.makeComponent || []);
  const safeAreas = applySafeAreas(rules.addSafeArea || []);

  const allResults = [
    ...renames.map((r) => r.success),
    ...makeComponents.map((r) => r.success),
    ...safeAreas.map((r) => r.success),
  ];

  return {
    renames,
    makeComponents,
    safeAreas,
    successCount: allResults.filter(Boolean).length,
    failCount: allResults.filter((s) => !s).length,
  };
}
