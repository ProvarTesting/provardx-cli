# Claude Code — Project Instructions

This file is read automatically by Claude Code at the start of every session. Follow these rules when working in this repo.

---

## Documentation Requirements

**Every PR that adds, modifies, or removes an MCP tool must update documentation.** The full set of places to update:

| What changed                                            | Where to update                                                                                                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New MCP tool                                            | `docs/mcp.md` (add tool entry with schema + example), `docs/mcp-pilot-guide.md` (add evaluation scenario if user-facing), `README.md` (update tool count if referenced) |
| Modified tool description / parameters / errors         | `docs/mcp.md` (update the relevant tool section)                                                                                                                        |
| Removed tool                                            | `docs/mcp.md`, `docs/mcp-pilot-guide.md`, `README.md`                                                                                                                   |
| New error code or suggestion field                      | `docs/mcp.md` (Troubleshooting or Error Codes section)                                                                                                                  |
| Security model change (path policy, license, transport) | `docs/mcp.md` (Security Model section), `docs/mcp-pilot-guide.md` (Security Model section)                                                                              |
| New NitroX tool or schema rule                          | `docs/mcp.md` (NitroX section), `docs/mcp-pilot-guide.md` (Scenario 7)                                                                                                  |
| Smoke test count change                                 | Update `TOTAL_EXPECTED` in `scripts/mcp-smoke.cjs`                                                                                                                      |

**External / customer-facing docs** (`docs/provar-mcp-public-docs.md`, `docs/university-of-provar-mcp-course.md`) are maintained separately by the Provar team — flag changes that affect public-facing behaviour in your PR description so those can be updated manually.

---

## Test Coverage Requirements

Every PR must include tests for new or changed behaviour:

- **New MCP tool** → unit tests in `test/unit/mcp/<toolGroup>Tools.test.ts` covering: happy path, path policy rejection, missing required fields, and any tool-specific error codes
- **Modified error handling** → at least one positive test (error path fires) and one negative test (does not fire for non-matching input)
- **New validation rule** → test that the rule fires correctly and that a valid input passes
- **Smoke test** → add an entry in `scripts/mcp-smoke.cjs` for each new tool; update `TOTAL_EXPECTED`

Run before every commit:

```sh
yarn test:only          # unit tests — must all pass
node scripts/mcp-smoke.cjs 2>/dev/null   # smoke — must show all PASS
yarn compile            # TypeScript — must be clean
```

> **Wireit caching gotcha:** `yarn test:only` is wired through wireit and can return a cached result
> after changes (e.g. after `git stash pop` or switching branches). When you need a guaranteed fresh
> run, bypass wireit entirely:
>
> ```sh
> node_modules/.bin/nyc node_modules/.bin/mocha "test/**/*.test.ts"
> ```
>
> This is equivalent to `yarn test:dev` and always re-executes against the current source.

---

## MCP Tool Authoring Standards

### Tool description quality

Every tool description must answer these questions for an AI agent reading it cold:

1. **What does it do?** (one sentence)
2. **What prerequisite tools must run first?** (e.g. `config.load` before `metadata.download`)
3. **What are the correct flags / parameters?** Include a concrete example in the `flags` field description when flags are free-form
4. **What does a failure mean?** If a known error pattern exists (e.g. `[DOWNLOAD_ERROR]` = auth failure), say so in the description or return a `details.suggestion`

### Field descriptions

- Fields that accept a **string key or password** must say "string value, NOT a file path" if there is any risk of confusion with a path
- Fields that accept a **file path** must note if the path must be within `--allowed-paths`
- Optional fields that have a dangerous default (e.g. overwriting existing files) must call that out

### Error responses

- Return `details: { suggestion: '...' }` when a known error pattern maps to a common root cause and there is an actionable fix
- Never pass `details: {}` — omit `details` entirely when there is nothing extra to say (keeps the response shape stable)
- Error codes follow `SCREAMING_SNAKE_CASE`; document new codes in `docs/mcp.md`

### Path safety

- Call `assertPathAllowed(path, config.allowedPaths)` on **every** path input before any file operation — not just the output path
- Use `path.resolve()` before `fs.existsSync` / `fs.readFileSync` / `fs.writeFileSync`
- Never construct shell commands from user input; use `spawnSync` with an args array

---

## Branch and PR Conventions

- Feature branches off `develop`: `feature/<description>`
- Bug/fix branches off `develop`: `fix/<description>`
- Release branches off `develop`: `release-v<semver>`
- PRs target `develop`; releases are merged develop → main
- Version in `package.json` follows `<major>.<minor>.<patch>-beta.<n>` on develop
- Bump the beta suffix (`beta.N → beta.N+1`) on any PR that triggers a publish

---

## Lint

The project uses ESLint with `@typescript-eslint` strict rules. Common gotchas:

- `complexity` max is **20** — extract helpers if a function grows past that
- `no-unsafe-assignment` / `no-unsafe-call` — cast through `unknown` not `any`
- `no-unnecessary-type-assertion` — TypeScript narrows after `typeof x === 'string'` checks; remove the redundant cast
- `camelcase` — `nitroX` is valid camelCase (capital X starts the next word)

CI runs lint as part of `sf-prepack` — do not skip with `--no-verify` on the final merge commit.
