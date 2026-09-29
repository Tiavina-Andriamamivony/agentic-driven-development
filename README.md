<p align="center">
  <img src="public/logo.png" alt="Lou Agents Orchestrator" width="140" />
</p>

<h1 align="center">Lou Agents Orchestrator</h1>

<p align="center">
  <strong>The governance layer for AI coding agents.</strong><br />
  Coding agents are fast. Lou makes them accountable — plan, test, verify, review,&nbsp;human&nbsp;approval.<br />
  <em>OpenCode executes. Lou orchestrates.</em>
</p>

<p align="center">
  <a href="https://github.com/Tiavina-Andriamamivony/lou-agents-orchestrator/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Tiavina-Andriamamivony/lou-agents-orchestrator/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Tiavina-Andriamamivony/lou-agents-orchestrator" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A522-339933?logo=nodedotjs&logoColor=white" alt="Node.js >= 22">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict">
</p>

<p align="center">
  <a href="#the-scene">The scene</a> ·
  <a href="#see-it-work">See it work</a> ·
  <a href="#try-it-in-three-commands">Try it</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#whats-shipped">What's shipped</a> ·
  <a href="#principles">Principles</a> ·
  <a href="#safety-model">Safety</a> ·
  <a href="#roadmap">Roadmap</a>
</p>

---

## The scene

"My agent said the tests passed. They didn't."

That is the problem Lou exists for. AI agents write code faster than ever — and with
nobody holding them to an engineering bar:

- An agent _says_ the tests pass. Nobody checks.
- Another rewrites half the codebase because a ticket said "improve performance".
- A third merges without a review.

The bottleneck of AI development is no longer **writing code**. It is **trust and
control**. Lou is the layer that sits _above_ an agent runtime (OpenCode) and turns
autonomous coding into a governed engineering process — the way git turned collaboration
into a governed science. Agents keep their velocity; humans keep the final word.

Lou is not an IDE, not a chat wrapper, not a CRUD generator.

## See it work

A ticket enters the repo. Lou plans it, a human approves the plan, Lou writes the tests
_first_, the agent implements, Lou runs the checks itself — an agent _claiming_ "tests
pass" is not proof — then a reviewer and a human gate, and a pull request appears.

`demos/lou-demo.cast` will hold a 30-second asciinema recording of exactly that. Record it
on your own machine (it drives a real ticket, so it needs `opencode` and `gh` on the
machine recording it) with the harness in `demos/`:

```bash
LOU_DEMO_ISSUE=<your-issue> bash demos/record-demo.sh
```

## Try it in three commands

```bash
lou init   # read-only onboarding: stack, docs, CI, git conventions
lou run 12 # drive issue #12 all the way to an approved pull request
lou runs   # what finished, what is still running
```

Install in one line:

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/Tiavina-Andriamamivony/lou-agents-orchestrator/main/apps/cli/install/install.sh | bash
# Windows (PowerShell)
irm https://raw.githubusercontent.com/Tiavina-Andriamamivony/lou-agents-orchestrator/main/apps/cli/install/install.ps1 | iex
```

The script is short and readable: it downloads the Lou sources from this repository
(branch `main` or a `--version <tag>` of your choice) into `~/.lou`, runs
`pnpm install --prod` with a frozen lockfile and no scripts, and wires the `lou` launcher
onto your PATH — no compiler, no global package pollution. Upgrade later with
`lou upgrade` (or `lou upgrade v0.2.0`). Requirements: Node.js >= 22.7, plus OpenCode
installed for `lou run` (`lou doctor` tells you if something is missing).

## How it works

Every ticket passes through the same bounded workflow:

```text
Ticket
  │
  ▼
Understand
  │
  ▼
Plan
  │
  ▼
Human approval          ← the engineer stays in charge
  │
  ▼
Test design             ← tests before implementation
  │
  ▼
Implementation          ← executed by the agent runtime (OpenCode)
  │
  ▼
Verification            ← Lou runs the checks itself — trust is verified
  │
  ▼
Review
  │
  ▼
Human approval
  │
  ▼
