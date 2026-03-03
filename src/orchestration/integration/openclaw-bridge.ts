/**
 * OrionClaw — OpenClawBridge
 *
 * Maps graph AGENT nodes to OpenClaw's sessions_spawn mechanism.
 * Uses spawnSubagentDirect() with mode:'run' for synchronous execution.
 */

import type {
  SpawnSubagentParams,
  SpawnSubagentContext,
  SpawnSubagentResult,
} from "../../agents/subagent-spawn.js";
import type { AgentBridge } from "../graph/executor.js";
import type { Node, NodeResult } from "../types.js";
import { NodeStatus } from "../types.js";

/**
 * Function signature matching spawnSubagentDirect from OpenClaw.
 * Injected to avoid hard coupling to the import.
 */
export type SpawnFn = (
  params: SpawnSubagentParams,
  ctx: SpawnSubagentContext,
) => Promise<SpawnSubagentResult>;

export interface OpenClawBridgeOptions {
  spawnFn: SpawnFn;
  context: SpawnSubagentContext;
  defaultModel?: string;
  defaultTimeoutSeconds?: number;
  executionId?: string;
}

export class OpenClawBridge implements AgentBridge {
  private spawnFn: SpawnFn;
  private context: SpawnSubagentContext;
  private defaultModel: string;
  private defaultTimeoutSeconds: number;
  private executionId: string;
  private sessionKeys: Map<string, string> = new Map();

  constructor(opts: OpenClawBridgeOptions) {
    this.spawnFn = opts.spawnFn;
    this.context = opts.context;
    this.defaultModel = opts.defaultModel ?? "anthropic/claude-opus-4-6";
    this.defaultTimeoutSeconds = opts.defaultTimeoutSeconds ?? 300;
    this.executionId = opts.executionId ?? "default";
  }

  async execute(node: Node, context: string): Promise<NodeResult> {
    const startedAt = new Date().toISOString();

    const progressPath = `~/.orionclaw/workspace/orchestration/active/${this.executionId}/${node.id}.jsonl`;
    const progressInstructions = [
      "",
      "## Progress Reporting",
      `After EVERY significant action, append ONE JSON line to: ${progressPath}`,
      'Entry format: {"ts":"ISO","type":"status|finding|done|error","msg":"...","pct":N}',
      'First entry must be: {"ts":"ISO","type":"status","msg":"Started","pct":0}',
      'Last entry must be type "done" or "error".',
      "",
    ].join("\n");

    const taskWithProgress = context + progressInstructions;

    const params: SpawnSubagentParams = {
      task: taskWithProgress,
      label: node.name,
      agentId: node.agentName,
      model: node.model ?? this.defaultModel,
      mode: "run",
      cleanup: "delete",
      runTimeoutSeconds: node.timeoutMs
        ? Math.ceil(node.timeoutMs / 1000)
        : this.defaultTimeoutSeconds,
    };

    if (node.tools && node.tools.length > 0) {
      // Tools are passed via the task description since SpawnSubagentParams
      // doesn't have a direct tools array — they're resolved by the agent runtime.
      params.task = `Tools available: ${node.tools.join(", ")}\n\n${context}`;
    }

    try {
      const result = await this.spawnFn(params, this.context);

      if (result.status === "forbidden") {
        return {
          nodeId: node.id,
          status: NodeStatus.FAILED,
          error: `Spawn forbidden: ${result.error ?? "unknown reason"}`,
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }

      if (result.status === "error") {
        return {
          nodeId: node.id,
          status: NodeStatus.FAILED,
          error: result.error ?? "Spawn error",
          startedAt,
          completedAt: new Date().toISOString(),
        };
      }

      // Track session key
      if (result.childSessionKey) {
        this.sessionKeys.set(node.id, result.childSessionKey);
      }

      const completedAt = new Date().toISOString();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

      // In mode:'run', the spawn blocks until completion.
      // The result contains the agent's output in the completion announcement.
      return {
        nodeId: node.id,
        status: NodeStatus.COMPLETED,
        output: result.runId ?? result.childSessionKey ?? "completed",
        startedAt,
        completedAt,
        durationMs,
        sessionKey: result.childSessionKey,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        nodeId: node.id,
        status: NodeStatus.FAILED,
        error,
        startedAt,
        completedAt: new Date().toISOString(),
      };
    }
  }

  /** Get the session key for a node that was executed. */
  getSessionKey(nodeId: string): string | undefined {
    return this.sessionKeys.get(nodeId);
  }

  /** Get all tracked session keys. */
  getAllSessionKeys(): Map<string, string> {
    return new Map(this.sessionKeys);
  }
}
