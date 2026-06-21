import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadPrivacyConfig,
  savePrivacyConfig,
} from '../../src/core/privacy.js';
import type { ProjectConfig } from '../../src/types.js';
import { defaultProjectConfig } from '../../src/types.js';

describe('excludedIngredients — save/load round-trip', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ingred-exclude-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('persists excludedIngredients through save and load', async () => {
    const config: ProjectConfig = {
      version: 1,
      privateIngredients: [],
      excludedIngredients: ['my-source/rules.md', 'other-source/ts.md'],
    };
    await savePrivacyConfig('proj1', config, tempDir);

    const loaded = await loadPrivacyConfig('proj1', tempDir);
    assert.deepEqual(loaded.excludedIngredients, ['my-source/rules.md', 'other-source/ts.md']);
  });

  it('persists both privateIngredients and excludedIngredients independently', async () => {
    const config: ProjectConfig = {
      version: 1,
      privateIngredients: ['my-source/secret.md'],
      excludedIngredients: ['my-source/noisy.md'],
    };
    await savePrivacyConfig('proj2', config, tempDir);

    const loaded = await loadPrivacyConfig('proj2', tempDir);
    assert.deepEqual(loaded.privateIngredients, ['my-source/secret.md']);
    assert.deepEqual(loaded.excludedIngredients, ['my-source/noisy.md']);
  });

  it('empty excludedIngredients round-trips correctly', async () => {
    const config: ProjectConfig = {
      version: 1,
      privateIngredients: ['src/a.md'],
      excludedIngredients: [],
    };
    await savePrivacyConfig('proj3', config, tempDir);

    const loaded = await loadPrivacyConfig('proj3', tempDir);
    assert.deepEqual(loaded.excludedIngredients, []);
  });
});

describe('excludedIngredients — backward compatibility', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'ingred-compat-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('defaults excludedIngredients to [] for old configs without the field', async () => {
    const projDir = join(tempDir, 'projects', 'old-proj');
    await mkdir(projDir, { recursive: true });
    // Old format: only privateIngredients, no excludedIngredients
    const oldConfig = { version: 1, privateIngredients: ['src/react.md'] };
    await writeFile(join(projDir, 'config.json'), JSON.stringify(oldConfig));

    const loaded = await loadPrivacyConfig('old-proj', tempDir);
    assert.deepEqual(loaded.excludedIngredients, []);
    assert.deepEqual(loaded.privateIngredients, ['src/react.md']);
  });

  it('defaultProjectConfig includes excludedIngredients as empty array', () => {
    const config = defaultProjectConfig();
    assert.ok(Array.isArray(config.excludedIngredients));
    assert.equal(config.excludedIngredients.length, 0);
  });
});
