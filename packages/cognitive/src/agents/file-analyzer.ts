// ─── File Analyzer Agent ──────────────────────────────────────────────────────
// Analyzes individual files — extracts symbols, classifies roles,
// assigns architectural layers, detects concepts, calculates complexity.

import { readFile } from 'fs/promises';
import { KnowledgeGraph as KG } from '../pipeline/types.js';
import { languageRegistry } from '../languages/registry.js';
import { FileInfo } from './project-scanner.js';

// We import CodeIndexer type from @mutimemoagent/indexer
// Since we don't have the real type, we define an interface

export interface CodeIndexer {
  /** Index a file and return its symbols */
  indexFile(filePath: string): Promise<SymbolEntry[]>;
}

export interface SymbolEntry {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'module' | 'method' | 'property' | 'enum' | 'unknown';
  line: number;
  column: number;
  endLine: number;
  visibility?: 'public' | 'private' | 'protected' | 'exported';
  parentName?: string;
  signature?: string;
  imports?: string[];
  exports?: string[];
  docComment?: string;
}

export interface AnalyzedSymbol {
  name: string;
  kind: SymbolEntry['kind'];
  role: SymbolRole;
  line: number;
  complexities: {
    hasGenerics: boolean;
    hasClosures: boolean;
    hasDecorators: boolean;
    hasAsync: boolean;
    hasInheritance: boolean;
    hasComposition: boolean;
    dependencyCount: number;
    parameterCount: number;
    nestingDepth: number;
  };
}

export type SymbolRole =
  | 'entry_point'
  | 'handler'
  | 'middleware'
  | 'model'
  | 'controller'
  | 'service'
  | 'utility'
  | 'config'
  | 'test'
  | 'component'
  | 'route'
  | 'unknown';

export interface FileAnalysis {
  file: FileInfo;
  symbols: AnalyzedSymbol[];
  layer: string;
  summary: string;
  tags: string[];
  concepts: string[];
}

// ─── Layer Detection ─────────────────────────────────────────────────────────

const LAYER_PATTERNS: Array<{ pattern: RegExp; layer: string }> = [
  // API Layer
  { pattern: /[\\\/]api[\\\/]/, layer: 'api' },
  { pattern: /[\\\/]controllers?[\\\/]/, layer: 'api' },
  { pattern: /[\\\/]routes?[\\\/]/, layer: 'api' },
  { pattern: /[\\\/]handlers?[\\\/]/, layer: 'api' },
  { pattern: /[\\\/]middleware[\\\/]/, layer: 'api' },
  { pattern: /[\\\/]middlewares?[\\\/]/, layer: 'api' },
  { pattern: /[\\\/]endpoints?[\\\/]/, layer: 'api' },
  // Service Layer
  { pattern: /[\\\/]services?[\\\/]/, layer: 'service' },
  { pattern: /[\\\/]lib[\\\/]/, layer: 'service' },
  { pattern: /[\\\/]business[\\\/]/, layer: 'service' },
  { pattern: /[\\\/]domain[\\\/]/, layer: 'service' },
  { pattern: /[\\\/]logic[\\\/]/, layer: 'service' },
  // Data Layer
  { pattern: /[\\\/]models?[\\\/]/, layer: 'data' },
  { pattern: /[\\\/]entities?[\\\/]/, layer: 'data' },
  { pattern: /[\\\/]schema[\\\/]/, layer: 'data' },
  { pattern: /[\\\/]types[\\\/]/, layer: 'data' },
  { pattern: /[\\\/]database[\\\/]/, layer: 'data' },
  { pattern: /[\\\/]repositories?[\\\/]/, layer: 'data' },
  { pattern: /[\\\/]dao[\\\/]/, layer: 'data' },
  { pattern: /[\\\/]db[\\\/]/, layer: 'data' },
  { pattern: /[\\\/]migrations?[\\\/]/, layer: 'data' },
  // UI Layer
  { pattern: /[\\\/]components?[\\\/]/, layer: 'ui' },
  { pattern: /[\\\/]pages[\\\/]/, layer: 'ui' },
  { pattern: /[\\\/]views[\\\/]/, layer: 'ui' },
  { pattern: /[\\\/]templates?[\\\/]/, layer: 'ui' },
  { pattern: /[\\\/]ui[\\\/]/, layer: 'ui' },
  { pattern: /[\\\/]screens?[\\\/]/, layer: 'ui' },
  { pattern: /[\\\/]widgets?[\\\/]/, layer: 'ui' },
  { pattern: /\.(svelte|vue|tsx|jsx)$/, layer: 'ui' },
  // Utility Layer
  { pattern: /[\\\/]utils?[\\\/]/, layer: 'utility' },
  { pattern: /[\\\/]helpers?[\\\/]/, layer: 'utility' },
  { pattern: /[\\\/]common[\\\/]/, layer: 'utility' },
  { pattern: /[\\\/]shared[\\\/]/, layer: 'utility' },
  { pattern: /[\\\/]misc[\\\/]/, layer: 'utility' },
  // Config Layer
  { pattern: /[\\\/]config[\\\/]/, layer: 'config' },
  { pattern: /[\\\/]settings?[\\\/]/, layer: 'config' },
  { pattern: /[\\\/]env[\\\/]/, layer: 'config' },
  { pattern: /\.env/, layer: 'config' },
  // Test Layer
  { pattern: /[\\\/]tests?[\\\/]/, layer: 'test' },
  { pattern: /[\\\/]__tests__[\\\/]/, layer: 'test' },
  { pattern: /[\\\/]spec[\\\/]/, layer: 'test' },
  { pattern: /\.(test|spec|e2e)\.(ts|js|tsx|jsx|py|go|rs|java|kt)$/, layer: 'test' },
  { pattern: /_test\.go$/, layer: 'test' },
];

