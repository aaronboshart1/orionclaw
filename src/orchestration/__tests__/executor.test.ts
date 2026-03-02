import { describe, it, expect, vi } from 'vitest';
import { GraphExecutor } from '../graph/executor.js';
import type { AgentBridge } from '../graph/executor.js';
import { WorkflowBuilder } from '../graph/builder.js';
import { WorkflowGraph } from '../graph/workflow-graph.js';
import { NodeType, NodeStatus, EdgeCondition } from '../types.js';
import type { Node, NodeResult } from '../types.js';

function mockBridge(output: string = 'done'): AgentBridge {
  return {
    execute: vi.fn(async (node: Node, _context: string): Promise<NodeResult> => ({
      nodeId: node.id,
      status: NodeStatus.COMPLETED,
      output: `${output}: ${node.name}`,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 10,
    })),
  };
}

describe('GraphExecutor', () => {
  it('executes a simple pipeline', async () => {
    const graph = WorkflowBuilder.pipeline('test', [
      { name: 'step1', prompt: 'do A' },
      { name: 'step2', prompt: 'do B' },
    ]);

    const bridge = mockBridge();
    const executor = new GraphExecutor({ bridge });
    const trace = await executor.execute(graph);

    expect(trace.completedAt).toBeDefined();
    expect(Object.keys(trace.results)).toHaveLength(2);
    expect(bridge.execute).toHaveBeenCalledTimes(2);
  });

  it('executes parallel branches', async () => {
    const graph = WorkflowBuilder.fanOutFanIn('test', [
      { name: 'w1' },
      { name: 'w2' },
    ]);

    const bridge = mockBridge();
    const executor = new GraphExecutor({ bridge });
    const trace = await executor.execute(graph);

    expect(trace.completedAt).toBeDefined();
    // AGENT nodes: w1, w2, reducer = 3 bridge calls
    expect(bridge.execute).toHaveBeenCalledTimes(3);
  });

  it('handles TOOL nodes', async () => {
    const graph = new WorkflowGraph();
    graph.addNode({
      id: 't1',
      type: NodeType.TOOL,
      name: 'transform',
      toolFn: async (input) => ({ transformed: true, input }),
    });

    const bridge = mockBridge();
    const executor = new GraphExecutor({ bridge });
    const trace = await executor.execute(graph);

    expect(trace.results['t1'].status).toBe(NodeStatus.COMPLETED);
    expect(trace.results['t1'].output).toEqual({ transformed: true, input: {} });
    // Bridge should NOT be called for tool nodes
    expect(bridge.execute).not.toHaveBeenCalled();
  });

  it('handles HUMAN gate with auto-approve', async () => {
    const graph = new WorkflowGraph();
    graph.addNode({ id: 'a1', type: NodeType.AGENT, name: 'draft' });
    graph.addNode({ id: 'h1', type: NodeType.HUMAN, name: 'approve', prompt: 'OK?' });
    graph.addNode({ id: 'a2', type: NodeType.AGENT, name: 'publish' });
    graph.addEdge({ source: 'a1', target: 'h1', condition: EdgeCondition.ALWAYS });
    graph.addEdge({ source: 'h1', target: 'a2', condition: EdgeCondition.ALWAYS });

    const bridge = mockBridge();
    const executor = new GraphExecutor({ bridge });
    const trace = await executor.execute(graph);

    expect(trace.results['h1'].status).toBe(NodeStatus.COMPLETED);
    expect(bridge.execute).toHaveBeenCalledTimes(2); // a1 + a2, not h1
  });

  it('handles HUMAN gate with rejection', async () => {
    const graph = new WorkflowGraph();
    graph.addNode({ id: 'h1', type: NodeType.HUMAN, name: 'gate' });
    graph.addNode({ id: 'a1', type: NodeType.AGENT, name: 'next' });
    graph.addEdge({ source: 'h1', target: 'a1', condition: EdgeCondition.ALWAYS });

    const bridge = mockBridge();
    const onHumanApproval = vi.fn(async () => false);
    const executor = new GraphExecutor({ bridge, onHumanApproval });

    // The executor should handle the failure gracefully
    const trace = await executor.execute(graph);
    expect(trace.results['h1'].status).toBe(NodeStatus.FAILED);
  });

  it('emits execution events', async () => {
    const graph = WorkflowBuilder.pipeline('test', [{ name: 'step1' }]);

    const events: string[] = [];
    const bridge = mockBridge();
    const executor = new GraphExecutor({
      bridge,
      onEvent: (e) => events.push(e.type),
    });

    await executor.execute(graph);

    expect(events).toContain('workflow_started');
    expect(events).toContain('node_started');
    expect(events).toContain('node_completed');
    expect(events).toContain('workflow_completed');
  });

  it('handles node errors with fallback edges', async () => {
    const graph = new WorkflowGraph();
    graph.addNode({ id: 'a1', type: NodeType.AGENT, name: 'risky' });
    graph.addNode({ id: 'a2', type: NodeType.AGENT, name: 'fallback' });
    graph.addEdge({ source: 'a1', target: 'a2', condition: EdgeCondition.ON_FAILURE });

    const bridge: AgentBridge = {
      execute: vi.fn(async (node: Node): Promise<NodeResult> => {
        if (node.id === 'a1') {
          return {
            nodeId: node.id,
            status: NodeStatus.FAILED,
            error: 'boom',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
          };
        }
        return {
          nodeId: node.id,
          status: NodeStatus.COMPLETED,
          output: 'recovered',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
      }),
    };

    const executor = new GraphExecutor({ bridge });
    const trace = await executor.execute(graph);

    expect(trace.results['a1'].status).toBe(NodeStatus.FAILED);
    expect(trace.results['a2'].status).toBe(NodeStatus.COMPLETED);
  });

  it('passes workflow input to state', async () => {
    const graph = WorkflowBuilder.pipeline('test', [{ name: 'step1' }]);

    const bridge = mockBridge();
    const executor = new GraphExecutor({ bridge });
    const trace = await executor.execute(graph, { data: 'hello' });

    const stateData = trace.state as Record<string, unknown>;
    expect(stateData).toBeDefined();
  });
});
