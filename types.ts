// UnityFigmaBridge Rules Definitions

export interface RenameRule {
  id: string;
  name: string;
}

export interface MakeComponentRule {
  id: string;
  type: string;
}

export interface LayoutRule {
  id: string;
  mode: "auto" | "absolute";
  spacing?: number;
  padding?: {
    horizontal?: number;
    vertical?: number;
  };
}

export interface VariantRule {
  base: string;
  props: string[];
}

export interface StyleRule {
  id: string;
  textStyle: string;
  fillColor?: {
    r: number;
    g: number;
    b: number;
  };
}

export interface RulesJSON {
  rename?: RenameRule[];
  makeComponent?: MakeComponentRule[];
  layout?: LayoutRule[];
  variants?: VariantRule[];
  styles?: StyleRule[];
}

export interface ActionResult {
  success: boolean;
  message: string;
  nodeId?: string;
  nodeType?: string;
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "warning" | "error";
  message: string;
  nodeId?: string;
}
