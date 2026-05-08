You are executing the provardx-cli development git workflow. Follow these steps in order. Stop and confirm with the user at each CONFIRM point before proceeding.

Full reference doc: `.claude/agents/dev-git-workflow.md`

---

## Step 0 — Establish the Jira ticket (planning phase)

Ask the user:

> "Do you have a PDX ticket for this work?
> A) Yes — give me the number
> B) No — create one now as part of planning
> C) No ticket needed (framework/chore work)"

---

### Option A — Existing ticket

User provides the ticket number. Set `TICKET = PDX-<number>`.

Fetch the ticket to confirm it exists and read its summary and status:

- Use `getJiraIssue` (cloudId: `3c8a4f06-8ecc-4723-876f-b096b816c6ec`, issueIdOrKey: `PDX-<number>`)
- Show the user: ticket summary, current status, and URL
- If the ticket is already Closed, warn the user before proceeding

Skip to **Derive branch variables** below.

---

### Option B — Create ticket now (planning phase)

Ask the user a single compound question to gather everything at once:

> "Tell me about the work — I'll draft the ticket from your answer:
>
> 1. What should this change do? (one sentence — becomes the ticket summary)
> 2. Is it a new feature, bug fix, infrastructure/CI work, research spike, or internal task?
> 3. Why is it needed? What problem or requirement drives it?
> 4. How will we know it's done? (acceptance criteria — list conditions)
> 5. Anything explicitly out of scope?"

From the user's answer, draft the full ticket content. Use your judgment to infer issue type if the user is vague. Do not ask follow-up questions unless a critical field (summary or acceptance criteria) is completely missing.

**Issue type mapping:**
| Work described | Issue type |
|----------------|-----------|
| New user-facing capability | Story |
| Something broken | Bug |
| CI, infra, tooling, architecture | Enabler |
| Research / investigation / prototype | Spike |
| Internal work, no user impact | Task |

**CONFIRM**: Show the drafted ticket for review before creating:

```
Summary: <summary>
Type: <issueTypeName>
Label: provardx-cli

Description:
## Background
<background>

## Acceptance Criteria
- [ ] <criterion 1>
- [ ] <criterion 2>

## Notes
<out of scope / caveats>
```

> "Does this look right? I'll create the Jira ticket now."

Once confirmed, create the ticket using the `createJiraIssue` MCP tool:

- `cloudId`: `3c8a4f06-8ecc-4723-876f-b096b816c6ec`
- `projectKey`: `PDX`
- `issueTypeName`: as chosen above
- `summary`: as drafted
- `description`: full description in markdown
- `contentFormat`: `markdown`
- `additional_fields`: `{ "labels": ["provardx-cli"] }`

The tool returns the new ticket key (e.g. `PDX-193`). Set `TICKET = PDX-<returned-number>`.

Show the user: `Ticket created: https://provartesting.atlassian.net/browse/<TICKET>`

---

### Option C — No ticket (PDX-0)

Set `TICKET = PDX-0`. No Jira steps. Use this only for framework chores, internal tooling, or changes with no observable user or system behaviour change.

---

### Derive branch variables

Ask: "What type of change is this? (feature / fix)" — skip if already obvious from the issue type.

Ask for a short branch slug (kebab-case, ≤ 30 chars, no spaces).

Derive:

- `BRANCH_TYPE` = `feature` or `fix`
- `BRANCH` = `feature/PDX-<number>-<slug>` or `fix/PDX-<number>-<slug>` (or `feature/<slug>` for PDX-0)

**CONFIRM**: "I'll create branch `<BRANCH>` off `develop`. Proceed?"

---

## Step 1 — Create worktree and install dependencies

```sh
# From the main repo root
git worktree add .claude/worktrees/<BRANCH> -b <BRANCH> develop

# Install node_modules so husky hooks work — ALWAYS do this in a new worktree
cd .claude/worktrees/<BRANCH> && yarn install
```

