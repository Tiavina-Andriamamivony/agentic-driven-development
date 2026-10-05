# Smoke run of the `lou run` pipeline

Ticket #17 — exercise the full ticket-to-PR journey and record the result. No
functional change expected; this document is the deliverable.

## Result

The `lou run` pipeline was exercised end-to-end on this repository. Four real
tickets were driven to production during the smoke session, each through the full
journey — understand → plan → human plan gate → tests → implementation →
verification → review → PR → human review gate → merge:

| Ticket | Change                                              | PR  | Merged    |
| ------ | --------------------------------------------------- | --- | --------- |
| #20    | `lou run --dry-run` stops right after the plan gate | #22 | `07d497b` |
| #21    | installer smoke test as a script                    | #23 | `1b4dd3b` |
| #19    | `lou init --json` machine-readable output           | #24 | `24afb1c` |
| #18    | `lou doctor` prerequisites command                  | #25 | `13dde1b` |

Each PR went through the `Quality Gates` (Node 22 + 24) and `Conventional Commits`
checks, received the human approval gate, and was squash-merged into `main`
(protected branch, CI green).

## Live probe against the real runtime

The safe path forward after #20 is a dry-run, which exercises fetch issue →
understand → askClarifications → build plan with the **real** `OpenCodeRuntime`
(an `opencode run --agent planner` subprocess), then stops before the plan
approval gate:

```bash
node --no-warnings --experimental-strip-types apps/cli/src/cli.ts run 17 --dry-run
```

Observed on the open issue #17:

```
Ticket #17 — chore: smoke-test the lou run pipeline
Should the smoke test's minimal diff be a README/docs line or a test-only
assertion, and is the run allowed to consume real OpenCode runtime calls?
```

That is: the `gh` adapter fetched issue #17, the real planner agent produced a
structured `SUMMARY`/`QUESTION`/`PLAN_*` reply, and the run reached the
interactive clarification gate — the expected stopping point for a non-TTY
subprocess (see #20). No branch, commit, PR or working-tree change occurred
(`git status` clean afterwards).

## Reproduction

```bash
# 1. Prerequisites (validated by `lou doctor`)
node --no-warnings --experimental-strip-types apps/cli/src/cli.ts doctor

# 2. Safe preview — stops right after the plan gate, no side effects
lou run <issue-number> --dry-run

# 3. Full journey — drives the ticket to a PR; human approves plan and review
lou run <issue-number>
```

## Notes

- The clarification gate is interactive by design: in a non-TTY subprocess the
  run halts there (mirrors the #17 observation referenced by #20).
- `lou init --json` (#19) and `lou doctor` (#18) were also smoke-run live on this
  machine: `init --json` prints parseable JSON with the 6 stable keys, and
  `doctor` reported 5/5 checks OK with exit 0.
