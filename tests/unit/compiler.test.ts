import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/core/compiler.js';
import type { MatchResult } from '../../src/types.js';
import { DEFAULT_META } from '../../src/types.js';

function makeMatch(
  relativePath: string,
  content: string,
  priority = 0,
  scope: 'engineering' | 'persona' = 'engineering',
  matchTier: 1 | 2 | 3 = 1,
  global = false,
): MatchResult {
  return {
    ingredient: {
      filePath: `/fake/${relativePath}`,
      relativePath,
      sourceName: 'test',
      content,
      meta: { ...DEFAULT_META, priority, scope, global },
    },
    matchTier,
    matchReason: 'test',
  };
}

describe('compile', () => {
  it('sorts by priority descending', () => {
    const matches = [
      makeMatch('low.md', 'Low priority', 0),
      makeMatch('high.md', 'High priority', 10),
    ];
    const result = compile(matches);
    assert.ok(result.project.engineeringSection.indexOf('High priority') < result.project.engineeringSection.indexOf('Low priority'));
  });

  it('groups persona and engineering separately', () => {
    const matches = [
      makeMatch('code.md', 'Code rules', 0, 'engineering'),
      makeMatch('style.md', 'Style rules', 0, 'persona'),
    ];
    const result = compile(matches);
    assert.ok(result.project.engineeringSection.includes('Code rules'));
    assert.ok(result.project.personaSection.includes('Style rules'));
    assert.ok(!result.project.engineeringSection.includes('Style rules'));
    assert.ok(!result.project.personaSection.includes('Code rules'));
  });

  it('auto-detects persona scope from path', () => {
    const matches = [
      makeMatch('persona/comm.md', 'Communication rules'),
    ];
    const result = compile(matches);
    assert.ok(result.project.personaSection.includes('Communication rules'));
    assert.equal(result.project.engineeringSection, '');
  });

  it('includes source attribution comments', () => {
    const matches = [makeMatch('rules.md', 'Some rules')];
    const result = compile(matches);
    assert.ok(result.project.engineeringSection.includes('<!-- source: test/rules.md -->'));
  });

  it('returns empty strings when no matches', () => {
    const result = compile([]);
    assert.equal(result.project.personaSection, '');
    assert.equal(result.project.engineeringSection, '');
    assert.equal(result.global.personaSection, '');
    assert.equal(result.global.engineeringSection, '');
  });

  it('splits global and project ingredients', () => {
    const matches = [
      makeMatch('rules.md', 'Project rules', 0, 'engineering', 1, false),
      makeMatch('persona/tone.md', 'Global tone', 0, 'persona', 1, true),
    ];
    const result = compile(matches);
    assert.ok(result.global.personaSection.includes('Global tone'));
    assert.equal(result.global.engineeringSection, '');
    assert.ok(result.project.engineeringSection.includes('Project rules'));
    assert.equal(result.project.personaSection, '');
  });
});
