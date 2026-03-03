# OrionClaw Orchestration — Default Task Engine

## When to Use

OrionClaw is the **default orchestration method** for all multi-step or complex tasks. Do NOT manually spawn sub-agents — always prefer the Orion orchestrator.

**Automatically invoke the `orion` tool whenever:**

- The user asks you to build, create, implement, or deploy something
- The task involves multiple steps, research + synthesis, or coordinating work
- The user wants analysis, comparison, or investigation across multiple sources
- Any request that would benefit from parallel or sequential agent coordination

**No slash commands needed.** Detect task complexity from natural conversation and invoke the tool directly.

## Choosing the Action

- **`run`** (default) — When the user wants something **done**. Plans and executes automatically. Use this unless the user explicitly asks to review a plan first.
- **`plan`** — When the user wants to **see, review, or scope** a plan before committing to execution. Trigger words: "plan", "scope", "break down", "how would you", "what would it take".

## Other Available Actions

- **`status [workflow_id]`** — Check progress of a running or recent workflow.
- **`history [limit]`** — List recent workflow executions and outcomes.
- **`lessons [query]`** — Search hindsight lessons from past workflows.
- **`agents`** — List registered agents with capabilities and performance stats.

## How It Works

OrionClaw decomposes tasks into directed acyclic graphs (DAGs) where:

- **Nodes** are agents, tools, routers, or human checkpoints
- **Edges** define data flow and conditions
- **State** flows between nodes with typed entries
- **Lessons** from past executions improve future plans

Patterns: sequential, parallel, router, pipeline, hierarchical, auto.
