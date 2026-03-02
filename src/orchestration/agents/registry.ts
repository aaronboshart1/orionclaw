/**
 * OrionClaw — AgentRegistry
 *
 * Manages registered agents, capability matching, and performance tracking.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { RegisteredAgent, AgentCapability, AgentPerformanceRecord } from '../types.js';

const DEFAULT_DATA_DIR = path.join(
  process.env['HOME'] ?? '/tmp',
  '.orionclaw',
  'workspace',
  'orchestration',
);
const STATS_FILE = 'agent-stats.json';

export class AgentRegistry {
  private agents: Map<string, RegisteredAgent> = new Map();
  private stats: Map<string, AgentPerformanceRecord> = new Map();
  private dataDir: string;
  private statsPath: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
    this.statsPath = path.join(this.dataDir, STATS_FILE);
  }

  /** Load agents from config. */
  loadFromConfig(agents: RegisteredAgent[]): void {
    for (const agent of agents) {
      this.agents.set(agent.name, agent);
    }
  }

  /** Register a single agent. */
  register(agent: RegisteredAgent): void {
    this.agents.set(agent.name, agent);
  }

  /** Get an agent by name. */
  get(name: string): RegisteredAgent | undefined {
    return this.agents.get(name);
  }

  /** Get all registered agents. */
  getAll(): RegisteredAgent[] {
    return [...this.agents.values()];
  }

  /**
   * Match agents by required capabilities.
   * Returns agents sorted by cumulative capability strength.
   */
  matchCapabilities(required: string[]): RegisteredAgent[] {
    if (required.length === 0) return this.getAll();

    const scored: Array<{ agent: RegisteredAgent; score: number }> = [];

    for (const agent of this.agents.values()) {
      let totalScore = 0;
      let allMatched = true;

      for (const reqCap of required) {
        const capability = agent.capabilities.find(
          c => c.name.toLowerCase() === reqCap.toLowerCase(),
        );
        if (capability) {
          totalScore += capability.strength;
        } else {
          allMatched = false;
        }
      }

      if (allMatched) {
        scored.push({ agent, score: totalScore });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .map(s => s.agent);
  }

  /** Record a task completion for performance tracking. */
  recordTaskCompletion(
    agentName: string,
    success: boolean,
    durationMs: number,
    tokens: number,
    taskType: string,
  ): void {
    const existing = this.stats.get(agentName);
    if (existing) {
      const totalTasks = existing.totalTasks + 1;
      const successCount = Math.round(existing.successRate * existing.totalTasks) + (success ? 1 : 0);
      existing.totalTasks = totalTasks;
      existing.successRate = successCount / totalTasks;
      existing.avgDurationMs = (existing.avgDurationMs * (totalTasks - 1) + durationMs) / totalTasks;
      existing.avgTokens = (existing.avgTokens * (totalTasks - 1) + tokens) / totalTasks;
      existing.lastUsed = new Date().toISOString();
      existing.taskTypes[taskType] = (existing.taskTypes[taskType] ?? 0) + 1;
    } else {
      this.stats.set(agentName, {
        agentName,
        totalTasks: 1,
        successRate: success ? 1 : 0,
        avgDurationMs: durationMs,
        avgTokens: tokens,
        lastUsed: new Date().toISOString(),
        taskTypes: { [taskType]: 1 },
      });
    }
  }

  /** Get performance stats for an agent. */
  getStats(agentName: string): AgentPerformanceRecord | undefined {
    return this.stats.get(agentName);
  }

  /** Get all performance stats. */
  getAllStats(): AgentPerformanceRecord[] {
    return [...this.stats.values()];
  }

  /** Load stats from disk. */
  async loadStats(): Promise<void> {
    try {
      const content = await fs.readFile(this.statsPath, 'utf-8');
      const data = JSON.parse(content) as AgentPerformanceRecord[];
      for (const record of data) {
        this.stats.set(record.agentName, record);
      }
    } catch {
      // No stats file yet
    }
  }

  /** Save stats to disk. */
  async saveStats(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    const data = [...this.stats.values()];
    await fs.writeFile(this.statsPath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