/** Detect architectural layer from file path */
function detectLayer(relativePath: string, filename: string): string {
  for (const { pattern, layer } of LAYER_PATTERNS) {
    if (pattern.test(relativePath)) return layer;
  }
  return 'utility'; // default
}

// ─── Role Classification ─────────────────────────────────────────────────────

function classifyRole(kind: string, name: string, relativePath: string, docComment?: string): SymbolRole {
  const lowerName = name.toLowerCase();
  const lowerPath = relativePath.toLowerCase();

  // Entry point
  if (/^(main|index|app|server|cli|bootstrap)_?/.test(lowerName)) return 'entry_point';

  // Controller
  if (lowerName.endsWith('controller') || lowerName.endsWith('controller') ||
      /[\\\/]controllers?[\\\/]/.test(lowerPath)) return 'controller';

  // Handler / Route handler
  if (lowerName.endsWith('handler') || lowerName.startsWith('handle') ||
      lowerName.endsWith('route') || lowerName.endsWith('routes') ||
      /[\\\/]handlers?[\\\/]/.test(lowerPath) || /[\\\/]routes?[\\\/]/.test(lowerPath)) return 'handler';

  // Middleware
  if (lowerName.endsWith('middleware') || lowerName.endsWith('middleware') ||
      /[\\\/]middleware[\\\/]/.test(lowerPath)) return 'middleware';

  // Model
  if (lowerName.endsWith('model') || lowerName.endsWith('entity') || lowerName.endsWith('schema') ||
      kind === 'class' && /[\\\/]models?[\\\/]/.test(lowerPath)) return 'model';

  // Service
  if (lowerName.endsWith('service') || lowerName.endsWith('services') ||
      kind === 'class' && /[\\\/]services?[\\\/]/.test(lowerPath) ||
      kind === 'function' && /[\\\/]services?[\\\/]/.test(lowerPath)) return 'service';

  // Component (UI)
  if (kind === 'function' || kind === 'class') {
    if (lowerName[0] === lowerName[0]?.toUpperCase() && lowerName !== lowerName.toUpperCase()) {
      if (/[\\\/]components?[\\\/]/.test(lowerPath) || /[\\\/]pages[\\\/]/.test(lowerPath)) return 'component';
    }
  }

  // Config
  if (lowerName.includes('config') || lowerName.includes('settings') ||
      /[\\\/]config[\\\/]/.test(lowerPath)) return 'config';

  // Test
  if (lowerName.startsWith('test') || lowerName.endsWith('test') || lowerName.endsWith('spec') ||
      /\.(test|spec|e2e)\.(ts|js|tsx|jsx|py|go|rs|java)$/.test(relativePath)) return 'test';

  // Utility
  if (kind === 'function' && !/^[A-Z]/.test(lowerName)) return 'utility';

  return 'unknown';
}

// ─── Concept Detection ───────────────────────────────────────────────────────

