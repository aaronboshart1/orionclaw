/**
 * OrionClaw — Orion Tool
 *
 * Native agent tool that wires the orchestration graph engine into the runtime.
 * Subcommands: plan, run, status, history, lessons, agents
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import type { SpawnSubagentContext } from "../../agents/subagent-spawn.js";
import type { AnyAgentTool } from "../../agents/tools/common.js";
import { jsonResult, readStringParam } from "../../agents/tools/common.js";
import { AgentRegistry } from "../agents/registry.js";
import { GraphExecutor } from "../graph/executor.js";
import { WorkflowGraph } from "../graph/workflow-graph.js";
import type { SpawnFn } from "../integration/openclaw-bridge.js";
import { OpenClawBridge } from "../integration/openclaw-bridge.js";
import { HindsightApiClient } from "../memory/hindsight-api.js";
import { HindsightMemoryProvider } from "../memory/hindsight-memory-provider.js";
import { HindsightProcessor } from "../memory/hindsight.js";
import { Planner } from "../planner/planner.js";
import { ContextAssembler } from "../state/context-assembler.js";
import { WorkflowState } from "../state/workflow-state.js";
import type { OrionClawConfig, OrchestrationPlan, ExecutionTrace } from "../types.js";

const SUBCOMMANDS = ["plan", "run", "status", "history", "lessons", "agents"] as const;

const OrionToolSchema = Type.Object({
  action: Type.Unsafe<(typeof SUBCOMMANDS)[number]>({
    type: "string",
    enum: [...SUBCOMMANDS],
  }),
  task: Type.Optional(Type.String()),
  query: Type.Optional(Type.String()),
});

const DEFAULT_HINDSIGHT_URL = "http://10.0.0.13:8888";
const DEFAULT_BANK = "project-orionclaw";

function getDataDir(config?: OrionClawConfig): string {
  return (
    config?.dataDir ??
    path.join(process.env["HOME"] ?? "/tmp", ".orionclaw", "workspace", "orchestration")
  );
}

function getHindsightUrl(config?: OrionClawConfig): string {
  return config?.hindsight?.url ?? DEFAULT_HINDSIGHT_URL;
}

function getBank(config?: OrionClawConfig): string {
  return config?.hindsight?.defaultBank ?? DEFAULT_BANK;
}

function isHindsightEnabled(config?: OrionClawConfig): boolean {
  return config?.hindsight?.enabled !== false;
}

function formatPlan(plan: OrchestrationPlan): string {
  const nodes = plan.graph.nodes ?? [];
  const edges = plan.graph.edges ?? [];
  const lines = [
    `## Orchestration Plan`,
    `**Pattern:** ${plan.pattern}`,
    `**Nodes:** ${nodes.length}`,
    `**Edges:** ${edges.length}`,
    `**Reasoning:** ${plan.reasoning}`,
  ];
  if (plan.estimatedDurationMs) {
    lines.push(`**Est. Duration:** ${Math.round(plan.estimatedDurationMs / 1000)}s`);
  }
  lines.push("", "### Graph Structure");
  for (const node of nodes) {
    lines.push(`- **${node.name}** (${node.type})${node.model ? ` [${node.model}]` : ""}`);
  }
  for (const edge of edges) {
    lines.push(`  ${edge.source} → ${edge.target}${edge.label ? ` (${edge.label})` : ""}`);
  }
  return lines.join("\n");
}

function formatTrace(trace: ExecutionTrace): string {
  const lines = [
    `## Execution Complete`,
    `**Workflow:** ${trace.workflowId}`,
    `**Duration:** ${trace.durationMs ? Math.round(trace.durationMs / 1000) + "s" : "unknown"}`,
    `**Nodes executed:** ${Object.keys(trace.results).length}`,
    "",
    "### Node Results",
  ];
  for (const [nodeId, result] of Object.entries(trace.results)) {
    const status = result.status;
    const dur = result.durationMs ? ` (${Math.round(result.durationMs / 1000)}s)` : "";
    const out = result.output
      ? typeof result.output === "string"
        ? result.output.slice(0, 200)
        : JSON.stringify(result.output).slice(0, 200)
      : (result.error ?? "");
    lines.push(`- **${nodeId}** ${status}${dur}: ${out}`);
  }
  return lines.join("\n");
}

// ── Subcommand Handlers ──────────────────────────────────────────────────

async function handlePlan(task: string, config?: OrionClawConfig): Promise<string> {
  const dataDir = getDataDir(config);
  const url = getHindsightUrl(config);
  const bank = getBank(config);
  const enabled = isHindsightEnabled(config);

  const hindsightProcessor = new HindsightProcessor({
    dataDir,
    bankId: bank,
    hindsightUrl: url,
    hindsightEnabled: enabled,
  });

  let apiClient: HindsightApiClient | undefined;
  if (enabled) {
    apiClient = new HindsightApiClient(url);
  }

  const registry = new AgentRegistry(dataDir);
  await registry.loadStats();

  const planner = new Planner(registry, hindsightProcessor, {
    hindsightClient: apiClient,
    hindsightBank: bank,
  });

  const plan = await planner.plan(task);

  // Retain plan to Hindsight (non-fatal)
  if (apiClient) {
    try {
      await apiClient.retain(bank, [
        {
          content: `Orchestration plan for: ${task}\nPattern: ${plan.pattern}\nNodes: ${plan.graph.nodes?.length ?? 0}\nReasoning: ${plan.reasoning}`,
          context: "architecture",
        },
      ]);
    } catch {
      // Non-fatal
    }
  }

  return formatPlan(plan);
}

async function resolveSpawnFn(injected?: SpawnFn): Promise<SpawnFn> {
  if (injected) {
    return injected;
  }
  const mod = await import("../../agents/subagent-spawn.js");
  return mod.spawnSubagentDirect;
}

async function handleRun(
  task: string,
  spawnCtx: SpawnSubagentContext,
  config?: OrionClawConfig,
  injectedSpawnFn?: SpawnFn,
): Promise<string> {
  const dataDir = getDataDir(config);
  const url = getHindsightUrl(config);
  const bank = getBank(config);
  const enabled = isHindsightEnabled(config);

  const hindsightProcessor = new HindsightProcessor({
    dataDir,
    bankId: bank,
    hindsightUrl: url,
    hindsightEnabled: enabled,
  });

  let apiClient: HindsightApiClient | undefined;
  if (enabled) {
    apiClient = new HindsightApiClient(url);
  }

  const registry = new AgentRegistry(dataDir);
  await registry.loadStats();

  const planner = new Planner(registry, hindsightProcessor, {
    hindsightClient: apiClient,
    hindsightBank: bank,
  });

  const plan = await planner.plan(task);

  // Build the execution components
  const state = new WorkflowState();
  const memoryProvider = enabled ? new HindsightMemoryProvider({ url, bankId: bank }) : undefined;
  const assembler = new ContextAssembler(state, memoryProvider, hindsightProcessor);

  const spawnFn = await resolveSpawnFn(injectedSpawnFn);
  const bridge = new OpenClawBridge({
    spawnFn,
    context: spawnCtx,
    defaultModel: config?.defaultModel,
  });

  const executor = new GraphExecutor({
    bridge,
    state,
    contextAssembler: assembler,
    hindsightProcessor,
  });

  const graph = WorkflowGraph.fromJSON(plan.graph);
  const trace = await executor.execute(graph, task);

  // Save completed workflow (non-fatal)
  try {
    const completedDir = path.join(dataDir, "completed", trace.workflowId);
    await fs.mkdir(completedDir, { recursive: true });
    await fs.writeFile(path.join(completedDir, "trace.json"), JSON.stringify(trace, null, 2));
  } catch {
    // Non-fatal
  }

  return formatTrace(trace);
}

async function handleStatus(config?: OrionClawConfig): Promise<string> {
  const activeDir = path.join(getDataDir(config), "active");
  try {
    const entries = await fs.readdir(activeDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    if (dirs.length === 0) {
      return "No active workflows.";
    }
    const lines = ["## Active Workflows", ""];
    for (const dir of dirs) {
      const manifestPath = path.join(activeDir, dir.name, "manifest.json");
      try {
        const raw = await fs.readFile(manifestPath, "utf-8");
        const manifest = JSON.parse(raw);
        lines.push(
          `- **${dir.name}**: ${manifest.task_summary ?? manifest.taskSummary ?? "unknown"}`,
        );
      } catch {
        lines.push(`- **${dir.name}**: (manifest unreadable)`);
      }
    }
    return lines.join("\n");
  } catch {
    return "No active workflows.";
  }
}

async function handleHistory(config?: OrionClawConfig): Promise<string> {
  const completedDir = path.join(getDataDir(config), "completed");
  try {
    const entries = await fs.readdir(completedDir, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    if (dirs.length === 0) {
      return "No completed workflows.";
    }
    const lines = ["## Completed Workflows", ""];
    for (const dir of dirs.slice(-20)) {
      const tracePath = path.join(completedDir, dir.name, "trace.json");
      try {
        const raw = await fs.readFile(tracePath, "utf-8");
        const trace: ExecutionTrace = JSON.parse(raw);
        const dur = trace.durationMs ? `${Math.round(trace.durationMs / 1000)}s` : "?";
        const nodes = Object.keys(trace.results).length;
        lines.push(`- **${trace.workflowId}** — ${nodes} nodes, ${dur}`);
      } catch {
        lines.push(`- **${dir.name}** — (trace unreadable)`);
      }
    }
    return lines.join("\n");
  } catch {
    return "No completed workflows.";
  }
}

async function handleLessons(query?: string, config?: OrionClawConfig): Promise<string> {
  const dataDir = getDataDir(config);
  const bank = getBank(config);
  const url = getHindsightUrl(config);
  const enabled = isHindsightEnabled(config);

  const processor = new HindsightProcessor({
    dataDir,
    bankId: bank,
    hindsightUrl: url,
    hindsightEnabled: enabled,
  });
  await processor.load();

  const lessons = query ? await processor.search(query) : await processor.search("*");

  if (lessons.length === 0) {
    return "No lessons found.";
  }

  const lines = ["## Lessons", ""];
  for (const lesson of lessons.slice(0, 20)) {
    lines.push(
      `- [${(lesson.confidence * 100).toFixed(0)}%] **${lesson.taskPattern}**: ${lesson.lesson}`,
    );
  }
  return lines.join("\n");
}

async function handleAgents(config?: OrionClawConfig): Promise<string> {
  const registry = new AgentRegistry(getDataDir(config));
  await registry.loadStats();

  const agents = registry.getAll();
  if (agents.length === 0) {
    return "No registered agents.";
  }

  const lines = ["## Registered Agents", ""];
  for (const agent of agents) {
    const caps = agent.capabilities?.map((c) => c.name).join(", ") ?? "none";
    lines.push(`- **${agent.name}** (${agent.model ?? "default"}) — Capabilities: ${caps}`);
  }
  return lines.join("\n");
}

// ── Tool Factory ─────────────────────────────────────────────────────────

export interface OrionToolOptions {
  agentSessionKey?: string;
  agentChannel?: string;
  agentAccountId?: string;
  agentTo?: string;
  agentThreadId?: string | number;
  agentGroupId?: string | null;
  agentGroupChannel?: string | null;
  agentGroupSpace?: string | null;
  config?: OrionClawConfig;
  /** Injected spawn function. If not provided, dynamically imports spawnSubagentDirect. */
  spawnFn?: SpawnFn;
}

