import {type EventSourceType, type RouteTarget} from '@mutimemoagent/core';

// ──────────────────────────────────────────────────────────────────
// SmartRouter — 智能路由
// ──────────────────────────────────────────────────────────────────

export interface RoutingContext {
  input: string;
  source: EventSourceType;
  metadata?: Record<string, unknown>;
}

/**
 * 智能路由器
 *
 * 根据输入内容的来源和分析结果，决定路由目标 agent(s)：
 * - dialogue → profile (高权重)
 * - code → project (高权重)
 * - mcp_install → mcp-registry (高权重)
 * - 其他来源按内容特征分析后路由
 */
export class SmartRouter {
  /**
   * 路由输入到目标 agents
   *
   * @param input - 输入文本
   * @param source - 事件源类型
   * @param metadata - 可选的上下文信息
   * @returns 路由目标列表 (按权重降序)
   */
  route(
    input: string,
    source: EventSourceType,
    metadata?: Record<string, unknown>
  ): RouteTarget[] {
    // 基于来源确定候选路由
    const candidates = this.getSourceCandidates(source, input);

    // 根据内容分析调整权重
    const refined = this.refineWeights(candidates, input, source, metadata);

    // 按权重降序排序
    refined.sort((a, b) => b.weight - a.weight);

    // 过滤掉权重过低的目标
    return refined.filter(r => r.weight > 0.1);
  }

  /**
   * 批量路由
   */
  routeBatch(items: RoutingContext[]): RouteTarget[][] {
    return items.map(item =>
      this.route(item.input, item.source, item.metadata)
    );
  }

  // ── 内部方法 ──────────────────────────────────────────────────

  private getSourceCandidates(
    source: EventSourceType,
    input: string
  ): RouteTarget[] {
    switch (source) {
      case 'dialogue':
        return [
          {agent_id: 'profile', weight: 0.9},
          {agent_id: 'insight', weight: 0.3},
        ];

      case 'code':
        return [
          {agent_id: 'project', weight: 0.9},
          {agent_id: 'code-index', weight: 0.7},
          {agent_id: 'profile', weight: 0.2},
        ];

      case 'mcp_install':
        return [
          {agent_id: 'mcp-registry', weight: 1.0},
          {agent_id: 'profile', weight: 0.3},
        ];

      case 'file_watch':
        return [
          {agent_id: 'project', weight: 0.8},
          {agent_id: 'code-index', weight: 0.6},
        ];

      case 'ci_webhook':
        return [
          {agent_id: 'project', weight: 0.8},
          {agent_id: 'insight', weight: 0.5},
        ];

      case 'cron':
        return [
          {agent_id: 'insight', weight: 0.6},
          {agent_id: 'profile', weight: 0.3},
        ];

      case 'manual':
        // 手动写入 — 尝试根据内容分析判断
        return this.routeByContent(input);

      default:
        return [{agent_id: 'profile', weight: 0.5}];
    }
  }

  private routeByContent(input: string): RouteTarget[] {
    const targets: RouteTarget[] = [{agent_id: 'profile', weight: 0.4}];

    // 检测代码相关
    if (
      /function|class|const|let|import|export|def|impl|interface/i.test(input)
    ) {
      targets.push({agent_id: 'code-index', weight: 0.7});
      targets.push({agent_id: 'project', weight: 0.6});
    }

    // 检测 MCP/skill 相关
    if (
      /mcp|skill|tool|plugin|extension|agent\s+definition/i.test(input)
    ) {
      targets.push({agent_id: 'mcp-registry', weight: 0.9});
    }

    // 检测偏好/决策相关
    if (
      /prefer|like|喜欢|偏好|hate|讨厌|think|认为|decision|决定/i.test(input)
    ) {
      targets.push({agent_id: 'preference', weight: 0.6});
    }

    // 检测事件相关
    if (
      /happened|occurred|今天|昨天|明天|on\s+\w+\s+\d+|会议|meeting|event/i.test(input)
    ) {
      targets.push({agent_id: 'event', weight: 0.5});
    }

    return targets;
  }

  private refineWeights(
    candidates: RouteTarget[],
    input: string,
    source: EventSourceType,
    metadata?: Record<string, unknown>
  ): RouteTarget[] {
    // 合并同 agent_id 的权重
    const merged = new Map<string, number>();
    for (const c of candidates) {
      const existing = merged.get(c.agent_id) ?? 0;
      merged.set(c.agent_id, Math.min(existing + c.weight, 1.0));
    }

    // 根据输入长度微调
    const inputLen = input.length;
    for (const [agent, weight] of merged) {
      // 非常短的输入 → 降低 project/mcp 路由权重
      if (inputLen < 50 && (agent === 'project' || agent === 'code-index')) {
        merged.set(agent, weight * 0.7);
      }
    }

    return Array.from(merged.entries()).map(([agent_id, weight]) => ({
      agent_id,
      weight: Math.round(weight * 100) / 100,
    }));
  }
}
