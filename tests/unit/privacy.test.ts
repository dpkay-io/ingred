import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadPrivacyConfig,
  savePrivacyConfig,
  clearPrivacyConfig,
  splitByPrivacy,
  getProjectId,
  getPrivateCompiledDir,
} from '../../src/core/privacy.js';
import type { MatchResult, ProjectPrivacyConfig } from '../../src/types.js';
import { DEFAULT_META } from '../../src/types.js';

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

describe('getProjectId', () => {
  it('returns a 12-char hex string', () => {
    const id = getProjectId('/some/workspace/path');
    assert.match(id, /^[0-9a-f]{12}$/);
  });

  it('returns different IDs for different paths', () => {
    const id1 = getProjectId('/path/a');
    const id2 = getProjectId('/path/b');
    assert.notEqual(id1, id2);
  });

  it('returns same ID for same path', () => {
    const id1 = getProjectId('/path/a');
    const id2 = getProjectId('/path/a');
    assert.equal(id1, id2);
  });
});

describe('loadPrivacyConfig', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ingred-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns default config when file does not exist', async () => {
    const config = await loadPrivacyConfig('nonexistent-id', tempDir);
    assert.deepEqual(config, { version: 1, privateIngredients: [] });
  });

  it('loads existing config', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const projDir = join(tempDir, 'projects', 'abc123');
    await mkdir(projDir, { recursive: true });
    const data: ProjectPrivacyConfig = {
      version: 1,
      privateIngredients: ['src/react.md'],
    };
    await writeFile(join(projDir, 'config.json'), JSON.stringify(data));

    const config = await loadPrivacyConfig('abc123', tempDir);
    assert.deepEqual(config.privateIngredients, ['src/react.md']);
  });

  it('returns default config on corrupted JSON', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const projDir = join(tempDir, 'projects', 'abc123');
    await mkdir(projDir, { recursive: true });
    await writeFile(join(projDir, 'config.json'), '{bad json');

    const config = await loadPrivacyConfig('abc123', tempDir);
    assert.deepEqual(config, { version: 1, privateIngredients: [] });
  });

  it('returns default config when JSON has unexpected shape', async () => {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const projDir = join(tempDir, 'projects', 'abc123');
    await mkdir(projDir, { recursive: true });
    await writeFile(join(projDir, 'config.json'), JSON.stringify({ version: 1, something: 'else' }));

    const config = await loadPrivacyConfig('abc123', tempDir);
    assert.deepEqual(config, { version: 1, privateIngredients: [] });
  });
});

describe('savePrivacyConfig', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ingred-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates directories and writes config file', async () => {
    const config: ProjectPrivacyConfig = {
      version: 1,
      privateIngredients: ['src/react.md', 'src/ts.md'],
    };
    await savePrivacyConfig('proj123', config, tempDir);

    const raw = await readFile(join(tempDir, 'projects', 'proj123', 'config.json'), 'utf-8');
    const loaded = JSON.parse(raw);
    assert.deepEqual(loaded.privateIngredients, ['src/react.md', 'src/ts.md']);
  });
});

describe('clearPrivacyConfig', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ingred-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('resets config to empty privateIngredients', async () => {
    const config: ProjectPrivacyConfig = {
      version: 1,
      privateIngredients: ['src/react.md'],
    };
    await savePrivacyConfig('proj123', config, tempDir);
    await clearPrivacyConfig('proj123', tempDir);

    const loaded = await loadPrivacyConfig('proj123', tempDir);
    assert.deepEqual(loaded.privateIngredients, []);
  });

  it('succeeds even when no config exists', async () => {
    await clearPrivacyConfig('nonexistent', tempDir);
    const loaded = await loadPrivacyConfig('nonexistent', tempDir);
    assert.deepEqual(loaded.privateIngredients, []);
  });
});

describe('splitByPrivacy', () => {
  it('splits matches into public and private based on config', () => {
    const matches = [
      makeMatch('my-source', 'react.md', 'React rules'),
      makeMatch('my-source', 'ts.md', 'TS rules'),
      makeMatch('other-source', 'testing.md', 'Test rules'),
    ];
    const config: ProjectPrivacyConfig = {
      version: 1,
      privateIngredients: ['my-source/react.md'],
    };

    const { publicMatches, privateMatches } = splitByPrivacy(matches, config);

    assert.equal(publicMatches.length, 2);
    assert.equal(privateMatches.length, 1);
    assert.equal(privateMatches[0].ingredient.relativePath, 'react.md');
    assert.equal(publicMatches[0].ingredient.relativePath, 'ts.md');
    assert.equal(publicMatches[1].ingredient.relativePath, 'testing.md');
  });

  it('returns all as public when no private ingredients configured', () => {
    const matches = [
      makeMatch('src', 'a.md', 'A'),
      makeMatch('src', 'b.md', 'B'),
    ];
    const config: ProjectPrivacyConfig = {
      version: 1,
      privateIngredients: [],
    };

    const { publicMatches, privateMatches } = splitByPrivacy(matches, config);
    assert.equal(publicMatches.length, 2);
    assert.equal(privateMatches.length, 0);
  });

  it('returns all as private when all are marked private', () => {
    const matches = [
      makeMatch('src', 'a.md', 'A'),
      makeMatch('src', 'b.md', 'B'),
    ];
    const config: ProjectPrivacyConfig = {
      version: 1,
      privateIngredients: ['src/a.md', 'src/b.md'],
    };

    const { publicMatches, privateMatches } = splitByPrivacy(matches, config);
    assert.equal(publicMatches.length, 0);
    assert.equal(privateMatches.length, 2);
  });

  it('ignores private entries that do not match any ingredient', () => {
    const matches = [makeMatch('src', 'a.md', 'A')];
    const config: ProjectPrivacyConfig = {
      version: 1,
      privateIngredients: ['src/nonexistent.md'],
    };

    const { publicMatches, privateMatches } = splitByPrivacy(matches, config);
    assert.equal(publicMatches.length, 1);
    assert.equal(privateMatches.length, 0);
  });
});

describe('getPrivateCompiledDir', () => {
  it('returns path under ~/.ingred/compiled/<projectId>', () => {
    const dir = getPrivateCompiledDir('abc123');
    assert.ok(dir.endsWith(join('compiled', 'abc123')));
    assert.ok(dir.includes('.ingred'));
  });
});
