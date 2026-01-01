import { describe, expect, test } from 'bun:test';
import { 
  validate, 
  parse, 
  isSupported, 
  getSupportedDiagrams,
  getDiagramType
} from './index.js';

describe('@a24z/mermaid-parser', () => {
  test('validates flowchart diagrams', async () => {
    const result = await validate(`
      graph TD
        A[Start] --> B{Decision}
        B -->|Yes| C[Success]
        B -->|No| D[Retry]
        D --> A
    `);
    
    expect(result).toBeTruthy();
    expect(result && result.diagramType).toBe('flowchart');
  });

  test('validates sequence diagrams', async () => {
    const result = await validate(`
      sequenceDiagram
        participant A as Alice
        participant B as Bob
        A->>B: Hello Bob, how are you?
        B-->>A: Great!
    `);
    
    expect(result).toBeTruthy();
    expect(result && result.diagramType).toBe('sequence');
  });

  test('validates class diagrams', async () => {
    const result = await validate(`
      classDiagram
        class Animal {
          +String name
          +makeSound() void
        }
        class Dog {
          +bark() void
        }
        Animal <|-- Dog
    `);
    
    expect(result).toBeTruthy();
    expect(result && result.diagramType).toBe('class');
  });

  test('validates state diagrams', async () => {
    const result = await validate(`
      stateDiagram-v2
        [*] --> Still
        Still --> [*]
        Still --> Moving
        Moving --> Still
        Moving --> Crash
        Crash --> [*]
    `);
    
    expect(result).toBeTruthy();
    expect(result && result.diagramType).toBe('state');
  });

  test('validates ER diagrams', async () => {
    const result = await validate(`
      erDiagram
        CUSTOMER ||--o{ ORDER : places
        CUSTOMER {
          string name
          string custNumber
        }
        ORDER {
          int orderNumber
          string deliveryAddress
        }
    `);
    
    expect(result).toBeTruthy();
    expect(result && result.diagramType).toBe('er');
  });

  test('validates gantt charts', async () => {
    const result = await validate(`
      gantt
        title A Gantt Diagram
        dateFormat  YYYY-MM-DD
        section Section
        A task           :a1, 2024-01-01, 30d
        Another task     :after a1  , 20d
    `);
    
    expect(result).toBeTruthy();
    expect(result && result.diagramType).toBe('gantt');
  });

  test('validates pie charts', async () => {
    const result = await validate(`
      pie title Pets adopted by volunteers
        "Dogs" : 386
        "Cats" : 85
        "Rats" : 15
    `);
    
    expect(result).toBeTruthy();
    expect(result && result.diagramType).toBe('pie');
  });

  test('rejects invalid syntax', async () => {
    const result = await validate('this is not a valid diagram', { 
      suppressErrors: true 
    });
    expect(result).toBe(false);
  });

  test('throws errors when not suppressed', async () => {
    expect(async () => {
      await validate('invalid syntax');
    }).toThrow();
  });

  test('parse function returns detailed information', async () => {
    const result = await parse(`
      graph LR
        A --> B
        B --> C
    `);
    
    expect(result.valid).toBe(true);
    expect(result.type).toBe('flowchart');
    expect(result.error).toBeUndefined();
  });

  test('parse function handles errors gracefully', async () => {
    const result = await parse('invalid diagram syntax');
    
    expect(result.valid).toBe(false);
    expect(result.type).toBe('unknown');
    expect(result.error).toBeDefined();
  });

  test('parse returns verbose diagnostics for invalid flowchart click syntax', async () => {
    const result = await parse(`
      graph TD
        A[Start] --> B[Process]
        click "src/hooks/use-mobile.tsx" "src/hooks/use-mobile.tsx"
    `);

    expect(result.valid).toBe(false);
    expect(result.type).toBe('flowchart');
    expect(result.error).toBeDefined();
    expect(result.errors).toBeDefined();
    expect(result.errors && result.errors[0].code).toBe('FLOWCHART_CLICK_TARGET_QUOTED');
    expect(result.errors && result.errors[0].line).toBeDefined();
  });

  test('isSupported checks diagram types', () => {
    expect(isSupported('flowchart')).toBe(true);
    expect(isSupported('sequence')).toBe(true);
    expect(isSupported('class')).toBe(true);
    expect(isSupported('nonexistent')).toBe(false);
  });

  test('getSupportedDiagrams returns all supported types', () => {
    const supported = getSupportedDiagrams();
    expect(supported).toBeInstanceOf(Array);
    expect(supported.length).toBeGreaterThan(10);
    expect(supported).toContain('flowchart');
    expect(supported).toContain('sequence');
    expect(supported).toContain('class');
    expect(supported).toContain('state');
  });

  test('getDiagramType detects types without validation', () => {
    expect(getDiagramType('graph TD\\n  A --> B')).toBe('flowchart');
    expect(getDiagramType('sequenceDiagram\\n  A->>B: Hi')).toBe('sequence');
    expect(getDiagramType('classDiagram\\n  class Foo')).toBe('class');
    expect(getDiagramType('invalid')).toBe('unknown');
  });

  test('handles directives and config', async () => {
    const result = await validate(`
      %%{init: {"theme": "dark"}}%%
      graph TD
        A --> B
    `);
    
    expect(result).toBeTruthy();
    expect(result && result.diagramType).toBe('flowchart');
    expect(result && result.config).toBeDefined();
    // The config structure should have init.theme
    expect(result && result.config?.init?.theme).toBe('dark');
  });

  test('handles comments', async () => {
    const result = await validate(`
      %% This is a comment
      graph TD
        A --> B %% Another comment
        # This is also a comment
    `);
    
    expect(result).toBeTruthy();
    expect(result && result.diagramType).toBe('flowchart');
  });

  test('validates journey diagrams', async () => {
    const result = await validate(`
      journey
        title My working day
        section Go to work
          Make tea: 5: Me
          Go upstairs: 3: Me
          Do work: 1: Me, Cat
    `);
    
    expect(result).toBeTruthy();
    expect(result && result.diagramType).toBe('journey');
  });

  test('detects C4 context diagrams', async () => {
    const type = getDiagramType(`
      C4Context
        title System Context diagram for Internet Banking System
    `);
    
    expect(type).toBe('c4context');
  });

  test('handles empty input gracefully', async () => {
    const result = await validate('', { suppressErrors: true });
    expect(result).toBe(false);
  });

  test('handles whitespace-only input', async () => {
    const result = await validate('   \\n  \\t  ', { suppressErrors: true });
    expect(result).toBe(false);
  });

  test('validates mindmap diagrams', async () => {
    const result = await validate(`
      mindmap
        root((mindmap))
          Origins
            Long history
            ::icon(fa fa-book)
    `);
    
    expect(result).toBeTruthy();
    expect(result && result.diagramType).toBe('mindmap');
  });

  test('validates complex flowchart with labeled edges and nodes', async () => {
    const result = await validate(`
      graph LR
        A[GitHub Repository] -->|1. Fetch Views| B[code-city-landing]
        B -->|2. Extract Summaries| C[a24z-memory]
        C -->|3. Return Summaries| B
        B -->|4. Store in S3| D[S3 Bucket]
        D -->|5. Serve via API| E[Alexandria API]
        E -->|6. Display| F[Alexandria UI]
    `);
    
    expect(result).toBeTruthy();
    expect(result && result.diagramType).toBe('flowchart');
    
    // Log the actual result for inspection
    console.log('Complex flowchart validation result:', JSON.stringify(result, null, 2));
  });

  test('validates flowchart with valid click syntax', async () => {
    const result = await validate(`
      graph TD
        A[Start] --> B[Process]
        click A "https://example.com"
        click B "https://example.com/process" "Visit Process"
    `);
    
    expect(result).toBeTruthy();
    expect(result && result.diagramType).toBe('flowchart');
  });

  test('rejects flowchart with invalid click syntax (string literal instead of identifier)', async () => {
    const result = await validate(`
      graph TD
        A[Start] --> B[Process]
        click UIComp "src/components/ui/"
        click DadButton "src/components/DadButton.tsx"
        click Hooks "src/hooks/"
        click "src/hooks/use-mobile.tsx" "src/hooks/use-mobile.tsx"
        click ToastLogic "src/hooks/use-toast.ts"
    `, { suppressErrors: true });
    
    expect(result).toBe(false);
  });

  test('rejects flowchart with click syntax starting with double quotes', async () => {
    const result = await validate(`
      graph TD
        A[Node]
        click "invalid" "url"
    `, { suppressErrors: true });
    
    expect(result).toBe(false);
  });

  test('rejects flowchart with click syntax starting with single quotes', async () => {
    const result = await validate(`
      graph TD
        A[Node]
        click 'invalid' 'url'
    `, { suppressErrors: true });
    
    expect(result).toBe(false);
  });
});