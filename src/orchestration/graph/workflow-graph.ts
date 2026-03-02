/**
 * OrionClaw — WorkflowGraph
 *
 * Core DAG data structure for workflow definitions.
 */

import type { Node, Edge, EdgeCondition, WorkflowGraphData } from '../types.js';

export class WorkflowGraph {
  private nodes: Map<string, Node> = new Map();
  private edges: Edge[] = [];
  private adjacency: Map<string, string[]> = new Map();
  private reverseAdj: Map<string, string[]> = new Map();

  addNode(node: Node): this {
    this.nodes.set(node.id, node);
    if (!this.adjacency.has(node.id)) this.adjacency.set(node.id, []);
    if (!this.reverseAdj.has(node.id)) this.reverseAdj.set(node.id, []);
    return this;
  }

  addEdge(edge: Edge): this {
    this.edges.push(edge);
    const fwd = this.adjacency.get(edge.source);
    if (fwd) fwd.push(edge.target);
    else this.adjacency.set(edge.source, [edge.target]);

    const rev = this.reverseAdj.get(edge.target);
    if (rev) rev.push(edge.source);
    else this.reverseAdj.set(edge.target, [edge.source]);
    return this;
  }

  getNode(id: string): Node | undefined {
    return this.nodes.get(id);
  }

  getNodes(): Node[] {
    return [...this.nodes.values()];
  }

  getEdges(): Edge[] {
    return [...this.edges];
  }

  getEdgesFrom(nodeId: string): Edge[] {
    return this.edges.filter(e => e.source === nodeId);
  }

  getEdgesTo(nodeId: string): Edge[] {
    return this.edges.filter(e => e.target === nodeId);
  }

  getSuccessors(nodeId: string): string[] {
    return this.adjacency.get(nodeId) ?? [];
  }

  getPredecessors(nodeId: string): string[] {
    return this.reverseAdj.get(nodeId) ?? [];
  }

  getEntryNodes(): Node[] {
    return [...this.nodes.values()].filter(
      n => (this.reverseAdj.get(n.id)?.length ?? 0) === 0,
    );
  }

  getTerminalNodes(): Node[] {
    return [...this.nodes.values()].filter(
      n => (this.adjacency.get(n.id)?.length ?? 0) === 0,
    );
  }

  /**
   * Kahn's algorithm — returns nodes in dependency order.
   * Throws if the graph contains a cycle.
   */
  topologicalSort(): Node[] {
    const inDegree = new Map<string, number>();
    for (const id of this.nodes.keys()) inDegree.set(id, 0);
    for (const edge of this.edges) {
      inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const result: Node[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const node = this.nodes.get(id);
      if (node) result.push(node);

      for (const succ of this.getSuccessors(id)) {
        const d = (inDegree.get(succ) ?? 1) - 1;
        inDegree.set(succ, d);
        if (d === 0) queue.push(succ);
      }
    }

    if (result.length !== this.nodes.size) {
      throw new Error('Cycle detected in workflow graph');
    }
    return result;
  }

  /**
   * Validate the graph, returning an array of error strings (empty = valid).
   */
  validate(): string[] {
    const errors: string[] = [];

    // Missing edge targets / sources
    for (const edge of this.edges) {
      if (!this.nodes.has(edge.source)) errors.push(`Edge references missing source node: ${edge.source}`);
      if (!this.nodes.has(edge.target)) errors.push(`Edge references missing target node: ${edge.target}`);
    }

    // Must have at least one entry node
    const entries = this.getEntryNodes();
    if (this.nodes.size > 0 && entries.length === 0) {
      errors.push('Graph has no entry nodes (all nodes have incoming edges — likely a cycle)');
    }

    // Unreachable nodes (BFS from entry nodes)
    if (entries.length > 0) {
      const visited = new Set<string>();
      const bfsQueue = entries.map(n => n.id);
      while (bfsQueue.length > 0) {
        const id = bfsQueue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        for (const succ of this.getSuccessors(id)) {
          if (!visited.has(succ)) bfsQueue.push(succ);
        }
      }
      for (const id of this.nodes.keys()) {
        if (!visited.has(id)) errors.push(`Unreachable node: ${id}`);
      }
    }

    // Cycle detection via topological sort
    try {
      this.topologicalSort();
    } catch {
      errors.push('Graph contains a cycle');
    }

    return errors;
  }

  /**
   * Group nodes into layers by dependency depth for concurrent execution.
   * Layer 0 = entry nodes, Layer N = nodes whose predecessors are all in layers < N.
   */
  getParallelLayers(): Node[][] {
    const sorted = this.topologicalSort();
    const depth = new Map<string, number>();

    for (const node of sorted) {
      const preds = this.getPredecessors(node.id);
      if (preds.length === 0) {
        depth.set(node.id, 0);
      } else {
        let maxPredDepth = 0;
        for (const p of preds) {
          maxPredDepth = Math.max(maxPredDepth, depth.get(p) ?? 0);
        }
        depth.set(node.id, maxPredDepth + 1);
      }
    }

    const layers: Node[][] = [];
    for (const node of sorted) {
      const d = depth.get(node.id) ?? 0;
      while (layers.length <= d) layers.push([]);
      layers[d].push(node);
    }
    return layers;
  }

  toJSON(): WorkflowGraphData {
    return {
      nodes: [...this.nodes.values()],
      edges: [...this.edges],
    };
  }

  static fromJSON(data: WorkflowGraphData): WorkflowGraph {
    const graph = new WorkflowGraph();
    for (const node of data.nodes) graph.addNode(node);
    for (const edge of data.edges) graph.addEdge(edge);
    return graph;
  }
}
