import { describe, it, expect } from "vitest";
import { WorkflowGraph } from "../graph/workflow-graph.js";
import { Planner } from "../planner/planner.js";
import { NodeType } from "../types.js";

describe("Planner heuristics", () => {
  const planner = new Planner();

  describe("fanOutFanIn detection", () => {
    it('produces fanOutFanIn graph for "compare esbuild vs tsup vs tsdown"', async () => {
      const plan = await planner.plan("compare esbuild vs tsup vs tsdown");

      expect(plan.pattern).toBe("parallel");
      expect(plan.reasoning).toContain("fan-out");

      const graph = WorkflowGraph.fromJSON(plan.graph);
      const nodes = graph.getNodes();

      // Should have: PARALLEL node, 3 AGENT workers, JOIN node, REDUCER node = 6
      const agentNodes = nodes.filter((n) => n.type === NodeType.AGENT);
      const parallelNodes = nodes.filter((n) => n.type === NodeType.PARALLEL);
      const joinNodes = nodes.filter((n) => n.type === NodeType.JOIN);
      const reducerNodes = nodes.filter((n) => n.type === NodeType.REDUCER);

      expect(agentNodes.length).toBe(3);
      expect(parallelNodes.length).toBe(1);
      expect(joinNodes.length).toBe(1);
      expect(reducerNodes.length).toBe(1);

      // Verify DAG structure: parallel layers should allow concurrent execution
      const layers = graph.getParallelLayers();
      // Layer 0: parallel fanout, Layer 1: 3 agents (concurrent), Layer 2: join, Layer 3: reducer
      expect(layers.length).toBeGreaterThanOrEqual(3);
      // The layer with agent nodes should have all 3
      const agentLayer = layers.find((l) => l.some((n) => n.type === NodeType.AGENT));
      expect(agentLayer).toBeDefined();
      expect(agentLayer!.length).toBe(3);
    });

    it('produces fanOutFanIn for "compare X and Y"', async () => {
      const plan = await planner.plan("compare React and Vue");
      expect(plan.pattern).toBe("parallel");
      const graph = WorkflowGraph.fromJSON(plan.graph);
      const agents = graph.getNodes().filter((n) => n.type === NodeType.AGENT);
      expect(agents.length).toBe(2);
    });

    it('produces fanOutFanIn for "research X and Y and Z"', async () => {
      const plan = await planner.plan("research Rust and Go and Zig");
      expect(plan.pattern).toBe("parallel");
      const graph = WorkflowGraph.fromJSON(plan.graph);
      const agents = graph.getNodes().filter((n) => n.type === NodeType.AGENT);
      expect(agents.length).toBe(3);
    });
  });

  describe("researchDecideBuild detection", () => {
    it('produces researchDecideBuild for "research competitors, analyze findings, write report"', async () => {
      const plan = await planner.plan("research competitors, analyze findings, write report");

      expect(plan.pattern).toBe("hierarchical");
      expect(plan.reasoning).toContain("research-decide-build");

      const graph = WorkflowGraph.fromJSON(plan.graph);
      const nodes = graph.getNodes();

      // Should have: PARALLEL, research AGENT(s), JOIN, REDUCER, decider AGENT, HUMAN gate, builder AGENT
      const agentNodes = nodes.filter((n) => n.type === NodeType.AGENT);
      const humanNodes = nodes.filter((n) => n.type === NodeType.HUMAN);

      // At least: research agent + decider + builder = 3 agents minimum
      expect(agentNodes.length).toBeGreaterThanOrEqual(3);
      // Should have a human gate
      expect(humanNodes.length).toBe(1);

      // Graph should be valid
      expect(graph.validate()).toEqual([]);
    });
  });

  describe("simple tasks still work", () => {
    it("classifies simple coding task as pipeline", () => {
      const classification = planner.classifyTask("build a REST API");
      expect(classification.pattern).toBe("pipeline");
    });

    it("classifies simple writing task as sequential", () => {
      const classification = planner.classifyTask("write a blog post");
      expect(classification.pattern).toBe("sequential");
    });
  });
});
