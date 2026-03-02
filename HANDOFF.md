# OrionClaw — Project Handoff

## What Is OrionClaw?

OrionClaw is a **private fork of OpenClaw** (github.com/openclaw/openclaw) customized for Aaron's personal infrastructure. It's the same personal AI assistant platform but rebranded, reconfigured, and tailored for deployment on Aaron's Proxmox homelab.

## Repository

- **Origin:** `git@github.com:aaronboshart1/orionclaw.git`
- **Upstream:** `https://github.com/openclaw/openclaw.git` (for pulling upstream updates)
- **Local working copy:** `/home/kali/orionclaw`

## Project Goals

1. **Rebrand** OpenClaw → OrionClaw throughout the codebase (binary name, package name, config paths, docs, branding)
2. **Customize** default configuration for Aaron's infrastructure (Proxmox VMs, Tailscale network, Hindsight memory, multi-agent orchestration)
3. **Deploy** to a dedicated Proxmox VM following the same install pattern as OpenClaw (`npm install -g orionclaw && orionclaw onboard --install-daemon`)
4. **Maintain upstream compatibility** — ability to merge upstream OpenClaw updates into the fork

## Architecture (Inherited from OpenClaw)

- **Runtime:** Node.js ≥22, TypeScript (ESM)
- **Gateway:** Long-running daemon (systemd/launchd) that manages AI sessions, tool execution, and channel routing
- **Channels:** WhatsApp, Telegram, Discord, Slack, Signal, iMessage, WebChat, etc.
- **Models:** Multi-provider (Anthropic, OpenAI, Google, etc.) with failover
- **Skills:** Modular skill system (bundled + ClawHub)
- **Workspace:** `~/.orionclaw/workspace/` (was `~/.openclaw/workspace/`)
- **Config:** `~/.orionclaw/` (was `~/.openclaw/`)
- **Plugins/Extensions:** npm-based plugin system under `extensions/`

## Rebranding Scope

All references to `openclaw`/`OpenClaw` need to become `orionclaw`/`OrionClaw`:

### Critical (functional — affects runtime paths and commands)
- `package.json` — name, bin, repository, homepage, bugs
- `openclaw.mjs` → `orionclaw.mjs` (entry point)
- CLI command name: `openclaw` → `orionclaw`
- Config directory: `~/.openclaw/` → `~/.orionclaw/`
- Session/agent paths: `~/.openclaw/agents/` → `~/.orionclaw/agents/`
- Workspace: `~/.openclaw/workspace/` → `~/.orionclaw/workspace/`
- systemd service name: `openclaw-gateway` → `orionclaw-gateway`
- Docker image/compose references
- npm package name in `package.json` and any `pnpm-workspace.yaml` references

### Important (branding — affects UX and docs)
- README.md, CONTRIBUTING.md, VISION.md
- Docs under `docs/` — all references
- GitHub URLs: `openclaw/openclaw` → `aaronboshart1/orionclaw`
- Discord/community links (point to Aaron's own or remove)
- Logo/assets under `docs/assets/` and `assets/`
- License attribution (keep MIT, update copyright holder)

### Lower Priority (cosmetic)
- CHANGELOG.md header
- CI workflows under `.github/`
- Test fixtures and snapshots that reference `openclaw`
- Comments in source code

## Deployment Plan

Target: A new Proxmox VM on Aaron's homelab (10.0.0.x network)

### VM Setup
1. Create Ubuntu 24.04 VM on Proxmox (10.0.0.100)
2. Install Node.js 22+
3. Install OrionClaw: `npm install -g orionclaw` (from GitHub Packages or local build)
4. Run onboarding: `orionclaw onboard --install-daemon`
5. Configure channels (WhatsApp, WebChat)
6. Configure model providers (Anthropic)
7. Set up Tailscale for remote access
8. Point workspace files (SOUL.md, AGENTS.md, etc.) from current Kali setup

### Migration from Current Setup
- Current Jarvis runs on Kali VM 103 via OpenClaw
- OrionClaw VM will run alongside initially for testing
- Once stable, migrate workspace, channels, and Hindsight connection
- Kali VM returns to security tooling role

## Key Files

| File | Purpose |
|------|---------|
| `HANDOFF.md` | This file — project overview for agents |
| `CLAUDE.md` | AI agent coding guidelines (symlink to AGENTS.md) |
| `VISION.md` | Product vision and direction |
| `package.json` | Package manifest, version, deps |
| `openclaw.mjs` | CLI entry point (rename target) |
| `src/` | Core TypeScript source |
| `extensions/` | Channel plugins |
| `skills/` | Bundled skills |
| `docs/` | Documentation |
| `Swabble/` | Speech.framework wake-word daemon (macOS) |

## Current Status

- [x] Fork created: `aaronboshart1/orionclaw`
- [x] Local clone configured with upstream remote
- [x] HANDOFF.md created
- [x] Hindsight bank `project-orionclaw` initialized
- [x] Rebranding pass — critical (runtime paths, CLI name, config dirs) — 2026-03-02
- [x] Rebranding pass — branding (docs, README, URLs) — 2026-03-02
- [ ] Build and test on target VM
- [ ] Publish to GitHub Packages or build from source on target VM
- [ ] Create Proxmox VM for deployment
- [ ] Deploy and configure
- [ ] Migrate workspace and channels

## For Contributing Agents

1. **Read this file first** — it's your map
2. **Don't run/test on Kali** — this project targets a separate Proxmox VM
3. **Commit frequently** with clear messages
4. **Update this HANDOFF.md** as you complete tasks or make architecture decisions
5. **Retain findings to Hindsight** bank `project-orionclaw`
6. **Keep upstream mergeability** — prefer additive changes over destructive rewrites where possible
