/**
 * @a24z/mermaid-parser - Lightweight Mermaid diagram validator
 * 
 * This package provides validation-only functionality for Mermaid diagrams
 * without the heavy rendering dependencies. Perfect for server-side validation,
 * CI/CD pipelines, and API endpoints.
 */

import './dom-stubs.js';
import * as yaml from 'js-yaml';

export interface ParseOptions {
  suppressErrors?: boolean;
}

export interface ParseResult {
  diagramType: string;
  config?: any;
  warnings?: string[];
}

export interface Diagnostic {
  severity: 'error' | 'warning';
  code?: string;
  message: string;
  /**
   * 1-based line number in the *processed* diagram (i.e. after directive/comment stripping).
   */
  line?: number;
  /**
   * 1-based column number in the *processed* diagram line.
   */
  column?: number;
  /**
   * The original line text (from the processed diagram) for easier debugging.
   */
  lineText?: string;
}

export interface DetailedParseResult {
  type: string;
  config?: any;
  valid: boolean;
  error?: string;
  errors?: Diagnostic[];
  warnings?: string[];
}

export class MermaidValidationError extends Error {
  constructor(
    message: string,
    public diagramType: string,
    public diagnostics: Diagnostic[] = []
  ) {
    super(message);
    this.name = 'MermaidValidationError';
  }
}

/**
 * Basic diagram type detection patterns
 */
const DIAGRAM_PATTERNS = {
  flowchart: /^\s*(graph|flowchart)(\s+TD|TB|BT|RL|LR)?/i,
  sequence: /^\s*sequenceDiagram/i,
  class: /^\s*classDiagram/i,
  state: /^\s*stateDiagram(-v2)?/i,
  er: /^\s*erDiagram/i,
  journey: /^\s*journey/i,
  gantt: /^\s*gantt/i,
  pie: /^\s*pie(\s+title)?/i,
  gitgraph: /^\s*gitGraph/i,
  mindmap: /^\s*mindmap/i,
  timeline: /^\s*timeline/i,
  quadrant: /^\s*quadrantChart/i,
  requirement: /^\s*requirementDiagram/i,
  c4context: /^\s*C4Context/i,
  c4container: /^\s*C4Container/i,
  c4component: /^\s*C4Component/i,
  c4dynamic: /^\s*C4Dynamic/i,
  c4deployment: /^\s*C4Deployment/i,
  sankey: /^\s*sankey-beta/i,
  block: /^\s*block-beta/i,
  packet: /^\s*packet-beta/i,
  architecture: /^\s*architecture-beta/i,
  xyChart: /^\s*xychart-beta/i,
};

/**
 * Simple preprocessing to extract config and clean diagram text
 */
function preprocessDiagram(text: string): { code: string; config?: any } {
  const lines = text.split('\n');
  let config: any = {};
  let codeLines: string[] = [];
  let inDirective = false;
  let directiveText = '';

  for (const line of lines) {
    const trimmed = line.trim();
    
    // Handle directives (%%{...}%%)
    if (trimmed.startsWith('%%{')) {
      inDirective = true;
      directiveText = trimmed.slice(3);
      if (trimmed.endsWith('}%%')) {
        directiveText = directiveText.slice(0, -3);
        try {
          const parsed = JSON.parse(directiveText);
          config = { ...config, ...parsed };
        } catch {
          // Try parsing with js-yaml as fallback
          try {
            const yamlParsed = yaml.load(directiveText) as any;
            config = { ...config, ...yamlParsed };
          } catch {
            // Ignore invalid directives
          }
        }
        inDirective = false;
        directiveText = '';
      }
      continue;
    }
    
    if (inDirective) {
      directiveText += line;
      if (trimmed.endsWith('}%%')) {
        directiveText = directiveText.slice(0, -3);
        try {
          const parsed = JSON.parse(directiveText);
          config = { ...config, ...parsed };
        } catch {
          // Ignore invalid JSON
        }
        inDirective = false;
        directiveText = '';
      }
      continue;
    }
    
    // Skip comments
    if (trimmed.startsWith('%%') || trimmed.startsWith('#')) {
      continue;
    }
    
    codeLines.push(line);
  }

  return {
    code: codeLines.join('\n'),
    config: Object.keys(config).length > 0 ? config : undefined,
  };
}

/**
 * Detect diagram type from text
 */
