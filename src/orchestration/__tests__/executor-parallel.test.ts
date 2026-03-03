import { describe, it, expect, vi } from "vitest";
import { WorkflowBuilder } from "../graph/builder.js";
import { GraphExecutor } from "../graph/executor.js";
import type { AgentBridge } from "../graph/executor.js";
import { NodeStatus } from "../types.js";
import type { Node, NodeResult } from "../types.js";

describe("GraphExecutor parallel concurrency", () => {
  it("spawns parallel nodes concurrently, not sequentially", async () => {
    const graph = WorkflowBuilder.fanOutFanIn("test", [
      { name: "w1", prompt: "task 1" },
      { name: "w2", prompt: "task 2" },
      { name: "w3", prompt: "task 3" },
    ]);

    const callLog: { nodeId: string; time: number; event: "start" | "end" }[] = [];
    const startTime = Date.now();

    const bridge: AgentBridge = {
      execute: vi.fn(async (node: Node): Promise<NodeResult> => {
        callLog.push({ nodeId: node.id, time: Date.now() - startTime, event: "start" });
        // Simulate 50ms of work
        await new Promise((r) => setTimeout(r, 50));
        callLog.push({ nodeId: node.id, time: Date.now() - startTime, event: "end" });
        return {
          nodeId: node.id,
          status: NodeStatus.COMPLETED,
          output: `done: ${node.name}`,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: 50,
        };
      }),
    };

    const executor = new GraphExecutor({ bridge });
    const trace = await executor.execute(graph);

    expect(trace.completedAt).toBeDefined();

    // The 3 worker agents should have been called
    // Plus the reducer = 4 bridge calls total
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(bridge.execute).toHaveBeenCalledTimes(4);

    // Verify concurrency: the 3 worker starts should all happen before any worker ends
    // (or at least close together, within the 50ms window)
    const workerStarts = callLog.filter((e) => e.event === "start").slice(0, 3); // first 3 are the workers

    // All 3 workers should start within ~20ms of each other (concurrent, not sequential)
    if (workerStarts.length === 3) {
      const spread = workerStarts[2].time - workerStarts[0].time;
      // If sequential, spread would be ~100ms+ (50ms per task). If concurrent, <30ms.
      expect(spread).toBeLessThan(40);
    }
  });
});
