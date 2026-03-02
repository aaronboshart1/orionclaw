/**
 * OrionClaw — System Prompt Hook
 *
 * Provides workflow context injection for agents running as part of an OrionClaw workflow.
 * This is additive — it generates context strings that can be appended to system prompts.
 */

import type { Node, NodeResult } from '../types.js';
import type { WorkflowState } from '../state/workflow-state.js';

export interface WorkflowPromptContext {
  workflowId: string;
  node: Node;
  predecessorResults: Map<string, NodeResult>;
  state: WorkflowState;
  instructions?: string;
  lessons?: string[];
}

/**
 * Build a system prompt section for an agent running within an OrionClaw workflow.
 * Returns a string to append to the existing system prompt.
 */
export function buildWorkflowPromptSection(ctx: WorkflowPromptContext): string {
  const sections: string[] = [];

  sections.push('# OrionClaw Workflow Context');
  sections.push(`You are executing as node **${ctx.node.name}** (${ctx.node.id}) in workflow ${ctx.workflowId}.`);

  if (ctx.node.prompt) {
    sections.push(`\n## Your Task\n${ctx.node.prompt}`);
  }

  if (ctx.instructions) {
    sections.push(`\n## Additional Instructions\n${ctx.instructions}`);
  }

  // Predecessor outputs
  if (ctx.predecessorResults.size > 0) {
    const predLines: string[] = [];
    for (const [id, result] of ctx.predecessorResults) {
      const output = typeof result.output === 'string'
        ? result.output
        : JSON.stringify(result.output);
      predLines.push(`### From ${id}\n${output}`);
    }
    sections.push(`\n## Input from Previous Steps\n${predLines.join('\n\n')}`);
  }

  // Key decisions
  const decisions = ctx.state.getByType('decision');
  if (decisions.length > 0) {
    const items = decisions.map(d => {
      const val = typeof d.value === 'string' ? d.value : JSON.stringify(d.value);
      return `- ${d.key}: ${val}`;
    }).join('\n');
    sections.push(`\n## Decisions Made\n${items}`);
  }

  // Lessons
  if (ctx.lessons && ctx.lessons.length > 0) {
    sections.push(`\n## Lessons from Past Workflows\n${ctx.lessons.map(l => `- ${l}`).join('\n')}`);
  }

  sections.push('\n## Output Requirements');
  sections.push('Write your result clearly. It will be passed to subsequent workflow nodes.');

  return sections.join('\n');
}

/**
 * Check if a system prompt should include workflow context.
 * Returns true if the session is part of an OrionClaw workflow execution.
 */
export function isWorkflowSession(sessionKey: string): boolean {
  // OrionClaw workflow sessions are tagged with a workflow ID prefix
  return sessionKey.includes('orionclaw:') || sessionKey.includes('workflow:');
}
