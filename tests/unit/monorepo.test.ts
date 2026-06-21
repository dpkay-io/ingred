import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePnpmWorkspace, parseLernaJson } from '../../src/parsers/workspace.js';
import { parsePackageJsonWorkspaces } from '../../src/parsers/manifest.js';

describe('parsePnpmWorkspace', () => {
  it('extracts packages array with single-quoted entries', () => {
    const content = `packages:\n  - 'packages/*'\n  - 'apps/*'\n`;
    const result = parsePnpmWorkspace(content);
    assert.deepEqual(result, ['packages/*', 'apps/*']);
  });

  it('extracts packages array with double-quoted entries', () => {
    const content = `packages:\n  - "libs/*"\n  - "services/*"\n`;
    const result = parsePnpmWorkspace(content);
    assert.deepEqual(result, ['libs/*', 'services/*']);
  });

  it('extracts packages array with unquoted entries', () => {
    const content = `packages:\n  - packages/*\n  - apps/*\n`;
    const result = parsePnpmWorkspace(content);
    assert.deepEqual(result, ['packages/*', 'apps/*']);
  });

  it('returns empty array when packages key is missing', () => {
    const content = `ignore:\n  - something\n`;
    const result = parsePnpmWorkspace(content);
    assert.deepEqual(result, []);
  });

  it('returns empty array for empty content', () => {
    assert.deepEqual(parsePnpmWorkspace(''), []);
  });

  it('stops collecting at next top-level key', () => {
    const content = `packages:\n  - 'packages/*'\nother:\n  - 'ignored/*'\n`;
    const result = parsePnpmWorkspace(content);
    assert.deepEqual(result, ['packages/*']);
  });
});

describe('parseLernaJson', () => {
  it('extracts packages array from valid lerna.json', () => {
    const content = JSON.stringify({ packages: ['packages/*', 'libs/*'] });
    const result = parseLernaJson(content);
    assert.deepEqual(result, ['packages/*', 'libs/*']);
  });

  it('returns empty array when packages key is missing', () => {
    const content = JSON.stringify({ version: '1.0.0' });
    const result = parseLernaJson(content);
    assert.deepEqual(result, []);
  });

  it('returns empty array for malformed JSON', () => {
    const result = parseLernaJson('not valid json {{{');
    assert.deepEqual(result, []);
  });

  it('returns empty array for empty string', () => {
    assert.deepEqual(parseLernaJson(''), []);
  });

  it('filters out non-string entries in packages array', () => {
    const content = JSON.stringify({ packages: ['packages/*', 42, null, 'apps/*'] });
    const result = parseLernaJson(content);
    assert.deepEqual(result, ['packages/*', 'apps/*']);
  });
});

describe('parsePackageJsonWorkspaces', () => {
  it('extracts workspaces as flat array', () => {
    const content = JSON.stringify({ workspaces: ['packages/*', 'apps/*'] });
    const result = parsePackageJsonWorkspaces(content);
    assert.deepEqual(result, ['packages/*', 'apps/*']);
  });

  it('extracts workspaces.packages (yarn berry format)', () => {
    const content = JSON.stringify({ workspaces: { packages: ['packages/*', 'libs/*'] } });
    const result = parsePackageJsonWorkspaces(content);
    assert.deepEqual(result, ['packages/*', 'libs/*']);
  });

  it('returns empty array when no workspaces field', () => {
    const content = JSON.stringify({ name: 'my-app' });
    const result = parsePackageJsonWorkspaces(content);
    assert.deepEqual(result, []);
  });

  it('returns empty array for malformed JSON', () => {
    const result = parsePackageJsonWorkspaces('not json');
    assert.deepEqual(result, []);
  });

  it('returns empty array when workspaces is a non-array non-object', () => {
    const content = JSON.stringify({ workspaces: 'packages/*' });
    const result = parsePackageJsonWorkspaces(content);
    assert.deepEqual(result, []);
  });
});
