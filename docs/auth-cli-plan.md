# Provar Auth — provardx-cli Implementation Plan

**Audience:** provardx-cli development team / agent  
**Repo:** provardx-cli (this repo)  
**Parallel work:** AWS backend team works from `auth-aws-backend-plan.md` simultaneously  
**Branch:** `feature/auth-and-quality-hub-api`

---

## Dependency Map

Most CLI work has **no AWS dependency** and can begin immediately. The only blocking
dependencies are:

| CLI work                              | Blocked until                               |
| ------------------------------------- | ------------------------------------------- |
| `set-key`, `status`, `clear` commands | Not blocked — build now                     |
| Key storage + reading logic           | Not blocked — build now                     |
| MCP local fallback path               | Not blocked — build now                     |
| Quality Hub API client (HTTP layer)   | Not blocked — mock the URL in tests         |
| MCP tools calling `/validate`         | Needs Phase 1 handoff (API URL + test key)  |
| `sf provar auth login` (Cognito flow) | Needs Phase 2 handoff (Pool ID + Client ID) |
| `sf provar auth login` (SF ECA flow)  | Needs Phase 3 (ECA Consumer Key)            |

---

## Phase 1 — Foundation (Start Immediately)

Everything here is buildable today with zero AWS dependency.

### 1.1 — New file: `src/services/auth/credentials.ts`

> **Layout note:** The project uses `src/services/` for shared logic (see
> `src/services/projectValidation.ts`). `src/lib/` is the TypeScript **output** directory
> (`tsconfig.json` outDir: `lib`). Do NOT use `src/lib/` as a source folder.

The single source of truth for key storage and resolution. Every MCP tool and auth command
imports from here — nothing else reads credentials directly.

**Responsibilities:**

- `getCredentialsPath()` — returns `~/.provar/credentials.json`
- `readStoredCredentials()` — reads and parses the file, returns null on any failure
- `writeCredentials(key, prefix, source)` — writes the file atomically with correct permissions
- `clearCredentials()` — deletes the file
- `resolveApiKey()` — returns the key to use, priority: `PROVAR_API_KEY` env var → stored file → null

**`resolveApiKey()` implementation detail:**

```typescript
export function resolveApiKey(): string | null {
  const envKey = process.env.PROVAR_API_KEY?.trim();
  if (envKey) return envKey; // non-empty env var wins
  const stored = readStoredCredentials();
  return stored?.api_key ?? null; // file fallback or null
}
```

Treat `PROVAR_API_KEY=""` (empty string) as "not set" — this is common in CI when
unsetting a variable. Trimming handles accidental whitespace.

**Key format contract:** All keys start with `pv_k_`. Reject anything else.

**File shape written to disk:**

```json
{
  "api_key": "pv_k_...",
  "prefix": "pv_k_abc123ef",
  "set_at": "2026-04-10T12:00:00.000Z",
  "source": "manual | cognito | salesforce"
}
```

**`writeCredentials()` permissions:**

```typescript
export function writeCredentials(key: string, prefix: string, source: string): void {
  const p = getCredentialsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  // mode: 0o600 on the writeFileSync sets permissions atomically on creation (POSIX)
  fs.writeFileSync(p, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
  // chmodSync also needed for re-runs on existing files; silent no-op on Windows
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    /* Windows: no file permission model */
  }
}
```

**`StoredCredentials` type — define once with optional Phase 2 fields:**

```typescript
interface StoredCredentials {
  api_key: string;
  prefix: string;
  set_at: string;
  source: 'manual' | 'cognito' | 'salesforce';
  // Phase 2 fields — optional so Phase 1 files remain valid after upgrade
  username?: string;
  tier?: string;
  expires_at?: string;
}
```

**File location:** `~/.provar/credentials.json`

