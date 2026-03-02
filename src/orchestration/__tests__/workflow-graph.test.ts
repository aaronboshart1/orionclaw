import { describe, it, expect } from 'vitest';
import { WorkflowGraph } from '../graph/workflow-graph.js';
import { NodeType, EdgeCondition } from '../types.js';
import type { Node, Edge } from '../types.js';

function makeNode(id: string, type: NodeType = NodeType.AGENT): Node {
  return { id, type, name: id };
}

function makeEdge(source: string, target: string, condition = EdgeCondition.ALWAYS): Edge {
  return { source, target, condition };
}

describe('WorkflowGraph', () => {
  it('adds nodes and edges', () => {
    const g = new WorkflowGraph();
    g.addNode(makeNode('a'));
    g.addNode(makeNode('b'));
    g.addEdge(makeEdge('a', 'b'));

    expect(g.getNodes()).toHaveLength(2);
    expect(g.getEdges()).toHaveLength(1);
    expect(g.getNode('a')?.name).toBe('a');
  });

  it('computes successors and predecessors', () => {
    const g = new WorkflowGraph();
    g.addNode(makeNode('a')).addNode(makeNode('b')).addNode(makeNode('c'));
    g.addEdge(makeEdge('a', 'b')).addEdge(makeEdge('a', 'c'));

    expect(g.getSuccessors('a')).toEqual(['b', 'c']);
    expect(g.getPredecessors('b')).toEqual(['a']);
    expect(g.getPredecessors('a')).toEqual([]);
  });

  it('finds entry and terminal nodes', () => {
    const g = new WorkflowGraph();
    g.addNode(makeNode('a')).addNode(makeNode('b')).addNode(makeNode('c'));
    g.addEdge(makeEdge('a', 'b')).addEdge(makeEdge('b', 'c'));

    expect(g.getEntryNodes().map(n => n.id)).toEqual(['a']);
    expect(g.getTerminalNodes().map(n => n.id)).toEqual(['c']);
  });

  it('topological sort returns correct order', () => {
    const g = new WorkflowGraph();
    g.addNode(makeNode('c')).addNode(makeNode('a')).addNode(makeNode('b'));
    g.addEdge(makeEdge('a', 'b')).addEdge(makeEdge('b', 'c'));

    const sorted = g.topologicalSort().map(n => n.id);
    expect(sorted.indexOf('a')).toBeLessThan(sorted.indexOf('b'));
    expect(sorted.indexOf('b')).toBeLessThan(sorted.indexOf('c'));
  });

  it('topological sort throws on cycle', () => {
    const g = new WorkflowGraph();
    g.addNode(makeNode('a')).addNode(makeNode('b'));
    g.addEdge(makeEdge('a', 'b')).addEdge(makeEdge('b', 'a'));

    expect(() => g.topologicalSort()).toThrow('Cycle');
  });

  it('validate catches missing edge targets', () => {
    const g = new WorkflowGraph();
    g.addNode(makeNode('a'));
    g.addEdge(makeEdge('a', 'nonexistent'));

    const errors = g.validate();
    expect(errors.some(e => e.includes('nonexistent'))).toBe(true);
  });

  it('validate catches cycles', () => {
    const g = new WorkflowGraph();
    g.addNode(makeNode('a')).addNode(makeNode('b'));
    g.addEdge(makeEdge('a', 'b')).addEdge(makeEdge('b', 'a'));

    const errors = g.validate();
    expect(errors.some(e => e.includes('cycle'))).toBe(true);
  });

  it('validate returns empty for valid graph', () => {
    const g = new WorkflowGraph();
    g.addNode(makeNode('a')).addNode(makeNode('b'));
    g.addEdge(makeEdge('a', 'b'));

    expect(g.validate()).toEqual([]);
  });

  it('getParallelLayers groups by depth', () => {
    const g = new WorkflowGraph();
    g.addNode(makeNode('a')).addNode(makeNode('b')).addNode(makeNode('c')).addNode(makeNode('d'));
    g.addEdge(makeEdge('a', 'c')).addEdge(makeEdge('b', 'c')).addEdge(makeEdge('c', 'd'));

    const layers = g.getParallelLayers();
    expect(layers).toHaveLength(3);
    expect(layers[0].map(n => n.id).sort()).toEqual(['a', 'b']);
    expect(layers[1].map(n => n.id)).toEqual(['c']);
    expect(layers[2].map(n => n.id)).toEqual(['d']);
  });

  it('serializes and deserializes', () => {
    const g = new WorkflowGraph();
    g.addNode(makeNode('a')).addNode(makeNode('b'));
    g.addEdge(makeEdge('a', 'b'));

    const json = g.toJSON();
    const g2 = WorkflowGraph.fromJSON(json);

    expect(g2.getNodes()).toHaveLength(2);
    expect(g2.getEdges()).toHaveLength(1);
    expect(g2.getSuccessors('a')).toEqual(['b']);
  });
});
