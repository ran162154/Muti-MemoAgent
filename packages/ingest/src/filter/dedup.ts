import {type MemoryEntry, cosineSimilarity} from '@mutimemoagent/core';
import type {Embedder} from '@mutimemoagent/core';

// ──────────────────────────────────────────────────────────────────
// DedupDetector — 去重检测
// ──────────────────────────────────────────────────────────────────

export interface DedupResult {
  isDuplicate: boolean;
  match?: MemoryEntry;
  similarity?: number;
}

/**
 * 去重检测器
 *
 * 使用余弦相似度比较输入内容与已有记忆体条目的语义相似度。
 * 相似度超过阈值 (>0.95) 则判定为重复。
 */
export class DedupDetector {
  private threshold: number;
  private embedder: Embedder;

  /**
   * @param embedder 嵌入向量生成器
   * @param threshold 相似度阈值 (默认 0.95)
   */
  constructor(embedder: Embedder, threshold = 0.95) {
    this.embedder = embedder;
    this.threshold = threshold;
  }

  /**
   * 检测输入是否与已有条目重复
   * @param input - 输入文本
   * @param existingEntries - 已有的记忆体条目列表
   * @returns 检测结果
   */
  async detectDuplicate(
    input: string,
    existingEntries: MemoryEntry[]
  ): Promise<DedupResult> {
    if (!input || existingEntries.length === 0) {
      return {isDuplicate: false};
    }

    // 计算输入文本的嵌入向量
    const inputEmbedding = await this.embedder.embed(input);

    let bestMatch: MemoryEntry | undefined;
    let bestSimilarity = 0;

    for (const entry of existingEntries) {
      // 跳过没有嵌入向量的条目
      if (!entry.embeddings || entry.embeddings.length === 0) continue;

      // 如果条目有缓存嵌入，直接比较
      const sim = cosineSimilarity(inputEmbedding, entry.embeddings);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestMatch = entry;
      }

      // 提前结束：找到一个超过阈值的匹配
      if (sim >= this.threshold) {
        return {
          isDuplicate: true,
          match: entry,
          similarity: sim,
        };
      }
    }

    // 如果没有超过阈值的匹配，但有一个接近的
    if (bestMatch && bestSimilarity >= this.threshold * 0.9) {
      // 近匹配: 再做一次精确内容重叠检查
      const overlap = this.computeContentOverlap(input, bestMatch.content);
      if (overlap > 0.85) {
        return {
          isDuplicate: true,
          match: bestMatch,
          similarity: bestSimilarity,
        };
      }
    }

    return {
      isDuplicate: false,
      match: bestMatch,
      similarity: bestSimilarity,
    };
  }

  /**
   * 批量去重检测
   */
  async detectDuplicateBatch(
    inputs: string[],
    existingEntries: MemoryEntry[]
  ): Promise<DedupResult[]> {
    return Promise.all(
      inputs.map(i => this.detectDuplicate(i, existingEntries))
    );
  }

  /**
   * 计算两块文本的字符级内容重叠比例
   */
  private computeContentOverlap(a: string, b: string): number {
    const setA = new Set([...a.toLowerCase()]);
    const setB = new Set([...b.toLowerCase()]);
    const intersection = new Set([...setA].filter(c => setB.has(c)));
    const union = new Set([...setA, ...setB]);
    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }
}
