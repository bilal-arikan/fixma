// ============================================================================
// UnityFigmaBridge Organizer - Figma Plugin
// Tüm mantık tek dosyada (Figma modül sistemi desteklemediği için)
// ============================================================================

// ============================================================================
// TIP TANIMLARI (Types)
// ============================================================================

interface RenameRule {
  id: string;
  name: string;
}

interface MakeComponentRule {
  id: string;
  type: string;
}

interface LayoutRule {
  id: string;
  mode: "auto" | "absolute";
  spacing?: number;
  padding?: {
    horizontal?: number;
    vertical?: number;
  };
}

interface VariantRule {
  base: string;
  props: string[];
}

interface StyleRule {
  id: string;
  textStyle: string;
  fillColor?: {
    r: number;
    g: number;
    b: number;
  };
}

interface RulesJSON {
  rename?: RenameRule[];
  makeComponent?: MakeComponentRule[];
  layout?: LayoutRule[];
  variants?: VariantRule[];
  styles?: StyleRule[];
}

interface ActionResult {
  success: boolean;
  message: string;
  nodeId?: string;
  nodeType?: string;
}

interface LogEntry {
  timestamp: string;
  level: "info" | "warning" | "error";
  message: string;
  nodeId?: string;
}

interface MessageData {
  type: string;
  rules?: RulesJSON;
  dryRun?: boolean;
}

interface ResponseData {
  success: boolean;
  results: ActionResult[];
  logs: LogEntry[];
  summary: {
    totalActions: number;
    successfulActions: number;
    failedActions: number;
  };
}

// ============================================================================
// YENIDEN ADLANDIRMA (Rename)
// ============================================================================

function applyRename(rule: RenameRule, logs: LogEntry[]): ActionResult {
  try {
    let targetNode = figma.getNodeById(rule.id) as any;
    if (!targetNode) {
      const searchResult = searchNodeByName(rule.id);
      if (searchResult) {
        targetNode = searchResult;
        logs.push({
          timestamp: new Date().toISOString(),
          level: "warning",
          message: `Node ID '${rule.id}' bulunamadı. İsim bazlı fallback kullanıldı`,
          nodeId: rule.id,
        });
      } else {
        throw new Error(`Node ID bulunamadı: ${rule.id}`);
      }
    }

    if ((targetNode as any).locked) {
      logs.push({
        timestamp: new Date().toISOString(),
        level: "warning",
        message: `Node is locked, cannot be renamed`,
        nodeId: rule.id,
      });
      return {
        success: false,
        message: `Node is locked: ${targetNode.name}`,
        nodeId: rule.id,
      };
    }

    const oldName = targetNode.name;
    targetNode.name = rule.name;
    logs.push({
      timestamp: new Date().toISOString(),
      level: "info",
      message: `Node renamed successfully: '${oldName}' → '${rule.name}'`,
      nodeId: rule.id,
    });

    return {
      success: true,
      message: `Renamed successfully`,
      nodeId: rule.id,
      nodeType: targetNode.type,
    };
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    logs.push({
      timestamp: new Date().toISOString(),
      level: "error",
      message: `Rename error: ${errorMessage}`,
      nodeId: rule.id,
    });
    return {
      success: false,
      message: `Hata: ${errorMessage}`,
      nodeId: rule.id,
    };
  }
}

function searchNodeByName(searchId: string): any {
  const root = figma.currentPage;
  function search(node: any): any {
    if (node.name && node.name.includes(searchId)) return node;
    if (node.children) {
      for (const child of node.children) {
        const result = search(child);
        if (result) return result;
      }
    }
    return null;
  }
  return search(root);
}

// ============================================================================
// COMPONENT OLUŞTURMA (Make Component)
// ============================================================================

