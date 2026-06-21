# Skill Registry — polycyes

Generated: 2026-06-18

## Project Conventions

### Source Files
- `PRD.md` — Product Requirements Document (2055 lines, v0.1 spec-ready)
- `AGENTS.md` — Not found (no agent config in project root)

Key conventions:
- ESM (`"type": "module"`), .js extensions in imports
- TypeScript strict mode, bundler module resolution
- JSDoc on all public APIs
- types.ts: zero dependencies (foundation layer)
- Tests in vitest, describe/it/beforeEach pattern
- Helpers: perm(), role(), user(), resourceInstance()

---

## User Skills

| Skill | Trigger |
|-------|---------|
| branch-pr | Creating a PR, opening a PR, preparing changes for review |
| customize-opencode | Editing opencode's config: opencode.json, .opencode/, ~/.config/opencode/; creating agents, skills, MCP servers |
| defuddle | Extracting clean markdown from web pages (standard URLs, not .md files) |
| find-skills | "how do I do X", "find a skill for X", "is there a skill that can..." |
| go-testing | Writing Go tests, using teatest, adding test coverage (Go projects only) |
| issue-creation | Creating a GitHub issue, reporting a bug, requesting a feature |
| json-canvas | Working with .canvas files, visual canvases, mind maps, flowcharts (Obsidian) |
| judgment-day | "judgment day", "judgment-day", "review adversarial", "dual review", "doble review", "juzgar" |
| obsidian-bases | Working with .base files, table views, card views, filters, formulas (Obsidian) |
| obsidian-cli | Interacting with Obsidian vaults, managing notes, searching vault content |
| obsidian-markdown | Working with .md files in Obsidian, wikilinks, callouts, frontmatter |
| skill-creator | Creating a new skill, adding agent instructions, documenting patterns for AI |
| sdd-apply | Implementing tasks from a change (SDD orchestrator internal) |
| sdd-archive | Archiving a completed change (SDD orchestrator internal) |
| sdd-design | Creating technical design from proposals (SDD orchestrator internal) |
| sdd-explore | Investigating codebase, thinking through features (SDD orchestrator internal) |
| sdd-init | Bootstrapping SDD context in a project |
| sdd-onboard | Guided walkthrough of SDD workflow |
| sdd-propose | Creating change proposals (SDD orchestrator internal) |
| sdd-spec | Writing specifications with requirements and scenarios (SDD orchestrator internal) |
| sdd-tasks | Breaking down specs into implementation tasks (SDD orchestrator internal) |
| sdd-verify | Validating implementation against specs (SDD orchestrator internal) |

---

## Compact Rules

### branch-pr
- Issue-first enforcement: always ensure an issue exists before creating a PR
- PR title: `type(scope): short description` (conventional commits)
- PR body: Summary, Test plan, linked issue

### issue-creation
- Conventional issue templates: bug report or feature request
- Include: title, description, steps to reproduce (bugs), acceptance criteria (features)

### judgment-day
- Two independent blind judge sub-agents launched simultaneously
- Synthesize findings, apply fixes, re-judge until both pass or escalate after 2 iterations

### skill-creator
- Skills live in `~/.claude/skills/<skill-name>/SKILL.md`
- Frontmatter: name, description, trigger, allowed-tools
