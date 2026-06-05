import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchIngredients, KNOWN_TECH_VOCABULARY } from '../../src/core/matcher.js';
import type { IngredientFile, DetectedStack, ExternalMapping } from '../../src/types.js';
import { DEFAULT_META } from '../../src/types.js';

function makeIngredient(
  relativePath: string,
  overrides: Partial<IngredientFile> = {},
): IngredientFile {
  return {
    filePath: `/fake/${relativePath}`,
    relativePath,
    sourceName: overrides.sourceName ?? 'test',
    content: overrides.content ?? 'Some content',
    meta: overrides.meta ?? { ...DEFAULT_META },
  };
}

const reactStack: DetectedStack = {
  technologies: new Set(['react', 'typescript', 'node', 'javascript', 'jest']),
  detectedFiles: new Map([['package.json', ['react', 'typescript', 'jest']]]),
  workspaceRoot: '/workspace',
};

describe('matchIngredients', () => {
  it('matches by filename token (tier 1)', () => {
    const ingredients = [makeIngredient('react-patterns.md')];
    const results = matchIngredients(ingredients, reactStack, []);
    assert.equal(results.length, 1);
    assert.equal(results[0].matchTier, 1);
    assert.ok(results[0].matchReason.includes('react'));
  });

  it('includes universal files (tier 1)', () => {
    const ingredients = [makeIngredient('general-rules.md')];
    const results = matchIngredients(ingredients, reactStack, []);
    assert.equal(results.length, 1);
    assert.equal(results[0].matchTier, 1);
    assert.ok(results[0].matchReason.includes('universal'));
  });

  it('excludes non-matching tech files (tier 1)', () => {
    const ingredients = [makeIngredient('vue-guidelines.md')];
    const results = matchIngredients(ingredients, reactStack, []);
    assert.equal(results.length, 0);
  });

  it('matches by frontmatter trigger (tier 2)', () => {
    const ingredients = [
      makeIngredient('patterns.md', {
        meta: { ...DEFAULT_META, triggers: ['react'] },
      }),
    ];
    const results = matchIngredients(ingredients, reactStack, []);
    assert.equal(results.length, 1);
    assert.equal(results[0].matchTier, 2);
  });

  it('matches with always: true (tier 2)', () => {
    const ingredients = [
      makeIngredient('style.md', {
        meta: { ...DEFAULT_META, always: true },
      }),
    ];
    const results = matchIngredients(ingredients, reactStack, []);
    assert.equal(results.length, 1);
    assert.equal(results[0].matchTier, 2);
  });

  it('matches by external mapping (tier 3)', () => {
    const ingredients = [makeIngredient('custom-rules.md')];
    const mappings: ExternalMapping[] = [
      { files: ['custom-rules.md'], when: { dependencies: ['react'] } },
    ];
    const results = matchIngredients(ingredients, reactStack, mappings);
    assert.equal(results.length, 1);
    assert.equal(results[0].matchTier, 3);
  });

  it('reports highest tier when multiple tiers match', () => {
    const ingredients = [
      makeIngredient('react-patterns.md', {
        meta: { ...DEFAULT_META, triggers: ['react'] },
      }),
    ];
    const mappings: ExternalMapping[] = [
      { files: ['react-patterns.md'], when: { dependencies: ['react'] } },
    ];
    const results = matchIngredients(ingredients, reactStack, mappings);
    assert.equal(results.length, 1);
    assert.equal(results[0].matchTier, 3);
  });

  it('deduplicates by basename keeping first source', () => {
    const ingredients = [
      makeIngredient('react.md', { sourceName: 'source-a' }),
      makeIngredient('react.md', { sourceName: 'source-b' }),
    ];
    const results = matchIngredients(ingredients, reactStack, []);
    assert.equal(results.length, 1);
    assert.equal(results[0].ingredient.sourceName, 'source-a');
  });

  it('uses content scanning fallback for ambiguous filenames', () => {
    const ingredients = [
      makeIngredient('tips.md', {
        content: 'When using React hooks, always prefer useCallback for...\nMore content here.',
      }),
    ];
    // "tips" is not a tech token, so it would be universal. But let's make a file
    // with a tech-related folder name that doesn't match
    const ambiguous = makeIngredient('python-tips.md', {
      content: 'Here are some tips for React development with hooks.',
    });
    const results = matchIngredients([ambiguous], reactStack, []);
    // python is in tech vocab, doesn't match react stack -> falls to content scan
    // content mentions react -> should match
    assert.equal(results.length, 1);
  });

  it('has a comprehensive KNOWN_TECH_VOCABULARY', () => {
    assert.ok(KNOWN_TECH_VOCABULARY.has('react'));
    assert.ok(KNOWN_TECH_VOCABULARY.has('vue'));
    assert.ok(KNOWN_TECH_VOCABULARY.has('django'));
    assert.ok(KNOWN_TECH_VOCABULARY.has('docker'));
    assert.ok(KNOWN_TECH_VOCABULARY.has('postgres'));
    assert.ok(KNOWN_TECH_VOCABULARY.size >= 150);
  });
});