const CONCEPT_PATTERNS: Array<{ pattern: RegExp; concept: string }> = [
  { pattern: /<\s*\w+>/g, concept: 'generics' },
  { pattern: /=>/g, concept: 'closures' },
  { pattern: /@\w+/g, concept: 'decorators' },
  { pattern: /\bawait\b|\basync\b/g, concept: 'async/await' },
  { pattern: /\bextends\s+\w+/g, concept: 'inheritance' },
  { pattern: /\bimplements\s+\w+/g, concept: 'composition' },
  { pattern: /new\s+\w+/g, concept: 'dependency-injection' },
  { pattern: /\bsubscribe\b|\bobservable\b|\bemit\b|\bon\b/g, concept: 'observer' },
  { pattern: /\bfactory\b|\bcreate\w+/g, concept: 'factory' },
  { pattern: /\bsingleton\b/g, concept: 'singleton' },
  { pattern: /\bmvc\b|\bcontroller\b|\bmodel\b|\bview\b/g, concept: 'mvc' },
  { pattern: /\bmiddleware\b/g, concept: 'middleware-pattern' },
  { pattern: /\bPromise\b|\.then\s*\(|\.catch\s*\(/g, concept: 'promises' },
  { pattern: /\bexport\b|\bmodule\.exports\b/g, concept: 'modularity' },
  { pattern: /\bthrow\b|\btry\b|\bcatch\b/g, concept: 'error-handling' },
  { pattern: /\binterface\b/g, concept: 'interfaces' },
  { pattern: /\babstract\b/g, concept: 'abstraction' },
  { pattern: /\benum\b/g, concept: 'enumerations' },
  { pattern: /\b(?:get|post|put|delete|patch)\s*\(/g, concept: 'rest-api' },
  { pattern: /\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bFROM\b/g, concept: 'sql' },
  { pattern: /\bGraphQL\b|\bgql\b|\bquery\b|\bmutation\b/g, concept: 'graphql' },
  { pattern: /\bWebSocket\b|\bws\b|\bwss\b/g, concept: 'websockets' },
  { pattern: /\bcache\b|\bRedis\b|\bmemoize\b/g, concept: 'caching' },
  { pattern: /\bauth\b|\blogin\b|\btoken\b|\bJWT\b|\bOAuth\b/g, concept: 'authentication' },
  { pattern: /\blogger\b|\blog\b/g, concept: 'logging' },
];

/** Detect language concepts from file content */
function detectConcepts(content: string): string[] {
  const found = new Set<string>();
  for (const { pattern, concept } of CONCEPT_PATTERNS) {
    if (pattern.test(content)) {
      found.add(concept);
      pattern.lastIndex = 0; // reset
    }
  }
  return Array.from(found);
}

// ─── Tag Extraction ──────────────────────────────────────────────────────────

const TAG_PATTERNS: Array<{ pattern: RegExp; extract: (match: string) => string }> = [
  // Domain concepts from directory names
  { pattern: /[\\\/](auth|user|payment|order|product|admin|api|email|notification|search|analytics|report|dashboard)[\\\/]/g, extract: m => m.replace(/[\\\/]/g, '') },
  // Technology mentions
  { pattern: /\b(docker|kubernetes|aws|gcp|azure|redis|postgres|mysql|mongodb|elasticsearch|kafka|rabbitmq|grpc|rest|graphql|websocket)\b/gi, extract: m => m.toLowerCase() },
  { pattern: /\b(react|vue|angular|svelte|django|flask|fastapi|spring|express|nestjs|next|nuxt|laravel|rails)\b/gi, extract: m => m.toLowerCase() },
];

/** Extract tags from file content and path */
function extractTags(content: string, relativePath: string, filename: string): string[] {
  const tags = new Set<string>();

  // From path
  const pathParts = relativePath.split(/[\\\/]/).filter(Boolean);
  for (const part of pathParts) {
    if (part !== '.' && part !== '..' && !part.includes('.')) {
      tags.add(part.toLowerCase());
    }
  }

  // From content matches
  for (const { pattern, extract } of TAG_PATTERNS) {
    const matches = content.matchAll(pattern);
    for (const m of matches) {
      tags.add(extract(m[0]));
    }
    pattern.lastIndex = 0;
  }

  // File extension
  const ext = filename.split('.').pop();
  if (ext) tags.add(ext);

  return Array.from(tags).slice(0, 20); // cap at 20 tags
}

// ─── Complexity Calculation ─────────────────────────────────────────────────

function calcNestingDepth(content: string): number {
  let maxDepth = 0;
  let depth = 0;
  for (const char of content) {
    if (char === '{' || char === '(' || char === '[') {
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    } else if (char === '}' || char === ')' || char === ']') {
      depth--;
    }
  }
  return maxDepth;
}

function calcComplexityScore(
  symbolCount: number,
  nestingDepth: number,
  dependencyCount: number,
  conceptCount: number
): number {
  return Math.round(
    symbolCount * 2 +
    nestingDepth * 3 +
    dependencyCount * 1.5 +
    conceptCount * 1
  );
}

// ─── Summary Generation ──────────────────────────────────────────────────────

function generateSummary(
  file: FileInfo,
  symbols: AnalyzedSymbol[],
  layer: string,
  concepts: string[]
): string {
  const parts: string[] = [];

  const functions = symbols.filter(s => s.kind === 'function').length;
  const classes = symbols.filter(s => s.kind === 'class').length;
  const interfaces = symbols.filter(s => s.kind === 'interface' || s.kind === 'type').length;
  const exports = symbols.filter(s => s.role !== 'unknown');

  parts.push(`File "${file.filename}" in ${file.language}.`);

  if (classes > 0) parts.push(`Defines ${classes} class(es).`);
  if (functions > 0) parts.push(`Contains ${functions} function(s).`);
  if (interfaces > 0) parts.push(`Declares ${interfaces} type(s)/interface(s).`);

  const roles = new Set(symbols.map(s => s.role).filter(r => r !== 'unknown'));
  if (roles.size > 0) {
    parts.push(`Roles: ${Array.from(roles).join(', ')}.`);
  }

  parts.push(`Layer: ${layer}.`);

  if (concepts.length > 0) {
    parts.push(`Concepts: ${concepts.slice(0, 5).join(', ')}.`);
  }

  if (file.isEntryPoint) parts.push('Serves as project entry point.');

  return parts.join(' ');
}

// ─── FileAnalyzer ────────────────────────────────────────────────────────────

export class FileAnalyzer {
  /**
   * Analyze a single file: extract symbols, classify, assign layer, detect concepts.
   */
  async analyze(file: FileInfo, indexer?: CodeIndexer): Promise<FileAnalysis> {
    let content = '';
    try {
      content = await readFile(file.path, 'utf-8');
    } catch {
      content = '';
    }

    // Get symbols from indexer or fall back to regex-based detection
    let symbols: SymbolEntry[] = [];
    if (indexer) {
      try {
        symbols = await indexer.indexFile(file.path);
      } catch {
        symbols = this.fallbackParse(content, file.extension, file.language);
      }
    } else {
      symbols = this.fallbackParse(content, file.extension, file.language);
    }

    // Analyze each symbol
    const analyzedSymbols: AnalyzedSymbol[] = symbols.map(sym => ({
      name: sym.name,
      kind: sym.kind,
      role: classifyRole(sym.kind, sym.name, file.relativePath, sym.docComment),
      line: sym.line,
      complexities: {
        hasGenerics: /<\s*\w+>/.test(sym.signature ?? ''),
        hasClosures: sym.signature?.includes('=>') ?? false,
        hasDecorators: sym.signature?.includes('@') ?? false,
        hasAsync: sym.signature?.includes('async') ?? false,
        hasInheritance: sym.signature?.includes('extends') ?? false,
        hasComposition: sym.signature?.includes('implements') ?? false,
        dependencyCount: sym.imports?.length ?? 0,
        parameterCount: sym.signature ? (sym.signature.match(/\b\w+(?=\s*[,)])/g)?.length ?? 0) : 0,
        nestingDepth: calcNestingDepth(content),
      },
    }));

    // Detect layer
    const layer = detectLayer(file.relativePath, file.filename);

    // Detect concepts
    const concepts = detectConcepts(content);

    // Extract tags
    const tags = extractTags(content, file.relativePath, file.filename);

    // Generate summary
    const summary = generateSummary(file, analyzedSymbols, layer, concepts);

    return {
      file,
      symbols: analyzedSymbols,
      layer,
      summary,
      tags,
      concepts,
    };
  }

  /**
   * Fallback regex-based parsing when no indexer is available.
   */
  private fallbackParse(content: string, extension: string, language: string): SymbolEntry[] {
    const symbols: SymbolEntry[] = [];
    const lines = content.split('\n');
    const langConfig = languageRegistry.getLanguage(extension) ?? languageRegistry.getLanguageByName(language);

    if (!langConfig) return symbols;

    // Class detection
    let match: RegExpExecArray | null;
    while ((match = langConfig.classPattern.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      symbols.push({
        name: match[1],
        kind: 'class',
        line: lineNum,
        column: match.index - content.lastIndexOf('\n', match.index) - 1,
        endLine: lineNum,
        visibility: content.slice(0, match.index).includes('export') ? 'exported' : 'public',
        signature: match[0],
      });
    }

    // Function detection
    langConfig.functionPattern.lastIndex = 0;
    while ((match = langConfig.functionPattern.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      symbols.push({
        name: match[1],
        kind: 'function',
        line: lineNum,
        column: match.index - content.lastIndexOf('\n', match.index) - 1,
        endLine: lineNum,
        signature: match[0],
      });
    }

    // Import detection
    langConfig.importPatterns.forEach(pattern => {
      pattern.lastIndex = 0;
      while ((match = pattern.exec(content)) !== null) {
        // Don't add as symbol, just note import
      }
    });

    // Export detection
    langConfig.exportPatterns.forEach(pattern => {
      pattern.lastIndex = 0;
      while ((match = pattern.exec(content)) !== null) {
        // export markers already matched in class/func patterns
      }
    });

    return symbols;
  }
}
