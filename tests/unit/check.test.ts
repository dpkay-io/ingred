import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateIngredient } from '../../src/commands/check.js';
import type { IngredientFile } from '../../src/types.js';
import { DEFAULT_META } from '../../src/types.js';

function makeIngredient(overrides: Partial<IngredientFile> = {}): IngredientFile {
  return {
    filePath: '/fake/react-rules.md',
    relativePath: 'react-rules.md',
    sourceName: 'test',
    content: overrides.content ?? 'Follow these rules.',
    meta: overrides.meta ?? { ...DEFAULT_META },
  };
}

describe('validateIngredient', () => {
  it('valid ingredient passes with 0 errors and 0 warnings', () => {
    const ingredient = makeIngredient({
      meta: { ...DEFAULT_META, triggers: ['react'], scope: 'engineering' },
    });
    const result = validateIngredient(ingredient);
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 0);
  });

  it('empty content produces an error', () => {
    const ingredient = makeIngredient({ content: '   ' });
    const result = validateIngredient(ingredient);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].toLowerCase().includes('empty'));
  });

  it('unknown trigger produces a warning', () => {
    const ingredient = makeIngredient({
      meta: { ...DEFAULT_META, triggers: ['notarealtechnology'] },
    });
    const result = validateIngredient(ingredient);
    assert.equal(result.errors.length, 0);
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings[0].includes('notarealtechnology'));
  });

  it('known triggers pass without warnings', () => {
    const ingredient = makeIngredient({
      meta: { ...DEFAULT_META, triggers: ['typescript', 'react', 'jest'] },
    });
    const result = validateIngredient(ingredient);
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 0);
  });

  it('invalid scope produces an error', () => {
    const ingredient = makeIngredient({
      // @ts-expect-error intentionally invalid scope for test
      meta: { ...DEFAULT_META, scope: 'invalid-scope' },
    });
    const result = validateIngredient(ingredient);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors.some((e) => e.includes('scope')));
  });

  it('suggests similar known tokens for unknown trigger', () => {
    // 'reakt' is close to 'react' (distance 2)
    const ingredient = makeIngredient({
      meta: { ...DEFAULT_META, triggers: ['reakt'] },
    });
    const result = validateIngredient(ingredient);
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings[0].includes('did you mean'));
    assert.ok(result.warnings[0].includes('react'));
  });

  it('empty content and invalid scope both produce errors', () => {
    const ingredient = makeIngredient({
      content: '',
      // @ts-expect-error intentionally invalid scope for test
      meta: { ...DEFAULT_META, scope: 'bad' },
    });
    const result = validateIngredient(ingredient);
    assert.ok(result.errors.length >= 2);
  });
});
