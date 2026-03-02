/**
 * OrionClaw — WorkflowBuilder
 *
 * Fluent API for constructing workflow graphs without manually wiring edges.
 */

import type { Node, NodeResult } from "../types.js";
import { NodeType, EdgeCondition } from "../types.js";
import { WorkflowGraph } from "./workflow-graph.js";

// Global counter to ensure unique IDs across all builder instances
let globalCounter = 0;

export class WorkflowBuilder {
  private graph: WorkflowGraph = new WorkflowGraph();
  private lastNodeId: string | null = null;

  private genId(prefix: string): string {
    return `${prefix}_${++globalCounter}`;
  }

  /** Add an LLM agent node, auto-chained to the previous node. */
  agent(
    name: string,
    opts: { prompt?: string; model?: string; tools?: string[]; agentName?: string } = {},
  ): this {
    const id = this.genId("agent");
    this.graph.addNode({ id, type: NodeType.AGENT, name, ...opts });
    if (this.lastNodeId) {
      this.graph.addEdge({ source: this.lastNodeId, target: id, condition: EdgeCondition.ALWAYS });
    }
    this.lastNodeId = id;
    return this;
  }

  /** Add a deterministic tool node. */
  tool(
    name: string,
    opts: {
      toolFn?: (input: Record<string, unknown>, state: Record<string, unknown>) => Promise<unknown>;
      tools?: string[];
    } = {},
  ): this {
    const id = this.genId("tool");
    this.graph.addNode({ id, type: NodeType.TOOL, name, ...opts });
    if (this.lastNodeId) {
      this.graph.addEdge({ source: this.lastNodeId, target: id, condition: EdgeCondition.ALWAYS });
    }
    this.lastNodeId = id;
    return this;
  }

  /** Fan-out to parallel branches with automatic JOIN + REDUCER. */
  parallel(...branchFns: Array<(b: WorkflowBuilder) => void>): this {
    const fanOutId = this.genId("parallel");
    this.graph.addNode({ id: fanOutId, type: NodeType.PARALLEL, name: "parallel" });
    if (this.lastNodeId) {
      this.graph.addEdge({
        source: this.lastNodeId,
        target: fanOutId,
        condition: EdgeCondition.ALWAYS,
      });
    }

    const joinId = this.genId("join");
    this.graph.addNode({ id: joinId, type: NodeType.JOIN, name: "join" });

    const reducerId = this.genId("reducer");
    this.graph.addNode({ id: reducerId, type: NodeType.REDUCER, name: "reducer" });
    this.graph.addEdge({ source: joinId, target: reducerId, condition: EdgeCondition.ALWAYS });

    for (const fn of branchFns) {
      const sub = new WorkflowBuilder();
      fn(sub);
      const subGraph = sub.buildRaw();

      // Merge sub-graph nodes and edges into main graph
      for (const node of subGraph.getNodes()) {
        this.graph.addNode(node);
      }
      for (const edge of subGraph.getEdges()) {
        this.graph.addEdge(edge);
      }

      // Connect fanOut → first node(s) of branch
      for (const entry of subGraph.getEntryNodes()) {
        this.graph.addEdge({ source: fanOutId, target: entry.id, condition: EdgeCondition.ALWAYS });
      }

      // Connect terminal node(s) of branch → join
      for (const terminal of subGraph.getTerminalNodes()) {
        this.graph.addEdge({
          source: terminal.id,
          target: joinId,
          condition: EdgeCondition.ALWAYS,
        });
      }
    }

    this.lastNodeId = reducerId;
    return this;
  }

  /** Add a conditional routing node. */
  route(
    name: string,
    opts: { routeFn?: (results: Map<string, NodeResult>) => Promise<string> } = {},
  ): this {
    const id = this.genId("router");
    this.graph.addNode({ id, type: NodeType.ROUTER, name, routeFn: opts.routeFn });
    if (this.lastNodeId) {
      this.graph.addEdge({ source: this.lastNodeId, target: id, condition: EdgeCondition.ALWAYS });
    }
    this.lastNodeId = id;
    return this;
  }

