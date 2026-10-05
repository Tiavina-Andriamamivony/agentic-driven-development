# AGENTS.md

## What this repo is

A pnpm monorepo for **Lou Agents Orchestrator** — a governance layer that orchestrates
development agents running inside OpenCode. Product brand: **Lou**. The French product
spec (`docs/cahier-des-charges.md`, `~2290 lines`) predates the brand and still calls the
product "Agentic-Driven Development (ADD)" — treat **ADD ≡ Lou**. Code, docs and commits
use the **Lou** brand.

## Current state

- `packages/core/state-machine/` — deterministic, bounded workflow engine (phases,
  commands, transition rules, iteration budgets, human approval gates).
- `packages/runtimes/agent-runtime/` — the runtime-agnostic `AgentRuntime` port every
  agent adapter implements, plus `BudgetedAgentRuntime` (cost/time accounting).
- `packages/runtimes/opencode/` — the `OpenCodeRuntime` adapter driving the `opencode run`
  CLI (spawn, timeout, abort, status).
- `packages/runtimes/claude-code/` — the `ClaudeCodeRuntime` adapter driving the `claude`
  CLI (`claude -p --output-format json`, MCP config, cost/usage parsing).
- `packages/core/command-runner/` — the shared `CommandRunner` port (`CommandRunner` +
  `NodeCommandRunner` + `RunningCommand`) used by every adapter that shells out; accepts
  an optional `stdin` for prompts that outgrow argument limits.
- `packages/git/` — the `GitAdapter` port plus a `NodeGitAdapter` (create branch, commit,
  push, current branch, clean check) driving the git CLI through the command runner.
- `packages/core/test-runner/` — the `TestRunner` port plus a `NodeTestRunner` that runs
  the project test command and reports a pass/fail verdict (verification over trust, §4.6).
- `packages/core/sandbox/` — the command sandbox (§23, §25): a `SandboxedCommandRunner`
  that confines every run to the workspace root and gates each command through the
  policy engine (`DENY`/`ASK_HUMAN` never execute).
- `packages/core/audit/` — the audit trail (§33, §34): an append-only `AuditLog`
  (JSON-lines, store-stamped timestamps) recording the 16 minimum event types, plus a
  `summarizeRun()` observer per run.
- `packages/core/orchestrator/` — the orchestrator (§18), the heart of the loop: drives a
  `Workflow` from ticket to PR_CREATED through injected `OrchestratorSteps` (planner,
  tests, developer), `HumanKeeper` approval gates, `ReviewerAgent`, `TestRunner`, git and
  GitHub adapters, recording every step in the `AuditLog`.
- `packages/integrations/github/` — the `GitHubAdapter` port plus a `NodeGitHubAdapter`
  driving the `gh` CLI: fetch issues and open pull requests.
- `packages/agents/reviewer/` — the review agent (§17.5, §28): assembles a structured
  review prompt, runs it on an `AgentRuntime`, and parses the verdict
  (`APPROVED/CHANGES_REQUESTED/BLOCKED`) onto the workflow commands.
- `packages/policy/engine/` — the `PolicyEngine` port plus `DefaultPolicyEngine`: ordered
  rules with fail-closed default (`ALLOW/DENY/ASK_HUMAN`), destructive/risky patterns,
  production/secret/config guards, and role-based capability rules.
- `packages/core/constitution/` — Article model, default 12-rule template ($7.1),
  markdown parse/serialize (deterministic), validation, and a `NodeConstitutionStore`
  persisting `.add/constitution.md`. Writing is explicit (`save()`); `/init` stays
  read-only ($6.3), so nothing is written without approval.
- `apps/cli/` — the `lou` CLI: `lou init` performs read-only project onboarding
  (§6.1–6.4): detects the stack, docs, CI, git conventions and constitution from the
  filesystem and prints a report without modifying anything. `lou run <issue-number>`
  wires the real adapters (Git, GitHub, OpenCode runtime, test runner, reviewer,
  audit file under `.lou/runs/`, terminal `HumanKeeper`) into the orchestrator and
  drives the ticket to a pull request. The `lou` bin runs TypeScript sources directly
  through `node --no-warnings --experimental-strip-types`. One-line installers
  (`apps/cli/install/install.sh` for Linux/macOS, `install.ps1` for Windows) fetch the
  sources from GitHub, run `pnpm install --prod --frozen-lockfile --ignore-scripts` and
  wire the `lou` launcher onto the PATH.
- Everything else in $47 (MVP) and the roadmap is scaffolding to be built.

## Git workflow (from now on)

