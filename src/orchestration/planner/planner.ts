/**
 * OrionClaw — Planner
 *
 * Converts natural language task descriptions into WorkflowGraphs.
 * Classifies tasks, selects patterns, and incorporates hindsight lessons.
 */

import type { AgentRegistry } from "../agents/registry.js";
import { WorkflowBuilder } from "../graph/builder.js";
import type { WorkflowGraph } from "../graph/workflow-graph.js";
import type { HindsightApiClient } from "../memory/hindsight-api.js";
import type { LessonProvider } from "../state/context-assembler.js";
import type {
  OrchestrationPlan,
  OrchestrationPattern,
  RegisteredAgent,
  HindsightLesson,
} from "../types.js";

export type TaskType = "research" | "coding" | "writing" | "analysis" | "mixed";

interface TaskClassification {
  type: TaskType;
  pattern: OrchestrationPattern;
  subtasks: string[];
  reasoning: string;
}

/** Keywords for simple task classification. */
const TASK_KEYWORDS: Record<TaskType, string[]> = {
  research: [
    "research",
    "find",
    "search",
    "investigate",
    "explore",
    "discover",
    "compare",
    "survey",
  ],
  coding: [
    "code",
    "build",
    "implement",
    "develop",
    "fix",
    "bug",
    "feature",
    "refactor",
    "deploy",
    "test",
  ],
  writing: ["write", "draft", "compose", "document", "blog", "article", "copy", "edit", "review"],
  analysis: ["analyze", "evaluate", "assess", "measure", "benchmark", "audit", "report", "data"],
  mixed: [],
};

/** Map task types to preferred patterns. */
const TYPE_PATTERN_MAP: Record<TaskType, OrchestrationPattern> = {
  research: "parallel",
  coding: "pipeline",
  writing: "sequential",
  analysis: "parallel",
  mixed: "auto",
};

export class Planner {
  private hindsightClient?: HindsightApiClient;
  private hindsightBank: string;

  constructor(
    private registry?: AgentRegistry,
    private lessonProvider?: LessonProvider,
    options?: { hindsightClient?: HindsightApiClient; hindsightBank?: string },
  ) {
    this.hindsightClient = options?.hindsightClient;
    this.hindsightBank = options?.hindsightBank ?? "project-orionclaw";
  }

  /**
   * Plan a workflow from a natural language task description.
   */
  async plan(taskDescription: string): Promise<OrchestrationPlan> {
    // 0. Recall relevant context from Hindsight (non-fatal)
    let hindsightContext = "";
    if (this.hindsightClient) {
      try {
        hindsightContext = await this.hindsightClient.recall(
          this.hindsightBank,
          `planning context for: ${taskDescription}`,
          2048,
        );
      } catch {
        // Non-fatal
      }
    }

    // 1. Classify the task
    const classification = this.classifyTask(taskDescription);

    // 2. Get relevant lessons
    let lessons: HindsightLesson[] = [];
    if (this.lessonProvider) {
      try {
        lessons = await this.lessonProvider.search(taskDescription);
      } catch {
        // Non-fatal
      }
    }

    // 3. Build the workflow graph
    const graph = this.buildGraph(classification, taskDescription, lessons);

    return {
      pattern: classification.pattern,
      graph: graph.toJSON(),
      reasoning: this.buildReasoning(classification, lessons, hindsightContext),
    };
  }

