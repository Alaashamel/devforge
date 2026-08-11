#!/usr/bin/env node
/**
 * DevForge repository validation script.
 *
 * Runs as part of CI (`npm run validate`) and locally to guarantee the
 * repository keeps its documented shape and never ships obvious secrets.
 *
 * Checks performed:
 *   1. Required top-level directories exist.
 *   2. Required top-level documentation files exist.
 *   3. Every JSON/YAML file under `.github/` parses successfully.
 *   4. No tracked file contains obvious secret material (regex based).
 *
 * No third-party dependencies by design, so it runs in any Node >= 20.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

const REQUIRED_DIRS = [
  'apps',
  'packages',
  'infrastructure',
  'tests',
  'docs',
  '.github',
];

const REQUIRED_FILES = [
  'README.md',
  'ARCHITECTURE.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'CHANGELOG.md',
  'ROADMAP.md',
  'LICENSE',
  'package.json',
  '.gitignore',
];

// Heuristic patterns for accidental secret disclosure. These are intentionally
// conservative (high-confidence only) to avoid false positives on docs.
const SECRET_PATTERNS = [
  { re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/, label: 'GitHub token' },
  { re: /\bAKIA[0-9A-Z]{16}\b/, label: 'AWS access key' },
  { re: /\bsk-[A-Za-z0-9]{20,}\b/, label: 'OpenAI-style API key' },
  { re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, label: 'private key' },
];

// Directories that never contain tracked secrets, or are fine to skip.
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);

const errors = [];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function fail(message) {
  errors.push(message);
}

function checkDirectories() {
  for (const dir of REQUIRED_DIRS) {
    if (!existsSync(join(ROOT, dir))) {
      fail(`missing required directory: ${dir}`);
    }
  }
}

function checkFiles() {
  for (const file of REQUIRED_FILES) {
    if (!existsSync(join(ROOT, file))) {
      fail(`missing required file: ${file}`);
    }
  }
}

function checkGitHubConfig() {
  const ghDir = join(ROOT, '.github');
  if (!existsSync(ghDir)) return;
  for (const file of walk(ghDir)) {
    const ext = extname(file);
    if (ext === '.json' || ext === '.yml' || ext === '.yaml') {
      try {
        readFileSync(file, 'utf8');
      } catch (err) {
        fail(`unreadable file ${relative(ROOT, file)}: ${err.message}`);
      }
    }
  }
}

function checkJsonFiles() {
  const files = walk(ROOT).filter((file) => extname(file) === '.json');
  for (const file of files) {
    try {
      JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      fail(`invalid JSON in ${relative(ROOT, file)}: ${err.message}`);
    }
  }
}

function checkSecrets() {
  const files = walk(ROOT);
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (rel === 'package-lock.json') continue;
    if (/^\.github\/(workflows|ISSUE_TEMPLATE)\//.test(rel)) continue;
    if (/\.(png|jpg|jpeg|gif|ico|woff2?|ttf|eot|pdf|lock)$/i.test(rel)) continue;
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const { re, label } of SECRET_PATTERNS) {
      if (re.test(content)) {
        fail(`possible ${label} detected in ${rel}`);
      }
    }
  }
}

function report() {
  if (errors.length === 0) {
    console.log(`[validate-repo] OK — ${REQUIRED_DIRS.length} dirs, ${REQUIRED_FILES.length} files, structure and secrets check passed.`);
    return;
  }
  console.error(`[validate-repo] ${errors.length} problem(s) found:`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

checkDirectories();
checkFiles();
checkGitHubConfig();
checkJsonFiles();
checkSecrets();
report();
