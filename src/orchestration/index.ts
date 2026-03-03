/**
 * OrionClaw Orchestration Engine — Barrel Exports
 */

// Types (includes HindsightConfig)
export * from "./types.js";

// Graph
export { WorkflowGraph } from "./graph/workflow-graph.js";
export { WorkflowBuilder } from "./graph/builder.js";
export { GraphExecutor } from "./graph/executor.js";
export type { AgentBridge, ExecutorOptions } from "./graph/executor.js";

// State
export { WorkflowState } from "./state/workflow-state.js";
export { ContextAssembler } from "./state/context-assembler.js";
export type { MemoryProvider, LessonProvider } from "./state/context-assembler.js";

// Integration
export { OpenClawBridge } from "./integration/openclaw-bridge.js";
export type { SpawnFn, OpenClawBridgeOptions } from "./integration/openclaw-bridge.js";
export { buildWorkflowPromptSection, isWorkflowSession } from "./integration/system-prompt-hook.js";
export type { WorkflowPromptContext } from "./integration/system-prompt-hook.js";
export { generateDashboardHtml } from "./integration/canvas-dashboard.js";
export type { DashboardState } from "./integration/canvas-dashboard.js";

// Memory
export { HindsightApiClient } from "./memory/hindsight-api.js";
export type {
  HindsightMemoryItem,
  HindsightRecallOptions,
  HindsightBank,
} from "./memory/hindsight-api.js";
export { HindsightProcessor } from "./memory/hindsight.js";
export type { HindsightProcessorOptions } from "./memory/hindsight.js";
export { HindsightMemoryProvider } from "./memory/hindsight-memory-provider.js";

// Feedback
export { ImplicitFeedbackCollector } from "./feedback/implicit.js";
export { InlineFeedbackCollector } from "./feedback/inline.js";
export { ReflectionFeedbackCollector } from "./feedback/reflection.js";

// Agents
export { AgentRegistry } from "./agents/registry.js";

// Planner
export { Planner } from "./planner/planner.js";
export type { TaskType } from "./planner/planner.js";

// Tool
export { createOrionTool } from "./tool/orion-tool.js";
export type { OrionToolOptions } from "./tool/orion-tool.js";
