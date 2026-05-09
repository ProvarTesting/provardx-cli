#!/usr/bin/env node
/**
 * Release pipeline utility: fetch the latest NitroX component packages
 * from the ProvarTesting/factPackages GitHub repo (main branch) and
 * regenerate docs/NITROX_COMPONENT_CATALOG.md.
 *
 * On success, writes docs/NITROX_CATALOG_SOURCE.json with the commit SHA
 * so downstream consumers can verify which version was bundled.
 *
 * Falls back silently to the committed catalog when:
 *   - GITHUB_TOKEN / GH_TOKEN is not set in the environment
 *   - The GitHub API is unreachable
 *   - Any download fails
 *
 * The script always exits 0 so a fetch failure never blocks the release.
 *
 * Environment:
 *   GITHUB_TOKEN or GH_TOKEN — required to access the private repo
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_OWNER = 'ProvarTesting';
const REPO_NAME = 'factPackages';
const BRANCH = 'main';
const DOCS_DIR = path.join(__dirname, '..', 'docs');
const OUTPUT_CATALOG = path.join(DOCS_DIR, 'NITROX_COMPONENT_CATALOG.md');
const OUTPUT_SOURCE = path.join(DOCS_DIR, 'NITROX_CATALOG_SOURCE.json');

function warn(msg) {
  console.warn(`[fetch-nitrox-packages] WARN: ${msg}`);
}

function log(msg) {
  console.log(`[fetch-nitrox-packages] ${msg}`);
}

/** Wraps https.get with redirect support; resolves to the response body string. */
function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqHeaders = {
      'User-Agent': 'provardx-cli/fetch-nitrox-packages',
      Accept: 'application/json',
      ...headers,
    };
    const req = https.get(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: reqHeaders },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          resolve(httpsGet(res.headers.location, headers));
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} from ${url}: ${body.slice(0, 200)}`));
          } else {
            resolve(body);
          }
        });
        res.on('error', reject);
      }
    );
    req.on('error', reject);
  });
}

/** Downloads raw file bytes (supports redirect); resolves to a Buffer. */
function httpsGetBuffer(url, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.get({ hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        resolve(httpsGetBuffer(res.headers.location, headers));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        } else {
          resolve(Buffer.concat(chunks));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

function apiHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'provardx-cli/fetch-nitrox-packages',
  };
}

async function getLatestCommitSha(token) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${BRANCH}`;
  const body = await httpsGet(url, apiHeaders(token));
  const data = JSON.parse(body);
  if (typeof data.sha !== 'string') throw new Error('No commit SHA in GitHub API response');
  return data.sha;
}

async function getTree(sha, token) {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${sha}?recursive=1`;
  const body = await httpsGet(url, apiHeaders(token));
  const data = JSON.parse(body);
  if (!Array.isArray(data.tree)) throw new Error('Unexpected tree response shape');
  return data.tree;
}

// Matches fact-* package manifests: e.g. "fact-common/src/package.json"
const PKG_JSON_RE = /^[^/]+\/src\/package\.json$/;
// Matches component definitions under fact-{pkg}/src/components/
const COMPONENT_FILE_RE = /^[^/]+\/src\/components\/[^/]+\.(cp|po)\.json$/;

function isRelevant(treePath) {
  return PKG_JSON_RE.test(treePath) || COMPONENT_FILE_RE.test(treePath);
}

async function downloadRaw(filePath, token) {
  const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${filePath}`;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return httpsGetBuffer(url, headers);
}

