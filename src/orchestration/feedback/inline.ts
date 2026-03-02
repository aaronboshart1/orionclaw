/**
 * OrionClaw — InlineFeedbackCollector
 *
 * Handles 👍/👎 reaction buttons per feedback category.
 */

import type { InlineReaction } from '../types.js';
import { FeedbackCategory } from '../types.js';

export class InlineFeedbackCollector {
  private reactions: InlineReaction[] = [];

  /** Record a reaction. */
  addReaction(
    category: FeedbackCategory,
    positive: boolean,
    workflowId: string,
    nodeId?: string,
    comment?: string,
  ): void {
    this.reactions.push({
      category,
      positive,
      workflowId,
      nodeId,
      comment,
      timestamp: new Date().toISOString(),
    });
  }

  /** Get all reactions for a workflow. */
  getReactions(workflowId?: string): InlineReaction[] {
    if (!workflowId) return [...this.reactions];
    return this.reactions.filter(r => r.workflowId === workflowId);
  }

  /** Get summary scores per category for a workflow. */
  getSummary(workflowId: string): Record<string, { positive: number; negative: number; net: number }> {
    const reactions = this.getReactions(workflowId);
    const summary: Record<string, { positive: number; negative: number; net: number }> = {};

    for (const cat of Object.values(FeedbackCategory)) {
      const catReactions = reactions.filter(r => r.category === cat);
      const pos = catReactions.filter(r => r.positive).length;
      const neg = catReactions.filter(r => !r.positive).length;
      if (pos + neg > 0) {
        summary[cat] = { positive: pos, negative: neg, net: pos - neg };
      }
    }

    return summary;
  }

  /** Get all available categories. */
  getCategories(): FeedbackCategory[] {
    return Object.values(FeedbackCategory);
  }

  /** Clear reactions. */
  clear(): void {
    this.reactions = [];
  }
}
