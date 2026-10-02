#!/usr/bin/env node
// Deterministic validator for editorial plans (editorial/plans/**/*.md).
// No LLM involved on purpose (prompt-evolucao-subsistema-editorial.md §10):
// front matter shape, lifecycle invariants and ID uniqueness are all
// mechanically checkable, so an LLM call would only add latency and
// nondeterminism to a CI gate.
//
// Usage:
//   node scripts/validate-editorial-plans.mjs               # validate all plans
//   node scripts/validate-editorial-plans.mjs --changed-only # validate only files
//                                                             # changed vs origin/develop
//
// --changed-only scopes CI to the plans a PR actually touches, instead of
// re-validating all 27 real plans on every push. All existing plans already
// carry schema_version (Fase G migration, done) and pass full validation —
// `npm run validate:editorial` with no flag confirms that at any time — so
// this mode is a CI performance/focus choice now, not a workaround for
// unmigrated files.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import Ajv from 'ajv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const PLANS_DIR = path.join(REPO_ROOT, 'editorial', 'plans');
const SCHEMA_PATH = path.join(REPO_ROOT, 'editorial', 'schema', 'editorial-plan.schema.json');
const RECEIPTS_DIR = path.join(REPO_ROOT, 'editorial', 'receipts');

// Real publication_ids from editorial/receipts/*.yml, used to confirm a
// plan's publication_receipt points at a receipt that actually exists
// instead of just being a non-empty string (see validateFile below).
export function knownReceiptIds(receiptsDir = RECEIPTS_DIR) {
  const ids = new Set();
  if (!existsSync(receiptsDir)) return ids;
  for (const entry of readdirSync(receiptsDir)) {
    if (!entry.endsWith('.yml') && !entry.endsWith('.yaml')) continue;
    // Strips an optional surrounding quote (single or double): a receipt
    // author writing `publication_id: "PUB-2026-001"` in YAML is valid and
    // common, but a plain publication_receipt reference in a plan's front
    // matter is never quoted (see validateFile's receiptIds.has() check) -
    // without stripping, the captured id would carry the literal quote
    // characters and never match. No receipt exists yet to have hit this in
    // practice (publication-receipt.schema.json: "stub contract, no real
    // integration exists yet"), found by reading the regex against the
    // schema's expected format rather than against an existing failure.
    const match = readFileSync(path.join(receiptsDir, entry), 'utf8').match(/^publication_id:\s*["']?([^"'\s]+)["']?/m);
    if (match) ids.add(match[1]);
  }
  return ids;
}

const VALID_STATUSES = [
  'idea',
  'researching',
  'planned',
  'drafting',
  'ready',
  'scheduled',
  'published',
  'cancelled',
  'archived',
];

const SENSITIVE_GATED_STATUSES = new Set(['ready', 'scheduled', 'published']);

const PII_PATTERNS = [
  { name: 'email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/ },
  // Loose BR/international phone shape; auxiliary signal only, not the sole
  // defense (prompt §12: "Não use regex como única defesa" — Gitleaks in
  // security.yml covers secrets/credentials separately).
  { name: 'phone', regex: /\(?\d{2,3}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}/ },
];

export function ajvInstance() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  // No ajv-formats dependency in this repo; only the two formats the
  // schema actually uses are needed, so define them inline rather than
  // adding a new dependency for two regexes.
  // A regex alone accepts calendar-impossible dates like 2026-99-99 (flagged
  // in codex CLI review); parse and round-trip through Date to catch those
  // too, without pulling in a date library for one check.
  ajv.addFormat('date', {
    validate: (value) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const d = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
    },
  });
  return ajv;
}

export function loadSchema() {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
}

function listPlanFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'templates') continue; // template is not a plan instance
      results.push(...listPlanFiles(full));
    } else if (entry.endsWith('.md') && entry !== 'README.md') {
      results.push(full);
    }
  }
  return results;
}

const ZERO_SHA = '0000000000000000000000000000000000000000';