// ── Catalog generation (mirrors generate-nitrox-catalog.cjs) ────────────────

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function renderComponent(comp) {
  const lines = [];
  const heading = comp.label ?? comp.name ?? '(unnamed)';
  lines.push(`#### ${heading}`, '');
  if (comp.name) lines.push(`- **name:** \`${comp.name}\``);
  if (comp.type) lines.push(`- **type:** \`${comp.type}\``);
  if (comp.tagName) lines.push(`- **tagName:** \`${comp.tagName}\``);

  const interactions = (comp.interactions ?? []).map((i) => i.title ?? i.name ?? '').filter(Boolean);
  if (interactions.length > 0) {
    lines.push(`- **interactions:** ${interactions.map((n) => `\`${n}\``).join(', ')}`);
  }

  const attributes = (comp.attributes ?? []).map((a) => a.title ?? a.attributeName ?? '').filter(Boolean);
  if (attributes.length > 0) {
    lines.push(`- **attributes:** ${attributes.map((n) => `\`${n}\``).join(', ')}`);
  }

  const elementCount = (comp.elements ?? []).length;
  if (elementCount > 0) lines.push(`- **child elements:** ${elementCount}`);

  lines.push('');
  return lines.join('\n');
}

function buildCatalogFromDir(baseDir, commitSha) {
  const pkgDirEntries = fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const lines = [
    '# NitroX Component Package Catalog',
    '',
    'Shipped base NitroX (Hybrid Model) component packages.',
    'Use as a reference when generating new NitroX components — match naming conventions,',
    'type strings, tagNames, interaction titles, and attribute names from these shipped packages.',
    '',
    `_Source: [ProvarTesting/factPackages@${commitSha.slice(
      0,
      7
    )}](https://github.com/ProvarTesting/factPackages/tree/${commitSha})_`,
    '',
    '---',
    '',
  ];

  for (const entry of pkgDirEntries) {
    // factPackages stores package content under a src/ subdirectory
    const srcDir = path.join(baseDir, entry.name, 'src');
    if (!fs.existsSync(srcDir)) continue;

    const meta = safeReadJson(path.join(srcDir, 'package.json')) ?? {};

    const displayName = meta.name ?? entry.name;
    const displayVersion = meta.version ? ` (v${meta.version})` : '';
    lines.push(`## ${displayName}${displayVersion}`);

    if (meta.description) lines.push('', meta.description);
    if (meta.provarVersion) lines.push(`**Requires Provar:** ${meta.provarVersion}`);
    lines.push('');

    const componentsDir = path.join(srcDir, 'components');
    if (!fs.existsSync(componentsDir)) {
      lines.push('_No component definitions found._', '', '---', '');
      continue;
    }

    const componentFiles = fs
      .readdirSync(componentsDir)
      .filter((f) => f.endsWith('.cp.json') || f.endsWith('.po.json'))
      .sort()
      .map((f) => path.join(componentsDir, f));

    if (componentFiles.length === 0) {
      lines.push('_No component definitions found._', '', '---', '');
      continue;
    }

    lines.push('### Components', '');
    for (const compFile of componentFiles) {
      const parsed = safeReadJson(compFile);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        lines.push(renderComponent(parsed));
      }
    }

    lines.push('---', '');
  }

  return lines.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const token = process.env['GITHUB_TOKEN'] || process.env['GH_TOKEN'];

  if (!token) {
    warn('No GITHUB_TOKEN or GH_TOKEN set — skipping factPackages fetch, using bundled catalog');
    return;
  }

  const tmpDir = path.join(os.tmpdir(), `nitrox-fact-packages-${Date.now()}`);

  try {
    log(`Fetching latest commit on ${REPO_OWNER}/${REPO_NAME}@${BRANCH}...`);
    const commitSha = await getLatestCommitSha(token);
    log(`Commit: ${commitSha}`);

    log('Fetching file tree...');
    const tree = await getTree(commitSha, token);
    const relevant = tree.filter((f) => f.type === 'blob' && isRelevant(f.path));
    log(`Downloading ${relevant.length} component files...`);

    for (const file of relevant) {
      const destPath = path.join(tmpDir, file.path);
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const content = await downloadRaw(file.path, token);
      fs.writeFileSync(destPath, content);
    }

    log('Generating catalog...');
    const catalog = buildCatalogFromDir(tmpDir, commitSha);
    fs.writeFileSync(OUTPUT_CATALOG, catalog, 'utf-8');
    log(`Written: docs/NITROX_COMPONENT_CATALOG.md (${catalog.split('\n').length} lines)`);

    const sourceInfo = {
      repo: `https://github.com/${REPO_OWNER}/${REPO_NAME}`,
      branch: BRANCH,
      commitSha,
      fetchedAt: new Date().toISOString(),
    };
    fs.writeFileSync(OUTPUT_SOURCE, JSON.stringify(sourceInfo, null, 2) + '\n', 'utf-8');
    log(`Written: docs/NITROX_CATALOG_SOURCE.json (commitSha: ${commitSha.slice(0, 7)})`);
  } catch (err) {
    warn(`Fetch failed — ${String(err instanceof Error ? err.message : err)}`);
    warn('Falling back to bundled catalog; release will use existing NITROX_COMPONENT_CATALOG.md');
  } finally {
    try {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}

main().catch((err) => {
  warn(`Unexpected error — ${String(err instanceof Error ? err.message : err)}`);
});
