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

export interface DetailedParseResult {
  type: string;
  config?: any;
  valid: boolean;
  error?: string;
  warnings?: string[];
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

/**
 * Basic syntax validation for different diagram types
 */
const SYNTAX_VALIDATORS = {
  flowchart: (text: string) => {
    // Basic flowchart validation - look for nodes or arrows
    const hasNodes = /\w+\s*(\[|\(|\{)/.test(text);
    const hasArrows = /\w+\s*-+>+\s*\w+/.test(text);
    const hasValidSyntax = !/[<>]{3,}/.test(text); // Avoid invalid arrow syntax
    
    // Check for invalid click syntax: click statement should start with an identifier, not a quoted string
    // Valid: click NodeId "url"
    // Invalid: click "url" "url"
    const hasInvalidClick = /^\s*click\s+["']/.test(text) || /\n\s*click\s+["']/.test(text);
    if (hasInvalidClick) {
      return false;
    }
    
    return (hasNodes || hasArrows) && hasValidSyntax;
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

    // Run basic syntax validation
    const validator = SYNTAX_VALIDATORS[type as keyof typeof SYNTAX_VALIDATORS] || SYNTAX_VALIDATORS.default;
    const isValid = validator(processed.code);
    
    if (!isValid) {
      throw new Error(`Invalid ${type} diagram syntax`);
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
    return {
      type: 'unknown',
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