function applyMakeComponent(rule: MakeComponentRule, logs: LogEntry[]): ActionResult {
  try {
    let targetNode = figma.getNodeById(rule.id) as any;
    if (!targetNode) throw new Error(`Node ID not found: ${rule.id}`);

    if (targetNode.type === "GROUP") {
      const groupNode = targetNode;
      const frameNode = figma.createFrame();
      frameNode.x = groupNode.x;
      frameNode.y = groupNode.y;

      for (const child of groupNode.children) {
        frameNode.appendChild(child.clone());
      }

      const parent = groupNode.parent;
      groupNode.remove();
      targetNode = frameNode;
      if (parent && parent.appendChild) parent.appendChild(frameNode);

      logs.push({
        timestamp: new Date().toISOString(),
        level: "info",
        message: `Group automatically converted to FRAME`,
        nodeId: rule.id,
      });
    }

    if (targetNode.type === "COMPONENT" || targetNode.type === "COMPONENT_SET" || targetNode.type === "INSTANCE") {
      logs.push({
        timestamp: new Date().toISOString(),
        level: "warning",
        message: `Node is already a component`,
        nodeId: rule.id,
      });
      return {
        success: false,
        message: `Node is already a component`,
        nodeId: rule.id,
      };
    }

    if (targetNode.type === "FRAME" || targetNode.type === "RECTANGLE" || targetNode.type === "TEXT") {
      const componentNode = (targetNode as any).createComponent();
      componentNode.name = rule.type;
      logs.push({
        timestamp: new Date().toISOString(),
        level: "info",
        message: `Component created: ${rule.type}`,
        nodeId: rule.id,
      });
      return {
        success: true,
        message: `Component created: ${rule.type}`,
        nodeId: rule.id,
        nodeType: "COMPONENT",
      };
    } else {
      throw new Error(`Node type cannot be converted to component: ${targetNode.type}`);
    }
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    logs.push({
      timestamp: new Date().toISOString(),
      level: "error",
      message: `Component creation error: ${errorMessage}`,
      nodeId: rule.id,
    });
    return {
      success: false,
      message: `Hata: ${errorMessage}`,
      nodeId: rule.id,
    };
  }
}

// ============================================================================
// AUTO LAYOUT UYGULAMA (Layout)
// ============================================================================

function applyLayout(rule: LayoutRule, logs: LogEntry[]): ActionResult {
  try {
    const targetNode = figma.getNodeById(rule.id) as any;
    if (!targetNode) throw new Error(`Node ID bulunamadı: ${rule.id}`);

    if (targetNode.type !== "FRAME" && targetNode.type !== "COMPONENT" && targetNode.type !== "COMPONENT_SET") {
      throw new Error(`Auto Layout cannot be applied to: ${targetNode.type}`);
    }

    if (rule.mode === "auto") {
      targetNode.layoutMode = "HORIZONTAL";
      if (rule.spacing !== undefined) targetNode.itemSpacing = rule.spacing;
      if (rule.padding) {
        if (rule.padding.horizontal !== undefined) {
          targetNode.paddingLeft = rule.padding.horizontal;
          targetNode.paddingRight = rule.padding.horizontal;
        }
        if (rule.padding.vertical !== undefined) {
          targetNode.paddingTop = rule.padding.vertical;
          targetNode.paddingBottom = rule.padding.vertical;
        }
      }
      logs.push({
        timestamp: new Date().toISOString(),
        level: "info",
        message: `Auto Layout applied`,
        nodeId: rule.id,
      });
    } else if (rule.mode === "absolute") {
      targetNode.layoutMode = "NONE";
      logs.push({
        timestamp: new Date().toISOString(),
        level: "info",
        message: `Converted to absolute layout`,
        nodeId: rule.id,
      });
    }

    return {
      success: true,
      message: `Layout rule applied: ${rule.mode}`,
      nodeId: rule.id,
      nodeType: targetNode.type,
    };
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    logs.push({
      timestamp: new Date().toISOString(),
      level: "error",
      message: `Layout rule error: ${errorMessage}`,
      nodeId: rule.id,
    });
    return {
      success: false,
      message: `Hata: ${errorMessage}`,
      nodeId: rule.id,
    };
  }
}

// ============================================================================
// VARIANT ÜRETME (Variant)
// ============================================================================

