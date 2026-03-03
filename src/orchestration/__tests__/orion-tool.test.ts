import { describe, it, expect, beforeEach } from "vitest";
import type { AnyAgentTool } from "../../agents/tools/common.js";
import { createOrionTool } from "../tool/orion-tool.js";

describe("orion-tool", () => {
  let tool: AnyAgentTool;

  beforeEach(() => {
    tool = createOrionTool({
      agentSessionKey: "test-session",
    });
  });

  it("creates a tool with correct name and description", () => {
    expect(tool.name).toBe("orion");
    expect(tool.label).toBe("OrionClaw Orchestration");
    expect(tool.description).toContain("plan");
    expect(tool.description).toContain("run");
  });

  it("returns error for missing action", async () => {
    await expect(tool.execute("call-1", {})).rejects.toThrow("action required");
  });

  it("returns error for unknown action", async () => {
    const result = await tool.execute("call-1", { action: "unknown" });
    const text = JSON.stringify(result);
    expect(text).toContain("Unknown action");
  });

  it("plan returns error without task", async () => {
    const result = await tool.execute("call-1", { action: "plan" });
    const text = JSON.stringify(result);
    expect(text).toContain("task parameter required");
  });

  it("run returns error without task", async () => {
    const result = await tool.execute("call-1", { action: "run" });
    const text = JSON.stringify(result);
    expect(text).toContain("task parameter required");
  });

  it("status returns no active workflows when dir missing", async () => {
    const result = await tool.execute("call-1", { action: "status" });
    const content = (result as unknown as { content: { type: string; text: string }[] }).content;
    expect(content[0].text).toContain("No active workflows");
  });

  it("history returns no completed workflows when dir missing", async () => {
    const result = await tool.execute("call-1", { action: "history" });
    const content = (result as unknown as { content: { type: string; text: string }[] }).content;
    expect(content[0].text).toContain("No completed workflows");
  });

  it("agents returns no registered agents when empty", async () => {
    const result = await tool.execute("call-1", { action: "agents" });
    const content = (result as unknown as { content: { type: string; text: string }[] }).content;
    expect(content[0].text).toContain("No registered agents");
  });

  it("lessons handles missing data gracefully", async () => {
    const result = await tool.execute("call-1", { action: "lessons", query: "test" });
    const content = (result as unknown as { content: { type: string; text: string }[] }).content;
    // Should not throw, should return some message
    expect(content[0].text).toBeDefined();
  });

  it("plan subcommand executes planner", async () => {
    // This will use the real planner with keyword-based classification
    const result = await tool.execute("call-1", {
      action: "plan",
      task: "Research the best frameworks for web development",
    });
    const content = (result as unknown as { content: { type: string; text: string }[] }).content;
    expect(content[0].text).toContain("Orchestration Plan");
    expect(content[0].text).toContain("Pattern");
  });
});
