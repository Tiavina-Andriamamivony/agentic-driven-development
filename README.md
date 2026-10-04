<p align="center">
  <img src="public/logo.png" alt="Lou Agents Orchestrator" width="140" />
</p>

<h1 align="center">Lou Agents Orchestrator</h1>

<p align="center">
  <strong>Lou turns an AI coding agent into a governed engineer.</strong><br />
  You give it a ticket. It plans, writes tests first, implements, verifies, reviews —<br />
  and stops for a human twice: after the plan, and before the pull request.<br />
  <em>OpenCode executes. Lou orchestrates.</em>
</p>

<p align="center">
  <a href="https://github.com/Tiavina-Andriamamivony/lou-agents-orchestrator/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Tiavina-Andriamamivony/lou-agents-orchestrator/ci.yml?branch=main&label=CI&logo=githubactions&logoColor=white" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Tiavina-Andriamamivony/lou-agents-orchestrator" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A522.7-339933?logo=nodedotjs&logoColor=white" alt="Node.js >= 22.7">
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript strict">
</p>

<p align="center">
  <a href="#what-is-lou">What is Lou?</a> ·
  <a href="#what-you-need">What you need</a> ·
  <a href="#install">Install</a> ·
  <a href="#your-first-run-step-by-step">First run</a> ·
  <a href="#every-command">Every command</a> ·
  <a href="#troubleshooting">Troubleshooting</a> ·
  <a href="#safety-model">Safety</a> ·
  <a href="#honest-status">Honest status</a>
</p>

---

## What is Lou?

**The problem.** An AI agent writes code fast. But nobody checks it. The agent says "the
tests pass". Nobody runs them. Another agent rewrites half your codebase because a ticket
said "improve performance". The bottleneck of AI development is no longer writing code — it
is **trust and control**.

**The fix.** Lou is a layer that sits _above_ your coding agent. You hand Lou a GitHub
issue. Lou then forces the work through a fixed, bounded engineering process: understand →
plan → **human approval** → tests first → implementation → **Lou runs the tests itself** →
review → **human approval** → pull request.

**What Lou is not.** Not an IDE. Not a chat wrapper. Not a code generator. Not something
that deploys to production. It is the governance layer around an agent that already exists
on your machine.

### Words you will see in this README

| Word                  | What it means                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| **Issue**             | A task written as a GitHub issue, identified by a number — for example issue `12`.               |
| **Pull request (PR)** | A proposal to merge code. Lou opens one; a human merges it.                                      |
| **Agent**             | One AI role with one job: planner, test designer, test writer, developer, reviewer.              |
| **Runtime**           | The AI tool that actually runs the agents — `opencode` (default) or `claude`.                    |
| **Verification**      | Lou runs your test command itself. An agent claiming success is not proof; a green run is.       |
| **Sandbox**           | A fence that confines every command Lou spawns to your project folder and asks a policy first.   |
| **Policy engine**     | The rulebook that answers `ALLOW`, `DENY` or `ASK_HUMAN` before any command runs.                |
| **Audit trail**       | A permanent, append-only log of every step, command and approval. Read it after any run.         |
| **Constitution**      | Your project's permanent rules, stored in `.add/constitution.md`, read by every agent every run. |
| **Gate**              | A point where the run pauses and waits for a human. Never auto-approved.                         |
| **TDD**               | Test-Driven Development: the tests are written _before_ the code they test.                      |

## What you need

Before anything else, you need these five things:

| Requirement             | Why                                                              | Check it with        |
| ----------------------- | ---------------------------------------------------------------- | -------------------- |
| **Node.js 22.7+**       | Lou runs TypeScript directly; older Node cannot strip the types. | `node --version`     |
| **git**                 | Lou works on branches, commits and pull requests.                | `git --version`      |
| **GitHub CLI (`gh`)**   | Lou reads issues and opens pull requests through `gh`.           | `gh auth status`     |
| **OpenCode**            | The agent that does the actual coding.                           | `opencode --version` |
| **A GitHub repository** | Your project, with at least one issue.                           | `git remote -v`      |

