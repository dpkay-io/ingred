import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { INGRED_SENTINEL, DEFAULT_META } from '../../src/types.js';
import type { MatchResult, DetectedStack } from '../../src/types.js';
import {
  upsertManagedBlock,
  GLOBAL_BLOCK_START,
  GLOBAL_BLOCK_END,
} from '../../src/utils/managed-block.js';

// Global targets resolve ~ at module load, so point HOME at a sandbox BEFORE importing them.
// This keeps these tests away from the real ~/.claude and ~/.gemini.
const sandboxHome = await mkdtemp(join(tmpdir(), 'ingred-home-'));
process.env.HOME = sandboxHome;
process.env.USERPROFILE = sandboxHome;

const { emit } = await import('../../src/core/emitter.js');
const { compile } = await import('../../src/core/compiler.js');
const { gemini } = await import('../../src/targets/gemini.js');
const { claude } = await import('../../src/targets/claude.js');

const GLOBAL_RULE = 'GLOBAL-RULE-TEXT';
const PROJECT_RULE = 'PROJECT-RULE-TEXT';
const MANUAL_CONTENT = '<!-- antibluff:start -->\nbe honest\n<!-- antibluff:end -->\n';

function makeMatch(relativePath: string, content: string, isGlobal: boolean): MatchResult {
  return {
    ingredient: {
      filePath: `/fake/${relativePath}`,
      relativePath,
      sourceName: 'src',
      content,
      meta: { ...DEFAULT_META, global: isGlobal },
    },
    matchTier: 1,
    matchReason: 'test',
  };
}

function makeStack(workspaceRoot: string): DetectedStack {
  return { technologies: new Set(['typescript']), detectedFiles: new Map(), workspaceRoot };
}

const claudeGlobalPath = join(sandboxHome, '.claude', 'CLAUDE.md');
const geminiGlobalPath = join(sandboxHome, '.gemini', 'GEMINI.md');
const importedPath = join(sandboxHome, '.ingred', 'compiled', '_global', 'private-claude.md');

after(async () => {
  await rm(sandboxHome, { recursive: true, force: true });
});

describe('upsertManagedBlock', () => {
  it('appends the block after existing content when absent', () => {
    const result = upsertManagedBlock('hello\n', '@x');
    assert.equal(result, `hello\n\n${GLOBAL_BLOCK_START}\n@x\n${GLOBAL_BLOCK_END}\n`);
  });

  it('writes only the block into an empty file', () => {
    assert.equal(upsertManagedBlock('', '@x'), `${GLOBAL_BLOCK_START}\n@x\n${GLOBAL_BLOCK_END}\n`);
  });

  it('replaces an existing block in place and preserves surrounding text', () => {
    const first = upsertManagedBlock('top\n', '@old')!;
    const withTail = `${first}\nbottom\n`;
    const result = upsertManagedBlock(withTail, '@new')!;
    assert.ok(result.startsWith('top\n'));
    assert.ok(result.endsWith('\nbottom\n'));
    assert.ok(result.includes('@new'));
    assert.ok(!result.includes('@old'));
    assert.equal(result.split(GLOBAL_BLOCK_START).length, 2, 'exactly one start marker');
  });

  it('is idempotent', () => {
    const once = upsertManagedBlock('top\n', '@x')!;
    assert.equal(upsertManagedBlock(once, '@x'), once);
  });

  it('returns null when the start marker has no end marker', () => {
    assert.equal(upsertManagedBlock(`${GLOBAL_BLOCK_START}\n@x\n`, '@y'), null);
  });
});

describe('global output paths', () => {
  it('gemini writes globally to ~/.gemini/GEMINI.md', () => {
    assert.equal(gemini.globalOutputPath, geminiGlobalPath);
    assert.equal(gemini.globalEnsureDir, join(sandboxHome, '.gemini'));
  });

  it('claude still writes globally to ~/.claude/CLAUDE.md', () => {
    assert.equal(claude.globalOutputPath, claudeGlobalPath);
  });
});