  /** Define a routing target from the current (router) node. Does not advance lastNodeId. */
  routeTo(targetLabel: string, nodeConfig: Partial<Node> & { name: string }): this {
    const id = this.genId("route_target");
    this.graph.addNode({
      ...nodeConfig,
      id,
      type: nodeConfig.type ?? NodeType.AGENT,
    });
    if (this.lastNodeId) {
      this.graph.addEdge({
        source: this.lastNodeId,
        target: id,
        condition: EdgeCondition.CONDITIONAL,
        label: targetLabel,
      });
    }
    return this;
  }

  /** Add a human approval checkpoint. */
  humanGate(name: string, prompt?: string): this {
    const id = this.genId("human");
    this.graph.addNode({ id, type: NodeType.HUMAN, name, prompt });
    if (this.lastNodeId) {
      this.graph.addEdge({ source: this.lastNodeId, target: id, condition: EdgeCondition.ALWAYS });
    }
    this.lastNodeId = id;
    return this;
  }

  /** Nest a sub-workflow. */
  subgraph(name: string, builderFn: (b: WorkflowBuilder) => void): this {
    const sub = new WorkflowBuilder();
    builderFn(sub);
    const subData = sub.buildRaw().toJSON();
    const id = this.genId("subgraph");
    this.graph.addNode({ id, type: NodeType.SUBGRAPH, name, subgraph: subData });
    if (this.lastNodeId) {
      this.graph.addEdge({ source: this.lastNodeId, target: id, condition: EdgeCondition.ALWAYS });
    }
    this.lastNodeId = id;
    return this;
  }

  /** Add an explicit custom edge. */
  edge(
    source: string,
    target: string,
    condition: EdgeCondition = EdgeCondition.ALWAYS,
    label?: string,
  ): this {
    this.graph.addEdge({ source, target, condition, label });
    return this;
  }

  /** Build without validation (for internal use by parallel). */
  private buildRaw(): WorkflowGraph {
    return this.graph;
  }

  /** Validate and return the constructed WorkflowGraph. */
  build(): WorkflowGraph {
    const errors = this.graph.validate();
    if (errors.length > 0) {
      throw new Error(`Invalid workflow graph:\n${errors.join("\n")}`);
    }
    return this.graph;
  }

  // ── Static Pattern Helpers ───────────────────────────────────────────────

  /** Sequential A → B → C pipeline. */
  static pipeline(
    _name: string,
    agents: Array<{ name: string; prompt?: string; model?: string }>,
  ): WorkflowGraph {
    const b = new WorkflowBuilder();
    for (const a of agents) {
      b.agent(a.name, a);
    }
    return b.build();
  }

  /** Parallel fan-out → join → reduce. */
  static fanOutFanIn(
    _name: string,
    workers: Array<{ name: string; prompt?: string; model?: string }>,
    _reducer?: { prompt?: string; model?: string },
  ): WorkflowGraph {
    const b = new WorkflowBuilder();
    b.parallel(...workers.map((w) => (sub: WorkflowBuilder) => sub.agent(w.name, w)));
    return b.build();
  }

  /** Multi-research → decide → human gate → build. */
  static researchDecideBuild(
    _name: string,
    topics: string[],
    decider: { name: string; prompt?: string },
    builder: { name: string; prompt?: string },
  ): WorkflowGraph {
    const b = new WorkflowBuilder();
    b.parallel(
      ...topics.map(
        (t) => (sub: WorkflowBuilder) => sub.agent(`research-${t}`, { prompt: `Research: ${t}` }),
      ),
    );
    b.agent(decider.name, decider);
    b.humanGate("approval", "Review the decision before proceeding");
    b.agent(builder.name, builder);
    return b.build();
  }
}
