import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ajvInstance,
  loadSchema,
  parseFrontMatter,
  validateFile,
  resolveDiffRange,
  knownReceiptIds,
} from '../validate-editorial-plans.mjs';

function compileSchema() {
  const schema = loadSchema();
  const ajv = ajvInstance();
  return ajv.compile(schema);
}

function writePlan(dir, relPath, frontMatter) {
  const full = path.join(dir, relPath);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, `---\n${frontMatter}\n---\n\n# body\n`);
  return full;
}

const VALID_FM = `id: POST-PLAN-2026-900
title: Test plan
created_at: 2026-06-27
updated_at: 2026-06-27
status: idea
schema_version: "1.0"
source_skill: post-planning
contains_sensitive_content: false`;

test('schema: valid plan passes', () => {
  const validate = compileSchema();
  const { data } = parseFrontMatter(`---\n${VALID_FM}\n---\n`);
  assert.equal(validate(data), true, JSON.stringify(validate.errors));
});

test('schema: missing required field fails', () => {
  const validate = compileSchema();
  const fmMissingStatus = VALID_FM.split('\n').filter((l) => !l.startsWith('status:')).join('\n');
  const { data } = parseFrontMatter(`---\n${fmMissingStatus}\n---\n`);
  assert.equal(validate(data), false);
});

test('schema: invalid enum value fails', () => {
  const validate = compileSchema();
  const fmBadStatus = VALID_FM.replace('status: idea', 'status: not-a-real-status');
  const { data } = parseFrontMatter(`---\n${fmBadStatus}\n---\n`);
  assert.equal(validate(data), false);
});

test('schema: unknown additional property fails (closed contract)', () => {
  const validate = compileSchema();
  const { data } = parseFrontMatter(`---\n${VALID_FM}\nmystery_field: surprise\n---\n`);
  assert.equal(validate(data), false);
});

test('parseFrontMatter: missing front matter block is reported as error, not thrown', () => {
  const result = parseFrontMatter('# no front matter here\n');
  assert.equal(result.error, 'missing front matter block (expected leading --- ... ---)');
});

test('parseFrontMatter: invalid YAML is reported as error, not thrown', () => {
  const result = parseFrontMatter('---\nid: [unterminated\n---\n');
  assert.ok(result.error && result.error.startsWith('invalid YAML'));
});

test('parseFrontMatter: unquoted YYYY-MM-DD dates normalize to ISO strings', () => {
  const { data } = parseFrontMatter(`---\n${VALID_FM}\n---\n`);
  assert.equal(typeof data.created_at, 'string');
  assert.equal(data.created_at, '2026-06-27');
});