export function createOrionTool(opts?: OrionToolOptions): AnyAgentTool {
  const spawnCtx: SpawnSubagentContext = {
    agentSessionKey: opts?.agentSessionKey,
    agentChannel: opts?.agentChannel,
    agentAccountId: opts?.agentAccountId,
    agentTo: opts?.agentTo,
    agentThreadId: opts?.agentThreadId,
    agentGroupId: opts?.agentGroupId,
    agentGroupChannel: opts?.agentGroupChannel,
    agentGroupSpace: opts?.agentGroupSpace,
  };

  const config = opts?.config;
  const injectedSpawnFn = opts?.spawnFn;

  return {
    name: "orion",
    label: "OrionClaw Orchestration",
    description:
      "Graph-based multi-agent orchestration engine. Actions: plan (generate workflow graph), run (plan + execute), status (active workflows), history (completed), lessons (hindsight), agents (registered agents).",
    parameters: OrionToolSchema,
    async execute(_toolCallId: string, args: Record<string, unknown>) {
      const action = readStringParam(args, "action", {
        required: true,
      }) as (typeof SUBCOMMANDS)[number];
      const task = readStringParam(args, "task");
      const query = readStringParam(args, "query");

      try {
        switch (action) {
          case "plan": {
            if (!task) {
              return jsonResult({ error: "task parameter required for plan action" });
            }
            const result = await handlePlan(task, config);
            return { content: [{ type: "text", text: result }] };
          }
          case "run": {
            if (!task) {
              return jsonResult({ error: "task parameter required for run action" });
            }
            const result = await handleRun(task, spawnCtx, config, injectedSpawnFn);
            return { content: [{ type: "text", text: result }] };
          }
          case "status": {
            const result = await handleStatus(config);
            return { content: [{ type: "text", text: result }] };
          }
          case "history": {
            const result = await handleHistory(config);
            return { content: [{ type: "text", text: result }] };
          }
          case "lessons": {
            const result = await handleLessons(query ?? task, config);
            return { content: [{ type: "text", text: result }] };
          }
          case "agents": {
            const result = await handleAgents(config);
            return { content: [{ type: "text", text: result }] };
          }
          default:
            return jsonResult({
              error: `Unknown action: ${String(action)}. Valid: ${SUBCOMMANDS.join(", ")}`,
            });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return jsonResult({ error: `Orion tool error: ${message}` });
      }
    },
  };
}
