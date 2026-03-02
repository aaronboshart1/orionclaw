import { describe, it, expect } from 'vitest';
import { ContextAssembler } from '../state/context-assembler.js';
import { WorkflowState } from '../state/workflow-state.js';
import { NodeStatus } from '../types.js';
import type { NodeResult, HindsightLesson } from '../types.js';
import type { LessonProvider, MemoryProvider } from '../state/context-assembler.js';

function makeResult(nodeId: string, output: unknown): NodeResult {
  return { nodeId, status: NodeStatus.COMPLETED, output, startedAt: new Date().toISOString() };
}

describe('ContextAssembler', () => {
  it('builds context with predecessor results', async () => {
    const state = new WorkflowState();
    const assembler = new ContextAssembler(state);
    const preds = new Map<string, NodeResult>([
      ['node-a', makeResult('node-a', 'Result from A')],
    ]);

    const ctx = await assembler.buildContext({ name: 'test' }, 'do something', preds);
    expect(ctx).toContain('Predecessor Results');
    expect(ctx).toContain('Result from A');
  });

  it('includes decisions and artifacts from state', async () => {
    const state = new WorkflowState();
    state.put('choice', 'use React', 'agent-1', 'decision');
    state.put('schema', '{}', 'agent-2', 'artifact');

    const assembler = new ContextAssembler(state);
    const ctx = await assembler.buildContext({ name: 'test' }, 'build it', new Map());
    expect(ctx).toContain('Decisions & Artifacts');
    expect(ctx).toContain('use React');
  });

  it('includes hindsight lessons when provider given', async () => {
    const state = new WorkflowState();
    const lessons: HindsightLesson[] = [{
      id: '1', taskPattern: 'test', lesson: 'Always validate inputs',
      confidence: 0.9, type: 'process', appliesTo: [], createdAt: new Date().toISOString(), decayRate: 0.05,
    }];
    const lessonProvider: LessonProvider = { search: async () => lessons };

    const assembler = new ContextAssembler(state, undefined, lessonProvider);
    const ctx = await assembler.buildContext({ name: 'test' }, 'task', new Map());
    expect(ctx).toContain('Lessons');
    expect(ctx).toContain('Always validate inputs');
  });

  it('includes memory when provider given', async () => {
    const state = new WorkflowState();
    const memProvider: MemoryProvider = { recall: async () => 'Past context about deployment' };

    const assembler = new ContextAssembler(state, memProvider);
    const ctx = await assembler.buildContext({ name: 'test' }, 'deploy', new Map());
    expect(ctx).toContain('Memory');
    expect(ctx).toContain('Past context about deployment');
  });

  it('buildMinimalContext returns predecessor summary', () => {
    const state = new WorkflowState();
    const assembler = new ContextAssembler(state);
    const preds = new Map<string, NodeResult>([
      ['a', makeResult('a', 'output-a')],
    ]);
    const ctx = assembler.buildMinimalContext(preds);
    expect(ctx).toContain('a: COMPLETED');
    expect(ctx).toContain('output-a');
  });

  it('buildMinimalContext returns empty for no predecessors', () => {
    const state = new WorkflowState();
    const assembler = new ContextAssembler(state);
    expect(assembler.buildMinimalContext(new Map())).toBe('');
  });

  it('respects maxContextChars budget', async () => {
    const state = new WorkflowState();
    // Add lots of state entries
    for (let i = 0; i < 100; i++) {
      state.put(`key-${i}`, 'x'.repeat(200), `producer-${i}`, 'intermediate');
    }
    const assembler = new ContextAssembler(state, undefined, undefined, 500);
    const ctx = await assembler.buildContext({ name: 'test' }, 'task', new Map());
    // Context should be bounded
    expect(ctx.length).toBeLessThan(1000);
  });
});
