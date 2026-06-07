import {type ClassifiedItem, type MemoryType, type LLMClient, generateId, now} from '@mutimemoagent/core';

// ──────────────────────────────────────────────────────────────────
// MCPExtractor — MCP/Skill 定义提取器
// ──────────────────────────────────────────────────────────────────

/**
 * MCP 提取器
 *
 * 从输入中提取 MCP (Model Context Protocol) 和 Skill 定义：
 * - mcp_registry  → MCP/Skill 整体注册信息
 * - mcp_tool      → MCP 工具定义 (名称、描述、参数)
 * - mcp_example   → MCP 使用示例
 * - fact          → 一般性事实信息
 */
export class MCPExtractor {
  private llm: LLMClient;

  constructor(llm: LLMClient) {
    this.llm = llm;
  }

  /**
   * 从输入中提取 MCP/Skill 定义
   * @param input - 输入文本
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
            this.isValidMCPType(item.type)
        )
        .map((item) => ({
          target_agent: item.target_agent || 'mcp-registry',
          type: item.type as MemoryType,
          content: item.content,
          confidence: typeof item.confidence === 'number' ? item.confidence : 0.8,
          source: 'mcp_install',
          tags: Array.isArray(item.tags) ? item.tags : ['mcp'],
          ...(item.structured_data
            ? {structured_data: item.structured_data}
            : {}),
        }));
    } catch {
      return this.fallbackExtract(input);
    }
  }

  private buildExtractionPrompt(input: string): string {
    return `You are an MCP (Model Context Protocol) and skill definition extractor. Analyze the following text and extract ALL MCP/Skill related definitions.

Valid types:
- "mcp_registry": overall MCP/Skill registry, provider info, version, description
- "mcp_tool": individual tool/function definitions (name, description, parameters/inputs)
- "mcp_example": usage examples, sample calls, demo scenarios
- "fact": any other factual information about MCP configuration

For each item:
- target_agent: "mcp-registry"
- type: one of the valid types
- content: descriptive content
- confidence: 0.0 to 1.0
- tags: relevant keywords (include "mcp", "skill", tool name etc.)
- structured_data (optional): { "tool_name"?, "provider"?, "version"?, "parameters"? }

Input:
"""
${input}
"""

Respond ONLY with a valid JSON array. No markdown, no explanation.`;
  }

  private fallbackExtract(input: string): ClassifiedItem[] {
    const items: ClassifiedItem[] = [];
    const lines = input.split('\n').filter((l) => l.trim().length > 0);

    let currentRegistry: string | null = null;
    let currentTool: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // 检测注册信息: name, version, description
      const nameMatch = trimmed.match(
        /(?:name|skill|plugin|package):\s*['"]?([\w@/-]+)['"]?/i
      );
      if (nameMatch && !items.some((i) => i.content.includes(nameMatch[1]))) {
        currentRegistry = nameMatch[1];
        items.push({
          target_agent: 'mcp-registry',
          type: 'mcp_registry',
          content: `MCP/Skill: ${nameMatch[1]}`,
          confidence: 0.8,
          source: 'mcp_install',
          tags: ['mcp', 'registry', nameMatch[1]],
          structured_data: {name: nameMatch[1]},
        });
        continue;
      }

      // 检测工具定义
      const toolMatch = trimmed.match(
        /(?:tool|function|action|command):\s*['"]?(\w+)['"]?/i
      );
      if (toolMatch) {
        currentTool = toolMatch[1];
        items.push({
          target_agent: 'mcp-registry',
          type: 'mcp_tool',
          content: `Tool: ${toolMatch[1]}`,
          confidence: 0.85,
          source: 'mcp_install',
          tags: ['mcp', 'tool', toolMatch[1]],
          structured_data: {
            tool_name: toolMatch[1],
            ...(currentRegistry ? {provider: currentRegistry} : {}),
          },
        });
        continue;
      }

      // 检测参数/描述 (紧跟工具的行)
      const paramMatch = trimmed.match(
        /(?:param|arg|input|option|field):\s*['"]?(\w+)['"]?/i
      );
      if (paramMatch && currentTool) {
        // 作为工具的额外信息
        const existing = items.find(
          (i) =>
            i.type === 'mcp_tool' &&
            i.structured_data?.tool_name === currentTool
        );
        if (existing) {
          const params = (existing.structured_data?.parameters as string[]) ?? [];
          params.push(paramMatch[1]);
          existing.structured_data = {
            ...existing.structured_data,
            parameters: params,
          };
        }
      }

      // 检测 example / usage
      if (
        /example|usage|demo|sample|how\s+to|e\.g\.|for\s+example/i.test(
          trimmed
        ) &&
        !items.some(
          (i) => i.type === 'mcp_example' && i.content.includes(trimmed.slice(0, 40))
        )
      ) {
        items.push({
          target_agent: 'mcp-registry',
          type: 'mcp_example',
          content: trimmed,
          confidence: 0.7,
          source: 'mcp_install',
          tags: ['mcp', 'example', ...(currentTool ? [currentTool] : [])],
        });
      }
    }

    return items;
  }

  private isValidMCPType(type: string): type is MemoryType {
    const valid: MemoryType[] = [
      'mcp_registry', 'mcp_tool', 'mcp_example', 'fact',
    ];
    return (valid as string[]).includes(type);
  }
}
