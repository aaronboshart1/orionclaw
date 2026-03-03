import { describe, it, expect, vi } from "vitest";
import { WorkflowBuilder } from "../graph/builder.js";
import { GraphExecutor } from "../graph/executor.js";
import type { AgentBridge } from "../graph/executor.js";
import type { HindsightProcessor } from "../memory/hindsight.js";
import { NodeStatus } from "../types.js";
import type { Node, NodeResult, ExecutionTrace } from "../types.js";

describe("HindsightProcessor wiring in GraphExecutor", () => {
  it("calls processTrace after execution completes", async () => {
    const graph = WorkflowBuilder.pipeline("test", [{ name: "step1", prompt: "do something" }]);

    const bridge: AgentBridge = {
      execute: vi.fn(
        async (node: Node): Promise<NodeResult> => ({
          nodeId: node.id,
          status: NodeStatus.COMPLETED,
          output: "done",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 10,
        }),
      ),
    };

    const mockProcessor = {
      processTrace: vi.fn(async (_trace: ExecutionTrace) => []),
      search: vi.fn(async () => []),
      load: vi.fn(async () => {}),
      getAllLessons: vi.fn(async () => []),
      decay: vi.fn(async () => 0),
    } as unknown as HindsightProcessor;

    const executor = new GraphExecutor({
      bridge,
      hindsightProcessor: mockProcessor,
    });

    const trace = await executor.execute(graph);

    expect(trace.completedAt).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockProcessor.processTrace).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockProcessor.processTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: expect.any(String),
        completedAt: expect.any(String),
      }),
    );
  });

  it("does not fail if processTrace throws", async () => {
    const graph = WorkflowBuilder.pipeline("test", [{ name: "step1" }]);

    const bridge: AgentBridge = {
      execute: vi.fn(
        async (node: Node): Promise<NodeResult> => ({
          nodeId: node.id,
          status: NodeStatus.COMPLETED,
          output: "done",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        }),
      ),
    };

    const mockProcessor = {
      processTrace: vi.fn(async () => {
        throw new Error("hindsight down");
      }),
      search: vi.fn(async () => []),
      load: vi.fn(async () => {}),
    } as unknown as HindsightProcessor;

    const executor = new GraphExecutor({ bridge, hindsightProcessor: mockProcessor });
    const trace = await executor.execute(graph);

    // Should still complete successfully
    expect(trace.completedAt).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockProcessor.processTrace).toHaveBeenCalledTimes(1);
  });
});
