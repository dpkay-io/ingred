import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../../src/parsers/frontmatter.js';

describe('parseFrontmatter', () => {
  it('returns default meta for files without frontmatter', () => {
    const { meta, content } = parseFrontmatter('# Hello\n\nSome content');
    assert.deepStrictEqual(meta.triggers, []);
    assert.equal(meta.scope, 'engineering');
    assert.equal(meta.priority, 0);
    assert.equal(meta.always, false);
    assert.equal(content, '# Hello\n\nSome content');
  });

  it('parses inline triggers array', () => {
    const raw = '---\ntriggers: ["react", "typescript"]\n---\nContent here';
    const { meta, content } = parseFrontmatter(raw);
    assert.deepStrictEqual(meta.triggers, ['react', 'typescript']);
    assert.equal(content, 'Content here');
  });

  it('parses block-style triggers array', () => {
    const raw = '---\ntriggers:\n  - react\n  - next.js\n---\nContent';
    const { meta } = parseFrontmatter(raw);
    assert.deepStrictEqual(meta.triggers, ['react', 'next.js']);
  });

  it('parses scope, priority, and always', () => {
    const raw = '---\nscope: persona\npriority: 10\nalways: true\n---\nBody';
    const { meta } = parseFrontmatter(raw);
    assert.equal(meta.scope, 'persona');
    assert.equal(meta.priority, 10);
    assert.equal(meta.always, true);
  });

  it('handles missing closing fence gracefully', () => {
    const raw = '---\ntriggers: ["react"]\nNo closing fence';
    const { meta, content } = parseFrontmatter(raw);
    assert.deepStrictEqual(meta.triggers, []);
    assert.equal(content, raw);
  });

  it('handles single trigger on one line', () => {
    const raw = '---\ntriggers: react\n---\nContent';
    const { meta } = parseFrontmatter(raw);
    assert.deepStrictEqual(meta.triggers, ['react']);
  });

  it('strips quotes from values', () => {
    const raw = '---\ntriggers: ["react", \'vue\']\nscope: "engineering"\n---\nContent';
    const { meta } = parseFrontmatter(raw);
    assert.deepStrictEqual(meta.triggers, ['react', 'vue']);
    assert.equal(meta.scope, 'engineering');
  });
});
