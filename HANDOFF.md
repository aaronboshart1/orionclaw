# OrionClaw — Handoff Document

_Last updated: 2026-03-02 21:16 CST_

## What Is OrionClaw

A fork of OpenClaw (`aaronboshart1/orionclaw`) with a graph-based multi-agent orchestration engine. Additive layer — does not modify upstream OpenClaw internals beyond fork-level integration points.

## Current Status: ✅ Multi-Agent DAG Execution Working

The orchestration engine is **production-functional**. First successful fan-out run completed March 2 2026:

- 7-node DAG (4 parallel research workers + 1 reducer)
- 5 subagents spawned via GraphExecutor → OpenClawBridge
- All completed cleanly, ~3.5 minutes wall time
- Planner correctly classifies fan-out, research-decide-build, and pipeline patterns
- Engine rated **9/10**

## Architecture

### Orchestration Engine (`src/orchestration/`)

18 source files, 77 tests passing:

| Component               | File                                     | Purpose                                                                               |
| ----------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| Types                   | `types.ts`                               | All orchestration types (WorkflowNode, OrchestrationPlan, ExecutionTrace, etc.)       |
| WorkflowGraph           | `graph/workflow-graph.ts`                | DAG with Kahn topological sort, parallel layer detection                              |
| WorkflowBuilder         | `graph/workflow-builder.ts`              | Fluent builder: pipeline, fanOutFanIn, researchDecideBuild patterns                   |
| WorkflowState           | `state/workflow-state.ts`                | Tracks node status, results, timing                                                   |
| ContextAssembler        | `context/context-assembler.ts`           | Builds prompts with memory + lessons (maxTokenBudget, memoryProvider, lessonProvider) |
| GraphExecutor           | `execution/graph-executor.ts`            | Walks layers via Promise.allSettled, spawns via bridge                                |
| OpenClawBridge          | `integration/openclaw-bridge.ts`         | SpawnFn injection, maps graph nodes to sessions_spawn calls                           |
| HindsightProcessor      | `hindsight/hindsight-processor.ts`       | Rule-based lesson extraction, retains to Hindsight API + local JSONL                  |
| HindsightApiClient      | `hindsight/hindsight-api-client.ts`      | Native fetch client for Hindsight REST API                                            |
| HindsightMemoryProvider | `hindsight/hindsight-memory-provider.ts` | Implements MemoryProvider for recall                                                  |
| Feedback Collectors     | `feedback/`                              | 3 collectors for execution feedback                                                   |
| AgentRegistry           | `registry/agent-registry.ts`             | Registered agents with capabilities                                                   |
| Planner                 | `planner/planner.ts`                     | Task classification with keyword/pattern heuristics                                   |
| Orion Tool              | `tool/orion-tool.ts`                     | Native agent tool: plan, run, status, history, lessons, agents                        |
| System Prompt Hook      | `hooks/system-prompt-hook.ts`            | Injects orchestration context                                                         |
| Canvas Dashboard        | `canvas/canvas-dashboard.ts`             | Real-time progress visualization                                                      |

### Integration Points

- **Tool registration**: `src/agents/tools/openclaw-tools.ts` — orion tool registered alongside sessions-spawn, browser, canvas
- **Slash command**: `src/auto-reply/commands-registry.data.ts` — `/orion` as native command
- **SpawnFn**: `spawnSubagentDirect` injected from session context
- **Barrel exports**: `src/orchestration/index.ts`

### Key Config

- `~/.orionclaw/orionclaw.json` — no `agents.defaults.models` key = allowAny (all models permitted)
- Bridge default model: `anthropic/claude-sonnet-4-6` (must match gateway-allowed models)
- Hindsight URL: `http://10.0.0.13:8888` (Kali VM)
- Hindsight banks: `project-orionclaw`, `jarvis-core`, `infra`

## Infrastructure

### VM 106 (OrionClaw Runtime)

- **IP**: 10.0.0.16 (LAN), 100.84.211.32 (Tailscale)
- **OS**: Ubuntu 24.04, 4 cores, 8GB RAM, 64GB disk
- **Credentials**: root/lanparty, service user orionclaw/lanparty
- **Source**: `/opt/orionclaw` (git clone, pnpm build, npm link → /usr/bin/orionclaw)
- **Service**: `systemctl --user restart orionclaw-gateway` (port 18789, --verbose)
- **Config**: `~/.orionclaw/orionclaw.json`
- **Workspace**: `~/.orionclaw/workspace/`
- **⚠️ Cannot push to GitHub** — no SSH keys, HTTPS returns 403

### Kali VM 103 (Development)

- **IP**: 10.0.0.13 (LAN), 100.120.170.28 (Tailscale)
- **Source**: `/home/kali/orionclaw` (git clone, SSH auth configured)
- **GitHub**: Push works via SSH as aaronboshart1
- **Hindsight**: Docker container at localhost:8888

## Known Issues

1. **VM 106 can't push to GitHub** — needs SSH key setup or gh auth
2. **Bridge defaultModel and orion-tool details field revert on rebase** — fixes are made on VM but subagent commits from Kali don't include them. Always fix in Kali repo first.
3. **Lesson extraction post-execution** — HindsightProcessor.processTrace() is wired but not yet verified firing in production runs
4. **Worker progress JSONL** — bridge injects instructions but workers may not follow them consistently

## Git History (key commits)

- `9d8d339` — feat(orchestration): improve planner heuristics, worker progress, lesson extraction
- `ad4424b` — feat(orchestration): create orion-tool for native agent integration
- Earlier: full rebrand (324 files), orchestration engine (18 files), Hindsight integration, unit tests

## Next Steps

1. Set up GitHub SSH keys on VM 106
2. Verify HindsightProcessor lesson extraction fires post-execution
3. Add Canvas dashboard for real-time progress visualization
4. Test researchDecideBuild pattern (3-phase hierarchical DAG)
5. Tune system prompt so agent defaults to `/orion run` for complex tasks
6. Push VM-local commits to GitHub from Kali