This keeps Provar state out of `~/.sf/` (Salesforce CLI's managed namespace). Creating
`~/.provar/` on first write is handled by `mkdirSync({recursive: true})`.

Add `credentials.json` to `.gitignore` as a belt-and-suspenders measure even though the
path is outside the repo.

---

### 1.2 — New commands: `sf provar auth set-key`, `auth status`, `auth clear`

Three new commands under `src/commands/provar/auth/`.

Full TypeScript implementations are in `auth-option-b-temp.md`. Summary of each:

**`set-key.ts`**

- Flag: `--key` (required, string)
- Validates key starts with `pv_k_`
- Calls `writeCredentials()` from credentials.ts
- Prints confirmation showing prefix only (never echo the full key back)

**`status.ts`**

- No flags
- Calls `resolveApiKey()` — reports source (env var / file / not set)
- Shows prefix, set_at, expiry (if known from Phase 2 fields)
- Clearly states whether validation will be API-based or local-only
- Never prints the full key

**`clear.ts`**

- No flags
- Calls `clearCredentials()`
- Warns that the next validation will fall back to local mode

**Required supporting files:**

```
messages/
  sf.provar.auth.set-key.md    ← required (OCLIF loads summaries/descriptions from here)
  sf.provar.auth.status.md
  sf.provar.auth.clear.md

package.json — add auth subtopic to oclif.topics.provar.subtopics:
  "auth": {
    "description": "Commands to manage Provar API key authentication."
  }
```

**Tests:** `test/unit/commands/provar/auth/*.test.ts`

- set-key: writes file with correct content; rejects non-`pv_k_` keys
- status: correct output when env var set / file set / nothing set
- clear: deletes file; no error when file does not exist

---

### 1.3 — New file: `src/services/qualityHub/client.ts`

The HTTP client that calls the Quality Hub API. Isolates all network calls in one place so
MCP tools never make raw HTTP requests.

**Responsibilities:**

- `validateTestCaseViaApi(xml, apiKey, baseUrl)` — `POST /validate`, returns normalised result
- Reads base URL from `PROVAR_QUALITY_HUB_URL` env var
- Attaches two headers: `x-provar-key: pv_k_...` (per-user auth) and `x-api-key: <infraKey>` (AWS API Gateway gate, from `PROVAR_INFRA_KEY` env var)
- Normalises the raw API response via `normaliseApiResponse()` to match local `validateTestCase()` shape
- On HTTP errors: maps status codes to typed errors (401 → `QualityHubAuthError`, 429 → `QualityHubRateLimitError`, etc.)

> **Header note (AWS memo 2026-04-10):** The AWS API Gateway has `ApiKeyRequired: true` with its own `x-api-key` infra gate. The user's `pv_k_` key travels in a _separate_ `x-provar-key` header. `PROVAR_INFRA_KEY` holds the shared gateway key (not secret, provided at Phase 1 handoff).

**Why a separate client file:**

- Mockable in tests without network calls
- Base URL is configurable — CLI team can point at staging or dev during development
- Single place to add retry logic, timeout config (recommended: 5s), or response caching later

**Stub for development (before Phase 1 handoff):**

```typescript
// src/services/qualityHub/client.ts
// Stub — replace with real HTTP call once API URL is provided

export async function validateTestCaseViaApi(
  _xml: string,
  _apiKey: string, // per-user pv_k_ key → x-provar-key header
  _baseUrl: string
): Promise<QualityHubValidationResult> {
  // TODO: replace with real HTTP call after Phase 1 handoff
  // POST <_baseUrl>/validate
  //   Headers: x-provar-key: _apiKey, x-api-key: getInfraKey()
  //   Body:    { test_case_xml: _xml }
  // Normalise response via normaliseApiResponse(raw)
  throw new Error('Quality Hub API URL not configured. Set PROVAR_QUALITY_HUB_URL.');
}
```

**Response shape normalisation (confirmed with AWS team, 2026-04-10):**

| Raw API field                   | Normalised field               | Notes                                                     |
| ------------------------------- | ------------------------------ | --------------------------------------------------------- |
| `valid: boolean`                | `is_valid: boolean`            | Direct rename                                             |
| _(not returned)_                | `validity_score: number`       | Derived: `valid ? 100 : max(0, 100 - errors.length * 20)` |
| `quality_metrics.quality_score` | `quality_score: number`        | Nested → flat                                             |
| `errors[].severity: "critical"` | `issues[].severity: "ERROR"`   | Collapsed to two-value enum                               |
| `warnings[].severity: *`        | `issues[].severity: "WARNING"` | All non-error severities → WARNING                        |
| `errors[]` + `warnings[]`       | `issues[]`                     | Two arrays merged, errors first                           |
| `applies_to: string[]`          | `applies_to?: string`          | First element only                                        |
| `recommendation`                | `suggestion`                   | Renamed                                                   |

> **Stub behaviour:** When this throws, the MCP tool's error-handling path catches it
> and falls back to local validation (same as a network error). No user-visible crash.
> A user who sets a key before Phase 1 handoff receives local results with
> `validation_source: "local_fallback"` and an "API unreachable" warning — correct
> and safe.

---

### 1.4 — Update `provar.testcase.validate` MCP tool

**File:** `src/mcp/tools/testCaseValidate.ts`

**Handler must be converted to async** (currently sync; required for the HTTP call):

```typescript
// Before
server.tool('provar.testcase.validate', ..., ({ content, xml, file_path }) => { ... });

// After
server.tool('provar.testcase.validate', ..., async ({ content, xml, file_path }) => { ... });
```

**Update `TestCaseValidationResult` interface:**

```typescript
export interface TestCaseValidationResult {
  is_valid: boolean;
  validity_score: number;
  quality_score: number;
  // ... existing fields unchanged ...
  /** Always present — indicates which ruleset produced this result. */
  validation_source: 'quality_hub' | 'local' | 'local_fallback';
  /** Present when falling back — explains why and what to do. */
  validation_warning?: string;
}
```

**Decision tree:**

```
Call received
  │
  ├─ resolveApiKey() returns a key?
  │     │
  │     YES → try { validateTestCaseViaApi() }
  │              ├─ 200: return API result + validation_source: "quality_hub"
  │              ├─ 401: return local result + validation_source: "local_fallback"
  │              │         + warning: key invalid, run sf provar auth set-key
  │              ├─ 429: return local result + validation_source: "local_fallback"
  │              │         + warning: rate limited, try again
  │              └─ any throw/network error: return local result
  │                        + validation_source: "local_fallback"
  │                        + warning: API unreachable
  │
  └─ NO key → run local validateTestCase()
               return result + validation_source: "local"
               + onboarding message: how to get a key
```

**Warning message format** (when falling back):

```
Quality Hub validation unavailable — running local validation only (structural rules, no quality scoring).
To enable Quality Hub (170 rules): visit https://success.provartesting.com, copy your API key, then run:
  sf provar auth set-key --key <your-key>
For CI/CD: set the PROVAR_QUALITY_HUB_URL and PROVAR_API_KEY environment variables.
```

**Do not break existing behaviour.** The local `validateTestCase()` is already trusted and
tested. The API path is additive — if it is unavailable for any reason, the tool still
returns a useful result.

**Tests:**

- When no key: returns local result with `validation_source: "local"` and onboarding warning
- When key set + stub returns 200: returns API result with `validation_source: "quality_hub"`
- When key set + stub returns 401: returns local result with `validation_source: "local_fallback"` + auth warning
- When key set + stub returns 429: returns local result + rate limit warning
- **When key set + stub throws (network error / unreachable):** returns local result with `validation_source: "local_fallback"` + unreachable warning
- Existing tests must continue to pass (they call the pure `validateTestCase()` function directly — unaffected by the async refactor)

---

### 1.5 — New test file: `test/unit/services/auth/credentials.test.ts`

The `credentials.ts` module is the trust boundary of the entire auth system. Unit test it
directly, not just through the command layer.

Required tests:

```typescript
describe('resolveApiKey', () => {
  afterEach(() => {
    delete process.env.PROVAR_API_KEY;
  }); // env isolation is required

  it('env var takes priority over stored file');
  it('empty PROVAR_API_KEY="" falls through to stored file');
  it('returns null when neither env var nor file is set');
  it('returns null when file exists but is corrupt JSON');
});

describe('readStoredCredentials', () => {
  it('returns null when file does not exist');
  it('returns null on JSON parse failure');
  it('returns parsed object on valid file');
});

describe('writeCredentials', () => {
  it('writes file with correct shape');
  it('rejects key that does not start with pv_k_');
  // Note: file mode 0600 only verifiable on Linux/macOS; skip on Windows in CI
});

describe('clearCredentials', () => {
  it('deletes the file when it exists');
  it('does not throw when file does not exist (ENOENT)');
});
```

**Test isolation pattern for all auth tests:** Use a temp directory for the credentials
file path. Never write to the real `~/.provar/credentials.json` in tests. Either
mock `getCredentialsPath()` or override `PROVAR_CREDENTIALS_PATH` env var.

---

### 1.6 — Environment variable documentation

Add to `README.md` (or `docs/development.md`) a table of environment variables the CLI reads:

| Variable                 | Purpose                            | Default                                           |
| ------------------------ | ---------------------------------- | ------------------------------------------------- |
| `PROVAR_API_KEY`         | API key for Quality Hub validation | None (falls back to `~/.provar/credentials.json`) |
| `PROVAR_QUALITY_HUB_URL` | Quality Hub API base URL           | Production URL (set by AWS team)                  |

---

### Phase 1 Done When

- [ ] `src/services/auth/credentials.ts` written and unit tested (`test/unit/services/auth/credentials.test.ts`)
- [ ] Three auth commands written and unit tested (`test/unit/commands/provar/auth/*.test.ts`)
- [ ] Messages files created (`messages/sf.provar.auth.*.md`)
- [ ] `package.json` updated with `auth` OCLIF subtopic
- [ ] `src/services/qualityHub/client.ts` stub written
- [ ] `provar.testcase.validate` updated with key-reading + fallback (async handler)
- [ ] `TestCaseValidationResult` interface includes `validation_source` and `validation_warning?`
- [ ] All existing tests still pass (`yarn test:only`)
- [ ] TypeScript compiles clean (`yarn compile`)

**At this point:** AWS team provides Phase 1 handoff (API URL + test key).
Replace the stub in `client.ts` with the real HTTP call. Run integration test.

---

## Phase 2 — `sf provar auth login` (Cognito)

**Starts when:** AWS Phase 2 handoff received (Cognito User Pool ID + App Client ID)

### 2.1 — New command: `sf provar auth login`

**File:** `src/commands/provar/auth/login.ts`

**Flow (email OTP / passwordless — simplest UX):**

```
sf provar auth login

Enter your Provar Success Portal email: user@company.com

A one-time code was sent to user@company.com.
Enter code: ██████

✓ Authenticated as user@company.com (enterprise)
✓ API key stored (pv_k_abc123...). Valid for 90 days.
  Run 'sf provar auth status' to check at any time.
```

**Implementation notes:**

- Use the AWS Cognito `InitiateAuth` API with `USER_AUTH` flow (email OTP / MAGIC_LINK)
- If passwordless is not available on the User Pool, use SRP (`USER_SRP_AUTH`) with a
  temporary password flow — confirm with AWS team which flows are enabled
- On success: call `POST /auth/exchange` with the Cognito access token
- `/auth/exchange` returns `{ api_key, prefix, tier, username, expires_at }`
- Call `writeCredentials(api_key, prefix, 'cognito')`
- Never log or print the full key — only the prefix

**Flags:**

- `--email` (optional) — skip the prompt if provided
- `--url` (optional) — override the Quality Hub API base URL (for testing against dev)

**Tests:**

- Mock Cognito calls and the exchange endpoint
- Verify credentials file is written correctly
- Verify correct error messages for wrong code, expired code, no license

---

### 2.2 — Update `credentials.ts`

The `StoredCredentials` interface already has `username?`, `tier?`, `expires_at?` as
optional fields (defined in Phase 1). Phase 2 simply writes them. No migration code
needed — Phase 1 files work correctly as Phase 2 reads (optional fields absent = fine).

Add `writeCredentialsFromLogin(response: AuthExchangeResponse)` which writes all fields
including the optional Phase 2 ones.

The `status` command should show `tier` and `expires_at` if present.

---

### Phase 2 Done When

- [ ] `sf provar auth login` works end-to-end against staging
- [ ] Full flow tested: `login` → `status` (shows tier + expiry) → `sf provar testcase validate` uses API
- [ ] `sf provar auth clear` + retry `login` works
- [ ] PROVAR_API_KEY env var still takes priority over stored credentials
- [ ] Existing unit tests still pass

---

## Phase 3 — Salesforce ECA (Later)

**Starts when:** Salesforce admin completes `auth-eca-admin-guide.md` and provides
the ECA Consumer Key; AWS team deploys `/auth/exchange-sf`

**CLI work is minimal** — the PKCE OAuth2 flow uses `@salesforce/core`'s `WebOAuthServer`
which handles the browser open + localhost callback automatically.

### 3.1 — Update `sf provar auth login`

Add `--provider` flag: `cognito` (default) | `salesforce`

With `--provider salesforce`:

1. Open browser to the EC org's OAuth2 authorize URL with PKCE
2. `WebOAuthServer` handles the localhost callback and receives the auth code
3. Exchange code for SF access token
4. Call `POST /auth/exchange-sf` with the SF access token
5. Same credentials write as Cognito path

**Nothing else changes.** Key storage, MCP tool integration, and the fallback path are
all provider-agnostic.

---

## Non-Blocking Work (Any Time)

These tasks have no external dependencies and can be picked up between phases:

### NB1 — `provardx.ping` MCP tool: add auth status

Update the ping tool to include auth status in its response:

```json
{
  "pong": "ping",
  "ts": "...",
  "server": "provar-mcp@1.5.0",
  "auth": {
    "key_configured": true,
    "source": "file",
    "prefix": "pv_k_abc123",
    "validation_mode": "quality_hub"
  }
}
```

This lets the AI agent check auth status without a separate tool call.

### NB2 — Smoke test entries

Add to `scripts/mcp-smoke.cjs`:

- `provar.testcase.validate` with no key → should return local result, not an error
- `provar.testcase.validate` with a test key → should return quality_hub result

Update `TOTAL_EXPECTED` if tool count changes.

### NB3 — `docs/mcp.md` update

Add a section on auth:

- What `validation_source` values mean
- How to configure an API key
- Environment variables
- CI/CD usage

---

## Files Created or Modified

| File                                          | Status                               | Phase |
| --------------------------------------------- | ------------------------------------ | ----- |
| `src/services/auth/credentials.ts`            | **New**                              | 1     |
| `src/services/qualityHub/client.ts`           | **New**                              | 1     |
| `src/commands/provar/auth/set-key.ts`         | **New**                              | 1     |
| `src/commands/provar/auth/status.ts`          | **New**                              | 1     |
| `src/commands/provar/auth/clear.ts`           | **New**                              | 1     |
| `src/mcp/tools/testCaseValidate.ts`           | **Modify**                           | 1     |
| `messages/sf.provar.auth.set-key.md`          | **New**                              | 1     |
| `messages/sf.provar.auth.status.md`           | **New**                              | 1     |
| `messages/sf.provar.auth.clear.md`            | **New**                              | 1     |
| `package.json`                                | **Modify** (add auth OCLIF subtopic) | 1     |
| `test/unit/services/auth/credentials.test.ts` | **New**                              | 1     |
| `test/unit/commands/provar/auth/*.test.ts`    | **New**                              | 1     |
| `test/unit/mcp/testCaseValidate.test.ts`      | **Modify**                           | 1     |
| `src/commands/provar/auth/login.ts`           | **New**                              | 2     |
| `src/commands/provar/auth/login.ts`           | **Modify** (add --provider flag)     | 3     |

---

## Branching and PRs

```
develop
  └─ feature/auth-and-quality-hub-api
       ├─ Phase 1 committed incrementally (one commit per section)
       ├─ PR opened against develop after Phase 1 Done criteria met
       ├─ Phase 2 added to same branch OR a follow-on branch
       └─ Phase 3 on its own branch when ECA is ready
```

Version bump: this work warrants a `beta.N+1` bump per the branch conventions in `CLAUDE.md`.

---

## Questions for AWS Team (Resolve Before Starting Phase 1 Work on `client.ts`)

1. What is the production Quality Hub API base URL?
2. What is the request shape for `POST /validate` — confirm it matches the Postman collection
   in `docs/Quality Hub API.postman_collection.json`
3. Will the validator Lambda in dev/staging be deployed with the key-hash check enabled
   before the CLI team's integration testing?
4. Confirm key prefix format is `pv_k_` — the CLI validates this on `set-key`

---

## GSTACK REVIEW REPORT

| Review     | Trigger            | Runs | Status | Key Findings                  |
| ---------- | ------------------ | ---- | ------ | ----------------------------- |
| Eng Review | `/plan-eng-review` | 1    | DONE   | 7 issues resolved (see below) |

**Resolved issues (2026-04-10):**

1. **File layout** — `src/lib/` → `src/services/` (matches existing project convention; `lib/` is the TS output dir)
2. **OCLIF topics** — Added `package.json` auth subtopic registration to plan
3. **Messages files** — Added `messages/sf.provar.auth.*.md` to Phase 1 file list
4. **Async refactor** — Explicit note: tool handler must be converted from sync to async
5. **TS interface** — Added `validation_source` and `validation_warning?` to `TestCaseValidationResult`
6. **Empty env var** — `resolveApiKey()` treats `PROVAR_API_KEY=""` as unset (`.trim()` + falsy check)
7. **File permissions** — `writeFileSync(mode:0o600)` + `chmodSync` for re-runs; Windows no-op noted
8. **Credentials location** — `~/.provar/credentials.json` (not `~/.sf/`) to avoid SF CLI namespace conflict
9. **Schema migration** — Phase 2 fields optional in `StoredCredentials` type; no migration code needed
10. **Test gaps** — Added `credentials.test.ts`, network error test case, env var isolation pattern
