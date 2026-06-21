import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkspaceConfig } from '../../src/parsers/workspace-config.js';

describe('parseWorkspaceConfig', () => {
  it('returns empty config for empty file', () => {
    const result = parseWorkspaceConfig('');
    assert.deepStrictEqual(result, {});
  });

  it('parses profile', () => {
    const result = parseWorkspaceConfig('profile: work');
    assert.equal(result.profile, 'work');
  });

  it('parses targets as inline array', () => {
    const result = parseWorkspaceConfig('targets: [claude, cursor]');
    assert.deepStrictEqual(result.targets, ['claude', 'cursor']);
  });

  it('parses targets as block array', () => {
    const content = 'targets:\n  - claude\n  - cursor\n  - copilot';
    const result = parseWorkspaceConfig(content);
    assert.deepStrictEqual(result.targets, ['claude', 'cursor', 'copilot']);
  });

  it('parses exclude as block array', () => {
    const content = 'exclude:\n  - source/secret.md\n  - other/private.md';
    const result = parseWorkspaceConfig(content);
    assert.deepStrictEqual(result.exclude, ['source/secret.md', 'other/private.md']);
  });

  it('parses all three fields together', () => {
    const content = [
      'profile: personal',
      'targets: [claude, gemini]',
      'exclude:',
      '  - myrepo/work-rules.md',
    ].join('\n');
    const result = parseWorkspaceConfig(content);
    assert.equal(result.profile, 'personal');
    assert.deepStrictEqual(result.targets, ['claude', 'gemini']);
    assert.deepStrictEqual(result.exclude, ['myrepo/work-rules.md']);
  });

  it('ignores commented-out lines', () => {
    const content = [
      '# profile: ignored',
      'profile: active',
      '# targets: [ignored]',
    ].join('\n');
    const result = parseWorkspaceConfig(content);
    assert.equal(result.profile, 'active');
    assert.equal(result.targets, undefined);
  });

  it('strips quotes from values', () => {
    const content = 'profile: "quoted-name"';
    const result = parseWorkspaceConfig(content);
    assert.equal(result.profile, 'quoted-name');
  });

  it('handles inline array with quoted entries', () => {
    const content = 'targets: ["claude", "cursor"]';
    const result = parseWorkspaceConfig(content);
    assert.deepStrictEqual(result.targets, ['claude', 'cursor']);
  });

  it('handles file with only comments and blank lines', () => {
    const content = '# This is a comment\n\n# Another comment\n';
    const result = parseWorkspaceConfig(content);
    assert.deepStrictEqual(result, {});
  });
});
