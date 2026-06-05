import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/core/compiler.js';
import type { MatchResult, IngredientFile } from '../../src/types.js';
import { DEFAULT_META } from '../../src/types.js';

function makeMatch(relativePath: string, content: string): MatchResult {
  const ingredient: IngredientFile = {
    filePath: `/fake/${relativePath}`,
    relativePath,
    sourceName: 'test',
    content,
    meta: { ...DEFAULT_META },
  };
  return { ingredient, matchTier: 1, matchReason: 'test' };
}

describe('compile with filtered matches (interactive simulation)', () => {
  it('compiles only the matches passed to it', () => {
    const match1 = makeMatch('react.md', 'React rules');
    const match2 = makeMatch('typescript.md', 'TS rules');
    const match3 = makeMatch('testing.md', 'Test rules');

    const allResult = compile([match1, match2, match3]);
    const filteredResult = compile([match1, match3]);

    assert.ok(allResult.project.engineeringSection.includes('TS rules'));
    assert.ok(!filteredResult.project.engineeringSection.includes('TS rules'));
    assert.ok(filteredResult.project.engineeringSection.includes('React rules'));
    assert.ok(filteredResult.project.engineeringSection.includes('Test rules'));
  });

  it('returns empty sections when no matches passed', () => {
    const result = compile([]);
    assert.equal(result.project.engineeringSection, '');
    assert.equal(result.project.personaSection, '');
  });
});