function applyVariant(rule: VariantRule, logs: LogEntry[]): ActionResult {
  try {
    const baseComponent = findComponentByName(rule.base);
    if (!baseComponent) throw new Error(`Base component not found: ${rule.base}`);

    const variantCreatedCount: string[] = [];
    for (const prop of rule.props) {
      try {
        createVariantComponent(baseComponent, rule.base, prop);
        variantCreatedCount.push(prop);
        logs.push({
          timestamp: new Date().toISOString(),
          level: "info",
          message: `Variant oluşturuldu: ${rule.base}#${prop}`,
        });
      } catch (variantError: any) {
        logs.push({
          timestamp: new Date().toISOString(),
          level: "warning",
          message: `Variant hata: ${variantError.message || variantError}`,
        });
      }
    }

    if (variantCreatedCount.length === 0) throw new Error(`No variants could be created`);

    return {
      success: true,
      message: `${variantCreatedCount.length} variants created`,
    };
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    logs.push({
      timestamp: new Date().toISOString(),
      level: "error",
      message: `Variant error: ${errorMessage}`,
    });
    return {
      success: false,
      message: `Hata: ${errorMessage}`,
    };
  }
}

function findComponentByName(name: string): any {
  const root = figma.currentPage;
  function search(node: any): any {
    if ((node.type === "COMPONENT" || node.type === "COMPONENT_SET") && node.name === name) return node;
    if (node.children) {
      for (const child of node.children) {
        const result = search(child);
        if (result) return result;
      }
    }
    return null;
  }
  return search(root);
}

function createVariantComponent(baseComponent: any, baseName: string, variantName: string): any {
  const variant = (baseComponent.clone && baseComponent.clone()) || baseComponent;
  variant.name = `${baseName}=${variantName}`;
  return variant;
}

// ============================================================================
// STYLE BAĞLAMA (Style)
// ============================================================================

function applyStyle(rule: StyleRule, logs: LogEntry[]): ActionResult {
  try {
    const targetNode = figma.getNodeById(rule.id) as any;
    if (!targetNode) throw new Error(`Node ID bulunamadı: ${rule.id}`);

    let styleApplied = false;

    if (rule.textStyle && targetNode.type === "TEXT") {
      const textStyles = figma.getLocalTextStyles();
      const targetStyle = textStyles.find((s: any) => s.name === rule.textStyle);

      if (!targetStyle) {
        logs.push({
          timestamp: new Date().toISOString(),
          level: "warning",
          message: `Text style bulunamadı: ${rule.textStyle}`,
          nodeId: rule.id,
        });
      } else {
        (targetNode as any).fillStyleId = targetStyle.id;
        styleApplied = true;
        logs.push({
          timestamp: new Date().toISOString(),
          level: "info",
          message: `Text style uygulandı`,
          nodeId: rule.id,
        });
      }
    }

    if (rule.fillColor && targetNode.fills) {
      const fills: any[] = [
        {
          type: "SOLID",
          color: {
            r: rule.fillColor.r / 255,
            g: rule.fillColor.g / 255,
            b: rule.fillColor.b / 255,
          },
        },
      ];
      targetNode.fills = fills;
      styleApplied = true;
      logs.push({
        timestamp: new Date().toISOString(),
        level: "info",
        message: `Fill color applied`,
        nodeId: rule.id,
      });
    }

    if (!styleApplied) throw new Error(`No applicable style found`);

    return {
      success: true,
      message: `Style applied`,
      nodeId: rule.id,
      nodeType: targetNode.type,
    };
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    logs.push({
      timestamp: new Date().toISOString(),
      level: "error",
      message: `Style error: ${errorMessage}`,
      nodeId: rule.id,
    });
    return {
      success: false,
      message: `Hata: ${errorMessage}`,
      nodeId: rule.id,
    };
  }
}

// ============================================================================
// ANA PLUGIN MANTIGI (Main)
// ============================================================================

figma.showUI(__html__, {
  width: 600,
  height: 700,
});

// UI message handler
figma.ui.onmessage = (msg: MessageData) => {
  if (msg.type === "applyRules") {
    const response = processRules(msg.rules || {}, msg.dryRun || false);
    figma.ui.postMessage(response);
  }
};

/**
 * Processes rules JSON and applies all rules
 */
