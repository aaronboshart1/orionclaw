/**
 * OrionClaw — GraphExecutor
 *
 * Walks a WorkflowGraph layer-by-layer, dispatching nodes by type.
 */

import crypto from 'node:crypto';
import type {
  Node,
  NodeResult,
  ExecutionEvent,
  ExecutionTrace,
  ExecutionEventType,
} from '../types.js';
import { NodeType, NodeStatus, EdgeCondition } from '../types.js';
import { WorkflowGraph } from './workflow-graph.js';
import { WorkflowState } from '../state/workflow-state.js';
import { ContextAssembler } from '../state/context-assembler.js';

/** Bridge interface for dispatching AGENT nodes to a runtime. */
export interface AgentBridge {
  execute(node: Node, context: string): Promise<NodeResult>;
}

export interface ExecutorOptions {
  bridge: AgentBridge;
  state?: WorkflowState;
  contextAssembler?: ContextAssembler;
  workflowTimeoutMs?: number;
  onEvent?: (event: ExecutionEvent) => void;
  /** Callback for HUMAN nodes — must resolve when approval is received. */
  onHumanApproval?: (node: Node) => Promise<boolean>;
}

export class GraphExecutor {
  private bridge: AgentBridge;
  private state: WorkflowState;
  private contextAssembler: ContextAssembler;
  private events: ExecutionEvent[] = [];
  private results: Map<string, NodeResult> = new Map();
  private workflowTimeoutMs: number;
  private onEvent?: (event: ExecutionEvent) => void;
  private onHumanApproval?: (node: Node) => Promise<boolean>;

  constructor(opts: ExecutorOptions) {
    this.bridge = opts.bridge;
    this.state = opts.state ?? new WorkflowState();
    this.contextAssembler = opts.contextAssembler ?? new ContextAssembler(this.state);
    this.workflowTimeoutMs = opts.workflowTimeoutMs ?? 600_000; // 10 min default
    this.onEvent = opts.onEvent;
    this.onHumanApproval = opts.onHumanApproval;
  }

  async execute(graph: WorkflowGraph, input?: unknown): Promise<ExecutionTrace> {
    const workflowId = crypto.randomUUID();
    const startedAt = new Date().toISOString();

    if (input !== undefined) {
      this.state.put('workflow_input', input, 'system', 'input');
    }

    this.emit({ timestamp: startedAt, type: 'workflow_started', data: { workflowId } });

    const layers = graph.getParallelLayers();
    let failed = false;

    const deadline = Date.now() + this.workflowTimeoutMs;

    for (const layer of layers) {
      if (failed) break;
      if (Date.now() > deadline) {
        this.emit({ timestamp: new Date().toISOString(), type: 'workflow_failed', data: { reason: 'timeout' } });
        failed = true;
        break;
      }

      // Execute all nodes in this layer concurrently
      const promises = layer.map(node => this.executeNode(node, graph, deadline));
      const layerResults = await Promise.allSettled(promises);

      for (const settled of layerResults) {
        if (settled.status === 'rejected') {
          failed = true;
        }
      }
    }

    const completedAt = new Date().toISOString();
    const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

    this.emit({
      timestamp: completedAt,
      type: failed ? 'workflow_failed' : 'workflow_completed',
      data: { workflowId },
    });

    // Sum token usage
    let totalInput = 0;
    let totalOutput = 0;
    for (const r of this.results.values()) {
      if (r.tokenUsage) {
        totalInput += r.tokenUsage.input;
        totalOutput += r.tokenUsage.output;
      }
    }

    const resultsObj: Record<string, NodeResult> = {};
    for (const [k, v] of this.results) resultsObj[k] = v;

    return {
      workflowId,
      graph: graph.toJSON(),
      events: [...this.events],
      results: resultsObj,
      state: this.state.toJSON() as unknown as Record<string, unknown>,
      startedAt,
      completedAt,
      durationMs,
      totalTokens: (totalInput + totalOutput > 0) ? { input: totalInput, output: totalOutput } : undefined,
    };
  }

