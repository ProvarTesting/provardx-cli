import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createCipheriv } from 'node:crypto';
import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'mocha';
import { LicenseError } from '../../../../src/mcp/licensing/licenseError.js';
import {
  hashKey,
  readCacheEntry,
  writeCacheEntry,
  isCacheEntryFresh,
  isCacheEntryWithinGrace,
  ONLINE_TTL_MS,
  OFFLINE_GRACE_MS,
} from '../../../../src/mcp/licensing/licenseCache.js';
import { validateLicense } from '../../../../src/mcp/licensing/licenseValidator.js';
import {
  readIdeLicenses,
  findActivatedIdeLicense,
  findLicenseByDecryptedKey,
} from '../../../../src/mcp/licensing/ideDetection.js';

/** Encrypt a raw license key with AES-128-ECB + PKCS5 to mimic IDE storage. */
function encryptKey(rawKey: string): string {
  const cipher = createCipheriv('aes-128-ecb', Buffer.from('provarautomation'), null);
  return Buffer.concat([cipher.update(Buffer.from(rawKey, 'utf-8')), cipher.final()]).toString('base64');
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Make a fake CacheEntry. checkedAt defaults to now. */
function makeCacheEntry(overrides: Partial<{
  keyHash: string;
  valid: boolean;
  licenseType: string;
  checkedAt: number;
}> = {}): { keyHash: string; valid: boolean; licenseType: string; checkedAt: number } {
  return {
    keyHash: 'fakehash',
    valid: true,
    licenseType: 'FixedSeat',
    checkedAt: Date.now(),
    ...overrides,
  };
}

// ── A. LicenseError ──────────────────────────────────────────────────────────

describe('LicenseError', () => {
  it('constructs with code and message', () => {
    const err = new LicenseError('LICENSE_INVALID', 'Key expired');
    assert.equal(err.code, 'LICENSE_INVALID');
    assert.equal(err.message, 'Key expired');
    assert.equal(err.name, 'LicenseError');
    assert.ok(err instanceof Error);
  });

  it('is distinguishable by instanceof', () => {
    const err = new LicenseError('X', 'msg');
    assert.ok(err instanceof LicenseError);
    assert.ok(!(new Error('msg') instanceof LicenseError));
  });
});

// ── B. licenseCache ──────────────────────────────────────────────────────────

describe('licenseCache', () => {
  let tmpDir: string;
  let origHome: string | undefined;
  let origProvarHome: string | undefined;

  beforeEach(() => {
    // Redirect PROVAR_HOME so the cache writes to a temp dir, not ~/Provar.
    // Also redirect HOME/USERPROFILE for os.homedir() fallback.
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provar-license-test-'));
    origHome = process.env['HOME'];
    origProvarHome = process.env['PROVAR_HOME'];
    process.env['HOME'] = tmpDir;
    process.env['USERPROFILE'] = tmpDir;
    process.env['PROVAR_HOME'] = path.join(tmpDir, 'Provar');
  });

  afterEach(() => {
    if (origHome !== undefined) {
      process.env['HOME'] = origHome;
      process.env['USERPROFILE'] = origHome;
    } else {
      delete process.env['HOME'];
      delete process.env['USERPROFILE'];
    }
    if (origProvarHome !== undefined) {
      process.env['PROVAR_HOME'] = origProvarHome;
    } else {
      delete process.env['PROVAR_HOME'];
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('hashKey returns a 64-char hex string', () => {
    const h = hashKey('any-test-input');
    assert.match(h, /^[0-9a-f]{64}$/);
  });

  it('hashKey is deterministic', () => {
    assert.equal(hashKey('abc'), hashKey('abc'));
  });

  it('hashKey differs for different keys', () => {
    assert.notEqual(hashKey('abc'), hashKey('ABC'));
  });

  it('readCacheEntry returns null when no cache file exists', () => {
    assert.equal(readCacheEntry('anyhash'), null);
  });

  it('writeCacheEntry creates ~/Provar/.licenses/.mcp-license-cache.json', () => {
    const entry = makeCacheEntry({ keyHash: hashKey('mykey') });
    writeCacheEntry(entry as Parameters<typeof writeCacheEntry>[0]);

    const cacheFilePath = path.join(tmpDir, 'Provar', '.licenses', '.mcp-license-cache.json');
    assert.ok(fs.existsSync(cacheFilePath), 'cache file should exist');
    const parsed = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8')) as Record<string, unknown>;
    assert.ok(parsed[entry.keyHash]);
  });

  it('readCacheEntry returns the written entry', () => {
    const hash = hashKey('round-trip-key');
    const entry = makeCacheEntry({ keyHash: hash, licenseType: 'Trial' });
    writeCacheEntry(entry as Parameters<typeof writeCacheEntry>[0]);

    const read = readCacheEntry(hash);
    assert.ok(read !== null);
    assert.equal(read?.licenseType, 'Trial');
    assert.equal(read?.valid, true);
  });

  it('readCacheEntry returns null for unknown hash', () => {
    const entry = makeCacheEntry({ keyHash: hashKey('keyA') });
    writeCacheEntry(entry as Parameters<typeof writeCacheEntry>[0]);
    assert.equal(readCacheEntry(hashKey('keyB')), null);
  });

  it('isCacheEntryFresh returns true for entry just written', () => {
    const entry = makeCacheEntry({ checkedAt: Date.now() });
    assert.ok(isCacheEntryFresh(entry as Parameters<typeof isCacheEntryFresh>[0]));
  });

  it('isCacheEntryFresh returns false when entry is older than 2h', () => {
    const entry = makeCacheEntry({ checkedAt: Date.now() - ONLINE_TTL_MS - 1 });
    assert.ok(!isCacheEntryFresh(entry as Parameters<typeof isCacheEntryFresh>[0]));
  });

  it('isCacheEntryWithinGrace returns true for entry written 30h ago', () => {
    const entry = makeCacheEntry({ checkedAt: Date.now() - 30 * 60 * 60 * 1000 });
    assert.ok(isCacheEntryWithinGrace(entry as Parameters<typeof isCacheEntryWithinGrace>[0]));
  });

  it('isCacheEntryWithinGrace returns false for entry older than 48h', () => {
    const entry = makeCacheEntry({ checkedAt: Date.now() - OFFLINE_GRACE_MS - 1 });
    assert.ok(!isCacheEntryWithinGrace(entry as Parameters<typeof isCacheEntryWithinGrace>[0]));
  });

  it('writeCacheEntry tolerates existing cache file with multiple entries', () => {
    const hashA = hashKey('keyA');
    const hashB = hashKey('keyB');
    writeCacheEntry(makeCacheEntry({ keyHash: hashA, licenseType: 'Trial' }) as Parameters<typeof writeCacheEntry>[0]);
    writeCacheEntry(makeCacheEntry({ keyHash: hashB, licenseType: 'Floating' }) as Parameters<typeof writeCacheEntry>[0]);

    assert.equal(readCacheEntry(hashA)?.licenseType, 'Trial');
    assert.equal(readCacheEntry(hashB)?.licenseType, 'Floating');
  });

  it('writeCacheEntry overwrites an existing entry for the same key', () => {
    const hash = hashKey('update-me');
    writeCacheEntry(makeCacheEntry({ keyHash: hash, valid: true }) as Parameters<typeof writeCacheEntry>[0]);
    writeCacheEntry(makeCacheEntry({ keyHash: hash, valid: false }) as Parameters<typeof writeCacheEntry>[0]);
    assert.equal(readCacheEntry(hash)?.valid, false);
  });
});

// ── C. licenseValidator — NODE_ENV=test fast-path ────────────────────────────

describe('licenseValidator (NODE_ENV=test fast-path)', () => {
  let origNodeEnv: string | undefined;

  beforeEach(() => {
    origNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'test';
  });

  afterEach(() => {
    process.env['NODE_ENV'] = origNodeEnv;
  });

  it('returns valid=true immediately in test environment', async () => {
    const result = await validateLicense();
    assert.equal(result.valid, true);
    assert.equal(result.fromCache, false);
    assert.equal(result.offlineGrace, false);
  });

  it('reports licenseType as Whitelisted in test environment', async () => {
    const result = await validateLicense();
    assert.equal(result.licenseType, 'Whitelisted');
  });
});

// ── D. ideDetection ──────────────────────────────────────────────────────────

describe('ideDetection', () => {
  let tmpDir: string;
  let origHome: string | undefined;
  let origProvarHome: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provar-ide-test-'));
    origHome = process.env['HOME'];
    origProvarHome = process.env['PROVAR_HOME'];
    // Point PROVAR_HOME to a subdirectory of tmpDir so ~/.licenses → tmpDir/Provar/.licenses
    process.env['PROVAR_HOME'] = path.join(tmpDir, 'Provar');
    process.env['HOME'] = tmpDir;
    process.env['USERPROFILE'] = tmpDir;
  });

  afterEach(() => {
    process.env['HOME'] = origHome;
    process.env['USERPROFILE'] = origHome;
    if (origProvarHome !== undefined) {
      process.env['PROVAR_HOME'] = origProvarHome;
    } else {
      delete process.env['PROVAR_HOME'];
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeLicenseFile(name: string, props: Record<string, string>): void {
    const dir = path.join(tmpDir, 'Provar', '.licenses');
    fs.mkdirSync(dir, { recursive: true });
    const content = Object.entries(props).map(([k, v]) => `${k}=${v}`).join('\n');
    fs.writeFileSync(path.join(dir, `${name}.properties`), content, 'utf-8');
  }

  it('returns empty array when licenses folder does not exist', () => {
    assert.deepEqual(readIdeLicenses(), []);
  });

  it('reads a single activated FixedSeat license (Java enum name "FixedSeat")', () => {
    // Java stores LicenseType.name() = "FixedSeat" (not the title "Fixed Seat")
    writeLicenseFile('License 1', {
      licenseStatus: 'Activated',
      licenseType: 'FixedSeat',
      lastOnlineAvailabilityCheckUtc: String(Date.now()),
    });
    const licenses = readIdeLicenses();
    assert.equal(licenses.length, 1);
    assert.equal(licenses[0].name, 'License 1');
    assert.equal(licenses[0].licenseType, 'FixedSeat');
    assert.ok(licenses[0].activated);
  });

  it('reads a FixedSeat license stored with legacy title "Fixed Seat"', () => {
    writeLicenseFile('License 1', {
      licenseStatus: 'Activated',
      licenseType: 'Fixed Seat',
      lastOnlineAvailabilityCheckUtc: String(Date.now()),
    });
    const licenses = readIdeLicenses();
    assert.equal(licenses[0].licenseType, 'FixedSeat');
  });

  it('reads a Floating license with NotActivated status', () => {
    writeLicenseFile('Floating', {
      licenseStatus: 'NotActivated',
      licenseType: 'Floating',
      lastOnlineAvailabilityCheckUtc: '0',
    });
    const licenses = readIdeLicenses();
    assert.equal(licenses[0].activated, false);
    assert.equal(licenses[0].licenseType, 'Floating');
  });

  it('ignores non-.properties files in the licenses folder', () => {
    const dir = path.join(tmpDir, 'Provar', '.licenses');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.mcp-license-cache.json'), '{}', 'utf-8');
    fs.writeFileSync(path.join(dir, 'README.txt'), 'ignore me', 'utf-8');
    assert.equal(readIdeLicenses().length, 0);
  });

  it('findActivatedIdeLicense returns null when no activated license', () => {
    writeLicenseFile('License 1', { licenseStatus: 'NotActivated', licenseType: 'Trial', lastOnlineAvailabilityCheckUtc: String(Date.now()) });
    assert.equal(findActivatedIdeLicense(), null);
  });

  it('findActivatedIdeLicense returns the most recently validated activated license', () => {
    const now = Date.now();
    writeLicenseFile('Old', { licenseStatus: 'Activated', licenseType: 'Floating', lastOnlineAvailabilityCheckUtc: String(now - 3_600_000) });
    writeLicenseFile('Recent', { licenseStatus: 'Activated', licenseType: 'FixedSeat', lastOnlineAvailabilityCheckUtc: String(now - 60_000) });
    const best = findActivatedIdeLicense();
    assert.equal(best?.name, 'Recent');
  });

  it('findLicenseByDecryptedKey returns null when no .licenses folder', () => {
    assert.equal(findLicenseByDecryptedKey('any-key'), null);
  });

  it('findLicenseByDecryptedKey returns null when no file matches the key', () => {
    writeLicenseFile('LicA', {
      licenseKey: encryptKey('OTHER-KEY-111'),
      licenseStatus: 'Activated',
      licenseType: 'Floating',
      lastOnlineAvailabilityCheckUtc: String(Date.now()),
    });
    assert.equal(findLicenseByDecryptedKey('AAAAA-BBBBB-CCCCC-DDDDD-EEEEE'), null);
  });

  it('findLicenseByDecryptedKey returns matching state when key decrypts correctly', () => {
    const rawKey = 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE';
    writeLicenseFile('FloatingLic', {
      licenseKey: encryptKey(rawKey),
      licenseStatus: 'Activated',
      licenseType: 'Floating',
      lastOnlineAvailabilityCheckUtc: String(Date.now()),
    });
    const state = findLicenseByDecryptedKey(rawKey);
    assert.ok(state !== null);
    assert.equal(state?.name, 'FloatingLic');
    assert.equal(state?.licenseType, 'Floating');
    assert.equal(state?.activated, true);
  });

  it('findLicenseByDecryptedKey returns state even when not Activated', () => {
    const rawKey = 'SOME-KEY-NOT-ACTIVE';
    writeLicenseFile('NotActive', {
      licenseKey: encryptKey(rawKey),
      licenseStatus: 'NotActivated',
      licenseType: 'FixedSeat',
      lastOnlineAvailabilityCheckUtc: String(Date.now()),
    });
    const state = findLicenseByDecryptedKey(rawKey);
    assert.ok(state !== null);
    assert.equal(state?.activated, false);
  });

  it('findLicenseByDecryptedKey returns null when licenseKey field is absent', () => {
    writeLicenseFile('NoKey', {
      licenseStatus: 'Activated',
      licenseType: 'FixedSeat',
      lastOnlineAvailabilityCheckUtc: String(Date.now()),
    });
    assert.equal(findLicenseByDecryptedKey('any'), null);
  });

  it('findLicenseByDecryptedKey matches across multiple files', () => {
    const rawKey = 'MULTI-FILE-MATCH-KEY';
    writeLicenseFile('Unrelated', {
      licenseKey: encryptKey('DIFFERENT-KEY'),
      licenseStatus: 'Activated',
      licenseType: 'Trial',
      lastOnlineAvailabilityCheckUtc: String(Date.now()),
    });
    writeLicenseFile('Target', {
      licenseKey: encryptKey(rawKey),
      licenseStatus: 'Activated',
      licenseType: 'Floating',
      lastOnlineAvailabilityCheckUtc: String(Date.now()),
    });
    const state = findLicenseByDecryptedKey(rawKey);
    assert.equal(state?.name, 'Target');
  });
});

// ── E. licenseValidator — IDE auto-detection (non-test env) ──────────────────

describe('licenseValidator (IDE auto-detection, non-test env)', () => {
  let origNodeEnv: string | undefined;
  let tmpDir: string;
  let origProvarHome: string | undefined;

  beforeEach(() => {
    origNodeEnv = process.env['NODE_ENV'];
    delete process.env['NODE_ENV'];
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provar-validator-test-'));
    origProvarHome = process.env['PROVAR_HOME'];
    process.env['PROVAR_HOME'] = path.join(tmpDir, 'Provar');
    process.env['HOME'] = tmpDir;
    process.env['USERPROFILE'] = tmpDir;
  });

  afterEach(() => {
    if (origNodeEnv !== undefined) {
      process.env['NODE_ENV'] = origNodeEnv;
    } else {
      delete process.env['NODE_ENV'];
    }
    if (origProvarHome !== undefined) {
      process.env['PROVAR_HOME'] = origProvarHome;
    } else {
      delete process.env['PROVAR_HOME'];
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeLicenseFile(name: string, props: Record<string, string>): void {
    const dir = path.join(tmpDir, 'Provar', '.licenses');
    fs.mkdirSync(dir, { recursive: true });
    const content = Object.entries(props).map(([k, v]) => `${k}=${v}`).join('\n');
    fs.writeFileSync(path.join(dir, `${name}.properties`), content, 'utf-8');
  }

  it('throws LICENSE_NOT_FOUND when no IDE license exists and no cache', async () => {
    await assert.rejects(
      () => validateLicense(),
      (err: unknown) => {
        assert.ok(err instanceof LicenseError);
        assert.equal(err.code, 'LICENSE_NOT_FOUND');
        return true;
      }
    );
  });

  it('throws LICENSE_NOT_FOUND when license is present but not Activated', async () => {
    writeLicenseFile('NotActive', {
      licenseStatus: 'NotActivated',
      licenseType: 'Trial',
      lastOnlineAvailabilityCheckUtc: String(Date.now()),
    });
    await assert.rejects(
      () => validateLicense(),
      (err: unknown) => {
        assert.ok(err instanceof LicenseError);
        assert.equal(err.code, 'LICENSE_NOT_FOUND');
        return true;
      }
    );
  });

  it('returns valid=true for an activated license', async () => {
    writeLicenseFile('ActiveLic', {
      licenseStatus: 'Activated',
      licenseType: 'Floating',
      lastOnlineAvailabilityCheckUtc: String(Date.now() - 60_000), // 1 min ago
    });
    const result = await validateLicense();
    assert.equal(result.valid, true);
    assert.equal(result.licenseType, 'Floating');
    assert.equal(result.fromCache, false);
    assert.equal(result.offlineGrace, false);
  });

  it('accepts an activated license even when lastOnlineAvailabilityCheckUtc is very old (200h)', async () => {
    // The IDE sets licenseStatus=Activated — we trust that, not the ALGAS timestamp.
    writeLicenseFile('OldTimestamp', {
      licenseStatus: 'Activated',
      licenseType: 'Floating',
      lastOnlineAvailabilityCheckUtc: String(Date.now() - 200 * 60 * 60 * 1000), // 200h ago
    });
    const result = await validateLicense();
    assert.equal(result.valid, true);
    assert.equal(result.offlineGrace, false);
  });

  it('writes to MCP cache after a successful IDE read', async () => {
    writeLicenseFile('CacheLic', {
      licenseStatus: 'Activated',
      licenseType: 'Trial',
      lastOnlineAvailabilityCheckUtc: String(Date.now()),
    });
    await validateLicense();
    // Verify cache was written using the IDE sentinel key
    const IDE_SENTINEL = '__ide_detection__';
    const entry = readCacheEntry(hashKey(IDE_SENTINEL));
    assert.ok(entry !== null, 'cache entry should be written');
    assert.equal(entry?.valid, true);
    assert.equal(entry?.licenseType, 'Trial');
  });

  it('serves from MCP cache on second call within 2h (skips IDE read)', async () => {
    writeLicenseFile('ActiveLic', {
      licenseStatus: 'Activated',
      licenseType: 'Floating',
      lastOnlineAvailabilityCheckUtc: String(Date.now()),
    });
    // First call — reads IDE, writes cache
    await validateLicense();
    // Second call — should hit cache (fromCache=true)
    const result = await validateLicense();
    assert.equal(result.fromCache, true);
    assert.equal(result.licenseType, 'Floating');
    assert.equal(result.offlineGrace, false);
  });

  it('serves from grace cache when IDE disappears but cache is within 48h', async () => {
    writeLicenseFile('ActiveLic', {
      licenseStatus: 'Activated',
      licenseType: 'FixedSeat',
      lastOnlineAvailabilityCheckUtc: String(Date.now()),
    });
    // Seed the cache with a stale-but-within-grace entry
    const IDE_SENTINEL = '__ide_detection__';
    writeCacheEntry({
      keyHash: hashKey(IDE_SENTINEL),
      valid: true,
      licenseType: 'FixedSeat',
      checkedAt: Date.now() - 10 * 60 * 60 * 1000, // 10h ago — past 2h TTL but within 48h grace
    });
    // Remove the IDE license file so IDE detection fails
    fs.rmSync(path.join(tmpDir, 'Provar', '.licenses', 'ActiveLic.properties'));

    const result = await validateLicense();
    assert.equal(result.valid, true);
    assert.equal(result.fromCache, true);
    assert.equal(result.offlineGrace, true);
  });
});

// ── F. licenseValidator — PROVAR_DEV_WHITELIST_KEYS bypass ───────────────────

describe('licenseValidator (PROVAR_DEV_WHITELIST_KEYS bypass)', () => {
  let origNodeEnv: string | undefined;
  let origWhitelist: string | undefined;
  let origProvarHome: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    origNodeEnv = process.env['NODE_ENV'];
    origWhitelist = process.env['PROVAR_DEV_WHITELIST_KEYS'];
    origProvarHome = process.env['PROVAR_HOME'];
    // Use a fresh tmpDir so fallthrough tests never touch the real ~/.Provar dir
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'provar-whitelist-test-'));
    delete process.env['NODE_ENV'];
    delete process.env['PROVAR_DEV_WHITELIST_KEYS'];
    process.env['PROVAR_HOME'] = path.join(tmpDir, 'Provar');
    process.env['HOME'] = tmpDir;
    process.env['USERPROFILE'] = tmpDir;
  });

  afterEach(() => {
    if (origNodeEnv !== undefined) process.env['NODE_ENV'] = origNodeEnv;
    else delete process.env['NODE_ENV'];
    if (origWhitelist !== undefined) process.env['PROVAR_DEV_WHITELIST_KEYS'] = origWhitelist;
    else delete process.env['PROVAR_DEV_WHITELIST_KEYS'];
    if (origProvarHome !== undefined) process.env['PROVAR_HOME'] = origProvarHome;
    else delete process.env['PROVAR_HOME'];
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('bypasses all validation when PROVAR_DEV_WHITELIST_KEYS contains a key', async () => {
    process.env['PROVAR_DEV_WHITELIST_KEYS'] = 'DEV-BYPASS-SENTINEL';
    const result = await validateLicense();
    assert.equal(result.valid, true);
    assert.equal(result.licenseType, 'Whitelisted');
    assert.equal(result.fromCache, false);
    assert.equal(result.offlineGrace, false);
  });

  it('bypasses when whitelist contains multiple comma-separated keys', async () => {
    process.env['PROVAR_DEV_WHITELIST_KEYS'] = 'KEY-A,KEY-B,KEY-C';
    const result = await validateLicense();
    assert.equal(result.valid, true);
    assert.equal(result.licenseType, 'Whitelisted');
  });

  it('trims whitespace from each whitelist entry', async () => {
    process.env['PROVAR_DEV_WHITELIST_KEYS'] = '  DEV-KEY-A  ,  DEV-KEY-B  ';
    const result = await validateLicense();
    assert.equal(result.valid, true);
    assert.equal(result.licenseType, 'Whitelisted');
  });

  it('does not bypass when env var is an empty string', async () => {
    process.env['PROVAR_DEV_WHITELIST_KEYS'] = '';
    // Falls through to IDE detection — no IDE on this machine, so throws
    await assert.rejects(
      () => validateLicense(),
      (err: unknown) => {
        assert.ok(err instanceof LicenseError);
        assert.equal(err.code, 'LICENSE_NOT_FOUND');
        return true;
      }
    );
  });

  it('does not bypass when env var contains only commas and whitespace', async () => {
    process.env['PROVAR_DEV_WHITELIST_KEYS'] = '  ,  ,  ';
    await assert.rejects(
      () => validateLicense(),
      (err: unknown) => {
        assert.ok(err instanceof LicenseError);
        assert.equal(err.code, 'LICENSE_NOT_FOUND');
        return true;
      }
    );
  });
});
