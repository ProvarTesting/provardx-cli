# Loop runner — template & registry

The reusable scaffold for driving a batch of PDX tickets from build → test → validate → merge,
one ticket per self-paced `/loop` iteration, on top of this repo's documented dev workflow
(`.claude/commands/git-workflow.md` + `.claude/agents/dev-git-workflow.md`).

- **This file** = the generic template + how-to + the registry of run prompts.
- **One file per loop prompt** lives beside it in `docs/loops/` (see [Registry](#registry)).
  Each instance doc is self-contained and ready to paste after `/loop`.

> Internal working docs — NOT customer-facing. PDX ticket IDs are fine in `docs/loops/`
> (unlike `docs/mcp.md`, `docs/mcp-pilot-guide.md`, `README.md`, the university course).

## Authoring a new loop prompt

1. Copy `docs/loops/_example-instance.md` (or any existing instance) to a new file in `docs/loops/`.
   Name it for the batch, e.g. `pdx-NNN-MMM.md` or a short descriptive slug.
2. Query the Jira keys first (`searchJiraIssuesUsingJql` on the keys) to read `issuelinks`
   and derive a **blocker-safe PROCESS ORDER** before writing the order line.
3. Fill the `<<…>>` slots in the template below, paste the result into the new instance doc,
   and record the decisions + status there.
4. Add a row to the [Registry](#registry).
5. To run it: open the instance doc, copy its fenced prompt, paste after `/loop`
   (no interval → self-paced; each iteration takes one ticket build→merge).

## Decisions to make before filling the template

| Decision              | Options                                                          | Where it lands        |
| --------------------- | ---------------------------------------------------------------- | --------------------- |
| Autonomy              | pause-before-merge / fully-autonomous-to-merge / stop-after-PR   | step 9 + EXCEPTIONS   |
| Merge style           | merge commit (`--merge`) / squash (`--squash`)                   | step 9                |
| Ordering              | respect `Blocks`/`is blocked by` links; front-load High severity | PROCESS ORDER         |
| Per-ticket specifics  | enum sources, dup decisions, error codes, etc.                   | TICKET-SPECIFIC RULES |
| Authoritative sources | confirm before editing — never guess at enums/contracts          | TICKET-SPECIFIC RULES |

## Template

```
Drive <<TICKET RANGE, e.g. PDX-NNN → PDX-MMM>> to merged, one ticket per iteration,
<<AUTONOMY: e.g. "fully autonomously">>.

AUTHORITATIVE WORKFLOW: follow .claude/commands/git-workflow.md and
.claude/agents/dev-git-workflow.md exactly (worktree-per-branch, yarn install in
the worktree, commit format, the compile/test/smoke/lint gate, PR template,
Copilot handling) — WITH these overrides for this loop:
  - <<AUTONOMY OVERRIDE: e.g. "Run unattended: do NOT stop at the workflow's
    CONFIRM points. Only the EXCEPTIONS at the bottom may stop the loop.">>
  - Merge style: <<MERGE COMMIT `gh pr merge <n> --merge --delete-branch`
    OR squash `--squash`>>.
  - Jira cloudId: 3c8a4f06-8ecc-4723-876f-b096b816c6ec.

PROCESS ORDER (respects blockers): <<ordered ticket list>>.
  - <<state each "X BLOCKS Y — don't start Y until X is merged AND Closed">>
  - <<state each "X may be a DUP of Y — don't start X until Y is merged">>

EACH ITERATION:
1. Pick the FIRST ticket in PROCESS ORDER not yet Closed whose blocker is Closed.
   If all are Closed (or closed-as-duplicate), STOP THE LOOP — don't reschedule.
   Print a final summary: ticket → PR → merge SHA → Jira status.
2. getJiraIssue, re-read description/acceptance criteria. Transition to In
   Progress, assign to me.
3. Create branch + worktree off develop; run `yarn install` in the worktree.
4. Implement per acceptance criteria + this repo's CLAUDE.md: unit tests in
   test/unit/mcp/<group>Tools.test.ts, docs/mcp.md for any new error code /
   changed tool / enum, smoke entry + TOTAL_EXPECTED bump in
   scripts/mcp-smoke.cjs when a tool/validator is added, NO internal PDX ticket
   IDs in customer-facing docs.
5. Gate before commit (in the worktree) — all four MUST pass, fix and re-run,
   never --no-verify:
     yarn compile
     node_modules/.bin/nyc node_modules/.bin/mocha "test/**/*.test.ts"
     node scripts/mcp-smoke.cjs 2>/dev/null
     yarn lint
6. Stage explicitly (never git add -A). Commit format:
     <TICKET>: <type>(<scope>): <subject ≤72 chars>
     <blank>
     RCA: <≥40 chars>
     Fix: <≥40 chars>
7. Push (pre-push runs build+test). Open PR to develop using the workflow's PR
   template, including the Jira link.
8. Wait for CI + Copilot. Poll `gh pr checks <n>` and `gh pr view <n> --comments`.
   Failing check OR valid Copilot/security comment → fix in the same worktree,
   commit, push, re-poll. Re-poll patiently; CI + Copilot take minutes.
9. <<MERGE GATE per AUTONOMY: e.g. "CI green AND no unresolved blocking Copilot/
   security comments → merge with `gh pr merge <n> --merge --delete-branch`.">>
10. Transition Jira to Closed. Remove the worktree (git worktree remove …; prune).
11. End the iteration; self-pace to the next ticket.

TICKET-SPECIFIC RULES:
  <<one block per ticket: corrected basis / authoritative sources / exact
    acceptance criteria / dup-vs-fix decisions / new error codes>>

EXCEPTIONS — STOP the loop and ask me (do NOT force or guess) if:
  - <<any unresolved input (e.g. an authoritative source not yet supplied)>>
  - CI or the pre-push/commit-msg hooks fail in a way you can't resolve after 3
    genuine fix attempts.
  - A Copilot SECURITY comment can't be confidently resolved.
  - Acceptance criteria are ambiguous enough that you'd be guessing at behaviour.
  - Any merge conflict against develop that isn't a trivial auto-resolve.
In every stop case, leave the branch/PR in place, report where you stopped and
why, and wait for me.
```

## Registry

| Loop prompt                      | Scope                                                                        | Status      |
| -------------------------------- | ---------------------------------------------------------------------------- | ----------- |
| [pdx-501-505.md](pdx-501-505.md) | MCP dogfooding fixes (comparisonType enum + sf invocation), 2026-05-29 batch | Not started |