function processRules(rules: RulesJSON, dryRun: boolean): ResponseData {
  const logs: LogEntry[] = [];
  const results: ActionResult[] = [];

  logs.push({
    timestamp: new Date().toISOString(),
    level: "info",
    message: `Plugin started. Dry-run: ${dryRun}`,
  });

  let totalActions = 0;
  let successfulActions = 0;
  let failedActions = 0;

  try {
// Apply rename rules
        if (rules.rename && rules.rename.length > 0) {
          figma.notify("Applying rename rules...");

      for (const rule of rules.rename) {
        totalActions++;
        let result: ActionResult;

        if (dryRun) {
          result = {
            success: true,
            message: `[DRY-RUN] Yeniden adlandırılacak: ${rule.id} → ${rule.name}`,
            nodeId: rule.id,
          };
          logs.push({
            timestamp: new Date().toISOString(),
            level: "info",
            message: result.message,
          });
        } else {
          result = applyRename(rule, logs);
        }

        results.push(result);
        if (result.success) {
          successfulActions++;
        } else {
          failedActions++;
        }
      }
    }

// Apply component creation rules
        if (rules.makeComponent && rules.makeComponent.length > 0) {
          figma.notify("Applying component creation rules...");

      for (const rule of rules.makeComponent) {
        totalActions++;
        let result: ActionResult;

        if (dryRun) {
          result = {
            success: true,
            message: `[DRY-RUN] Component oluşturulacak: ${rule.id} (${rule.type})`,
            nodeId: rule.id,
          };
          logs.push({
            timestamp: new Date().toISOString(),
            level: "info",
            message: result.message,
          });
        } else {
          result = applyMakeComponent(rule, logs);
        }

        results.push(result);
        if (result.success) {
          successfulActions++;
        } else {
          failedActions++;
        }
      }
    }

// Apply layout rules
        if (rules.layout && rules.layout.length > 0) {
          figma.notify("Applying layout rules...");

      for (const rule of rules.layout) {
        totalActions++;
        let result: ActionResult;

        if (dryRun) {
          result = {
            success: true,
            message: `[DRY-RUN] Layout kuralı uygulanacak: ${rule.id} (${rule.mode})`,
            nodeId: rule.id,
          };
          logs.push({
            timestamp: new Date().toISOString(),
            level: "info",
            message: result.message,
          });
        } else {
          result = applyLayout(rule, logs);
        }

        results.push(result);
        if (result.success) {
          successfulActions++;
        } else {
          failedActions++;
        }
      }
    }

// Apply variant rules
        if (rules.variants && rules.variants.length > 0) {
          figma.notify("Applying variant rules...");

      for (const rule of rules.variants) {
        totalActions++;
        let result: ActionResult;

        if (dryRun) {
          result = {
            success: true,
            message: `[DRY-RUN] Variant oluşturulacak: ${rule.base} (${rule.props.join(", ")})`,
          };
          logs.push({
            timestamp: new Date().toISOString(),
            level: "info",
            message: result.message,
          });
        } else {
          result = applyVariant(rule, logs);
        }

        results.push(result);
        if (result.success) {
          successfulActions++;
        } else {
          failedActions++;
        }
      }
    }

// Apply style rules
        if (rules.styles && rules.styles.length > 0) {
          figma.notify("Applying style rules...");

      for (const rule of rules.styles) {
        totalActions++;
        let result: ActionResult;

        if (dryRun) {
          result = {
            success: true,
            message: `[DRY-RUN] Style uygulanacak: ${rule.id}`,
            nodeId: rule.id,
          };
          logs.push({
            timestamp: new Date().toISOString(),
            level: "info",
            message: result.message,
          });
        } else {
          result = applyStyle(rule, logs);
        }

        results.push(result);
        if (result.success) {
          successfulActions++;
        } else {
          failedActions++;
        }
      }
    }

    // İşlem tamamlandı bildirimi
    const completionMessage = `İşlem tamamlandı: ${successfulActions}/${totalActions} başarılı`;
    logs.push({
      timestamp: new Date().toISOString(),
      level: "info",
      message: completionMessage,
    });

    figma.notify(completionMessage);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logs.push({
      timestamp: new Date().toISOString(),
      level: "error",
      message: `Plugin error: ${errorMsg}`,
    });
    figma.notify(`Error: ${errorMsg}`, { error: true });
  }

  return {
    success: failedActions === 0,
    results,
    logs,
    summary: {
      totalActions,
      successfulActions,
      failedActions,
    },
  };
}