- One feature per branch, named `feature/<kebab-case>` or `fix/<kebab-case>`, branched
  off `main`. Push, open a PR (conventional title), wait for CI green, merge, delete the
  branch. Main is protected: 1 approving review + the `Quality Gates` and
  `Conventional Commits` checks are required (admin merges may bypass via
  `gh pr merge --admin`).
- PR bodies follow `.github/pull_request_template.md`: state what the PR does, the ticket
  in cause (`Closes #N`), the files changed (one line each) and the idea behind the design.

## Developer commands (run from repo root)

```bash
pnpm install        # install all workspaces
pnpm lint           # ESLint strict + NASA Power-of-Ten adaptation (max-warnings 0)
pnpm typecheck      # tsc --noEmit across packages
pnpm knip           # dead-code analysis
pnpm test           # vitest across packages
pnpm check          # lint -> format -> typecheck -> knip -> test (the full local gate)
```

CI (`.github/workflows/ci.yml`) runs lint -> format -> typecheck -> knip -> test on Node 22 and 24,
plus a conventional-commits job on PRs. `main` is protected: nothing merges without a
green pipeline.

## Hard, non-negotiable conventions

- Conventional commits in English. Enforced by commitlint + a pre-commit hook; CI blocks
  PRs with non-conforming commits. Types: `feat/fix/refactor/test/docs/build/ci/chore/revert`.
- TDD: failing test first, then implementation. Every behaviour change ships with tests.
- The code reads by itself: no explanatory comments. Extract a named function/constant
  when a comment feels needed; only non-obvious invariants may be commented.
- One role per file, one class per file (ESLint `max-classes-per-file`), one
  responsibility per function.
- TypeScript strict with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`. Zero warnings, always.
- Every relative import uses an explicit `.ts` extension (`./audit-log.ts`, `../types.ts`).
  The source is executed directly by Node (`--experimental-strip-types`), which resolves
  only full specifiers; `tsconfig.base.json` sets `allowImportingTsExtensions`.
- `tsconfig.base.json` extends to every workspace; one tsconfig per package mirroring
  `packages/core/state-machine/` and `apps/cli/` (`noEmit`, `allowImportingTsExtensions`).

## NASA Power of Ten adaptation (enforced by eslint.config.mjs)

Complexity <= 8, max 50 lines per function, max 20 statements, max 4 params; unbounded
`while(true)` / `for(;;)` / `do-while` forbidden; no `any`, no non-null assertions, no
floating promises; every test must assert (`vitest/expect-expect`); `TODO/FIXME/HACK`
comments are errors; `eslint-disable` is limited and flags unused disables.

## Spec constraints that govern the product design (draft v0.1)

- Language: the spec is written in **French**; new spec content should be written in
  French. Product code/commits stay in English.
- Positioning: Lou is a control plane, not an IDE. `OpenCode exécute. ADD gouverne et
orchestre.` (spec wording; brand: Lou). Do not design it as a Cursor clone, LLM wrapper,
  or CRUD generator ($3).
- Core principles that must not be violated ($4, $53): human-in-the-loop / human is final
  authority, least privilege per agent, test-first workflow, small blast radius,
  verification over trust ("tests pass" asserted by an agent is not proof — run them),
  fail closed, model-agnostic, reproducibility.
- MVP scope ($47): CLI, `/init`, Git, GitHub Issues + PRs, Project Constitution, Policy
  Engine, Planner/Test/Developer/Reviewer agents, OpenCode adapter, state machine, human
  approval gates, audit trail, command safety, PR generation. Explicitly EXCLUDED from
  MVP: production deploys, full web UI, multi-Kanban, agent marketplace, model
  training/fine-tuning, multi-tenant, advanced analytics.
- Priority order ($57): state machine -> OpenCode adapter -> policy engine -> constitution
  -> git -> test workflow -> human gates -> GitHub -> review agent -> sandbox -> audit.

## When editing the spec

- Keep the numbered-section style and `---` separators. Update section references
  elsewhere in the doc if you renumber.
- Cross-check additions against $3 (Non-objectifs) and $53 (principles never to
  sacrifice) — design proposals that contradict them will be rejected.
- Roadmap phases ($51) and MVP scope ($47) are the gate for what belongs in scope.

## When adding a package

- Use `packages/<area>/<name>` (or `apps/` for binaries), scoped as `@lou/<name>`.
- Mirror the layout of `packages/core/state-machine/`: `src/` + `test/`, own
  `tsconfig.json` extending `tsconfig.base.json`, `vitest.config.ts`, own
  `lint`/`typecheck`/`test` scripts.
- Under `pnpm-lock.yaml`, record deps in the package manifest — do not rely on hoisting.
- Add the workspace to `knip.json` entries explicitly.
