import { describe, it, expect, vi } from "vitest";
import { OpenClawBridge } from "../integration/openclaw-bridge.js";
import { NodeType } from "../types.js";
import type { Node } from "../types.js";

describe("OpenClawBridge progress instructions", () => {
  it("includes progress JSONL instructions in spawned task", async () => {
    let capturedTask = "";
    const mockSpawnFn = vi.fn(async (params: { task: string }) => {
      capturedTask = params.task;
      return { status: "ok" as const, childSessionKey: "test-key", runId: "run-1" };
    });

    const bridge = new OpenClawBridge({
      spawnFn: mockSpawnFn as unknown as import("../integration/openclaw-bridge.js").SpawnFn,
      context: {} as unknown as import("../../agents/subagent-spawn.js").SpawnSubagentContext,
      executionId: "exec-123",
    });

    const node: Node = {
      id: "agent_1",
      type: NodeType.AGENT,
      name: "researcher",
      prompt: "research topic",
    };

    await bridge.execute(node, "Do some research");

    expect(mockSpawnFn).toHaveBeenCalledTimes(1);
    expect(capturedTask).toContain("Progress Reporting");
    expect(capturedTask).toContain("exec-123");
    expect(capturedTask).toContain("agent_1.jsonl");
    expect(capturedTask).toContain('"type":"status|finding|done|error"');
  });
});
