import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../../src/core/compiler.js';
import type { MatchResult } from '../../src/types.js';
import { DEFAULT_META } from '../../src/types.js';

function makeMatch(
  relativePath: string,
  content: string,
  opts: {
    sourceName?: string;
    priority?: number;
    scope?: 'engineering' | 'persona';
    matchTier?: 1 | 2 | 3;
    global?: boolean;
    extends?: string;
  } = {},
): MatchResult {
  const {
    sourceName = 'test',
    priority = 0,
    scope = 'engineering',
    matchTier = 1,
    global = false,
    extends: extendsVal,
  } = opts;
  return {
    ingredient: {
      filePath: `/fake/${relativePath}`,
      relativePath,
      sourceName,
      content,
      meta: { ...DEFAULT_META, priority, scope, global, extends: extendsVal },
    },
    matchTier,
    matchReason: 'test',
  };
}

describe('ingredient composition (extends)', () => {
  it('prepends base content before child content when extends is used', () => {
    const matches = [
      makeMatch('base.md', 'Base rules', { sourceName: 'test' }),
      makeMatch('child.md', 'Child rules', { sourceName: 'test', extends: 'base.md' }),
    ];
    const result = compile(matches);
    const section = result.project.engineeringSection;

    // The base+child combined content should appear in a single attribution block
    // attributed to the child (the base is absorbed into child's block)
    const childAttrIdx = section.indexOf('source: test/child.md');
    assert.ok(childAttrIdx !== -1, 'child attribution should appear');

    // base content should come before child content within the child's block
    const baseIdx = section.indexOf('Base rules');
    const childIdx = section.indexOf('Child rules');
    assert.ok(baseIdx !== -1, 'base content should appear in output');
    assert.ok(childIdx !== -1, 'child content should appear in output');
    assert.ok(baseIdx < childIdx, 'base content should appear before child content');

    // They should both appear after child's attribution comment
    assert.ok(baseIdx > childAttrIdx, 'base content should be under child attribution block');
  });

  it('absorbed base is not emitted as standalone when extended by another matched ingredient', () => {
    const matches = [
      makeMatch('base.md', 'Base rules'),
      makeMatch('child.md', 'Child rules', { extends: 'base.md' }),
    ];
    const result = compile(matches);
    const section = result.project.engineeringSection;

    // base content appears once (inside the child block), not twice
    const baseCommentCount = (section.match(/source: test\/base\.md/g) ?? []).length;
    assert.equal(baseCommentCount, 0, 'base should not appear as its own standalone block');
    // base content should still be present (prepended into child's block)
    assert.ok(section.includes('Base rules'), 'base content should still be in output');
  });

  it('throws on circular extends (A extends B extends A)', () => {
    const matches = [
      makeMatch('a.md', 'A rules', { extends: 'b.md' }),
      makeMatch('b.md', 'B rules', { extends: 'a.md' }),
    ];
    assert.throws(() => compile(matches), /circular/i);
  });

  it('handles missing base gracefully — child still compiles', () => {
    const matches = [
      makeMatch('child.md', 'Child rules', { extends: 'nonexistent.md' }),
    ];
    const result = compile(matches);
    assert.ok(result.project.engineeringSection.includes('Child rules'));
  });

  it('does not duplicate base content when base is used only once', () => {
    const matches = [
      makeMatch('base.md', 'Base rules'),
      makeMatch('child.md', 'Child rules', { extends: 'base.md' }),
    ];
    const result = compile(matches);
    const occurrences = (result.project.engineeringSection.match(/Base rules/g) ?? []).length;
    assert.equal(occurrences, 1, 'base content should appear exactly once');
  });

  it('throws when base also has extends (multi-level extends not supported)', () => {
    const matches = [
      makeMatch('grandparent.md', 'Grandparent rules'),
      makeMatch('parent.md', 'Parent rules', { extends: 'grandparent.md' }),
      makeMatch('child.md', 'Child rules', { extends: 'parent.md' }),
    ];
    assert.throws(() => compile(matches), /multi-level|chain|only one level/i);
  });
});
