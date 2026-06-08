# Bug report — `provar_automation_testrun` fails with `ENOBUFS` on verbose runs

> **Recommendation:** replace the in-memory `spawnSync` capture in `runSfCommand` with **stream-to-file** stdio so there is no buffer ceiling to overflow.

|                                  |                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Component**                    | `@provartesting/provardx-cli` — MCP server (`provar mcp start`)                                                                 |
| **Tool**                         | `provar_automation_testrun` (also affects `…_compile`, `…_metadata_download`, `…_setup`, all `qualityhub_*` — shared code path) |
| **Version observed**             | 1.6.0 (`develop`)                                                                                                               |
| **Severity**                     | High — recurring; the primary MCP run tool fails on real Salesforce UI runs and forces a manual CLI fallback                    |
| **Platform observed**            | Windows 11, sf standalone CLI (`C:\Program Files\sf\client\bin\sf.cmd`, so `shell:true`), Provar 307                            |
| **Status of current mitigation** | `maxBuffer` was already raised 1 MB → 50 MB (`sfSpawn.ts:95`); **still reproduces**                                             |

---

## 1. Symptom

The tool returns an opaque error and the run is lost (even though the underlying Provar run actually started and wrote results to disk):

```json
{
  "error_code": "ENOBUFS",
  "message": "spawnSync C:\\WINDOWS\\system32\\cmd.exe ENOBUFS",
  "retryable": false,
  "requestId": "cb8b2b24-…"
}
```

Running the same thing in the terminal succeeds:

```
sf provar automation test run --json   # → {"status":0,"result":{"success":true}}
```

## 2. Reproduction

1. `provar_automation_config_load` a `provardx-properties.json` with `testOutputLevel: "DETAILED"`, `connectionRefreshType: "Reload"`, `metadataLevel: "Reuse"`, targeting a real Salesforce Lightning UI test (e.g. a Lead-convert flow against a sandbox).
2. `provar_automation_testrun`.
3. On a verbose run — **especially the first run after a metadata reload** — the tool aborts with `ENOBUFS`. The same command via `sf provar automation test run --json` in a terminal completes normally.

## 3. Root cause

`runSfCommand` captures the child's **entire** stdout/stderr in an in-memory buffer:

```ts
// src/mcp/tools/sfSpawn.ts:282
const result = sfSpawnHelper.spawnSync(spawnExecutable, spawnArgs, {
  encoding: 'utf-8',
  shell: useShell,
  maxBuffer: MAX_BUFFER, // 50 * 1024 * 1024  (sfSpawn.ts:95)
});
```

`spawnSync` buffers all child output in RAM and, the moment the combined output exceeds `maxBuffer`, **aborts the whole call** with `result.error.code === 'ENOBUFS'` (message `spawnSync <shell> ENOBUFS`). `runSfCommand` then re-throws that error (`sfSpawn.ts:288-294`) and `handleSpawnError` surfaces it verbatim (`automationTools.ts:59-75`).

A `DETAILED` Provar run emits a very large stdout — every step plus the Java **schema-validator / logger noise** that `filterTestRunOutput` exists to strip. Crucially, that filter runs **after** the full buffer is captured (`automationTools.ts` testrun handler), so it cannot prevent the overflow that kills the call.

### Evidence the 50 MB build still overflows (not just a stale process)

- `MAX_BUFFER` is already 50 MB in `1.6.0` and committed on `develop` (`sfSpawn.ts:95`), and the tool description claims ENOBUFS "is now rare" (`automationTools.ts:309`).
- The MCP update cache (`$PROVAR_HOME/.cache/.mcp-update-cache.json`) recorded `currentVersion: "1.6.0"` with a `checkedAt` timestamp **~13 minutes before** the failing run — i.e. a 50 MB build was live and _still_ hit ENOBUFS on a single verbose Lead-convert run.

### Secondary (Windows) factor

With `shell: true` through `cmd.exe`, a large piped output can also surface a genuine OS-level `ENOBUFS` ("No buffer space available") independent of `maxBuffer`. Both failure modes share the same remedy below.

## 4. Why raising the cap is not the fix

A cap is a ceiling. Set it to _N_ and a verbose-enough run (bigger org, more steps, validator dumps, first-run metadata logging) dies at _N+1_. The 1 MB → 50 MB bump reduced frequency but did not remove the failure class. **The output must not be buffered in memory at all.**

## 5. Proposed fix — stream child stdio to temp files

Capture the child's stdout/stderr to **files** instead of an in-memory pipe, then read them back after the process exits. No in-memory cap ⇒ `ENOBUFS` becomes structurally impossible from `maxBuffer`, and because the child writes straight to a file descriptor there is no pipe back-pressure (also fixes the Windows OS-level `ENOBUFS`). Provar already persists JUnit + logs to the results dir, so disk is the natural sink.

