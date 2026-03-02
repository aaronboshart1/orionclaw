/**
 * OrionClaw — ContextAssembler
 *
 * Builds tailored prompt context for each agent node, pulling from
 * state, memory, and hindsight lessons with priority ordering.
 */

import type { HindsightLesson, NodeResult } from '../types.js';
import type { WorkflowState } from './workflow-state.js';

/** Long-term memory recall provider. */
export interface MemoryProvider {
  recall(query: string, maxTokens: number): Promise<string>;
}

/** Hindsight lesson search provider. */
export interface LessonProvider {
  search(taskDescription: string): Promise<HindsightLesson[]>;
}

export class ContextAssembler {
  constructor(
    private state: WorkflowState,
    private memoryProvider?: MemoryProvider,
    private lessonProvider?: LessonProvider,
    private maxContextChars: number = 12000,
  ) {}

  /**
   * Build full context for an agent node with priority ordering:
   * 1. Hindsight lessons from similar tasks
   * 2. Direct dependency outputs (predecessor results)
   * 3. Decisions + artifacts from state
   * 4. Relevant long-term memory
   * 5. General workflow state summary
   */
  async buildContext(
    agentConfig: { name: string; prompt?: string },
    taskDescription: string,
    predecessorResults: Map<string, NodeResult>,
  ): Promise<string> {
    const sections: string[] = [];
    let remaining = this.maxContextChars;

    const addSection = (section: string): boolean => {
      if (section.length <= remaining) {
        sections.push(section);
        remaining -= section.length;
        return true;
      }
      return false;
    };

    // 1. Hindsight lessons
    if (this.lessonProvider) {
      try {
        const lessons = await this.lessonProvider.search(taskDescription);
        if (lessons.length > 0) {
          const lessonText = lessons
            .slice(0, 5)
            .map(l => `- [${l.type}, confidence:${l.confidence.toFixed(2)}] ${l.lesson}`)
            .join('\n');
          addSection(`## Lessons from Similar Tasks\n${lessonText}`);
        }
      } catch {
        // Lesson provider failure is non-fatal
      }
    }

    // 2. Predecessor outputs
    if (predecessorResults.size > 0) {
      const predLines: string[] = [];
      for (const [id, result] of predecessorResults) {
        const output = typeof result.output === 'string'
          ? result.output
          : JSON.stringify(result.output);
        predLines.push(`### ${id}\n${output}`);
      }
      addSection(`## Predecessor Results\n${predLines.join('\n\n')}`);
    }

    // 3. Decisions + artifacts from state
    const decisions = this.state.getByType('decision');
    const artifacts = this.state.getByType('artifact');
    if (decisions.length + artifacts.length > 0) {
      const items = [...decisions, ...artifacts]
        .map(e => {
          const val = typeof e.value === 'string' ? e.value : JSON.stringify(e.value);
          return `- [${e.type}] ${e.key}: ${val}`;
        })
        .join('\n');
      addSection(`## Key Decisions & Artifacts\n${items}`);
    }

    // 4. Long-term memory
    if (this.memoryProvider && remaining > 500) {
      try {
        const memory = await this.memoryProvider.recall(
          taskDescription,
          Math.min(remaining, 2000),
        );
        if (memory) {
          addSection(`## Relevant Memory\n${memory}`);
        }
      } catch {
        // Memory provider failure is non-fatal
      }
    }

    // 5. General state summary
    if (remaining > 200) {
      const summary = this.state.getSummary(remaining);
      if (summary) {
        addSection(`## Workflow State\n${summary}`);
      }
    }

    return sections.join('\n\n');
  }

  /** Lightweight context for routers/tools — just predecessor results. */
  buildMinimalContext(predecessorResults: Map<string, NodeResult>): string {
    if (predecessorResults.size === 0) return '';
    const lines: string[] = [];
    for (const [id, result] of predecessorResults) {
      const outputStr = result.output
        ? (typeof result.output === 'string'
            ? result.output
            : JSON.stringify(result.output)
          ).slice(0, 500)
        : '';
      lines.push(`${id}: ${result.status}${outputStr ? ' — ' + outputStr : ''}`);
    }
    return `## Input\n${lines.join('\n')}`;
  }
}