  /** Classify a task using keyword matching and structural heuristics. */
  classifyTask(taskDescription: string): TaskClassification {
    const lower = taskDescription.toLowerCase();
    const scores: Record<TaskType, number> = {
      research: 0,
      coding: 0,
      writing: 0,
      analysis: 0,
      mixed: 0,
    };

    for (const [type, keywords] of Object.entries(TASK_KEYWORDS)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          scores[type as TaskType]++;
        }
      }
    }

    // Find the top type
    let bestType: TaskType = "mixed";
    let bestScore = 0;
    for (const [type, score] of Object.entries(scores)) {
      if (type === "mixed") {
        continue;
      }
      if (score > bestScore) {
        bestScore = score;
        bestType = type as TaskType;
      }
    }

    // If no clear winner, it's mixed
    if (bestScore === 0) {
      bestType = "mixed";
    }

    // Detect structural patterns that override simple type→pattern mapping

    // 1. Research-decide-build pattern: distinct phases (check first, more specific)
    const rdbPattern = this.detectResearchDecideBuild(lower, taskDescription);
    if (rdbPattern) {
      return {
        type: "mixed",
        pattern: "hierarchical",
        subtasks: [...rdbPattern.researchTopics, rdbPattern.decideTask, rdbPattern.buildTask],
        reasoning: `Detected research-decide-build pattern: ${rdbPattern.researchTopics.length} research topics → decide → build`,
      };
    }

    // 2. Fan-out pattern: comparing/researching multiple items
    const fanOutPattern = this.detectFanOut(lower);
    if (fanOutPattern) {
      const subtasks = fanOutPattern.items.map((item) => `Research and analyze: ${item}`);
      return {
        type: bestType === "mixed" ? "research" : bestType,
        pattern: "parallel",
        subtasks,
        reasoning: `Detected fan-out pattern (${fanOutPattern.reason}), using fanOutFanIn with ${subtasks.length} workers`,
      };
    }

    // Extract subtasks (split on sentences or newlines)
    const subtasks = this.extractSubtasks(taskDescription);

    const pattern = TYPE_PATTERN_MAP[bestType];

    return {
      type: bestType,
      pattern,
      subtasks,
      reasoning: `Classified as '${bestType}' (score: ${bestScore}), using '${pattern}' pattern`,
    };
  }

  /** Detect fan-out patterns: "compare X vs Y vs Z", "research X and Y", "for each X, Y, Z" */
  private detectFanOut(lower: string): { items: string[]; reason: string } | null {
    // "compare A vs B vs C" or "compare A, B, and C"
    const compareVsMatch = lower.match(/compare\s+(.+)/);
    if (compareVsMatch) {
      const rest = compareVsMatch[1];
      // Split on "vs", "versus", commas, "and"
      const items = rest
        .split(/\s+(?:vs\.?|versus)\s+|,\s*(?:and\s+)?|\s+and\s+/i)
        .map((s) => s.trim().replace(/[.!?]+$/, ""))
        .filter((s) => s.length > 0);
      if (items.length >= 2) {
        return { items, reason: "compare X vs Y" };
      }
    }

    // "research X and Y and Z"
    const researchAndMatch = lower.match(/research\s+(.+)/);
    if (researchAndMatch) {
      const rest = researchAndMatch[1];
      const items = rest
        .split(/\s+and\s+|,\s*(?:and\s+)?/i)
        .map((s) => s.trim().replace(/[.!?]+$/, ""))
        .filter((s) => s.length > 0);
      if (items.length >= 2) {
        return { items, reason: "research X and Y" };
      }
    }

    // "for each X, Y, Z" or "analyze multiple: X, Y, Z"
    const forEachMatch = lower.match(/(?:for each|analyze multiple|evaluate each)\s*:?\s*(.+)/);
    if (forEachMatch) {
      const rest = forEachMatch[1];
      const items = rest
        .split(/,\s*(?:and\s+)?|\s+and\s+/i)
        .map((s) => s.trim().replace(/[.!?]+$/, ""))
        .filter((s) => s.length > 0);
      if (items.length >= 2) {
        return { items, reason: "for each / analyze multiple" };
      }
    }

    return null;
  }

  /** Detect research-decide-build: tasks with distinct research + analysis/decision + output phases */
  private detectResearchDecideBuild(
    lower: string,
    original: string,
  ): {
    researchTopics: string[];
    decideTask: string;
    buildTask: string;
  } | null {
    // Pattern: "research X, analyze Y, write/build Z" (comma or period separated phases)
    const phaseKeywords = {
      research: ["research", "investigate", "explore", "survey", "gather", "find out about"],
      decide: [
        "analyze",
        "evaluate",
        "assess",
        "decide",
        "determine",
        "compare findings",
        "analyze findings",
      ],
      build: [
        "write",
        "build",
        "create",
        "draft",
        "compose",
        "generate",
        "produce",
        "write report",
        "compile",
      ],
    };

    const hasResearch = phaseKeywords.research.some((k) => lower.includes(k));
    const hasDecide = phaseKeywords.decide.some((k) => lower.includes(k));
    const hasBuild = phaseKeywords.build.some((k) => lower.includes(k));

    if (hasResearch && hasDecide && hasBuild) {
      // Split into phases by commas/semicolons/periods/"then"
      const parts = original
        .split(/[,;.]\s*|\s+then\s+/i)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      if (parts.length >= 3) {
        const researchParts = parts.filter((p) =>
          phaseKeywords.research.some((k) => p.toLowerCase().includes(k)),
        );
        const decideParts = parts.filter((p) =>
          phaseKeywords.decide.some((k) => p.toLowerCase().includes(k)),
        );
        const buildParts = parts.filter((p) =>
          phaseKeywords.build.some((k) => p.toLowerCase().includes(k)),
        );

        if (researchParts.length > 0 && decideParts.length > 0 && buildParts.length > 0) {
          return {
            researchTopics: researchParts,
            decideTask: decideParts[0],
            buildTask: buildParts[0],
          };
        }
      }

      // Fallback: use the whole description split into 3 phases
      return {
        researchTopics: ["research phase"],
        decideTask: "analyze and decide",
        buildTask: "build output",
      };
    }

    return null;
  }

  /** Extract subtasks from a description by splitting on clear boundaries. */
  private extractSubtasks(description: string): string[] {
    // Split on numbered lists, bullet points, or "then"/"and then"
    const lines = description.split(/\n/).filter((l) => l.trim());

    if (lines.length > 1) {
      return lines.map((l) => l.replace(/^\s*[-*•\d.]+\s*/, "").trim()).filter(Boolean);
    }

    // Split on "then" / "and" for simple sentences
    const parts = description.split(/\b(?:then|and then|after that|next|finally)\b/i);
    if (parts.length > 1) {
      return parts.map((p) => p.trim()).filter(Boolean);
    }

    return [description];
  }

  /** Build a WorkflowGraph from the classification. */
  buildGraph(
    classification: TaskClassification,
    taskDescription: string,
    _lessons: HindsightLesson[],
  ): WorkflowGraph {
    const { pattern, subtasks } = classification;

    // Get available agents
    const agents = this.registry?.getAll() ?? [];

    switch (pattern) {
      case "sequential":
      case "pipeline":
        return this.buildSequential(subtasks, agents, taskDescription);
      case "parallel":
        return this.buildParallel(subtasks, agents, taskDescription);
      case "router":
        return this.buildRouter(subtasks, agents, taskDescription);
      case "hierarchical":
        return this.buildHierarchical(subtasks, agents, taskDescription);
      case "auto":
      default:
        // Auto: parallel if multiple independent subtasks, else sequential
        if (subtasks.length > 2) {
          return this.buildParallel(subtasks, agents, taskDescription);
        }
        return this.buildSequential(subtasks, agents, taskDescription);
    }
  }

  private buildSequential(
    subtasks: string[],
    agents: RegisteredAgent[],
    _taskDescription: string,
  ): WorkflowGraph {
    const agentConfigs = subtasks.map((task, i) => {
      const agent = this.selectAgent(agents, task);
      return {
        name: agent?.name ?? `step-${i + 1}`,
        prompt: task,
        model: agent?.model,
      };
    });
    return WorkflowBuilder.pipeline("sequential", agentConfigs);
  }

  private buildParallel(
    subtasks: string[],
    agents: RegisteredAgent[],
    _taskDescription: string,
  ): WorkflowGraph {
    const workers = subtasks.map((task, i) => {
      const agent = this.selectAgent(agents, task);
      return {
        name: agent?.name ?? `worker-${i + 1}`,
        prompt: task,
        model: agent?.model,
      };
    });
    return WorkflowBuilder.fanOutFanIn("parallel", workers);
  }

  private buildRouter(
    subtasks: string[],
    agents: RegisteredAgent[],
    _taskDescription: string,
  ): WorkflowGraph {
    const b = new WorkflowBuilder();
    b.route("classifier", {
      routeFn: async () => subtasks[0] ?? "default",
    });
    for (const task of subtasks) {
      const agent = this.selectAgent(agents, task);
      b.routeTo(task, {
        name: agent?.name ?? task.slice(0, 30),
        prompt: task,
        model: agent?.model,
      });
    }
    return b.build();
  }

  private buildHierarchical(
    subtasks: string[],
    agents: RegisteredAgent[],
    taskDescription: string,
  ): WorkflowGraph {
    // Research phase → decision → build
    if (subtasks.length >= 3) {
      const researchTopics = subtasks.slice(0, -2);
      const deciderTask = subtasks[subtasks.length - 2];
      const buildTask = subtasks[subtasks.length - 1];
      const deciderAgent = this.selectAgent(agents, deciderTask);
      const builderAgent = this.selectAgent(agents, buildTask);

      return WorkflowBuilder.researchDecideBuild(
        "hierarchical",
        researchTopics,
        { name: deciderAgent?.name ?? "decider", prompt: deciderTask },
        { name: builderAgent?.name ?? "builder", prompt: buildTask },
      );
    }
    // Fallback to sequential
    return this.buildSequential(subtasks, agents, taskDescription);
  }

  /** Select the best agent for a task from the registry. */
  private selectAgent(agents: RegisteredAgent[], task: string): RegisteredAgent | undefined {
    if (agents.length === 0) {
      return undefined;
    }

    const lower = task.toLowerCase();
    let best: RegisteredAgent | undefined;
    let bestScore = -1;

    for (const agent of agents) {
      let score = 0;
      for (const cap of agent.capabilities) {
        if (lower.includes(cap.name.toLowerCase())) {
          score += cap.strength;
        }
      }
      // Prefer lower cost
      if (agent.costTier === "low") {
        score += 0.1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = agent;
      }
    }

    return best;
  }

  /** Build reasoning string for the plan. */
  private buildReasoning(
    classification: TaskClassification,
    lessons: HindsightLesson[],
    hindsightContext = "",
  ): string {
    const parts = [classification.reasoning];

    if (classification.subtasks.length > 1) {
      parts.push(`Decomposed into ${classification.subtasks.length} subtasks`);
    }

    if (lessons.length > 0) {
      parts.push(`Informed by ${lessons.length} hindsight lesson(s)`);
      const topLesson = lessons[0];
      parts.push(
        `Top lesson: "${topLesson.lesson}" (confidence: ${topLesson.confidence.toFixed(2)})`,
      );
    }

    if (hindsightContext) {
      parts.push(`Hindsight context available (${hindsightContext.length} chars)`);
    }

    return parts.join(". ");
  }
}