```ts
// Sketch for runSfCommand — replace the single spawnSync block.
import { mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'provar-sf-'));
const outPath = join(dir, 'stdout.log');
const errPath = join(dir, 'stderr.log');
const outFd = openSync(outPath, 'w');
const errFd = openSync(errPath, 'w');
try {
  const result = sfSpawnHelper.spawnSync(spawnExecutable, spawnArgs, {
    shell: useShell,
    stdio: ['ignore', outFd, errFd], // no maxBuffer, no encoding — not piped to memory
  });
  closeSync(outFd);
  closeSync(errFd);
  if (result.error) {
    const err = result.error as NodeJS.ErrnoException;
    if (err.code === 'ENOENT') throw new SfNotFoundError(resolvedSfPath);
    throw result.error;
  }
  return {
    stdout: readFileSync(outPath, 'utf-8'),
    stderr: readFileSync(errPath, 'utf-8'),
    exitCode: result.status ?? 1,
  };
} finally {
  try {
    closeSync(outFd);
  } catch {
    /* already closed */
  }
  try {
    closeSync(errFd);
  } catch {
    /* already closed */
  }
  rmSync(dir, { recursive: true, force: true });
}
```

### Notes / edge cases

- **Signature unchanged** — callers still receive `{ stdout, stderr, exitCode }` strings; no change needed in `config_load`, `testrun`, `compile`, `metadata_download`, `setup`, `qualityhub_*`, or `probeProvarTopic`.
- **Tiny probe spawns** (`resolveSfExecutable` `--version` at `sfSpawn.ts:180/193`, and `updateChecker` at `updateChecker.ts:42`) can stay in-memory (output is bytes) or be given the same treatment for consistency — low priority.
- **Reading back a huge file** still allocates a large string. Since this is mainly for `filterTestRunOutput`, consider an optional enhancement: for `testrun`, return only a head+tail slice (e.g. first/last 200 KB) plus a pointer to the full on-disk log, leaving the complete output untouched on disk. This bounds the MCP response size as well.
- **Cleanup** in `finally`; `mkdtempSync` gives a unique dir so there's no collision (note: `Date.now()`/`Math.random()` are fine in the CLI; only the MCP-workflow sandbox forbids them).
- **Windows `shell:true`** works with fd stdio — `cmd.exe` inherits the handles.

## 6. Secondary improvement — make `ENOBUFS` actionable (defense in depth)

Even after the streaming fix, `handleSpawnError` (`automationTools.ts:59`) should translate a residual `code: 'ENOBUFS'` into something useful instead of `spawnSync … ENOBUFS`, e.g.:

> "Provar produced more output than the capture buffer. The full run results are on disk at `<resultsPath>`. Re-run with `sf provar automation test run --json`, or lower `testOutputLevel`."

And update the now-inaccurate tool-description lines (`automationTools.ts:309-310`) once buffering is removed.

## 7. Affected code

- `src/mcp/tools/sfSpawn.ts` — `runSfCommand` (primary change), `MAX_BUFFER` constant retired/relocated.
- No caller signature changes.

## 8. Test impact

- `test/unit/mcp/sfSpawn.test.ts` and `test/unit/mcp/automationTools.test.ts` stub `sfSpawnHelper.spawnSync` and currently assert on `{ maxBuffer, encoding }` and read `result.stdout`. These must move to the file-backed model — stub/seed the temp files (or inject the temp dir) and assert on the `stdio: ['ignore', fd, fd]` shape instead of `maxBuffer`.
- **Add a regression test**: simulate child output larger than the old cap and assert (a) no throw and (b) full capture round-trips through the temp files.

## 9. Rollout caveats

- The fix only takes effect once it is **built, published, and the MCP reconnects**. A hand-edited copy under `…/AppData/Local/sf/node_modules/@provartesting/provardx-cli` is **overwritten by `--auto-update true` on the next publish**, so the change must ship in the package — local patching is not a durable workaround.

## 10. Acceptance criteria

1. A `DETAILED` testrun whose stdout exceeds 50 MB completes through `provar_automation_testrun` with a success result and **no `ENOBUFS`** — on Windows (`shell:true`) and POSIX.
2. The tool still returns filtered stdout + JUnit `steps[]`.
3. Unit tests updated to the streaming model and green; new over-cap regression test added.

---

### Appendix — current call chain

`provar_automation_testrun` handler (`automationTools.ts`, ~`registerAutomationTestRun`) → `runSfCommand(['provar','automation','test','run', …flags])` (`sfSpawn.ts:253`) → `sfSpawnHelper.spawnSync(… { maxBuffer: 50 MB })` (`sfSpawn.ts:282`) → on overflow throws `ENOBUFS` → `handleSpawnError` (`automationTools.ts:59`).
