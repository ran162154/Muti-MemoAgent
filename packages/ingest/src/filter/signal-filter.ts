import {type MemoryEntry, cosineSimilarity} from '@mutimemoagent/core';
import type {Embedder} from '@mutimemoagent/core';

// ──────────────────────────────────────────────────────────────────
// SignalFilter — 信号过滤: 拒绝噪音输入
// ──────────────────────────────────────────────────────────────────

export interface FilterResult {
  pass: boolean;
  reason?: string;
}

/**
 * 信号过滤器
 *
 * 用于过滤低质量、无意义或纯噪音输入，确保只有有意义的
 * 内容进入记忆体管道。
 */
export class SignalFilter {
  /**
   * 对输入内容进行信号检测
   * @param input - 原始输入文本
   * @returns 过滤结果
   */
  filter(input: string): FilterResult {
    if (!input || typeof input !== 'string') {
      return {pass: false, reason: 'empty input'};
    }

    const trimmed = input.trim();

    // 1. 太短 (<10 字符)
    if (trimmed.length < 10) {
      return {pass: false, reason: 'too short (<10 chars)'};
    }

    // 2. 纯标点符号 / 纯 emoji / 纯空白
    if (this.isOnlyPunctuationOrEmoji(trimmed)) {
      return {pass: false, reason: 'no meaningful content (all punctuation/emoji)'};
    }

    // 3. 纯情感表达 (哈哈 / 嗯 / ok / lol / 👍 等)
    if (this.isPureEmotionalExpression(trimmed)) {
      return {pass: false, reason: 'pure emotional expression without substance'};
    }

    // 4. 重复性内容 (aaaaaa / 哈哈哈呵呵呵)
    if (this.isRepeatedPattern(trimmed)) {
      return {pass: false, reason: 'repetitive pattern without information'};
    }

    return {pass: true};
  }

  /**
   * 批量过滤
   */
  filterBatch(inputs: string[]): FilterResult[] {
    return inputs.map(i => this.filter(i));
  }

  // ── 内部方法 ──────────────────────────────────────────────────

  private isOnlyPunctuationOrEmoji(text: string): boolean {
    // 匹配: 空白, 标点, emoji (包括多字节 emoji 序列)
    const meaningfulPattern =
      /[\p{L}\p{N}]/u; // 任何字母或数字
    return !meaningfulPattern.test(text);
  }

  private isPureEmotionalExpression(text: string): boolean {
    // 常见简单情感表达式 (中日英混用)
    const pureEmotionPattern =
      /^(哈哈|呵呵|嘿嘿|嗯嗯|嗯|哦|哦哦|好的|好嘞|好的吧|ok|OK|Ok|lol|LOL|nice|Nice|yes|Yes|no|No|好的+嗯*|嗯+好的*|👍|👌|❤️|😊|😄|😅|😂|🤣|🙏|💪)$/u;
    if (pureEmotionPattern.test(text)) return true;

    // 检测纯重复单字/音节的情感表达
    const stripped = text.replace(/[\s👍👌❤️😊😄😅😂🤣🙏💪]+/g, '');
    if (stripped.length <= 3) {
      const chars = [...stripped];
      if (chars.length <= 2 && /^[哈哈哈呵呵嘿嘿嗯哦好坏okOKlolLOLnice]$/i.test(stripped)) return false;
      const unique = new Set(chars.map(c => c.toLowerCase()));
      if (unique.size <= 1) return true;
      // 检测: 嗯嗯 / 哈哈 这种重复
      if (chars.length === 2 && chars[0] === chars[1]) return true;
    }

    return false;
  }

  private isRepeatedPattern(text: string): boolean {
    // 检测 >80% 的字符都是同一字符
    if (!text) return false;
    const chars = [...text.replace(/[\s]/g, '')];
    if (chars.length <= 3) return false;
    const freq = new Map<string, number>();
    for (const c of chars) {
      freq.set(c, (freq.get(c) ?? 0) + 1);
    }
    const maxFreq = Math.max(...freq.values());
    return maxFreq / chars.length > 0.8;
  }
}
