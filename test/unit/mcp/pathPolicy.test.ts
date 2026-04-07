import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, afterEach } from 'mocha';
import { assertPathAllowed, PathPolicyError } from '../../../src/mcp/security/pathPolicy.js';

const tmp = os.tmpdir();

describe('pathPolicy', () => {
  it('allows path within allowedPaths', () => {
    assert.doesNotThrow(() => assertPathAllowed(path.join(tmp, 'foo.java'), [tmp]));
  });

  it('allows exact match of allowedPath', () => {
    assert.doesNotThrow(() => assertPathAllowed(tmp, [tmp]));
  });

  it('allows all paths when allowedPaths is empty', () => {
    assert.doesNotThrow(() => assertPathAllowed('/any/path', []));
  });

  it('throws PATH_TRAVERSAL for .. segments', () => {
    try {
      assertPathAllowed('/some/path/../etc/passwd', [tmp]);
      assert.fail('Expected PathPolicyError to be thrown');
    } catch (e) {
      assert.ok(e instanceof PathPolicyError, 'Expected PathPolicyError');
      assert.equal(e.code, 'PATH_TRAVERSAL');
    }
  });

  it('throws PATH_NOT_ALLOWED for path outside allowed', () => {
    try {
      assertPathAllowed('/etc/passwd', [tmp]);
      assert.fail('Expected PathPolicyError to be thrown');
    } catch (e) {
      assert.ok(e instanceof PathPolicyError, 'Expected PathPolicyError');
      assert.equal(e.code, 'PATH_NOT_ALLOWED');
    }
  });

  it('allows nested paths inside allowedPaths', () => {
    assert.doesNotThrow(() =>
      assertPathAllowed(path.join(tmp, 'a', 'b', 'c', 'file.xml'), [tmp])
    );
  });

  it('rejects sibling directories that share a prefix', () => {
    const allowed = path.join(tmp, 'myproject');
    const sibling = path.join(tmp, 'myproject-evil', 'secret.txt');
    try {
      assertPathAllowed(sibling, [allowed]);
      assert.fail('Expected PathPolicyError to be thrown');
    } catch (e) {
      assert.ok(e instanceof PathPolicyError, 'Expected PathPolicyError');
      assert.equal(e.code, 'PATH_NOT_ALLOWED');
    }
  });

  describe('symlink containment', () => {
    let symlinkDir: string | undefined;

    afterEach(() => {
      if (symlinkDir) {
        try { fs.rmSync(symlinkDir, { recursive: true, force: true }); } catch { /* ignore */ }
      }
    });

    it('rejects a symlink inside an allowed dir that points outside it', function () {
      if (process.platform === 'win32') {
        // Symlink creation on Windows requires elevated privileges in most CI environments
        this.skip();
        return;
      }
      symlinkDir = fs.mkdtempSync(path.join(tmp, 'pathpolicy-sym-'));
      const target = path.join(tmp, 'outside-secret.txt');
      fs.writeFileSync(target, 'secret');
      const link = path.join(symlinkDir, 'evil-link');
      fs.symlinkSync(target, link);

      try {
        assertPathAllowed(link, [symlinkDir]);
        assert.fail('Expected PathPolicyError to be thrown');
      } catch (e) {
        assert.ok(e instanceof PathPolicyError, 'Expected PathPolicyError');
        assert.equal(e.code, 'PATH_NOT_ALLOWED');
      } finally {
        fs.unlinkSync(target);
      }
    });

    it('allows a real path inside an allowed dir (not a symlink)', () => {
      symlinkDir = fs.mkdtempSync(path.join(tmp, 'pathpolicy-real-'));
      const real = path.join(symlinkDir, 'real-file.txt');
      const allowedDir = symlinkDir;
      fs.writeFileSync(real, 'content');
      assert.doesNotThrow(() => assertPathAllowed(real, [allowedDir]));
    });
  });
});