// On a pull_request run, GITHUB_BASE_REF is the target branch (e.g.
// "develop") and origin/<base> vs HEAD is the right diff. On a push run
// (cd.yml, triggered after merge to develop), HEAD *is* origin/develop by
// the time this runs — diffing against it would always return empty and
// silently skip validation. GITHUB_BEFORE_SHA (wired from github.event.before
// in cd.yml) is the real pre-push commit and covers multi-commit pushes
// correctly; HEAD~1 is only a fallback for local runs or the (rare) case
// where before is the all-zero SHA (new branch, nothing to diff against).
export function resolveDiffRange() {
  if (process.env.GITHUB_BASE_REF) {
    return { base: `origin/${process.env.GITHUB_BASE_REF}`, useMergeBase: true };
  }
  if (process.env.GITHUB_BEFORE_SHA && process.env.GITHUB_BEFORE_SHA !== ZERO_SHA) {
    return { base: process.env.GITHUB_BEFORE_SHA, useMergeBase: false };
  }
  return { base: 'HEAD~1', useMergeBase: false };
}

function getChangedPlanFiles() {
  try {
    const { base, useMergeBase } = resolveDiffRange();
    const range = useMergeBase
      ? execSync(`git merge-base HEAD ${base}`, { cwd: REPO_ROOT }).toString().trim()
      : base;
    const diff = execSync(`git diff --name-only --diff-filter=ACM ${range} HEAD`, {
      cwd: REPO_ROOT,
    })
      .toString()
      .split('\n')
      .filter(Boolean);
    return diff
      .filter((f) => f.startsWith('editorial/plans/') && f.endsWith('.md') && !f.endsWith('README.md'))
      .filter((f) => !f.includes('/templates/'))
      .map((f) => path.join(REPO_ROOT, f));
  } catch (err) {
    console.error('warning: could not compute changed files against origin/develop, falling back to full scan:', err.message);
    return listPlanFiles(PLANS_DIR);
  }
}

export function parseFrontMatter(raw, filePath) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { error: 'missing front matter block (expected leading --- ... ---)' };
  }
  try {
    // JSON_SCHEMA (not js-yaml's default) has no YAML 1.1 timestamp type,
    // so unquoted YYYY-MM-DD scalars stay plain strings instead of being
    // parsed into JS Date objects. That parsing was tried first and
    // reverted: Date's own overflow semantics silently "fix" an invalid
    // calendar date like 2026-99-99 into a valid one (2034-06-07) before
    // the schema's format check ever sees it — worse than rejecting it.
    const data = yaml.load(match[1], { schema: yaml.JSON_SCHEMA }) ?? {};
    return { data };
  } catch (err) {
    return { error: `invalid YAML: ${err.message}` };
  }
}

function expectedDateFromPath(filePath) {
  // editorial/plans/YYYY/MM/YYYY-MM-DD-slug.md
  const rel = path.relative(PLANS_DIR, filePath).split(path.sep);
  const [year, month, filename] = rel;
  const dateMatch = filename && filename.match(/^(\d{4})-(\d{2})-(\d{2})-/);
  if (!year || !month || !dateMatch) return null;
  return { year, month, fileDate: `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` };
}

function scanForPii(bodyText) {
  const hits = [];
  for (const { name, regex } of PII_PATTERNS) {
    if (regex.test(bodyText)) hits.push(name);
  }
  return hits;
}

