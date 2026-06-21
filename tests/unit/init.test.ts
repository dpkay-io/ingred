import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scaffoldIngredientsRepo, scaffoldWorkspaceConfig } from '../../src/commands/init.js';

// ─── scaffoldIngredientsRepo ─────────────────────────────────────────────────

describe('scaffoldIngredientsRepo', () => {
  let tempDir: string;
  let repoDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ingred-init-test-'));
    repoDir = join(tempDir, 'my-ingredients');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates the repo directory', async () => {
    await scaffoldIngredientsRepo(repoDir);
    const s = await stat(repoDir);
    assert.ok(s.isDirectory());
  });

  it('creates persona subdirectory', async () => {
    await scaffoldIngredientsRepo(repoDir);
    const s = await stat(join(repoDir, 'persona'));
    assert.ok(s.isDirectory());
  });

  it('creates general-rules.md', async () => {
    await scaffoldIngredientsRepo(repoDir);
    const content = await readFile(join(repoDir, 'general-rules.md'), 'utf-8');
    assert.ok(content.length > 0, 'general-rules.md should not be empty');
    assert.ok(content.includes('# General Rules'), 'should have a heading');
  });

  it('creates react.md with correct frontmatter', async () => {
    await scaffoldIngredientsRepo(repoDir);
    const content = await readFile(join(repoDir, 'react.md'), 'utf-8');
    assert.ok(content.includes('triggers: [react]'), 'should have react trigger');
    assert.ok(content.includes('scope: engineering'), 'should have engineering scope');
    assert.ok(content.includes('priority: 5'), 'should have priority 5');
  });

  it('creates testing.md with multiple triggers', async () => {
    await scaffoldIngredientsRepo(repoDir);
    const content = await readFile(join(repoDir, 'testing.md'), 'utf-8');
    assert.ok(content.includes('triggers: [jest, vitest, mocha, pytest]'), 'should have multiple triggers');
    assert.ok(content.includes('scope: engineering'), 'should have engineering scope');
  });

  it('creates persona/communication-style.md with always: true', async () => {
    await scaffoldIngredientsRepo(repoDir);
    const content = await readFile(join(repoDir, 'persona', 'communication-style.md'), 'utf-8');
    assert.ok(content.includes('scope: persona'), 'should have persona scope');
    assert.ok(content.includes('always: true'), 'should be always-included');
  });

  it('creates ingred.yaml as a commented-out example', async () => {
    await scaffoldIngredientsRepo(repoDir);
    const content = await readFile(join(repoDir, 'ingred.yaml'), 'utf-8');
    assert.ok(content.length > 0, 'ingred.yaml should not be empty');
    // All substantive lines should be commented out (it's an example file)
    const substantiveLines = content
      .split('\n')
      .filter((line) => line.trim().length > 0 && !line.trim().startsWith('#'));
    assert.equal(substantiveLines.length, 0, 'ingred.yaml should have only comments');
  });

  it('creates README.md', async () => {
    await scaffoldIngredientsRepo(repoDir);
    const content = await readFile(join(repoDir, 'README.md'), 'utf-8');
    assert.ok(content.length > 0, 'README.md should not be empty');
    assert.ok(content.includes('ingred'), 'README.md should mention ingred');
  });

  it('creates exactly 6 files total (5 root + 1 in persona/)', async () => {
    await scaffoldIngredientsRepo(repoDir);
    const expectedFiles = [
      join(repoDir, 'general-rules.md'),
      join(repoDir, 'react.md'),
      join(repoDir, 'testing.md'),
      join(repoDir, 'ingred.yaml'),
      join(repoDir, 'README.md'),
      join(repoDir, 'persona', 'communication-style.md'),
    ];

    for (const filePath of expectedFiles) {
      const s = await stat(filePath);
      assert.ok(s.isFile(), `Expected file: ${filePath}`);
    }
  });

  it('is idempotent — does not throw if called on a new dir inside existing parent', async () => {
    const newRepo = join(tempDir, 'second-ingredients');
    await assert.doesNotReject(() => scaffoldIngredientsRepo(newRepo));
    const s = await stat(newRepo);
    assert.ok(s.isDirectory());
  });
});

// ─── scaffoldWorkspaceConfig ─────────────────────────────────────────────────

describe('scaffoldWorkspaceConfig', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ingred-init-ws-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates .ingred.yaml in the given directory', async () => {
    await scaffoldWorkspaceConfig(tempDir);
    const s = await stat(join(tempDir, '.ingred.yaml'));
    assert.ok(s.isFile());
  });

  it('creates .ingred.yaml with only comments (everything commented out)', async () => {
    await scaffoldWorkspaceConfig(tempDir);
    const content = await readFile(join(tempDir, '.ingred.yaml'), 'utf-8');
    const substantiveLines = content
      .split('\n')
      .filter((line) => line.trim().length > 0 && !line.trim().startsWith('#'));
    assert.equal(substantiveLines.length, 0, 'all config options should be commented out');
  });

  it('content includes expected config keys as comments', async () => {
    await scaffoldWorkspaceConfig(tempDir);
    const content = await readFile(join(tempDir, '.ingred.yaml'), 'utf-8');
    assert.ok(content.includes('profile'), 'should document profile key');
    assert.ok(content.includes('exclude'), 'should document exclude key');
    assert.ok(content.includes('targets'), 'should document targets key');
  });

  it('can be called with an existing directory without throwing', async () => {
    await assert.doesNotReject(() => scaffoldWorkspaceConfig(tempDir));
  });
});
