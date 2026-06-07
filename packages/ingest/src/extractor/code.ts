import {type ClassifiedItem, type MemoryType, type LLMClient, generateId, now} from '@mutimemoagent/core';

// ──────────────────────────────────────────────────────────────────
// CodeExtractor — 代码内容提取器
// ──────────────────────────────────────────────────────────────────

/**
 * 代码提取器
 *
 * 将代码内容分类提取为：
 * - code_file          → 文件级信息 (文件名、路径、用途)
 * - code_symbol        → 符号 (函数、类、变量、接口)
 * - code_dependency    → 依赖关系 (import/require/模块引用)
 * - code_architecture  → 架构信息 (设计模式、模块组织)
 * - code_hotspot       → 热点 (频繁修改、复杂区域)
 * - procedure          → 运行/部署流程
 */
export class CodeExtractor {
  private llm: LLMClient;

  constructor(llm: LLMClient) {
    this.llm = llm;
  }

  /**
   * 从代码片段中提取分类后的记忆体项
   * @param input - 代码或相关文本
   * @returns 分类后的内存项列表
   */
  async extract(input: string): Promise<ClassifiedItem[]> {
    if (!input || input.trim().length === 0) return [];

    const prompt = this.buildExtractionPrompt(input);

    try {
      const items = await this.llm.extractJSON<ClassifiedItem[]>(prompt);
      return items
        .filter(
          (item) =>
            item &&
            typeof item.content === 'string' &&
            item.content.length > 0 &&
            this.isValidCodeType(item.type)
        )
        .map((item) => ({
          target_agent: item.target_agent || 'project',
          type: item.type as MemoryType,
          content: item.content,
          confidence: typeof item.confidence === 'number' ? item.confidence : 0.8,
          source: 'code',
          tags: Array.isArray(item.tags) ? item.tags : [],
          ...(item.structured_data ? {structured_data: item.structured_data} : {}),
        }));
    } catch {
      return this.fallbackExtract(input);
    }
  }

  private buildExtractionPrompt(input: string): string {
    return `You are a code analysis system. Analyze the following code/text and extract ALL distinct pieces of information.

Valid types:
- "code_file": file-level info (path, language, purpose, size)
- "code_symbol": function, class, variable, interface, type definitions
- "code_dependency": import/require statements, external modules, dependencies
- "code_architecture": design patterns, module organization, data flow
- "code_hotspot": frequently changed code, complex logic, critical sections
- "procedure": build, test, deploy steps, configuration

For each item:
- target_agent: "project" for project-wide, "code-index" for symbol-level
- type: one of the valid types
- content: description of what was found
- confidence: 0.0 to 1.0
- tags: relevant keywords
- structured_data (optional): { "file_path"?, "symbol_name"?, "language"?, "line_number"? }

Code:
"""
${input}
"""

Respond ONLY with a valid JSON array. No markdown, no explanation.`;
  }

  private fallbackExtract(input: string): ClassifiedItem[] {
    const items: ClassifiedItem[] = [];

    // 提取 import/require 语句
    const importRegex =
      /(?:import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))?)\s+from\s+['"]([^'"]+)['"]|const\s+\w+\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"])/g;
    let match: RegExpExecArray | null;
    const seenDeps = new Set<string>();
    while ((match = importRegex.exec(input)) !== null) {
      const dep = match[1] || match[2] || match[3];
      if (dep && !seenDeps.has(dep)) {
        seenDeps.add(dep);
        items.push({
          target_agent: 'project',
          type: 'code_dependency',
          content: `Dependency on "${dep}"`,
          confidence: 0.9,
          source: 'code',
          tags: ['dependency', dep],
          structured_data: {module: dep},
        });
      }
    }

    // 提取函数/类定义
    const defRegex =
      /(?:export\s+)?(?:function\s+(\w+)|class\s+(\w+)|interface\s+(\w+)|type\s+(\w+)\s*=)/g;
    const seenSymbols = new Set<string>();
    while ((match = defRegex.exec(input)) !== null) {
      const name = match[1] || match[2] || match[3] || match[4];
      if (name && !seenSymbols.has(name)) {
        seenSymbols.add(name);
        const symType = match[2]
          ? 'class'
          : match[3]
            ? 'interface'
            : match[4]
              ? 'type'
              : 'function';
        items.push({
          target_agent: 'code-index',
          type: 'code_symbol',
          content: `${symType} ${name}`,
          confidence: 0.9,
          source: 'code',
          tags: [symType, name],
          structured_data: {symbol_name: name, symbol_type: symType},
        });
      }
    }

    // 提取文件名提示
    const fileHintRegex = /(?:file|module|component):\s*['"]?([\w./-]+\.[\w]+)['"]?/gi;
    const seenFiles = new Set<string>();
    while ((match = fileHintRegex.exec(input)) !== null) {
      const file = match[1];
      if (file && !seenFiles.has(file)) {
        seenFiles.add(file);
        items.push({
          target_agent: 'project',
          type: 'code_file',
          content: `File reference: ${file}`,
          confidence: 0.7,
          source: 'code',
          tags: ['file', file],
          structured_data: {file_path: file},
        });
      }
    }

    return items;
  }

  private isValidCodeType(type: string): type is MemoryType {
    const valid: MemoryType[] = [
      'code_file', 'code_symbol', 'code_dependency', 'code_architecture',
      'code_hotspot', 'procedure', 'fact',
    ];
    return (valid as string[]).includes(type);
  }
}