`pnpm` (the package manager) is **not** required: the installer sets it up for you. If you
build Lou from source, you will need it.

**Two minutes, three commands.** Open a terminal in your project and run:

```bash
node --version     # must print v22.7 or higher
gh auth status# must say you are logged in
git remote -v      # must print your repository URL
```

If any of these fails, fix it before continuing — `lou doctor` will tell you the same
things in one shot.

## Install

Lou installs with a single line. It downloads the sources into `~/.lou`, installs
dependencies, and puts a `lou` command on your PATH. No compiler, no global package mess.

**Linux / macOS**

```bash
curl -fsSL https://raw.githubusercontent.com/Tiavina-Andriamamivony/lou-agents-orchestrator/main/apps/cli/install/install.sh | bash
```

**Windows (PowerShell)**

```powershell
irm https://raw.githubusercontent.com/Tiavina-Andriamamivony/lou-agents-orchestrator/main/apps/cli/install/install.ps1 | iex
```

The installer is short and readable — you can read it before running it
(`apps/cli/install/install.sh`). Useful options:

```bash
bash install.sh --version v0.6.1   # pin a specific release instead of main
bash install.sh --prefix ~/.lou    # install somewhere else (default: ~/.lou)
bash install.sh --help             # all options
```

**Check the installation:**

```bash
lou --version    # e.g. lou 0.6.1
lou doctor       # verifies every prerequisite
```

`lou doctor` checks five things — Node.js, pnpm, the GitHub CLI, the agent runtime, and
that you are inside a Git repository — and exits with code `1` if any of them fails.

**Remove it:**

```bash
rm -rf ~/.lou        # Linux / macOS
```

