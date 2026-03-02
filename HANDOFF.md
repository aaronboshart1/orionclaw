# OrionClaw — Project Handoff

> A graph-based multi-agent orchestration engine, forked from OpenClaw.
> Another agent picking this up should read this document top-to-bottom before writing any code.

---

## 1. What Is This?

OrionClaw forks [OpenClaw](https://github.com/openclaw/openclaw) (v2026.2.27, ~240k lines TypeScript) to add a **graph-based orchestration layer** on top of its existing multi-channel agent runtime.

The goal: replace OpenClaw's implicit, prompt-driven orchestration with a structured system where workflows are directed acyclic graphs, agents are nodes, data flows through typed state, and the system learns from every execution via hindsight memory and feedback loops.

**Think of it as:** OpenClaw handles channels, gateway, tools, and individual agent sessions. OrionClaw adds the "brain" that decides _which_ agents to run, _in what order_, _with what context_, and _learns_ from the results.

---

## 2. Repository & Infrastructure

### 2.1 Git

- **Origin:** `git@github.com:aaronboshart1/orionclaw.git`
- **Upstream:** `https://github.com/openclaw/openclaw.git` (for pulling upstream updates)
- **Local working copy:** `/home/kali/orionclaw` (on Kali VM 103)
- **Forked:** March 2, 2026 from openclaw/openclaw

### 2.2 Rebranding Status (Completed March 2, 2026)

The codebase has been rebranded from OpenClaw → OrionClaw:

- [x] `openclaw.mjs` → `orionclaw.mjs` (entry point)
- [x] `package.json` — name, bin, repository, homepage, bugs
- [x] CLI command: `openclaw` → `orionclaw` throughout src/
- [x] Config paths: `~/.openclaw/` → `~/.orionclaw/` throughout src/
- [x] systemd service: `openclaw-gateway` → `orionclaw-gateway`
- [x] Docker files updated
- [x] README, CONTRIBUTING, VISION, all docs rebranded
- [x] GitHub URLs → `aaronboshart1/orionclaw`

### 2.3 Deployment Target

- **VM 106** on Proxmox (10.0.0.100)
- **IP:** 10.0.0.16
- **OS:** Ubuntu 24.04.4 LTS
- **Specs:** 4 cores, 8GB RAM, 64GB disk
- **User:** root / lanparty
- **Deployment in progress** — Node.js 22, pnpm, build from source, systemd service

---

## 3. What Already Exists

### 3.1 OpenClaw (Upstream — Do Not Modify These)

These layers are **kept unchanged**:

| Layer             | Location                                                                                                    | Purpose                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Gateway           | `src/gateway/`                                                                                              | WebSocket control plane (`ws://127.0.0.1:18789`)                                          |
| Channel Adapters  | `src/telegram/`, `src/discord/`, `src/slack/`, `src/whatsapp/`, `src/signal/`, `src/imessage/`, `src/line/` | Multi-channel message routing                                                             |
| Agent Runtime     | `src/agents/pi-embedded-runner/`                                                                            | Runs Claude agents with tools, manages conversation turns                                 |
| System Prompt     | `src/agents/system-prompt.ts`                                                                               | Builds the system prompt for each agent session — **we extend this**                      |
| Session Spawn     | `src/agents/tools/sessions-spawn-tool.ts` + `src/agents/subagent-spawn.ts`                                  | Creates sub-agent sessions — **this is our primary dispatch mechanism**                   |
| Subagent Registry | `src/agents/subagent-registry*.ts`                                                                          | Tracks active/completed sub-agents                                                        |
| Skills            | `src/agents/skills*.ts`                                                                                     | Loads workspace skills into agent context                                                 |
| Canvas/A2UI       | `src/canvas-host/`, `vendor/a2ui/`                                                                          | Renders rich HTML in conversation — **we use this for dashboards**                        |
| Lobster           | `extensions/lobster/`                                                                                       | Deterministic pipeline engine (pipe syntax, approval gates) — **coexists with OrionClaw** |
| Config            | `src/config/`                                                                                               | `orionclaw.json` loading — **we add an `orchestration` section**                          |
| CLI               | `src/cli/`, `src/commands/`                                                                                 | Terminal interface                                                                        |

### 3.2 OrionClaw Orchestration Code (Designed, Needs Implementation)

Five TypeScript files were designed for `src/orchestration/`. They need to be created on the server and completed. The designs are structurally complete but the executor, bridge, memory, feedback, and planner need to be built.

#### `src/orchestration/types.ts` (292 lines) — DESIGNED

All shared types for the orchestration engine:

```
Enums: NodeType, EdgeCondition, NodeStatus, ImplicitSignal, FeedbackCategory
Graph: Edge, Node, WorkflowGraphData
Exec: NodeResult, ExecutionEvent, ExecutionTrace
State: StateEntry, WorkflowStateData (types: StateEntryType, StateTTL)
Memory: HindsightLesson, FactRecord, AgentPerformanceRecord (type: LessonType)
Feedback: ImplicitFeedback, InlineReaction, UnifiedFeedbackData
Agents: AgentCapability, RegisteredAgent
Planner: OrchestrationPlan (type: OrchestrationPattern)
Config: OrionClawConfig
```

Key `Node` interface fields: `id`, `type` (AGENT|TOOL|ROUTER|PARALLEL|JOIN|SUBGRAPH|HUMAN|REDUCER), `name`, `prompt`, `model`, `tools`, `agentName`, `dependsOn`, `subgraph`, `config`.

Key `NodeType` values: `AGENT` = LLM agent, `TOOL` = deterministic function, `ROUTER` = conditional branch, `PARALLEL` = fan-out marker, `JOIN` = wait-for-all, `REDUCER` = merge parallel outputs, `HUMAN` = approval gate, `SUBGRAPH` = nested workflow.

#### `src/orchestration/graph/workflow-graph.ts` (227 lines) — DESIGNED

The `WorkflowGraph` class. Core data structure for workflow definitions.

**Methods:**

- `addNode(node)` / `addEdge(edge)` — Build the graph
- `getSuccessors(nodeId)` / `getPredecessors(nodeId)` — Traverse edges
- `getEntryNodes()` — Nodes with no incoming edges
- `getTerminalNodes()` — Nodes with no outgoing edges
- `topologicalSort()` — Dependency-ordered node list (Kahn's algorithm)
- `validate()` — Returns error strings for: missing edge targets, unreachable nodes, cycles, no entry nodes
- `getParallelLayers()` — Groups nodes by dependency depth for concurrent execution
- `toJSON()` / `fromJSON()` — Serialization

#### `src/orchestration/graph/builder.ts` (347 lines) — DESIGNED

Fluent `WorkflowBuilder` API for constructing graphs without manually wiring edges.

**Fluent methods (chainable):**

- `agent(name, { prompt, model, tools, agentName })` — Add LLM agent node, auto-chains to previous
- `tool(name, { toolFn, tools })` — Add deterministic tool node
- `parallel(...branchFns)` — Fan-out to parallel branches, auto-creates JOIN + REDUCER
- `route(name, { routeFn })` — Add conditional routing node
- `routeTo(targetName, nodeConfig)` — Define a routing target
- `humanGate(name, prompt)` — Add human approval checkpoint
- `subgraph(name, builderFn)` — Nest a sub-workflow
- `edge(source, target, condition, label)` — Explicit custom edge
- `build()` — Validates and returns `WorkflowGraph`

**Pre-built pattern helpers (static):**

- `pipeline(name, agents[])` — Sequential A → B → C
- `fanOutFanIn(name, workers[], reducer)` — Parallel fan-out → join → reduce
- `researchDecideBuild(name, topics[], decider, builder)` — Multi-research → decide → human gate → build

#### `src/orchestration/state/workflow-state.ts` (152 lines) — DESIGNED

Per-workflow key-value state store with typed entries.

**Methods:**

- `put(key, value, producer, entryType, ttl)` — Write state
- `get(key)` / `getEntry(key)` / `has(key)` — Read
- `getByProducer(producer)` — All entries written by a specific agent
- `getByType(entryType)` — All entries of a given type
- `getPersistable()` — Entries marked `ttl: 'persistent'` for long-term storage
- `getSummary(maxChars)` — Condensed text summary for prompt injection
- `getHistory()` — Full append-only changelog
- `toJSON()` / `fromJSON()` — Serialization

#### `src/orchestration/state/context-assembler.ts` (188 lines) — DESIGNED

Builds tailored prompt context for each agent node, pulling from state + memory + lessons.

**Methods:**

- `buildContext(agentConfig, taskDescription, predecessorResults)` — Full context assembly with priority ordering:
  1. Hindsight lessons from similar tasks (via `LessonProvider` interface)
  2. Direct dependency outputs (predecessor agent results)
  3. Decisions + artifacts from state
  4. Relevant long-term memory (via `MemoryProvider` interface)
  5. General workflow state summary (fills remaining token budget)
- `buildMinimalContext(dependsOn)` — Lightweight context for routers/tools

**Interfaces to implement:**

- `MemoryProvider { recall(query, maxTokens): Promise<string> }`
- `LessonProvider { search(taskDescription): Promise<HindsightLesson[]> }`

---

## 4. What Needs To Be Built

### Priority order — build these sequentially, each depends on the previous:

### 4.1 Graph Executor (`src/orchestration/graph/executor.ts`) — HIGH PRIORITY

The heart of the system. Walks a `WorkflowGraph` and executes nodes.

**Requirements:**

- Accept a `WorkflowGraph` + initial input + `WorkflowState` instance
- Process nodes in topological order from `getParallelLayers()`
- For each layer, execute all nodes concurrently
- Node type dispatch:
  - `AGENT` → Call the OpenClaw bridge (see 4.2) to spawn a session
  - `TOOL` → Execute the `toolFn` directly
  - `ROUTER` → Evaluate `routeFn` with predecessors' outputs, follow matching edge
  - `PARALLEL` → Fan-out marker (no-op, proceed to successors)
  - `JOIN` → Wait for all predecessors to complete
  - `REDUCER` → Run a merge/synthesis agent on all predecessor outputs
  - `HUMAN` → Pause execution, emit approval request, resume on approval
  - `SUBGRAPH` → Recursively execute the nested `WorkflowGraph`
- Write each node's result to `WorkflowState`
- Build context for each agent node using `ContextAssembler.buildContext()`
- Emit `ExecutionEvent` objects for observability
- Build an `ExecutionTrace` when workflow completes
- Handle timeouts per-node and per-workflow
- Handle errors: mark node as FAILED, check for fallback edges

### 4.2 OpenClaw Bridge (`src/orchestration/integration/openclaw-bridge.ts`) — HIGH PRIORITY

Maps graph AGENT nodes to OpenClaw `sessions_spawn` calls.

**Requirements:**

- Import and call OpenClaw's `spawnSubagentDirect()` from `src/agents/subagent-spawn.ts`
- Map node config to spawn params (agentName→agentId, model, prompt+context→task, tools)
- Wait for spawned session to complete, capture output
- Handle spawn errors (forbidden, depth limit, timeout)
- Use `mode: 'run'` (one-shot, waits for completion)

**Important:** OpenClaw has a `maxSpawnDepth` limit (currently 2). Orchestrator = depth 1, workers = depth 2.

### 4.3 Hindsight Processor (`src/orchestration/memory/hindsight.ts`) — MEDIUM PRIORITY

Runs after each workflow completes. Extracts lessons from `ExecutionTrace`.

- Call Haiku 4.5 to analyze trace and extract lessons
- Each lesson: `taskPattern`, `lesson`, `confidence` (0-1), `type` (outcome|process|strategic), `appliesTo`
- Store as JSONL at `~/.orionclaw/workspace/orchestration/lessons.jsonl`
- Implement `LessonProvider` interface
- Apply confidence decay (default 0.05/day); prune below 0.1

### 4.4 Feedback Collectors (`src/orchestration/feedback/`) — MEDIUM PRIORITY

Three channels normalizing into `UnifiedFeedbackData`:

- **Implicit** — auto-tracked signals (task_completed, abandoned, restarted, edited, accepted, response_time)
- **Inline** — optional 👍/👎 reaction buttons per category (accuracy, speed, quality, relevance, creativity, thoroughness)
- **Reflection** — at configurable sample rate (default 10%), ask open-ended "How did that go?"

### 4.5 Agent Registry (`src/orchestration/agents/registry.ts`) — MEDIUM PRIORITY

- Load agent definitions from `config.orchestration.agents`
- `matchCapabilities(requiredCapabilities[])` → ranked agent list
- Track per-agent stats: `AgentPerformanceRecord`
- Stats at `~/.orionclaw/workspace/orchestration/agent-stats.json`

### 4.6 Planner (`src/orchestration/planner/planner.ts`) — MEDIUM PRIORITY

- Accept natural language task description
- Classify task type (research, coding, writing, analysis, mixed)
- Select orchestration pattern: sequential, parallel, router, pipeline, hierarchical, auto
- Factor in hindsight lessons for similar tasks
- Decompose into `WorkflowGraph` using `WorkflowBuilder`
- Use Haiku 4.5 for classification/decomposition

### 4.7 System Prompt Integration (`src/orchestration/integration/system-prompt-hook.ts`) — LOW PRIORITY

- Hook into `src/agents/system-prompt.ts`
- When agent runs as part of OrionClaw workflow, inject workflow context, instructions, lessons, predecessor outputs
- **Be surgical** — add extension point, don't rewrite

### 4.8 Canvas Dashboard (`src/orchestration/integration/canvas-dashboard.ts`) — LOW PRIORITY

- Live workflow visualization HTML
- Node status colors, edge flow indicators, timing, token usage
- Update on each `ExecutionEvent`

### 4.9 Skill Implementation — LOW PRIORITY

- `skills/orionclaw/SKILL.md` exposing `/orion` commands
- Commands: `plan`, `run`, `status`, `history`, `lessons`, `agents`

---

## 5. Architecture Decisions (Already Made)

### 5.1 Integration Strategy

OrionClaw is an **additive layer** — it doesn't replace any OpenClaw internals. It uses OpenClaw's existing primitives (`sessions_spawn`, `sessions_send`, Canvas, workspace files) as its runtime.

- OpenClaw updates can be merged with minimal conflicts
- Orchestration layer can be disabled via `config.orchestration.enabled = false`
- Lobster coexists — use Lobster for deterministic pipelines, OrionClaw for adaptive multi-agent workflows

### 5.2 Cost Model

| Component                    | Model                   | Why                                                   |
| ---------------------------- | ----------------------- | ----------------------------------------------------- |
| Planner / Router / Hindsight | Haiku 4.5 API           | Cheap (~$0.25/M input), fast, good for classification |
| Orchestrator                 | SDK on Max subscription | Manages graph execution, needs tools                  |
| Worker agents                | SDK on Max subscription | Actual task execution, full capability                |

### 5.3 State Flow

```
User Request
  ↓
[Planner] → classifies task, picks pattern, builds WorkflowGraph
  ↓
[GraphExecutor] → walks graph layer by layer
  ↓ (for each AGENT node)
[ContextAssembler] → builds tailored context from:
  - predecessors' outputs
  - workflow state (decisions, artifacts)
  - hindsight lessons for this task pattern
  - long-term memory
  ↓
[OpenClawBridge] → sessions_spawn(task=context+prompt, model=..., mode='run')
  ↓
[Agent completes] → result written to WorkflowState
  ↓
[All nodes done] → ExecutionTrace built
  ↓
[HindsightProcessor] → extracts lessons from trace
  ↓
[FeedbackCollector] → gathers implicit + optional inline feedback
  ↓
[Lessons stored] → available for next similar task
```

### 5.4 File Conventions

All runtime data at `~/.orionclaw/workspace/orchestration/`:

```
active/{workflow_id}/manifest.json        — Graph definition
active/{workflow_id}/state.json           — Live workflow state
active/{workflow_id}/execution-log.jsonl  — Append-only event stream
active/{workflow_id}/nodes/{node_id}.jsonl — Per-node logs
completed/{workflow_id}/                  — Archived workflows
lessons.jsonl                             — Hindsight lessons (persistent)
agent-stats.json                          — Agent performance metrics
```

---

## 6. Non-Obvious Gotchas

1. **Spawn depth limit**: OpenClaw enforces `maxSpawnDepth`. Orchestrator = depth 1, workers = depth 2. Workers cannot spawn sub-agents without bumping limit to 3.
2. **sessions_spawn is async**: Returns immediately with `status: 'accepted'`. Use `mode: 'run'` which blocks until completion.
3. **System prompt size**: OpenClaw already injects a large system prompt. Context assembler's token budget must account for this.
4. **Lobster coexistence**: Lobster = deterministic pipelines. OrionClaw = adaptive multi-agent workflows. Don't conflict.
5. **File-based state**: Write state to `~/.orionclaw/workspace/orchestration/` so the running agent can read it.
6. **Auth**: API key auth for cheap Haiku calls, Max subscription for worker agents.
7. **TypeScript strict mode**: ES modules with `.js` extensions in imports. Follow existing patterns.

---

## 7. Key Files to Study Before Coding

- `src/agents/subagent-spawn.ts` — How sub-agents are spawned
- `src/agents/tools/sessions-spawn-tool.ts` — Tool schema and execution flow
- `src/agents/subagent-registry.ts` — How spawned agents are tracked
- `src/agents/system-prompt.ts` — Where to hook in context injection
- `extensions/lobster/src/lobster-tool.ts` — Reference for how extensions work
- `src/agents/pi-embedded-runner/` — The actual agent execution runtime

---

## 8. Build Order

1. **Create orchestration source files** at `src/orchestration/` (types, graph, state, context-assembler)
2. **Graph Executor** (4.1) — can test with mock bridge
3. **OpenClaw Bridge** (4.2) — hooks executor to real `sessions_spawn`
4. **End-to-end test**: simple 2-node pipeline with real agents
5. **Hindsight Processor** (4.3)
6. **Feedback** (4.4) — start with implicit only
7. **Agent Registry** (4.5) + **Planner** (4.6) — enables automatic orchestration
8. **System Prompt Hook** (4.7) + **Dashboard** (4.8) + **Skill** (4.9) — polish

---

## 9. Current Status

- [x] Fork created: `aaronboshart1/orionclaw`
- [x] Full codebase rebrand (OpenClaw → OrionClaw)
- [x] HANDOFF.md with architecture spec
- [x] Hindsight bank `project-orionclaw` initialized
- [x] VM 106 created (10.0.0.16, Ubuntu 24.04, 4c/8G/64G)
- [ ] VM 106 deployment (Node.js, pnpm, build from source) — IN PROGRESS
- [x] Create orchestration source files (types.ts, workflow-graph.ts, builder.ts, workflow-state.ts, context-assembler.ts)
- [x] Build Graph Executor (graph/executor.ts — layer-by-layer execution, all 8 node types, timeouts, fallback edges)
- [x] Build OpenClaw Bridge (integration/openclaw-bridge.ts — maps to SpawnSubagentParams, mode:'run')
- [ ] End-to-end test with real agents
- [x] Hindsight Processor (memory/hindsight.ts — lesson extraction, confidence decay, JSONL persistence, LessonProvider)
- [x] Feedback Collectors (feedback/implicit.ts, inline.ts, reflection.ts — all three channels)
- [x] Agent Registry (agents/registry.ts — capability matching, performance tracking)
- [x] Planner (planner/planner.ts — task classification, pattern selection, graph building)
- [x] System Prompt Hook (integration/system-prompt-hook.ts — workflow context injection)
- [x] Canvas Dashboard (integration/canvas-dashboard.ts — live HTML visualization)
- [x] Skill (skills/orionclaw/SKILL.md — /orion commands)
- [x] Unit tests (46 passing — types, graph, builder, state, context-assembler, executor)
- [x] Barrel exports (index.ts)

---

## 10. For Contributing Agents

1. **Read this file first** — it's your map
2. **Don't modify upstream OpenClaw layers** — OrionClaw is additive
3. **Commit frequently** with clear messages
4. **Update this HANDOFF.md** as you complete tasks or make architecture decisions
5. **Retain findings to Hindsight** bank `project-orionclaw`
6. **Keep upstream mergeability** — prefer additive changes over destructive rewrites
7. **Follow TypeScript strict mode** — ES modules, `.js` extensions, no `any`
