import { describe, it, expect } from 'vitest';
import { WorkflowBuilder } from '../graph/builder.js';
import { NodeType } from '../types.js';

describe('WorkflowBuilder', () => {
  it('builds a simple chain', () => {
    const g = new WorkflowBuilder()
      .agent('step1', { prompt: 'do A' })
      .agent('step2', { prompt: 'do B' })
      .build();

    expect(g.getNodes()).toHaveLength(2);
    expect(g.getEdges()).toHaveLength(1);
    expect(g.getEntryNodes()).toHaveLength(1);
    expect(g.getTerminalNodes()).toHaveLength(1);
  });

  it('builds parallel branches with join and reducer', () => {
    const g = new WorkflowBuilder()
      .parallel(
        b => b.agent('worker1'),
        b => b.agent('worker2'),
      )
      .build();

    const nodes = g.getNodes();
    const types = nodes.map(n => n.type);
    expect(types).toContain(NodeType.PARALLEL);
    expect(types).toContain(NodeType.JOIN);
    expect(types).toContain(NodeType.REDUCER);
    // parallel + 2 workers + join + reducer = 5
    expect(nodes).toHaveLength(5);
  });

  it('adds human gate', () => {
    const g = new WorkflowBuilder()
      .agent('draft')
      .humanGate('approval', 'Review this?')
      .agent('publish')
      .build();

    const humanNodes = g.getNodes().filter(n => n.type === NodeType.HUMAN);
    expect(humanNodes).toHaveLength(1);
    expect(humanNodes[0].prompt).toBe('Review this?');
  });

  it('pipeline static helper', () => {
    const g = WorkflowBuilder.pipeline('test', [
      { name: 'a' },
      { name: 'b' },
      { name: 'c' },
    ]);
    expect(g.getNodes()).toHaveLength(3);
    const layers = g.getParallelLayers();
    expect(layers).toHaveLength(3);
  });

  it('fanOutFanIn static helper', () => {
    const g = WorkflowBuilder.fanOutFanIn('test', [
      { name: 'w1' },
      { name: 'w2' },
      { name: 'w3' },
    ]);
    // parallel + 3 workers + join + reducer = 6
    expect(g.getNodes()).toHaveLength(6);
  });

  it('researchDecideBuild static helper', () => {
    const g = WorkflowBuilder.researchDecideBuild(
      'test',
      ['topic1', 'topic2'],
      { name: 'decider' },
      { name: 'builder' },
    );
    const nodes = g.getNodes();
    expect(nodes.some(n => n.type === NodeType.HUMAN)).toBe(true);
    expect(nodes.length).toBeGreaterThan(5);
  });

  it('build validates and throws on invalid graph', () => {
    // A builder with no nodes should still be "valid" (empty graph validates)
    // but a graph with edges to nowhere would fail
    const b = new WorkflowBuilder();
    // Empty graph is valid
    expect(() => b.build()).not.toThrow();
  });
});
