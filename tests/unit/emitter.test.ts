import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { emit } from '../../src/core/emitter.js';
import { compile } from '../../src/core/compiler.js';
import { INGRED_SENTINEL, DEFAULT_META } from '../../src/types.js';
import type { MatchResult, DetectedStack } from '../../src/types.js';

function makeMatch(
  sourceName: string,
  relativePath: string,
  content: string,
): MatchResult {
  return {
    ingredient: {
      filePath: `/fake/${relativePath}`,
      relativePath,
      sourceName,
      content,
      meta: { ...DEFAULT_META },
    },
    matchTier: 1,
    matchReason: 'test',
  };
}

function makeStack(workspaceRoot: string): DetectedStack {
  return {
    technologies: new Set(['typescript']),
    detectedFiles: new Map(),
    workspaceRoot,
  };
}

describe('emit with private ingredients', () => {
  let workDir: string;
  let compiledDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'ingred-emit-'));
    compiledDir = await mkdtemp(join(tmpdir(), 'ingred-compiled-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
    await rm(compiledDir, { recursive: true, force: true });
  });

  it('writes private content and appends reference to target file', async () => {
    const publicMatches = [makeMatch('pub-src', 'public-rules.md', 'Public engineering rules')];
    const privateMatches = [makeMatch('priv-src', 'secret-rules.md', 'Secret engineering rules')];

    const publicCompiled = compile(publicMatches);
    const privateCompiled = compile(privateMatches);

    const stack = makeStack(workDir);
    const results = await emit(publicCompiled, stack, ['claude'], false, {
      privateCompiled,
      compiledDir,
      tildeCompiledDir: '~/.ingred/compiled/abc123',
    });

    // Project file should be written
    const projectResult = results.find(
      (r) => r.target === 'claude' && r.location === 'project',
    );
    assert.ok(projectResult);
    assert.equal(projectResult!.status, 'written');

    // Read the project file
    const claudeMd = await readFile(join(workDir, 'CLAUDE.md'), 'utf-8');

    // Should contain public content
    assert.ok(claudeMd.includes('Public engineering rules'));
    // Should contain @~ reference
    assert.ok(claudeMd.includes('@~/.ingred/compiled/abc123/private-claude.md'));
    // Should NOT contain private content
    assert.ok(!claudeMd.includes('Secret engineering rules'));

    // Read the private file
    const privateMd = await readFile(
      join(compiledDir, 'private-claude.md'),
      'utf-8',
    );
    // Should contain private content
    assert.ok(privateMd.includes('Secret engineering rules'));
    // Should NOT contain the sentinel (private files are not user-facing)
    assert.ok(!privateMd.includes(INGRED_SENTINEL));
  });

  it('writes reference-only target file when no public but private exists', async () => {
    const privateMatches = [makeMatch('priv-src', 'secret.md', 'Secret stuff')];
    const publicCompiled = compile([]);
    const privateCompiled = compile(privateMatches);

    const stack = makeStack(workDir);
    const results = await emit(publicCompiled, stack, ['claude'], false, {
      privateCompiled,
      compiledDir,
      tildeCompiledDir: '~/.ingred/compiled/abc123',
    });

    const projectResult = results.find(
      (r) => r.target === 'claude' && r.location === 'project',
    );
    assert.ok(projectResult);
    assert.equal(projectResult!.status, 'written');

    const claudeMd = await readFile(join(workDir, 'CLAUDE.md'), 'utf-8');
    // Should have sentinel
    assert.ok(claudeMd.includes(INGRED_SENTINEL));
    // Should have @~ reference
    assert.ok(claudeMd.includes('@~/.ingred/compiled/abc123/private-claude.md'));
  });

  it('cleans up stale private files', async () => {
    // Pre-create a stale private file
    const staleFile = join(compiledDir, 'private-claude.md');
    await writeFile(staleFile, 'stale content', 'utf-8');

    const publicMatches = [makeMatch('pub-src', 'rules.md', 'Public rules')];
    const publicCompiled = compile(publicMatches);

    const stack = makeStack(workDir);
    await emit(publicCompiled, stack, ['claude'], false, {
      privateCompiled: null,
      compiledDir,
      tildeCompiledDir: '~/.ingred/compiled/abc123',
    });

    // Stale file should be deleted
    let exists = true;
    try {
      await readFile(staleFile, 'utf-8');
    } catch {
      exists = false;
    }
    assert.equal(exists, false, 'stale private file should have been deleted');

    // Project file should not have a reference
    const claudeMd = await readFile(join(workDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(!claudeMd.includes('@~/.ingred/compiled'));
  });

  it('backward compatible when no privateOpts', async () => {
    const publicMatches = [makeMatch('pub-src', 'rules.md', 'Public rules')];
    const publicCompiled = compile(publicMatches);

    const stack = makeStack(workDir);
    const results = await emit(publicCompiled, stack, ['claude'], false);

    const projectResult = results.find(
      (r) => r.target === 'claude' && r.location === 'project',
    );
    assert.ok(projectResult);
    assert.equal(projectResult!.status, 'written');

    const claudeMd = await readFile(join(workDir, 'CLAUDE.md'), 'utf-8');
    assert.ok(claudeMd.includes('Public rules'));
    // Should not have any @~ reference
    assert.ok(!claudeMd.includes('@~'));
  });

  it('appends text references for non-Claude targets', async () => {
    const publicMatches = [makeMatch('pub-src', 'rules.md', 'Public rules')];
    const privateMatches = [makeMatch('priv-src', 'secret.md', 'Secret rules')];

    const publicCompiled = compile(publicMatches);
    const privateCompiled = compile(privateMatches);

    const stack = makeStack(workDir);
    const results = await emit(publicCompiled, stack, ['cursor'], false, {
      privateCompiled,
      compiledDir,
      tildeCompiledDir: '~/.ingred/compiled/abc123',
    });

    const projectResult = results.find(
      (r) => r.target === 'cursor' && r.location === 'project',
    );
    assert.ok(projectResult);
    assert.equal(projectResult!.status, 'written');

    const cursorRules = await readFile(join(workDir, '.cursorrules'), 'utf-8');
    // Should have the cursor-style reference
    assert.ok(cursorRules.includes('/* Read and follow:'));
    assert.ok(
      cursorRules.includes('~/.ingred/compiled/abc123/private-cursor.md'),
    );
  });
});