**Install from source** (for contributors — see [Contributing](#contributing)):

```bash
git clone https://github.com/Tiavina-Andriamamivony/lou-agents-orchestrator.git
cd lou-agents-orchestrator
pnpm install
pnpm --filter @lou/cli exec tsx src/cli.ts --help   # or: node --no-warnings --experimental-transform-types apps/cli/bin/lou.js --help
```

## Your first run, step by step

Start in the folder of your project — the Git repository you want Lou to work on.

### Step 1 — Look at your project (read-only)

```bash
lou init
```

Lou reads your project and prints a report: the language, the framework, the test command,
the CI setup, the documentation, the Git conventions, and whether a constitution exists.
**It writes nothing.** Nothing is created, nothing is modified. This is your safe first
step — run it as often as you like.

Use `lou init --json` if you want the same report as JSON, for scripting.

### Step 2 — Write down your project's rules (optional, but recommended)

```bash
lou constitution --init
```

This creates `.add/constitution.md` with 12 default rules ("tests first", "no secrets in
code", "conventional commits"...). Edit the file to match your own standards: every agent
reads these rules on every run.

```bash
lou constitution                       # show the file and count its rules
lou constitution --init --force        # replace it with the defaults again
```

Lou never overwrites an existing constitution unless you pass `--force`.

### Step 3 — Make sure everything is in place

```bash
lou doctor
```

You want `5/5 checks passed.` If OpenCode is missing, `lou init` offers to install it for
you.

### Step 4 — Run a ticket

```bash
lou run 12
```

`12` is a GitHub issue number in your repository. Lou then works through the workflow and
**stops and waits for you** at the first human gate. Read the plan, approve it or reject
it, and Lou continues. At the end you get a pull request — which you still review and
merge yourself.

Start with `--dry-run` if you only want to see the plan without changing anything.

### Step 5 — See what happened

```bash
lou runs
```

```text
#12  PR created  2026-02-11 14:32:07  https://github.com/acme/app/pull/42
#13  needs human  2026-02-11 15:10:44  Budget exhausted at implementation
```

`lou runs --json` prints the same thing as JSON.

## Every command

Lou has exactly six commands, plus help and version. That is the whole surface.

```bash
lou <command> [options]
```

| Command                                 | What it does                                               | Writes to disk?            |
| --------------------------------------- | ---------------------------------------------------------- | -------------------------- |
| [`lou doctor`](#lou-doctor)             | Checks that everything needed is installed and configured. | No                         |
| [`lou init`](#lou-init)                 | Prints a read-only report about your project.              | **No**                     |
| [`lou constitution`](#lou-constitution) | Shows or creates your project's permanent rules.           | Only with `--init`         |
| [`lou run`](#lou-run)                   | Drives one or more GitHub issues to a pull request.        | Yes — worktree, branch, PR |
| [`lou runs`](#lou-runs)                 | Lists finished and in-flight runs.                         | No                         |
| [`lou upgrade`](#lou-upgrade)           | Updates Lou itself to the latest version.                  | Yes — `~/.lou`             |
| [`lou --help`](#lou-help)               | Prints the command list.                                   | No                         |
| [`lou --version`](#lou-help)            | Prints the installed version.                              | No                         |

### `lou doctor`

Checks that your machine can run Lou. Do this first whenever something does not work.

```bash
lou doctor
lou doctor --runtime claude    # check Claude Code instead of OpenCode
```

It verifies five things:

| Check                 | What it verifies                                           |
| --------------------- | ---------------------------------------------------------- |
| `Node runtime`        | Node 22.7+ and the `--experimental-transform-types` flag   |
| `pnpm`                | pnpm is reachable                                          |
| `GitHub CLI`          | `gh` is installed and you are logged in (`gh auth status`) |
| `opencode` / `claude` | the chosen agent runtime answers `--version`               |
| `Git repository`      | the current folder is inside a Git work tree               |

**Exit code:** `0` if all checks pass, `1` otherwise. Safe to use in scripts and CI.

### `lou init`

Reads your project and prints what Lou found. **This command never writes anything** — it
is a pure inspection, so it is always safe to run.

```bash
lou init
lou init --json      # machine-readable report
```

The report covers: detected stack, test command, CI configuration, documentation, Git
conventions, and whether a constitution is present. When run in an interactive terminal,
Lou also offers to install OpenCode if it is missing.

**Exit code:** `0`.

### `lou constitution`

Manages `.add/constitution.md` — the permanent rulebook every agent reads on every run.

```bash
lou constitution                      # show path, rule count, validity
lou constitution --init# create it with the 12 default rules
lou constitution --init --force       # overwrite an existing file
lou constitution --json               # machine-readable output
```

`--force` is only accepted together with `--init`; without it Lou **refuses to overwrite**
an existing constitution.

**Exit code:** `0` on success, `1` if Lou refused to overwrite an existing file.

### `lou run`

The main command. It takes one or more GitHub issue numbers and drives each of them to a
pull request.

```bash
lou run 12                     # issue #12
lou run 12 13 14               # three issues (see --max-concurrency)
lou run 12 --dry-run           # plan only, change nothing
lou run 12 --runtime claude    # use Claude Code instead of OpenCode
```

While it works, Lou prints what it is doing, and it **stops and waits for you twice**:

1. **After the plan** — read it, approve or reject.
2. **Before the pull request** — the final human gate.

Every run is recorded, bounded and reversible. See
[all `lou run` options](#all-lou-run-options) and
[what happens during a run](#what-happens-during-lou-run).

**Exit code:** `0` on success, `1` if the run failed.

### `lou runs`

Lists the runs stored in `.lou/runs/`, most recent first.

```bash
lou runs
lou runs --json
```

| Status shown  | Meaning                                                |
| ------------- | ------------------------------------------------------ |
| `PR created`  | The run finished and opened a pull request.            |
| `in progress` | A run is currently going.                              |
| `needs human` | The run stopped at a gate or hit a limit.              |
| `blocked`     | The reviewer blocked it, or the policy engine refused. |
| `failed`      | Something went wrong.                                  |

**Exit code:** `0`.

### `lou upgrade`

Updates Lou to the latest release.

```bash
lou upgrade            # latest version
lou upgrade v0.6.1     # a specific version
lou upgrade --help
```

**Exit code:** `0` on success, `1` on failure.

### `lou help`

```bash
lou help
lou --help
lou -h
```

Prints the list of commands and exits. `lou --version` (or `lou -v`) prints the installed
version, for example `lou 0.6.1`.

### All `lou run` options

| Option                           | What it does                                                                                   |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `--dry-run`                      | Plan only. Creates no branch, no commit, no pull request.                                      |
| `--runtime opencode` \| `claude` | Which agent CLI runs the agents. Default: `opencode`.                                          |
| `--model <name>`                 | Use this model for every agent.                                                                |
| `--model-by-agent role=<name>`   | Use a different model per role. Roles: `planner`, `test-designer`, `test-writer`, `developer`. |
| `--mcp name=<command>`           | Register an MCP server for the agents. Repeatable.                                             |
| `--max-cost-usd <usd>`           | Stop the run if the agents spend more than this.                                               |
| `--max-time-min <minutes>`       | Stop the run after this many minutes.                                                          |
| `--max-concurrency <n>`          | How many tickets may run at the same time. Default: `1`.                                       |

Examples:

```bash
lou run 12 --dry-run
lou run 12 --runtime claude --model claude-sonnet-4
lou run 12 --model-by-agent planner=big-model --model-by-agent developer=fast-model
lou run 12 13 --max-concurrency 2
lou run 12 --mcp context7=npx -y @upstash/context7-mcp --max-cost-usd 2 --max-time-min 30
```

Budget flags are ignored unless you set at least one of them — an unbounded run is the
default, which is why setting `--max-cost-usd` or `--max-time-min` is recommended.

## What happens during `lou run`

Every ticket goes through the same fixed workflow. It cannot skip a step.

```text
Ticket (#12)
  │
  ▼
Understand            the planner reads the issue and the codebase
  │
  ▼
Plan                     the planner writes the plan
  │
  ▼
◆ Human approval 1 ──── YOU decide: approve or reject the plan
  │
  ▼
Test design              acceptance cases are written down
  │
  ▼
Tests                     the test writer writes failing tests (TDD)
  │
  ▼
Implementation        the developer writes the code that makes them pass
  │
  ▼
Verification           Lou runs the tests ITSELF — the agent's word is not proof
  │
  ▼
Review                   a reviewer agent returns APPROVED / CHANGES_REQUESTED / BLOCKED
  │
  ▼
◆ Human approval 2 ──── YOU decide: open the pull request or not
  │
  ▼
Pull request             a PR appears, waiting for your review and merge
```

Two properties make this different from "just run the agent":

- **Bounded.** Every retry loop has a budget. When a run exhausts it, it stops and asks a
  human instead of improvising.
- **Audited.** Every step, command and approval is written to an append-only log that
  survives the run.

### Watching a run

Agents take minutes, so Lou never leaves you staring at a blank screen:

```text
  ▍ lou run #12 · Add password reset
  ⎿ worktree /tmp/lou/worktrees/run-12

  ▸ PLAN
    ⠹ planner · reading the auth module             2m 14s
    ✔ planner · 2m 16s
      ⎿ plan the reset endpoint

  ▸ TESTS
    ✔ test-designer · 41s
      ⎿ 3 acceptance cases
    ✔ test-writer · test-first passed               51s

  ▸ CODE
    ✔ developer · 3m 04s
      ⎿ added the reset endpoint and specs

  ▸ VERIFY
    ✔ tests · 51 passed                              12s

  ▸ REVIEW
    ✔ review · approved                              58s

  ▸ PUSH
    · commit feat(auth): add password reset
    · pushed

  ▸ PULL REQUEST
    ✔ pull request #42
```

On a terminal the wait is a single line that rewrites itself, so a four-minute agent call
shows a spinner, what the agent is doing right now, and an elapsed timer. After 15 seconds
of silence the line says so explicitly instead of freezing. Piped into a file or CI, the
spinner becomes one plain line every 30 seconds, so the log never goes quiet either.

## What Lou writes on your computer

Lou never touches your working tree while a run is in progress: each run gets its own
isolated Git worktree in the system temporary directory, so several tickets can run
concurrently without contaminating each other or your current branch.

| Path                             | What it is                                               | Created by                |
| -------------------------------- | -------------------------------------------------------- | ------------------------- |
| `.add/constitution.md`           | Your project's permanent rules.                          | `lou constitution --init` |
| `.lou/runs/run-<n>.jsonl`        | The audit trail of run `n` (one JSON event per line).    | `lou run`                 |
| `.lou/runs/run-<n>.summary.json` | The outcome of run `n`: status, reason, PR URL, timings. | `lou run`                 |
| `<temp>/lou/worktrees/run-<n>`   | The isolated worktree where run `n` works.               | `lou run`                 |
| `~/.lou/`                        | The Lou installation itself.                             | the installer             |

**The audit trail is the record of what happened.** After a run, read it:

```bash
cat .lou/runs/run-12.jsonl
```

Secrets are redacted before they reach the log, and long command output is truncated.

## Troubleshooting

| What you see                                      | What it means                                                                 | What to do                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `lou: command not found`                          | Lou is not on your PATH.                                                      | Re-run the installer, or restart your terminal.               |
| `Node runtime — v22.6 is below the required 22.7` | Node is too old to strip TypeScript types.                                    | Install Node 22.7+ from [nodejs.org](https://nodejs.org).     |
| `gh not found or not authenticated`               | Lou cannot read issues or open PRs.                                           | Install `gh`, then run `gh auth login`.                       |
| `opencode not found on PATH`                      | The agent runtime is missing.                                                 | Run `lou init` in a terminal — it offers to install OpenCode. |
| `Git repository — not inside a git work tree`     | You are not in a project folder.                                              | `cd` into your project before running `lou run`.              |
| `tests could not prove anything`                  | The project has no test command, or the runner never reported a passing test. | Add real tests. Lou refuses to advance on unproven work.      |
| `Already present. Re-run with --force`            | A constitution already exists.                                                | Edit the file, or `lou constitution --init --force`.          |
| `Budget exhausted`                                | The run hit `--max-cost-usd` or `--max-time-min`.                             | Raise the budget, or split the ticket.                        |
| A run stops at a gate and waits                   | This is the design, not a bug.                                                | Answer the prompt in the terminal.                            |

Run `lou runs` to see the status of past runs, and read the last lines of
`.lou/runs/run-<n>.jsonl` to understand why one stopped.

## How it is built

Under the hood, `lou run` is assembled from small, independently tested pieces:

| Package                    | Role                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `@lou/state-machine`       | The workflow engine: phases, commands, transition rules, iteration budgets, human approval gates. |
| `@lou/orchestrator`        | The loop: planner, test designer, test writer, developer, reviewer, verification, git, GitHub.    |
| `@lou/agent-runtime`       | The port every agent adapter implements, plus cost and time accounting.                           |
| `@lou/opencode-runtime`    | Adapter driving the `opencode run` CLI (spawn, timeout, abort, status).                           |
| `@lou/claude-code-runtime` | Adapter driving the `claude` CLI (`claude -p`, JSON cost/usage output, MCP config).               |
| `@lou/budget`              | Cost and time budgets, enforced around the runtime.                                               |
| `@lou/git`                 | Branch, commit, push, clean check, and detached worktrees for isolated runs.                      |
| `@lou/github`              | The `gh` CLI adapter: fetch issues, open pull requests.                                           |
| `@lou/test-runner`         | Runs your project's test command and returns a pass/fail verdict.                                 |
| `@lou/reviewer`            | Structured pre-review returning `APPROVED` / `CHANGES_REQUESTED` / `BLOCKED`.                     |
| `@lou/policy-engine`       | Ordered `ALLOW` / `DENY` / `ASK_HUMAN` rules, fail-closed by default.                             |
| `@lou/sandbox`             | Confines every command to the workspace root and routes it through the policy engine.             |
| `@lou/audit`               | Append-only JSON-lines audit log with store-stamped timestamps, plus a per-run summary.           |
| `@lou/constitution`        | The project rulebook: model, markdown parse/serialize, validation, storage.                       |
| `@lou/command-runner`      | The shared port used by every adapter that shells out to a CLI.                                   |

Everything ships test-first: a failing test is written first, then the implementation. The
linter, the type checker, the dead-code analysis and the test suite are the gate, on Node 22
and 24. `main` is protected.

## Who it's for

### Development teams

An agent becomes a disciplined team member rather than a cowboy:

- **Test-first by construction** — behaviour is specified as failing tests before any
  business code is written.
- **Verification over trust** — an agent asserting "tests pass" is not proof. Lou runs the
  checks itself and only advances when they are green.
- **Small blast radius** — each ticket runs in its own worktree; changes stay small,
  isolated and reversible.
- **Human gates where they matter** — plan approval and PR approval. You delegate execution,
  never authority.
- **Bounded loops** — a run that exhausts its budget stops and escalates instead of
  improvising.

### Teams without dedicated coders

Product teams and founders describe intent instead of writing code:

- Describe the goal in plain language. Lou plans the work, writes the tests, implements,
  verifies and opens a pull request.
- You supervise outcomes — plan, result, approve or reject — in natural language.
- No codebase hostage: the result is a normal repository your team can read, review and take
  back at any time. **The human is the final authority.**

### Engineering leaders and business

Agent adoption is a governance decision, not a tool choice:

- **Least privilege** — every agent role gets only the permissions its task requires.
- **Audit trail** — every call, approval and command is recorded. If it shipped, you can
  show exactly how, when and who approved it.
- **Fail closed** — when a critical operation cannot be assessed, the run stops.
- **Model agnostic** — different models per task (`--model`, `--model-by-agent`) and more
  than one agent runtime (`--runtime opencode|claude`). No single vendor lock-in.
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

- **Bounded workflows** — the state machine caps every retry loop. When a run exceeds its
  iteration budget it stops and asks for a human.
- **Policy engine** — every command Lou spawns is classified `ALLOW` / `DENY` / `ASK_HUMAN`
  before it runs. Each adapter has its own role and its own allow list, and destructive rules
  are evaluated first: a role allowed to `git push` still cannot `--force`. `DENY` and
  `ASK_HUMAN` never execute.
- **Command sandbox** — `@lou/sandbox` refuses any command whose working directory escapes
  the workspace root, and routes the rest through the policy engine. It is wired behind git,
  GitHub, the test runner and the agent runtime.
- **Human gates** — the run pauses after the plan and before the pull request. There is no
  flag to skip them.
- **Audit trail** — every tool call, approval and command is recorded, with secrets redacted.
- **NASA Power of Ten as the default engineering policy** — Lou ships a baseline policy
  inspired by the JPL/NASA Power of Ten rules, tuned for TypeScript/Node. The same rules are
  enforced on Lou's own codebase by the linter and CI, so the product dogfoods the policy it
  governs.

See [Honest status](#honest-status) for what this does and does not cover.

## Why not just "vibe code"?

|                   | Raw agent CLI                 | IDE chat                  | Lou                                                          |
| ----------------- | ----------------------------- | ------------------------- | ------------------------------------------------------------ |
| Process           | Whatever the model improvises | Whatever the chat decides | A fixed, bounded engineering process                         |
| Tests             | Claimed, occasionally trusted | Claimed                   | Written first, then run by Lou                               |
| Human control     | Interrupt when things break   | Approve inline            | Explicit gates: plan, PR                                     |
| Safety            | Depends on the prompt         | Depends on the prompt     | Bounded state machine, approval gates, policy-gated commands |
| Auditability      | Barely                        | Barely                    | Every decision recorded                                      |
| Model portability | Tied to one provider          | Tied to one provider      | Model-agnostic by design                                     |

## Honest status

What works, and what does not. A green test suite is not evidence here: it stayed green
while `lou run` was structurally unable to open a pull request, because every test injected
a fake git adapter.

**Proven end to end** — a run goes from a GitHub issue to a created pull request against a
real repository, with a real git adapter, a real audit log on disk and the real test command
(`apps/cli/test/run-wiring.test.ts`). Removing one `git stage()` call makes four of those
tests fail, so the test has teeth.

**Now on the `lou run` path** — every command Lou itself spawns (git, `gh`, the test command
and the agent runtime invocation) is confined to the workspace root and classified before it
runs. Destructive rules are evaluated before the allow lists, so `git push --force` is refused
even for the role that is allowed to push. `apps/cli/test/run-sandbox-wiring.test.ts` asserts
the sandbox really is the object behind each adapter: removing it from the composition fails
that test while the rest of the suite stays green.

**Still not covered** — what an agent does _inside_ its own CLI session. `opencode run` and
`claude -p` execute their own tools; Lou gates the invocation, not the shell commands the
model decides to run inside it. Confining that needs an OS-level sandbox, which is not
implemented.

The constitution _is_ honoured: `lou run` reads `.add/constitution.md` and puts its articles
in front of the planner, the test designer, the test writer, the developer and the reviewer.
An invalid file is reported and ignored rather than silently dropped, and a run with no
constitution file simply proceeds without one.

The safety story that is real today is therefore: the bounded state machine, the explicit
human approval gates, the audit trail, the policy gate and workspace confinement on every
command Lou spawns, and the fact that Lou runs the test command itself instead of trusting
the agent's word.

**Never validated at scale** — no real agent run has completed in a development environment.
Agent output parsing (`CHANGED:`, `SUMMARY:`, `VERDICT:`) has only ever been fed the exact
format the parser expects. The Claude Code runtime's own verdict is parsed and enforced, but
the only real `claude` calls captured returned `401 authentication_failed`
(`apiKeySource: none`), so their event streams ended in an aborted envelope rather than a
verdict. The realtime envelope itself was read off a real run: `--output-format stream-json`
emits JSON Lines and closes with a `type: "result"` object carrying `is_error`,
`total_cost_usd` and `usage`, and it refuses to start without `--verbose`.

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
lou-agents-orchestrator/
├── apps/
│   └── cli/                      # the `lou` command: doctor, init, run, runs, constitution, upgrade
│       └── install/              # one-line installers + smoke test
├── packages/
│   ├── core/
│   │   ├── state-machine/        # workflow engine + human approval gates
│   │   ├── orchestrator/         # the loop: state machine driven end to end → PR
│   │   ├── constitution/         # persistent project rules model + store
│   │   ├── command-runner/       # shared CommandRunner port + Node spawn impl
│   │   ├── test-runner/          # runs the project tests, verification over trust
│   │   ├── sandbox/              # workspace confinement + policy gate per command
│   │   ├── audit/                # append-only audit trail + per-run summary
│   │   └── budget/               # cost and time budgets
│   ├── git/                      # git adapter: branch, commit, push, worktrees
│   ├── agents/
│   │   └── reviewer/             # structured pre-review, verdict → workflow
│   ├── integrations/
│   │   └── github/               # gh CLI adapter: issues, pull requests
│   ├── policy/
│   │   └── engine/               # rules, risk classification, permissions
│   └── runtimes/
│       ├── agent-runtime/        # the AgentRuntime port + budget accounting
│       ├── opencode/             # OpenCode adapter
│       └── claude-code/          # Claude Code adapter
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

```bash
pnpm install     # install all workspaces
pnpm check       # the full local gate: lint → format → typecheck → knip → test
```

Individual steps, if you need them:

| Command          | What it does                          |
| ---------------- | ------------------------------------- |
| `pnpm lint`      | ESLint strict, zero warnings allowed. |
| `pnpm format`    | Formats the repository with Prettier. |
| `pnpm typecheck` | `tsc --noEmit` across all packages.   |
| `pnpm knip`      | Dead-code analysis.                   |
| `pnpm test`      | Vitest across all packages.           |

Conventions:

- Conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `ci:`, `chore:`),
  enforced by commitlint and CI.
- TDD: write the failing test, watch it fail, then make it pass.
- One file, one role. One class per file. One responsibility per function.
- TypeScript strict with zero warnings — the CI pipeline is the gate.
- One feature per branch, one PR per feature, merged once green.

The repo is developed by its own orchestrator; see
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Security

Report vulnerabilities privately — see [`SECURITY.md`](SECURITY.md).

## License

[MIT](LICENSE) — © 2026 Lou Agents Orchestrator contributors.

---

<p align="center">
  <img src="public/logo.png" alt="Lou" width="56" /><br />
  <em>OpenCode executes. Lou orchestrates.</em>
</p>
