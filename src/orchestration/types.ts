/**
 * OrionClaw Orchestration Engine — Shared Types
 *
 * All enums, interfaces, and type aliases used across the orchestration layer.
 */

// ── Enums ──────────────────────────────────────────────────────────────────

export enum NodeType {
  AGENT = 'AGENT',
  TOOL = 'TOOL',
  ROUTER = 'ROUTER',
  PARALLEL = 'PARALLEL',
  JOIN = 'JOIN',
  SUBGRAPH = 'SUBGRAPH',
  HUMAN = 'HUMAN',
  REDUCER = 'REDUCER',
}

export enum EdgeCondition {
  ALWAYS = 'ALWAYS',
  ON_SUCCESS = 'ON_SUCCESS',
  ON_FAILURE = 'ON_FAILURE',
  CONDITIONAL = 'CONDITIONAL',
}

export enum NodeStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
  WAITING_HUMAN = 'WAITING_HUMAN',
}

export enum ImplicitSignal {
  TASK_COMPLETED = 'TASK_COMPLETED',
  ABANDONED = 'ABANDONED',
  RESTARTED = 'RESTARTED',
  EDITED = 'EDITED',
  ACCEPTED = 'ACCEPTED',
  RESPONSE_TIME = 'RESPONSE_TIME',
}

export enum FeedbackCategory {
  ACCURACY = 'ACCURACY',
  SPEED = 'SPEED',
  QUALITY = 'QUALITY',
  RELEVANCE = 'RELEVANCE',
  CREATIVITY = 'CREATIVITY',
  THOROUGHNESS = 'THOROUGHNESS',
}

// ── Graph ──────────────────────────────────────────────────────────────────

export interface Edge {
  source: string;
  target: string;
  condition: EdgeCondition;
  label?: string;
  conditionFn?: (result: NodeResult) => boolean;
}

export interface Node {
  id: string;
  type: NodeType;
  name: string;
  prompt?: string;
  model?: string;
  tools?: string[];
  agentName?: string;
  dependsOn?: string[];
  subgraph?: WorkflowGraphData;
  config?: Record<string, unknown>;
  toolFn?: (input: Record<string, unknown>, state: Record<string, unknown>) => Promise<unknown>;
  routeFn?: (predecessorResults: Map<string, NodeResult>) => Promise<string>;
  timeoutMs?: number;
}

export interface WorkflowGraphData {
  nodes: Node[];
  edges: Edge[];
  metadata?: Record<string, unknown>;
}

// ── Execution ──────────────────────────────────────────────────────────────

export interface NodeResult {
  nodeId: string;
  status: NodeStatus;
  output?: unknown;
  error?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  tokenUsage?: { input: number; output: number };
  sessionKey?: string;
}

export type ExecutionEventType =
  | 'node_started'
  | 'node_completed'
  | 'node_failed'
  | 'workflow_started'
  | 'workflow_completed'
  | 'workflow_failed'
  | 'human_approval_requested'
  | 'human_approval_received';

export interface ExecutionEvent {
  timestamp: string;
  nodeId?: string;
  type: ExecutionEventType;
  data?: Record<string, unknown>;
}

export interface ExecutionTrace {
  workflowId: string;
  graph: WorkflowGraphData;
  events: ExecutionEvent[];
  results: Record<string, NodeResult>;
  state: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  totalTokens?: { input: number; output: number };
}

// ── State ──────────────────────────────────────────────────────────────────

export type StateEntryType = 'input' | 'output' | 'decision' | 'artifact' | 'intermediate' | 'error';
export type StateTTL = 'workflow' | 'persistent' | 'ephemeral';

export interface StateEntry {
  key: string;
  value: unknown;
  producer: string;
  type: StateEntryType;
  ttl: StateTTL;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface WorkflowStateData {
  entries: Record<string, StateEntry>;
  history: Array<{ key: string; value: unknown; producer: string; timestamp: string }>;
}

// ── Memory ─────────────────────────────────────────────────────────────────

export type LessonType = 'outcome' | 'process' | 'strategic';

export interface HindsightLesson {
  id: string;
  taskPattern: string;
  lesson: string;
  confidence: number;
  type: LessonType;
  appliesTo: string[];
  createdAt: string;
  lastUsed?: string;
  decayRate: number;
}

export interface FactRecord {
  id: string;
  fact: string;
  source: string;
  confidence: number;
  createdAt: string;
}

export interface AgentPerformanceRecord {
  agentName: string;
  totalTasks: number;
  successRate: number;
  avgDurationMs: number;
  avgTokens: number;
  lastUsed: string;
  taskTypes: Record<string, number>;
}

// ── Feedback ───────────────────────────────────────────────────────────────

export interface ImplicitFeedback {
  signal: ImplicitSignal;
  workflowId: string;
  nodeId?: string;
  value?: number;
  timestamp: string;
}

export interface InlineReaction {
  category: FeedbackCategory;
  positive: boolean;
  workflowId: string;
  nodeId?: string;
  comment?: string;
  timestamp: string;
}

export interface UnifiedFeedbackData {
  workflowId: string;
  implicit: ImplicitFeedback[];
  inline: InlineReaction[];
  reflection?: string;
  collectedAt: string;
}

// ── Agents ─────────────────────────────────────────────────────────────────

export interface AgentCapability {
  name: string;
  description: string;
  strength: number;
}

export interface RegisteredAgent {
  name: string;
  description: string;
  model: string;
  capabilities: AgentCapability[];
  tools?: string[];
  maxConcurrent?: number;
  costTier?: 'low' | 'medium' | 'high';
}

// ── Planner ────────────────────────────────────────────────────────────────

export type OrchestrationPattern = 'sequential' | 'parallel' | 'router' | 'pipeline' | 'hierarchical' | 'auto';

export interface OrchestrationPlan {
  pattern: OrchestrationPattern;
  graph: WorkflowGraphData;
  reasoning: string;
  estimatedCost?: number;
  estimatedDurationMs?: number;
}

// ── Config ─────────────────────────────────────────────────────────────────

export interface OrionClawConfig {
  enabled: boolean;
  defaultModel?: string;
  plannerModel?: string;
  hindsightModel?: string;
  maxWorkflowDepth?: number;
  maxConcurrentWorkflows?: number;
  feedbackSampleRate?: number;
  agents?: RegisteredAgent[];
  dataDir?: string;
}