function detectType(text: string): string {
  const cleaned = text.trim();
  
  for (const [type, pattern] of Object.entries(DIAGRAM_PATTERNS)) {
    if (pattern.test(cleaned)) {
      return type;
    }
  }
  
  return 'unknown';
}

/**
 * Check for potential rendering issues in node labels
 */
function checkNodeLabels(text: string, diagramType: string): string[] {
  const warnings: string[] = [];
  
  if (diagramType === 'flowchart' || diagramType === 'graph') {
    // Check for problematic markdown in node labels
    // Mermaid nodes with [] support limited markdown
    
    // Pattern to match node definitions with square brackets
    const nodePattern = /\w+\[([^\]]+)\]/g;
    let match;
    
    while ((match = nodePattern.exec(text)) !== null) {
      const label = match[1];
      
      // Check for markdown lists (- or * at start of lines)
      if (/^\s*[-*]\s+/m.test(label)) {
        warnings.push(`Node label "${label}" contains markdown list syntax which is not supported in Mermaid nodes`);
      }
      
      // Check for numbered lists
      if (/^\s*\d+\.\s+/m.test(label)) {
        warnings.push(`Node label "${label}" contains numbered list syntax which is not supported in Mermaid nodes`);
      }
      
      // Check for headers
      if (/^#+\s+/m.test(label)) {
        warnings.push(`Node label "${label}" contains markdown header syntax which may not render correctly`);
      }
      
      // Check for code blocks
      if (/```/.test(label)) {
        warnings.push(`Node label "${label}" contains code block syntax which is not supported in Mermaid nodes`);
      }
      
      // Check for HTML tags (common issue)
      if (/<[^>]+>/.test(label)) {
        warnings.push(`Node label "${label}" contains HTML tags which may not render correctly`);
      }
    }
    
    // Also check edge labels
    const edgePattern = /\|([^|]+)\|/g;
    while ((match = edgePattern.exec(text)) !== null) {
      const label = match[1];
      
      // Check for problematic characters in edge labels
      if (/^\s*[-*]\s+/m.test(label)) {
        warnings.push(`Edge label "${label}" contains markdown list syntax which may cause rendering issues`);
      }
      
      if (/^\s*\d+\.\s+/m.test(label)) {
        warnings.push(`Edge label "${label}" contains numbered list which may cause rendering issues`);
      }
    }
  }
  
  return warnings;
}

function validateFlowchartSyntax(text: string): { valid: boolean; errors: Diagnostic[] } {
  const errors: Diagnostic[] = [];

  // 1) Targeted check: invalid click syntax
  // Mermaid flowchart syntax expects: click <nodeId> "<url>" ["<tooltip>"]
  // A quoted nodeId (click "something" ...) is invalid.
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const trimmed = lineText.trim();
    if (!trimmed.startsWith('click')) continue;

    // Must be `click <something...>`
    const afterClick = trimmed.slice('click'.length).trimStart();
    if (afterClick.startsWith('"') || afterClick.startsWith("'")) {
      const colIdx = lineText.indexOf(afterClick[0]);
      errors.push({
        severity: 'error',
        code: 'FLOWCHART_CLICK_TARGET_QUOTED',
        message:
          'Invalid flowchart click syntax: the click target must be an unquoted node id (e.g. `click NodeId "url"`), not a quoted string.',
        line: i + 1,
        column: colIdx >= 0 ? colIdx + 1 : undefined,
        lineText,
      });
    }
  }

  // 2) Existing coarse checks (kept for speed/coverage)
  const hasNodes = /\w+\s*(\[|\(|\{)/.test(text);
  const hasArrows = /\w+\s*-+>+\s*\w+/.test(text);
  const hasValidArrowSyntax = !/[<>]{3,}/.test(text); // Avoid invalid arrow syntax

  const valid = errors.length === 0 && (hasNodes || hasArrows) && hasValidArrowSyntax;
  if (!valid && errors.length === 0) {
    errors.push({
      severity: 'error',
      code: 'FLOWCHART_SYNTAX_INVALID',
      message: 'Invalid flowchart diagram syntax.',
    });
  }

  return { valid, errors };
}

/**
 * Basic syntax validation for different diagram types
 */
const SYNTAX_VALIDATORS = {
  flowchart: (text: string) => {
    return validateFlowchartSyntax(text).valid;
  },
  
  sequence: (text: string) => {
    // Check for participant or actor definitions, or direct interactions
    const hasParticipants = /participant\s+\w+|actor\s+\w+|\w+\s*-[->]+\s*\w+/.test(text);
    return hasParticipants;
  },
  
  class: (text: string) => {
    // Check for class definitions or relationships
    const hasClasses = /class\s+\w+|[\w\s]+\s*[<|>-]+\s*[\w\s]+/.test(text);
    return hasClasses;
  },
  
  state: (text: string) => {
    // Check for state definitions or transitions
    const hasStates = /\[\*\]|\w+\s*-->\s*\w+|state\s+\w+/.test(text);
    return hasStates;
  },
  
  er: (text: string) => {
    // Check for entity relationships
    const hasEntities = /\w+\s+\|\|?--[o{]?\{?\s*\w+/.test(text);
    return hasEntities;
  },
  
  gantt: (text: string) => {
    // Check for sections and tasks
    const hasGanttElements = /section\s+|title\s+|\w+\s*:\s*[\w,\s-]+/.test(text);
    return hasGanttElements;
  },
  
  pie: (text: string) => {
    // Check for pie chart data
    const hasData = /"[^"]+"\s*:\s*\d+/.test(text);
    return hasData;
  },
  
  journey: (text: string) => {
    // Check for journey sections
    const hasJourneyElements = /section\s+|\w+:\s*\d+/.test(text);
    return hasJourneyElements;
  },
  
  default: () => true, // Accept other diagram types without deep validation
};

/**
 * Validate a mermaid diagram without rendering
 * @param text - The mermaid diagram definition
 * @param parseOptions - Options for parsing
 * @returns Validation result with diagram type if valid, false if invalid
 */
export async function validate(
  text: string,
  parseOptions?: ParseOptions
): Promise<ParseResult | false> {
  try {
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid input: text must be a non-empty string');
    }

    const processed = preprocessDiagram(text);
    const type = detectType(processed.code);
    
    if (type === 'unknown') {
      throw new Error('Unknown diagram type');
    }

    // Run richer validation when we can (currently: flowchart)
    if (type === 'flowchart') {
      const outcome = validateFlowchartSyntax(processed.code);
      if (!outcome.valid) {
        const first = outcome.errors[0];
        throw new MermaidValidationError(first?.message ?? 'Invalid flowchart diagram syntax', type, outcome.errors);
      }
    }

    // Run basic syntax validation
    const validator = SYNTAX_VALIDATORS[type as keyof typeof SYNTAX_VALIDATORS] || SYNTAX_VALIDATORS.default;
    const isValid = validator(processed.code);
    
    if (!isValid) {
      throw new MermaidValidationError(`Invalid ${type} diagram syntax`, type);
    }

    // Check for potential rendering issues
    const warnings = checkNodeLabels(processed.code, type);

    return {
      diagramType: type,
      config: processed.config,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    if (parseOptions?.suppressErrors) {
      return false;
    }
    throw error;
  }
}

/**
 * Parse a diagram and return detailed information
 */
export async function parse(text: string): Promise<DetailedParseResult> {
  const processed = preprocessDiagram(text);
  const detectedType = detectType(processed.code);
  try {
    const result = await validate(text, { suppressErrors: false });
    if (result) {
      return {
        type: result.diagramType,
        config: result.config,
        valid: true,
        warnings: result.warnings,
      };
    }
    return {
      type: 'unknown',
      valid: false,
    };
  } catch (error) {
    if (error instanceof MermaidValidationError) {
      return {
        type: error.diagramType || (detectedType === 'unknown' ? 'unknown' : detectedType),
        config: processed.config,
        valid: false,
        error: error.message,
        errors: error.diagnostics?.length ? error.diagnostics : undefined,
      };
    }
    return {
      type: detectedType === 'unknown' ? 'unknown' : detectedType,
      config: processed.config,
      valid: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if a diagram type is supported
 */
export function isSupported(diagramType: string): boolean {
  return Object.keys(DIAGRAM_PATTERNS).includes(diagramType);
}

/**
 * Get list of supported diagram types
 */
export function getSupportedDiagrams(): string[] {
  return Object.keys(DIAGRAM_PATTERNS);
}

/**
 * Get diagram type from text without full validation
 */
export function getDiagramType(text: string): string {
  const processed = preprocessDiagram(text);
  return detectType(processed.code);
}

// Default export
const mermaidValidator = {
  validate,
  parse,
  isSupported,
  getSupportedDiagrams,
  getDiagramType,
};

export default mermaidValidator;