export function validateFile(filePath, validateSchema, seenIds, receiptIds) {
  const errors = [];
  const warnings = [];
  const raw = readFileSync(filePath, 'utf8');
  const relPath = path.relative(REPO_ROOT, filePath);

  const { data, error } = parseFrontMatter(raw, filePath);
  if (error) {
    errors.push(error);
    return { errors, warnings };
  }

  const schemaValid = validateSchema(data);
  if (!schemaValid) {
    for (const e of validateSchema.errors) {
      errors.push(`schema: ${e.instancePath || '(root)'} ${e.message}`);
    }
  }

  // ID uniqueness and format (format already checked by schema pattern;
  // uniqueness needs cross-file state, so it lives here).
  if (data.id) {
    if (seenIds.has(data.id)) {
      errors.push(`duplicate id "${data.id}", already used by ${seenIds.get(data.id)}`);
    } else {
      seenIds.set(data.id, relPath);
    }
  }

  // Path vs created_at consistency.
  const pathInfo = expectedDateFromPath(filePath);
  if (pathInfo && data.created_at) {
    const createdYear = String(data.created_at).slice(0, 4);
    const createdMonth = String(data.created_at).slice(5, 7);
    if (createdYear !== pathInfo.year || createdMonth !== pathInfo.month) {
      errors.push(
        `created_at (${data.created_at}) does not match path year/month (${pathInfo.year}/${pathInfo.month})`
      );
    }
    if (pathInfo.fileDate !== String(data.created_at)) {
      warnings.push(
        `filename date (${pathInfo.fileDate}) differs from created_at (${data.created_at}) — allowed if the plan was renamed, but confirm intentional`
      );
    }
  }

  // Status enum (defense in depth even though schema also enforces it).
  if (data.status && !VALID_STATUSES.includes(data.status)) {
    errors.push(`invalid status "${data.status}", expected one of: ${VALID_STATUSES.join(', ')}`);
  }

  // Lifecycle invariants (editorial/LIFECYCLE.md).
  if (data.status === 'scheduled' && !data.planned_publication) {
    errors.push('status "scheduled" requires planned_publication');
  }
  if (data.status === 'published') {
    if (!data.published_at) errors.push('status "published" requires published_at');
    if (!data.canonical_content) errors.push('status "published" requires canonical_content');
    // Fase E shipped the Publication Receipt contract (editorial/receipts/),
    // so "published" without one is now a real gap, not a pending feature —
    // this used to be a warning while the contract didn't exist yet.
    if (!data.publication_receipt) {
      errors.push('status "published" requires publication_receipt (editorial/schema/publication-receipt.schema.json)');
    } else if (receiptIds && !receiptIds.has(data.publication_receipt)) {
      errors.push(`publication_receipt "${data.publication_receipt}" does not match any known receipt in editorial/receipts/`);
    }
  }
  if (data.contains_sensitive_content === true && SENSITIVE_GATED_STATUSES.has(data.status)) {
    if (data.human_review_required !== true) {
      errors.push(
        `contains_sensitive_content: true blocks status "${data.status}" without human_review_required: true`
      );
    }
  }

  // schema_version presence is already required by the schema; this is a
  // clearer, standalone message for the most common actionable gap.
  if (!data.schema_version) {
    errors.push('missing schema_version (see editorial/schema/editorial-plan.schema.json)');
  }

  // Lightweight PII signal on the body text, auxiliary only.
  const piiHits = scanForPii(raw);
  if (piiHits.length > 0 && data.contains_sensitive_content !== true) {
    warnings.push(
      `possible PII pattern(s) detected (${piiHits.join(', ')}) but contains_sensitive_content is not true — review manually`
    );
  }

  return { errors, warnings };
}

export function main() {
  const changedOnly = process.argv.includes('--changed-only');
  const schema = loadSchema();
  const ajv = ajvInstance();
  const validateSchema = ajv.compile(schema);

  const files = changedOnly ? getChangedPlanFiles() : listPlanFiles(PLANS_DIR);

  if (files.length === 0) {
    console.log(changedOnly ? 'No editorial plan files changed, nothing to validate.' : 'No editorial plan files found.');
    process.exit(0);
  }

  // Seed the ID index from every plan in the repo not part of this diff —
  // otherwise --changed-only mode can't catch a new plan reusing an id
  // already used by an untouched historical plan (duplicate id is a
  // whole-repo property, not a per-diff one). Excluding the changed files
  // themselves avoids a false "duplicate of itself" positive.
  const seenIds = new Map();
  if (changedOnly) {
    const changedSet = new Set(files.map((f) => path.resolve(f)));
    for (const file of listPlanFiles(PLANS_DIR)) {
      if (changedSet.has(path.resolve(file))) continue;
      const { data } = parseFrontMatter(readFileSync(file, 'utf8'));
      if (data && data.id && !seenIds.has(data.id)) {
        seenIds.set(data.id, path.relative(REPO_ROOT, file));
      }
    }
  }
  const receiptIds = knownReceiptIds();
  let hadErrors = false;

  for (const file of files.sort()) {
    const relPath = path.relative(REPO_ROOT, file);
    const { errors, warnings } = validateFile(file, validateSchema, seenIds, receiptIds);
    if (errors.length > 0) {
      hadErrors = true;
      console.error(`\nFAIL ${relPath}`);
      for (const e of errors) console.error(`  - ${e}`);
    }
    if (warnings.length > 0) {
      console.warn(`\nWARN ${relPath}`);
      for (const w of warnings) console.warn(`  - ${w}`);
    }
  }

  console.log(`\nValidated ${files.length} plan file(s)${changedOnly ? ' (changed-only mode)' : ''}.`);
  if (hadErrors) {
    console.error('Validation failed.');
    process.exit(1);
  }
  console.log('All plans valid.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
