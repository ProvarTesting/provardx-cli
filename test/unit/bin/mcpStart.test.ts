import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it } from 'mocha';

const currentDir = dirname(fileURLToPath(import.meta.url));
const BIN_SCRIPT = join(currentDir, '../../../bin/mcp-start.js');

function runBin(args: string[]): { status: number | null; stderr: string } {
  const result = spawnSync('node', [BIN_SCRIPT, ...args], { encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr };
}

describe('bin/mcp-start.js — argument validation', () => {
  it('exits 1 with usage when no arguments given', () => {
    const { status, stderr } = runBin([]);
    assert.equal(status, 1);
    assert.ok(stderr.includes('Usage:'), `expected usage hint, got: ${stderr}`);
  });

  it('exits 1 with usage when "mcp" subcommand is missing', () => {
    const { status, stderr } = runBin(['start']);
    assert.equal(status, 1);
    assert.ok(stderr.includes('Usage:'), `expected usage hint, got: ${stderr}`);
  });

  it('exits 1 with usage when only "mcp" is given without "start"', () => {
    const { status, stderr } = runBin(['mcp']);
    assert.equal(status, 1);
    assert.ok(stderr.includes('Usage:'), `expected usage hint, got: ${stderr}`);
  });

  it('exits 1 with required-arg error when --allowed-paths is omitted', () => {
    const { status, stderr } = runBin(['mcp', 'start']);
    assert.equal(status, 1);
    assert.ok(stderr.includes('--allowed-paths is required'), `expected required-arg error, got: ${stderr}`);
  });

  it('exits 1 with value-required error when --allowed-paths has no value', () => {
    const { status, stderr } = runBin(['mcp', 'start', '--allowed-paths']);
    assert.equal(status, 1);
    assert.ok(stderr.includes('requires a path value'), `expected value-required error, got: ${stderr}`);
  });

  it('exits 1 with value-required error when -a has no value', () => {
    const { status, stderr } = runBin(['mcp', 'start', '-a']);
    assert.equal(status, 1);
    assert.ok(stderr.includes('requires a path value'), `expected value-required error, got: ${stderr}`);
  });
});