Pull request
```

Bounded and audited end to end: every retry is capped, every escalation reaches a human,
every decision is recorded in an append-only audit trail that survives the run.
Multiple tickets (`lou run 12 13`) run concurrently (`--max-concurrency`) — and each run
gets its own isolated git worktree, so batch runs cannot contaminate one another.

## What's shipped

`lou run` drives a GitHub issue to a pull request with human approval gates at the plan
and review steps, and `lou init` produces a zero-write onboarding report. Under the hood:

- `@lou/state-machine` — deterministic, bounded workflow engine (phases, commands,
  transition rules, iteration budgets) with explicit human gates.
- `@lou/orchestrator` — the loop: planner, test-writer, developer, reviewer, test runner,
  git and GitHub, wired to the state machine and recorded in the audit trail.
- `@lou/opencode-runtime` — the `AgentRuntime` port plus an `OpenCodeRuntime` adapter
  driving the `opencode run` CLI (spawn, timeout, abort, status).
- `@lou/git` — branch, commit, push, clean check, plus detached worktrees for isolated
  batch runs.
- `@lou/github` — the `gh` CLI adapter: fetch issues, open pull requests.
- `@lou/reviewer` — structured pre-review returning `APPROVED / CHANGES_REQUESTED /
BLOCKED`, mapped onto the workflow commands.
- `@lou/test-runner` — runs the project test command itself and reports a pass/fail
  verdict: verification over trust.
- `@lou/policy-engine` — `ALLOW / DENY / ASK_HUMAN` rules: destructive/risky patterns,
  production/secret/config guards, role capabilities; `DENY` and `ASK_HUMAN` never
  execute.
- `@lou/sandbox` — every command confined to the workspace root and gated by the policy
  engine.
- `@lou/audit` — append-only JSON-lines audit log, store-stamped timestamps, plus a
  per-run summary.
- `@lou/constitution` — the project's persistent rules (default 12-rule template,
  `.add/constitution.md`), parsed and validated.

Everything ships test-first, zero-warning lint, strict typecheck, dead-code analysis, and
a green CI on Node 22 and 24. `main` is protected.

## Who it's for

### Development teams

An agent becomes a disciplined team member, not a cowboy:

- **Test-first by construction** — behaviour is specified as failing tests _before_ any
  business code is written.
- **Verification over trust** — an agent asserting "tests pass" is not proof. Lou runs
  the checks itself and only advances when they are green.
- **Small blast radius** — changes stay small, isolated and reversible.
- **Human gates where they matter** — plan approval, review, merge. You delegate
  execution, never authority.
- **Bounded loops** — a run that exhausts its budget stops and escalates instead of
  improvising.

### Teams building without dedicated coders

Product teams and founders describe intent instead of writing code:

- Describe the goal in plain language. Lou plans the work, writes the tests, implements,
  verifies and opens a pull request.
- You supervise outcomes instead of writing syntax — plan, result, approve or reject, in
  natural language.
- No codebase hostage: the result is a normal repository your team can read, review and
  take back at any time. **The human is the final authority.**

### Engineering leaders and business

Agent adoption is a governance decision, not a tool choice:

- **Least privilege** — every agent role receives only the permissions its task requires.
  No blanket access to production or secrets.
- **Audit trail** — every call, approval and command recorded and replayable. If it
  shipped, you can show exactly how, when and who approved it.
- **Fail closed** — when a critical operation cannot be assessed, the run stops. It never
  executes by default.
- **Model agnostic** — different models orchestrated for different tasks (`--model`,
  `--model-by-agent`). No single vendor lock-in.
- **Policy at the platform level** — rules live in enforced policy and lint/CI gates, not
  in prompts anyone can forget.
- **Reproducible** — a run is a documented, bounded process, not a black box.

## Principles

| Principle               | Commitment                                                           |
| ----------------------- | -------------------------------------------------------------------- |
| Human-in-the-loop       | A human is the final authority on high-impact decisions.             |
| Least privilege         | Each agent receives only the permissions its task requires.          |
| Test first              | Expected behaviour is specified and testable before business code.   |
| Small blast radius      | Changes stay small, isolated and reversible.                         |
| Verification over trust | An agent asserting "tests pass" is not proof. Lou runs them.         |
| Fail closed             | When a critical operation cannot be assessed, stop — do not execute. |
| Model agnostic          | Different models can be orchestrated for different tasks.            |
| Reproducible            | Every run can be traced and, as far as possible, replayed.           |

## Safety model

- **Bounded workflows** — the state machine caps every retry loop; when a run exceeds its
  iteration budget it stops and asks for a human.
- **Policy engine** — every sensitive action is classified (`ALLOW / DENY / ASK_HUMAN`)
  before execution; destructive commands require approval.
- **Command sandbox** — every command is confined to the workspace root; hostile actions
  never execute implicitly.
- **Audit trail** — every tool call, approval and command is recorded and replayable.
- **NASA Power of Ten as the default engineering policy** — Lou ships a configurable
  baseline policy inspired by the JPL/NASA Power of Ten rules, tuned for TypeScript/Node.
  The same rules are enforced — non-negotiably — on Lou's own codebase through the linter
  and CI, so the product dogfoods the policy it governs with.

## Why not just "vibe code"?

|                   | Raw agent CLI                 | IDE chat                  | Lou                                      |
| ----------------- | ----------------------------- | ------------------------- | ---------------------------------------- |
| Process           | Whatever the model improvises | Whatever the chat decides | A fixed, bounded engineering process     |
| Tests             | Claimed, occasionally trusted | Claimed                   | Written first, then run by Lou           |
| Human control     | Interrupt when things break   | Approve inline            | Explicit gates: plan, review, merge      |
| Safety            | Depends on the prompt         | Depends on the prompt     | Enforced policy + capability permissions |
| Auditability      | Barely                        | Barely                    | Every decision recorded                  |
| Model portability | Tied to one provider          | Tied to one provider      | Model-agnostic by design                 |

## Roadmap

| Phase | Focus                                                                                    |
| ----- | ---------------------------------------------------------------------------------------- |
| 0     | Proof of concept: CLI + agent runtime + git + manual ticket + plan + tests + review loop |
| 1     | MVP: GitHub issues/PRs, policy engine, project constitution, human gates, audit, sandbox |
| 2     | Agent platform: multiple agents/models, MCP, model routing, cost control                 |
| 3     | Team/enterprise: organizational policies, RBAC, shared projects, compliance              |
| 4     | Ecosystem: Linear, Jira, GitLab, cloud environments, plugin marketplace                  |

MVP scope is fixed in the [product specification](docs/cahier-des-charges.md) (§47, in
French) — the design contract this repository implements.

## Repository layout

```text
lou/
├── apps/
│   └── cli/                      # the `lou` CLI: doctor, init, run, runs, upgrade
│       └── install/              # one-line installers + smoke test
├── packages/
│   ├── core/
│   │   ├── state-machine/        # workflow engine + human approval gates
│   │   ├── constitution/         # persistent project rules model + store
│   │   ├── command-runner/       # shared CommandRunner port + Node spawn impl
│   │   ├── test-runner/          # runs the project tests, verification over trust
│   │   ├── sandbox/              # workspace confinement + policy gate per command
│   │   ├── audit/                # append-only audit trail + per-run summary
│   │   └── orchestrator/         # the loop: state machine driven end to end → PR
│   ├── git/                      # git adapter: branch, commit, push, worktrees
│   ├── agents/
│   │   └── reviewer/             # structured pre-review, verdict → workflow
│   ├── integrations/
│   │   └── github/               # gh CLI adapter: issues, pull requests
│   ├── policy/
│   │   └── engine/               # rules, risk classification, permissions
│   └── runtimes/
│       └── opencode/             # AgentRuntime port + OpenCode adapter
├── demos/                        # demo recording harness (asciinema)
├── docs/
│   └── cahier-des-charges.md     # product specification (FR)
└── .github/
```

## Non-goals

- Not an IDE and not a replacement for OpenCode.
- Not an LLM wrapper — no single locked-in model.
- Not a CRUD generator.
- Not a system that deploys to production automatically.

## Contributing

- Conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `ci:`, `chore:`),
  enforced by commitlint and CI.
- TDD: write the failing test, watch it fail, then make it pass.
- One file, one role. One class per file. One responsibility per function.
- TypeScript strict with zero warnings — the CI pipeline is the gate.
- One feature per branch, PR per feature, merge once green.
- The repo is developed by its own orchestrator; see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Security

Report vulnerabilities privately — see [`SECURITY.md`](SECURITY.md).

## License

[MIT](LICENSE) — © 2026 Lou Agents Orchestrator contributors.

---

<p align="center">
  <img src="public/logo.png" alt="Lou" width="56" /><br />
  <em>OpenCode executes. Lou orchestrates.</em>
</p>