describe('emit with global ingredients', () => {
  let workDir: string;
  const compiled = () =>
    compile([
      makeMatch('global-rules.md', GLOBAL_RULE, true),
      makeMatch('project-rules.md', PROJECT_RULE, false),
    ]);

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'ingred-work-'));
    await rm(join(sandboxHome, '.claude'), { recursive: true, force: true });
    await rm(join(sandboxHome, '.gemini'), { recursive: true, force: true });
    await rm(join(sandboxHome, '.ingred'), { recursive: true, force: true });
  });

  after(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('writes gemini global rules to ~/.gemini/GEMINI.md and keeps them out of the project file', async () => {
    const results = await emit(compiled(), makeStack(workDir), ['gemini'], false);

    const globalResult = results.find((r) => r.location === 'global');
    assert.equal(globalResult?.status, 'written');

    const globalFile = await readFile(geminiGlobalPath, 'utf-8');
    assert.ok(globalFile.startsWith(INGRED_SENTINEL));
    assert.ok(globalFile.includes(GLOBAL_RULE));
    assert.ok(!globalFile.includes(PROJECT_RULE));

    const projectFile = await readFile(join(workDir, 'GEMINI.md'), 'utf-8');
    assert.ok(projectFile.includes(PROJECT_RULE));
    assert.ok(!projectFile.includes(GLOBAL_RULE));
  });

  it('skips a hand-written global file by default and leaves it untouched', async () => {
    await mkdir(join(sandboxHome, '.claude'), { recursive: true });
    await writeFile(claudeGlobalPath, MANUAL_CONTENT, 'utf-8');

    const results = await emit(compiled(), makeStack(workDir), ['claude'], false);

    const globalResult = results.find((r) => r.location === 'global');
    assert.equal(globalResult?.status, 'skipped');
    assert.equal(await readFile(claudeGlobalPath, 'utf-8'), MANUAL_CONTENT);
  });

  it('importGlobal keeps the hand-written file and links compiled rules via an include line', async () => {
    await mkdir(join(sandboxHome, '.claude'), { recursive: true });
    await writeFile(claudeGlobalPath, MANUAL_CONTENT, 'utf-8');

    const results = await emit(compiled(), makeStack(workDir), ['claude'], false, undefined, {
      importGlobal: true,
    });

    const globalResult = results.find((r) => r.location === 'global');
    assert.equal(globalResult?.status, 'imported');

    const manual = await readFile(claudeGlobalPath, 'utf-8');
    assert.ok(manual.startsWith(MANUAL_CONTENT), 'original content untouched');
    assert.ok(manual.includes(GLOBAL_BLOCK_START));
    assert.ok(manual.includes('@~/.ingred/compiled/_global/private-claude.md'));
    assert.ok(!manual.includes(GLOBAL_RULE), 'rules live in the compiled file, not inline');

    const linked = await readFile(importedPath, 'utf-8');
    assert.ok(linked.includes(GLOBAL_RULE));
    assert.ok(!linked.includes(INGRED_SENTINEL), 'sentinel stripped from linked file');
  });

  it('importGlobal is idempotent and refreshes the linked file on re-run', async () => {
    await mkdir(join(sandboxHome, '.claude'), { recursive: true });
    await writeFile(claudeGlobalPath, MANUAL_CONTENT, 'utf-8');
    const opts = { importGlobal: true };

    await emit(compiled(), makeStack(workDir), ['claude'], false, undefined, opts);
    const afterFirst = await readFile(claudeGlobalPath, 'utf-8');

    const updated = compile([makeMatch('global-rules.md', 'UPDATED-TEXT', true)]);
    await emit(updated, makeStack(workDir), ['claude'], false, undefined, opts);

    assert.equal(await readFile(claudeGlobalPath, 'utf-8'), afterFirst, 'include block unchanged');
    assert.ok((await readFile(importedPath, 'utf-8')).includes('UPDATED-TEXT'));
  });

  it('importGlobal writes directly when the global file is already ingred-owned', async () => {
    await mkdir(join(sandboxHome, '.claude'), { recursive: true });
    await writeFile(claudeGlobalPath, `${INGRED_SENTINEL}\nold\n`, 'utf-8');

    const results = await emit(compiled(), makeStack(workDir), ['claude'], false, undefined, {
      importGlobal: true,
    });

    assert.equal(results.find((r) => r.location === 'global')?.status, 'written');
    assert.ok((await readFile(claudeGlobalPath, 'utf-8')).includes(GLOBAL_RULE));
  });

  it('importGlobal skips (not corrupts) a file with an unterminated ingred block', async () => {
    await mkdir(join(sandboxHome, '.claude'), { recursive: true });
    const broken = `${MANUAL_CONTENT}\n${GLOBAL_BLOCK_START}\n@dangling\n`;
    await writeFile(claudeGlobalPath, broken, 'utf-8');

    const results = await emit(compiled(), makeStack(workDir), ['claude'], false, undefined, {
      importGlobal: true,
    });

    const globalResult = results.find((r) => r.location === 'global');
    assert.equal(globalResult?.status, 'skipped');
    assert.equal(await readFile(claudeGlobalPath, 'utf-8'), broken);
  });

  it('force overwrites a hand-written global file even with importGlobal', async () => {
    await mkdir(join(sandboxHome, '.claude'), { recursive: true });
    await writeFile(claudeGlobalPath, MANUAL_CONTENT, 'utf-8');

    const results = await emit(compiled(), makeStack(workDir), ['claude'], true, undefined, {
      importGlobal: true,
    });

    assert.equal(results.find((r) => r.location === 'global')?.status, 'written');
    assert.ok((await readFile(claudeGlobalPath, 'utf-8')).includes(GLOBAL_RULE));
  });

  it('globalOnly writes global files and nothing into the workspace', async () => {
    const results = await emit(compiled(), makeStack(workDir), ['claude', 'gemini'], false, undefined, {
      globalOnly: true,
    });

    assert.ok(results.every((r) => r.location === 'global'));
    assert.equal(results.length, 2);
    assert.ok((await readFile(claudeGlobalPath, 'utf-8')).includes(GLOBAL_RULE));
    assert.ok((await readFile(geminiGlobalPath, 'utf-8')).includes(GLOBAL_RULE));
    assert.deepEqual(await readdir(workDir), [], 'workspace untouched');
  });

  it('globalOnly ignores targets that have no global file', async () => {
    const results = await emit(compiled(), makeStack(workDir), ['agents'], false, undefined, {
      globalOnly: true,
    });

    assert.deepEqual(results, []);
    assert.deepEqual(await readdir(workDir), []);
  });
});