test('validateFile: rejects duplicate id across two files', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'editorial-test-'));
  try {
    const validate = compileSchema();
    const seenIds = new Map();
    const fileA = writePlan(dir, 'a.md', VALID_FM);
    const fileB = writePlan(dir, 'b.md', VALID_FM); // same id on purpose

    const resultA = validateFile(fileA, validate, seenIds);
    assert.equal(resultA.errors.length, 0, JSON.stringify(resultA.errors));

    const resultB = validateFile(fileB, validate, seenIds);
    assert.ok(resultB.errors.some((e) => e.includes('duplicate id')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lifecycle: scheduled without planned_publication fails', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'editorial-test-'));
  try {
    const validate = compileSchema();
    const fm = VALID_FM.replace('status: idea', 'status: scheduled');
    const file = writePlan(dir, 'x.md', fm);
    const { errors } = validateFile(file, validate, new Map());
    assert.ok(errors.some((e) => e.includes('requires planned_publication')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lifecycle: published without published_at and canonical_content fails', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'editorial-test-'));
  try {
    const validate = compileSchema();
    const fm = VALID_FM.replace('status: idea', 'status: published');
    const file = writePlan(dir, 'x.md', fm);
    const { errors } = validateFile(file, validate, new Map());
    assert.ok(errors.some((e) => e.includes('requires published_at')));
    assert.ok(errors.some((e) => e.includes('requires canonical_content')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lifecycle: published without publication_receipt fails (Fase E receipts contract exists now)', () => {
  // Was a warning while Publication Receipt was unimplemented; now that the
  // contract and validator ship (editorial/schema/publication-receipt.schema.json),
  // "published" with no receipt is a real gap, not a pending feature.
  const dir = mkdtempSync(path.join(tmpdir(), 'editorial-test-'));
  try {
    const validate = compileSchema();
    const fm =
      VALID_FM.replace('status: idea', 'status: published') +
      '\npublished_at: 2026-07-01\ncanonical_content: https://example.com/post';
    const file = writePlan(dir, 'x.md', fm);
    const { errors } = validateFile(file, validate, new Map(), new Set());
    assert.ok(errors.some((e) => e.includes('requires publication_receipt')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lifecycle: published with a fabricated publication_receipt fails (not just non-empty)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'editorial-test-'));
  try {
    const validate = compileSchema();
    const fm =
      VALID_FM.replace('status: idea', 'status: published') +
      '\npublished_at: 2026-07-01\ncanonical_content: https://example.com/post\npublication_receipt: PUB-2026-999';
    const file = writePlan(dir, 'x.md', fm);
    const { errors } = validateFile(file, validate, new Map(), new Set()); // no known receipts
    assert.ok(errors.some((e) => e.includes('does not match any known receipt')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Found during the full-audit pass on Block 7 (docs/book/cases/CASE-008):
// knownReceiptIds() had zero test coverage anywhere (the lifecycle tests
// above build the receiptIds Set by hand, never through the real function
// that reads editorial/receipts/*.yml). The gap this closes: the function's
// own regex would have carried a literal quote character into the captured
// id if a receipt YAML quoted publication_id, never matching the plan's
// unquoted reference - latent because no real receipt file exists yet.
test('knownReceiptIds: reads an unquoted publication_id from a real receipt file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'editorial-receipts-test-'));
  try {
    writeFileSync(path.join(dir, 'rec-1.yml'), 'publication_id: PUB-2026-001\nother_field: x\n');
    const ids = knownReceiptIds(dir);
    assert.ok(ids.has('PUB-2026-001'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('knownReceiptIds: reads a quoted publication_id without keeping the quote characters', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'editorial-receipts-test-'));
  try {
    writeFileSync(path.join(dir, 'rec-1.yml'), 'publication_id: "PUB-2026-002"\n');
    const ids = knownReceiptIds(dir);
    assert.ok(ids.has('PUB-2026-002'));
    assert.ok(!ids.has('"PUB-2026-002"'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('knownReceiptIds: returns an empty set when the receipts directory does not exist', () => {
  const ids = knownReceiptIds(path.join(tmpdir(), 'does-not-exist-' + Date.now()));
  assert.equal(ids.size, 0);
});

test('lifecycle: published with a real, known publication_receipt passes', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'editorial-test-'));
  try {
    const validate = compileSchema();
    const fm =
      VALID_FM.replace('status: idea', 'status: published') +
      '\npublished_at: 2026-07-01\ncanonical_content: https://example.com/post\npublication_receipt: PUB-2026-001';
    const file = writePlan(dir, 'x.md', fm);
    const { errors } = validateFile(file, validate, new Map(), new Set(['PUB-2026-001']));
    assert.equal(errors.length, 0, JSON.stringify(errors));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('security: sensitive content blocks ready/scheduled/published without human review', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'editorial-test-'));
  try {
    const validate = compileSchema();
    const fm =
      VALID_FM.replace('status: idea', 'status: ready').replace(
        'contains_sensitive_content: false',
        'contains_sensitive_content: true'
      );
    const file = writePlan(dir, 'x.md', fm);
    const { errors } = validateFile(file, validate, new Map());
    assert.ok(errors.some((e) => e.includes('human_review_required')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('security: sensitive content with human_review_required passes the gate', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'editorial-test-'));
  try {
    const validate = compileSchema();
    const fm =
      VALID_FM.replace('status: idea', 'status: ready')
        .replace('contains_sensitive_content: false', 'contains_sensitive_content: true') +
      '\nhuman_review_required: true';
    const file = writePlan(dir, 'x.md', fm);
    const { errors } = validateFile(file, validate, new Map());
    assert.ok(!errors.some((e) => e.includes('human_review_required')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ids: format validated by schema pattern', () => {
  const validate = compileSchema();
  const fmBadId = VALID_FM.replace('id: POST-PLAN-2026-900', 'id: not-the-right-format');
  const { data } = parseFrontMatter(`---\n${fmBadId}\n---\n`);
  assert.equal(validate(data), false);
});

test('schema: calendar-impossible date is rejected, not just shape-checked', () => {
  const validate = compileSchema();
  const fmBadDate = VALID_FM.replace('created_at: 2026-06-27', 'created_at: 2026-99-99');
  const { data } = parseFrontMatter(`---\n${fmBadDate}\n---\n`);
  assert.equal(validate(data), false);
});

test('changed-only id uniqueness: catches a new plan reusing an id from an untouched plan', async () => {
  // Regression test for a gap found during codex CLI review: seenIds used
  // to be seeded only from the files being validated, so --changed-only
  // mode could miss a duplicate against a historical plan nobody touched.
  const dir = mkdtempSync(path.join(tmpdir(), 'editorial-test-'));
  try {
    const validate = compileSchema();
    const untouched = writePlan(dir, 'plans/2026/06/untouched.md', VALID_FM);

    // Simulate main()'s seeding step: index every plan in the repo except
    // the ones being validated in this diff.
    const seenIds = new Map();
    const { data } = parseFrontMatter(`---\n${VALID_FM}\n---\n`);
    seenIds.set(data.id, path.relative(process.cwd(), untouched));

    const newFile = writePlan(dir, 'plans/2026/07/new-plan.md', VALID_FM); // same id
    const { errors } = validateFile(newFile, validate, seenIds);
    assert.ok(errors.some((e) => e.includes('duplicate id')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveDiffRange: uses GITHUB_BEFORE_SHA on a push run instead of the fragile HEAD~1 guess', () => {
  // codex CLI review flagged HEAD~1 as unreliable for multi-commit pushes
  // (cd.yml runs on push to develop, not pull_request). cd.yml now wires
  // github.event.before into GITHUB_BEFORE_SHA, which covers that case.
  const prevBase = process.env.GITHUB_BASE_REF;
  const prevBefore = process.env.GITHUB_BEFORE_SHA;
  try {
    delete process.env.GITHUB_BASE_REF;
    process.env.GITHUB_BEFORE_SHA = 'abc123deadbeef';
    assert.deepEqual(resolveDiffRange(), { base: 'abc123deadbeef', useMergeBase: false });
  } finally {
    if (prevBase === undefined) delete process.env.GITHUB_BASE_REF; else process.env.GITHUB_BASE_REF = prevBase;
    if (prevBefore === undefined) delete process.env.GITHUB_BEFORE_SHA; else process.env.GITHUB_BEFORE_SHA = prevBefore;
  }
});

test('resolveDiffRange: falls back to HEAD~1 when before is the all-zero SHA (new branch)', () => {
  const prevBase = process.env.GITHUB_BASE_REF;
  const prevBefore = process.env.GITHUB_BEFORE_SHA;
  try {
    delete process.env.GITHUB_BASE_REF;
    process.env.GITHUB_BEFORE_SHA = '0000000000000000000000000000000000000000';
    assert.deepEqual(resolveDiffRange(), { base: 'HEAD~1', useMergeBase: false });
  } finally {
    if (prevBase === undefined) delete process.env.GITHUB_BASE_REF; else process.env.GITHUB_BASE_REF = prevBase;
    if (prevBefore === undefined) delete process.env.GITHUB_BEFORE_SHA; else process.env.GITHUB_BEFORE_SHA = prevBefore;
  }
});

test('missing schema_version is reported as an actionable error', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'editorial-test-'));
  try {
    const validate = compileSchema();
    const fm = VALID_FM.split('\n').filter((l) => !l.startsWith('schema_version:')).join('\n');
    const file = writePlan(dir, 'x.md', fm);
    const { errors } = validateFile(file, validate, new Map());
    assert.ok(errors.some((e) => e.includes('missing schema_version')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