  private async executeNode(node: Node, graph: WorkflowGraph, deadline: number): Promise<void> {
    // Check if edge conditions from predecessors allow this node to run
    if (!this.shouldExecute(node, graph)) {
      this.results.set(node.id, {
        nodeId: node.id,
        status: NodeStatus.SKIPPED,
        startedAt: new Date().toISOString(),
      });
      return;
    }

    const startedAt = new Date().toISOString();
    this.emit({ timestamp: startedAt, type: 'node_started', nodeId: node.id });

    try {
      const nodeTimeout = node.timeoutMs ?? (deadline - Date.now());
      const result = await this.withTimeout(
        this.dispatchNode(node, graph),
        Math.max(nodeTimeout, 1000),
        node.id,
      );

      this.results.set(node.id, result);
      this.state.put(`node:${node.id}:output`, result.output, node.id, 'output');
      this.emit({
        timestamp: result.completedAt ?? new Date().toISOString(),
        type: result.status === NodeStatus.FAILED ? 'node_failed' : 'node_completed',
        nodeId: node.id,
        data: { status: result.status },
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const result: NodeResult = {
        nodeId: node.id,
        status: NodeStatus.FAILED,
        error,
        startedAt,
        completedAt: new Date().toISOString(),
      };
      result.durationMs = new Date(result.completedAt!).getTime() - new Date(startedAt).getTime();
      this.results.set(node.id, result);
      this.state.put(`node:${node.id}:error`, error, node.id, 'error');
      this.emit({ timestamp: result.completedAt!, type: 'node_failed', nodeId: node.id, data: { error } });

      // Check for fallback edges
      const fallbackEdges = graph.getEdgesFrom(node.id)
        .filter(e => e.condition === EdgeCondition.ON_FAILURE);
      if (fallbackEdges.length === 0) {
        throw err;
      }
      // Fallback edges will be followed in the normal layer processing
    }
  }

  private async dispatchNode(node: Node, graph: WorkflowGraph): Promise<NodeResult> {
    const startedAt = new Date().toISOString();
    const predResults = this.getPredecessorResults(node, graph);

    switch (node.type) {
      case NodeType.AGENT: {
        const context = await this.contextAssembler.buildContext(
          { name: node.name, prompt: node.prompt },
          node.prompt ?? node.name,
          predResults,
        );
        const taskContext = node.prompt
          ? `${node.prompt}\n\n${context}`
          : context;
        return this.bridge.execute(node, taskContext);
      }

      case NodeType.TOOL: {
        if (!node.toolFn) {
          throw new Error(`Tool node ${node.id} has no toolFn`);
        }
        const input: Record<string, unknown> = {};
        for (const [id, r] of predResults) input[id] = r.output;
        const output = await node.toolFn(input, this.state.toJSON().entries);
        return {
          nodeId: node.id,
          status: NodeStatus.COMPLETED,
          output,
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }

      case NodeType.ROUTER: {
        if (!node.routeFn) {
          throw new Error(`Router node ${node.id} has no routeFn`);
        }
        const selectedLabel = await node.routeFn(predResults);
        // Find the edge with matching label
        const edges = graph.getEdgesFrom(node.id);
        const matchedEdge = edges.find(e => e.label === selectedLabel);
        if (!matchedEdge) {
          throw new Error(`Router ${node.id} selected '${selectedLabel}' but no matching edge found`);
        }
        return {
          nodeId: node.id,
          status: NodeStatus.COMPLETED,
          output: { selectedRoute: selectedLabel, targetNode: matchedEdge.target },
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }

      case NodeType.PARALLEL: {
        // Fan-out marker — no-op, successors will be executed in the next layer
        return {
          nodeId: node.id,
          status: NodeStatus.COMPLETED,
          output: null,
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }

      case NodeType.JOIN: {
        // Wait-for-all: all predecessors must be complete (guaranteed by layer ordering)
        const outputs: Record<string, unknown> = {};
        for (const [id, r] of predResults) outputs[id] = r.output;
        return {
          nodeId: node.id,
          status: NodeStatus.COMPLETED,
          output: outputs,
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }

      case NodeType.REDUCER: {
        // Synthesis agent — use bridge with merged predecessor outputs as context
        const mergedOutputs: string[] = [];
        for (const [id, r] of predResults) {
          const out = typeof r.output === 'string' ? r.output : JSON.stringify(r.output);
          mergedOutputs.push(`## ${id}\n${out}`);
        }
        const context = `Synthesize the following outputs:\n\n${mergedOutputs.join('\n\n')}`;
        const reducerNode: Node = {
          ...node,
          prompt: node.prompt ?? 'Synthesize and merge the following inputs into a unified result.',
        };
        return this.bridge.execute(reducerNode, context);
      }

      case NodeType.HUMAN: {
        this.emit({
          timestamp: new Date().toISOString(),
          type: 'human_approval_requested',
          nodeId: node.id,
          data: { prompt: node.prompt },
        });

        if (!this.onHumanApproval) {
          // Auto-approve if no handler
          return {
            nodeId: node.id,
            status: NodeStatus.COMPLETED,
            output: { approved: true, auto: true },
            startedAt,
            completedAt: new Date().toISOString(),
          };
        }

        const approved = await this.onHumanApproval(node);
        this.emit({
          timestamp: new Date().toISOString(),
          type: 'human_approval_received',
          nodeId: node.id,
          data: { approved },
        });

        return {
          nodeId: node.id,
          status: approved ? NodeStatus.COMPLETED : NodeStatus.FAILED,
          output: { approved },
          startedAt,
          completedAt: new Date().toISOString(),
          error: approved ? undefined : 'Human rejected',
        };
      }

      case NodeType.SUBGRAPH: {
        if (!node.subgraph) {
          throw new Error(`Subgraph node ${node.id} has no subgraph definition`);
        }
        const subGraph = WorkflowGraph.fromJSON(node.subgraph);
        const subInput = predResults.size > 0
          ? Object.fromEntries([...predResults].map(([k, v]) => [k, v.output]))
          : undefined;
        const subExecutor = new GraphExecutor({
          bridge: this.bridge,
          state: this.state,
          contextAssembler: this.contextAssembler,
          onEvent: this.onEvent,
          onHumanApproval: this.onHumanApproval,
        });
        const trace = await subExecutor.execute(subGraph, subInput);
        return {
          nodeId: node.id,
          status: trace.completedAt ? NodeStatus.COMPLETED : NodeStatus.FAILED,
          output: trace,
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }

      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }
  }

  private shouldExecute(node: Node, graph: WorkflowGraph): boolean {
    const incomingEdges = graph.getEdgesTo(node.id);
    if (incomingEdges.length === 0) return true; // entry node

    for (const edge of incomingEdges) {
      const predResult = this.results.get(edge.source);
      if (!predResult) continue;

      switch (edge.condition) {
        case EdgeCondition.ALWAYS:
          return true;
        case EdgeCondition.ON_SUCCESS:
          if (predResult.status === NodeStatus.COMPLETED) return true;
          break;
        case EdgeCondition.ON_FAILURE:
          if (predResult.status === NodeStatus.FAILED) return true;
          break;
        case EdgeCondition.CONDITIONAL: {
          // For router edges, check if this was the selected route
          const routerOutput = predResult.output as { selectedRoute?: string; targetNode?: string } | null;
          if (routerOutput?.targetNode === node.id) return true;
          // Also check conditionFn if present
          if (edge.conditionFn && edge.conditionFn(predResult)) return true;
          break;
        }
      }
    }

    // For JOIN nodes, require all predecessors complete
    if (node.type === NodeType.JOIN) {
      const preds = graph.getPredecessors(node.id);
      return preds.every(p => {
        const r = this.results.get(p);
        return r && (r.status === NodeStatus.COMPLETED || r.status === NodeStatus.FAILED);
      });
    }

    return false;
  }

  private getPredecessorResults(node: Node, graph: WorkflowGraph): Map<string, NodeResult> {
    const preds = graph.getPredecessors(node.id);
    const results = new Map<string, NodeResult>();
    for (const p of preds) {
      const r = this.results.get(p);
      if (r) results.set(p, r);
    }
    return results;
  }

  private emit(event: ExecutionEvent): void {
    this.events.push(event);
    this.onEvent?.(event);
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, nodeId: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Node ${nodeId} timed out after ${ms}ms`)), ms);
      promise.then(
        v => { clearTimeout(timer); resolve(v); },
        e => { clearTimeout(timer); reject(e); },
      );
    });
  }
}