The `yarn install` step is mandatory. Without it, the pre-commit hook cannot find `wireit` and will fail with "wireit is not recognized".

---

## Step 2 — Implement the change

Work in the worktree at `.claude/worktrees/<BRANCH>/`.

Before every commit attempt, run in the worktree directory:

```sh
yarn compile
node_modules/.bin/nyc node_modules/.bin/mocha "test/**/*.test.ts"
node scripts/mcp-smoke.cjs 2>/dev/null
yarn lint
```

Fix any failures before staging. Do not move to Step 3 until all four pass.

---

## Step 3 — Stage and commit

Stage files explicitly — never `git add -A`:

```sh
git add <file1> <file2> ...
```

Commit with the required PDX format:

```sh
git commit -m "$(cat <<'EOF'
<TICKET>: <type>(<scope>): <subject under 72 chars>

RCA: <at least 40 chars — requirement or root cause>
Fix: <at least 40 chars — what was implemented or changed>
EOF
)"
```

Valid `type` values: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`
Valid `scope` values: `mcp`, `prompts`, `resources`, `cli`, `test`, `docs`, `ci`

If the commit-msg hook rejects the message, read the error and fix the message. **Do not use `--no-verify` unless the user explicitly approves it.**

---

## Step 4 — Push and open PR

```sh
git push -u origin <BRANCH>
```

The pre-push hook runs `yarn build && yarn test` (60–120 seconds). If it fails, fix the issue, commit the fix (Step 3 format), and push again.

Open the PR:

```sh
gh pr create \
  --base develop \
  --title "<TICKET>: <short description>" \
  --body "$(cat <<'EOF'
## Summary
- <bullet>

## Jira
https://provartesting.atlassian.net/browse/<TICKET>

## Test plan
- [ ] yarn compile passes
- [ ] yarn test:only passes
- [ ] mcp-smoke.cjs passes
- [ ] yarn lint passes

## Changes
- <file>: <what changed>
EOF
)"
```

Omit the `## Jira` section for `PDX-0` work.

**CONFIRM**: Show the user the PR URL and ask: "PR is open. Should I check the Copilot review now?"

---

## Step 5 — Address Copilot review

```sh
gh pr view <pr-number> --comments
gh pr checks <pr-number>
```

For each Copilot comment:

- **Valid concern** → fix in the worktree, commit (Step 3 format), push
- **Not applicable** → reply explaining why: `gh pr comment <pr-number> --body "..."`
- **Security comment** → always address; never dismiss without strong justification

---

## Step 6 — Merge and close ticket

**CONFIRM**: "All checks pass. Should I merge the PR?"

```sh
gh pr merge <pr-number> --squash --delete-branch
```

For ticketed work (non-PDX-0): transition the Jira ticket to Closed.

- Web: `https://provartesting.atlassian.net/browse/<TICKET>`
- MCP: `transitionJiraIssue` (cloudId: `3c8a4f06-8ecc-4723-876f-b096b816c6ec`)

Clean up the worktree:

```sh
git worktree remove .claude/worktrees/<BRANCH>
git worktree prune
```

---

## Hook failures quick-reference

| Hook       | Failure                    | Fix                                                            |
| ---------- | -------------------------- | -------------------------------------------------------------- |
| pre-commit | `wireit is not recognized` | Run `yarn install` in the worktree first                       |
| pre-commit | ESLint violation           | Fix the violation, `git add` the file, retry                   |
| pre-commit | Prettier                   | Run `yarn pretty-quick --staged`, restage, retry               |
| commit-msg | Wrong format               | Read error, rewrite message with `git commit --amend -m "..."` |
| commit-msg | Lines too short            | `RCA:` or `Req:` and `Fix:` each need ≥ 40 characters          |
| pre-push   | Compile error              | Fix TypeScript error, commit, push again                       |
| pre-push   | Test failure               | Fix the test, commit, push again                               |
