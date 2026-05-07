#!/usr/bin/env node
/**
 * Developer utility: regenerate docs/NITROX_COMPONENT_CATALOG.md from the
 * local Provar NitroX base package installation.
 *
 * Run this whenever Provar ships updated NitroX packages, then commit the result.
 *
 * Usage:
 *   node scripts/generate-nitrox-catalog.cjs
 *
 * Requires: ~/Provar/.nitroX/com/provar/fact/_extracted_all to exist.
 * (Run Provar NitroX at least once on this machine to extract the base packages.)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const EXTRACTED_ALL_DIR = path.join(os.homedir(), 'Provar', '.nitroX', 'com', 'provar', 'fact', '_extracted_all');
const OUTPUT_FILE = path.join(__dirname, '..', 'docs', 'NITROX_COMPONENT_CATALOG.md');

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function collectComponentFiles(pkgDir) {
  const componentsDir = path.join(pkgDir, 'components');
  if (!fs.existsSync(componentsDir)) return [];
  try {
    return fs
      .readdirSync(componentsDir)
      .filter((f) => f.endsWith('.cp.json') || f.endsWith('.po.json'))
      .sort()
      .map((f) => path.join(componentsDir, f));
  } catch {
    return [];
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

function buildCatalog() {
  if (!fs.existsSync(EXTRACTED_ALL_DIR)) {
    console.error(`ERROR: packages not found at ${EXTRACTED_ALL_DIR}`);
    console.error('Run Provar NitroX on this machine to extract base packages, then retry.');
    process.exit(1);
  }

  const pkgDirEntries = fs
    .readdirSync(EXTRACTED_ALL_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const lines = [
    '# NitroX Component Package Catalog',
    '',
    'Shipped base NitroX (Hybrid Model) component packages.',
    'Use as a reference when generating new NitroX components — match naming conventions,',
    'type strings, tagNames, interaction titles, and attribute names from these shipped packages.',
    '',
    '---',
    '',
  ];

  for (const entry of pkgDirEntries) {
    const pkgDir = path.join(EXTRACTED_ALL_DIR, entry.name);
    const meta = safeReadJson(path.join(pkgDir, 'package.json')) ?? {};

    const displayName = meta.name ?? entry.name;
    const displayVersion = meta.version ? ` (v${meta.version})` : '';
    lines.push(`## ${displayName}${displayVersion}`);

    if (meta.description) lines.push('', meta.description);
    if (meta.provarVersion) lines.push(`**Requires Provar:** ${meta.provarVersion}`);
    lines.push('');

    const componentFiles = collectComponentFiles(pkgDir);
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

const catalog = buildCatalog();
fs.writeFileSync(OUTPUT_FILE, catalog, 'utf-8');
const lineCount = catalog.split('\n').length;
console.log(`Written: docs/NITROX_COMPONENT_CATALOG.md (${lineCount} lines)`);
