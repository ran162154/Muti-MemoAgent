import {type ClassifiedItem, type MemoryType, type LLMClient, generateId, now} from '@mutimemoagent/core';

// ──────────────────────────────────────────────────────────────────
// ProfileExtractor — 个人档案提取器
// ──────────────────────────────────────────────────────────────────

/**
 * 个人档案提取器
 *
 * 使用 LLM 将输入的对话/文本内容分类为：
 * - fact       → 客观事实信息
 * - preference → 偏好/喜好
 * - procedure  → 流程/步骤/做法
 * - event      → 事件/活动记录
 * - error      → 错误/故障记录
 * - insight    → 见解/洞察/反思
 */
export class ProfileExtractor {
  private llm: LLMClient;

  constructor(llm: LLMClient) {
    this.llm = llm;
  }

  /**
   * 从输入文本中提取分类后的记忆体项
   * @param input - 输入文本
   * @returns 分类后的内存项列表
   */
  async extract(input: string): Promise<ClassifiedItem[]> {
    if (!input || input.trim().length === 0) return [];

    const prompt = this.buildExtractionPrompt(input);
    let items: ClassifiedItem[];

    try {
      items = await this.llm.extractJSON<ClassifiedItem[]>(prompt);
    } catch (err) {
      // LLM 解析失败时回退到基本分类
      return this.fallbackExtract(input);
    }

    // 确保每个 item 有合法的 type 和 content
    items = items.filter(
      (item) =>
        item &&
        typeof item.content === 'string' &&
        item.content.length > 0 &&
        this.isValidMemoryType(item.type)
    );

    // 补充默认字段
    items = items.map((item) => ({
      target_agent: item.target_agent || 'profile',
      type: item.type || ('fact' as MemoryType),
      content: item.content,
      confidence: typeof item.confidence === 'number' ? item.confidence : 0.8,
      source: 'dialogue',
      tags: Array.isArray(item.tags) ? item.tags : [],
      ...(item.structured_data ? {structured_data: item.structured_data} : {}),
    }));

    return items;
  }

  // ── LLM 提取 prompt ──────────────────────────────────────────

  private buildExtractionPrompt(input: string): string {
    return `You are a memory extraction system. Analyze the following text and extract ALL distinct pieces of information as classified memory items.

Valid memory types:
- "fact": objective facts, statements of truth, personal information
- "preference": likes, dislikes, preferences, opinions
- "procedure": steps, workflows, how-to instructions, recipes
- "event": past or future events, meetings, activities
- "error": mistakes, bugs, failures, problems encountered
- "insight": realizations, lessons learned, reflections, wisdom

For each extracted item, provide:
- target_agent: always "profile"
- type: one of the valid types above
- content: the extracted information as a clean statement
- confidence: 0.0 to 1.0
- tags: relevant keywords as string array

Input text:
"""
${input}
"""

Respond ONLY with a valid JSON array. No markdown, no explanation.`;
  }

  // ── 回退提取 (当 LLM 调用失败时) ────────────────────────────

  private fallbackExtract(input: string): ClassifiedItem[] {
    const items: ClassifiedItem[] = [];
    const lines = input.split(/[。！？\n]+/).filter((l) => l.trim().length > 0);

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 5) continue;

      let type: MemoryType = 'fact';
      const tags: string[] = [];

      // 启发式分类
      if (
        /喜欢|爱好|prefer|like|讨厌|hate|不好|不错|好看|好吃/i.test(trimmed)
      ) {
        type = 'preference';
        tags.push('preference');
      } else if (
        /步骤|方法|如何|怎么|流程|第一步|操作|教程/i.test(trimmed)
      ) {
        type = 'procedure';
        tags.push('procedure');
      } else if (
        /今天|明天|昨天|会议|见面|活动|event|meeting|happened/i.test(trimmed)
      ) {
        type = 'event';
        tags.push('event');
      } else if (
        /错误|bug|故障|失败|错了|不是|问题|error|fail|bug/i.test(trimmed)
      ) {
        type = 'error';
        tags.push('error');
      } else if (
        /意识到|发现|原来|其实|总结|反思|insight|lesson/i.test(trimmed)
      ) {
        type = 'insight';
        tags.push('insight');
      } else {
        tags.push('fact');
      }

      items.push({
        target_agent: 'profile',
        type,
        content: trimmed,
        confidence: 0.6,
        source: 'dialogue',
        tags,
      });
    }

    return items;
  }

  private isValidMemoryType(type: string): type is MemoryType {
    const validTypes: MemoryType[] = [
      'fact', 'preference', 'procedure', 'event', 'error', 'insight',
      'mcp_registry', 'mcp_tool', 'mcp_example',
      'code_file', 'code_symbol', 'code_dependency', 'code_architecture', 'code_hotspot',
      'cross_agent_relation', 'conflict_flag', 'merge_result',
    ];
    return (validTypes as string[]).includes(type);
  }
}
