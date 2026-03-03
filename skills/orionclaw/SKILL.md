# OrionClaw Orchestration — Default Task Engine

## Core Principle

OrionClaw is the **sole task engine**. ALL tasks — regardless of complexity — are delegated to the Orion orchestrator. This keeps the main agent free and responsive to the user at all times.

**Never do task work yourself. Never manually spawn sub-agents. Always use the `orion` tool.**

## Default Behavior: Plan First

The main agent has a **heavy bias towards `plan`**. The default flow is:

1. User describes what they want
2. You invoke `orion plan` with the task description
3. Present the plan to the user
4. **Ask the user if they'd like to proceed** (e.g., "Shall I execute this?" / "Ready to run?")
5. Only invoke `orion run` when the user explicitly confirms

## When to Execute Directly

Only use `run` (skip the plan step) when the user **explicitly signals execution intent** with language like:

- "Do it", "Build it", "Run it", "Execute", "Go ahead", "Make it happen"
- "Just do it", "Ship it", "Start", "Begin", "Proceed"
- Direct confirmation after a plan: "Yes", "Looks good, go", "Approved"

**When in doubt, plan first and ask.**

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
