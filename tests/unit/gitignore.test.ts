import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitignore, addToGitignore } from '../../src/utils/gitignore.js';

describe('parseGitignore', () => {
  it('extracts non-comment, non-empty lines', () => {
    const content = '# comment\nnode_modules\n\n.env\n# another comment\ndist\n';
    const result = parseGitignore(content);
    assert.deepStrictEqual(result, ['node_modules', '.env', 'dist']);
  });

  it('returns empty array for empty content', () => {
    assert.deepStrictEqual(parseGitignore(''), []);
  });

  it('returns empty array for comment-only content', () => {
    assert.deepStrictEqual(parseGitignore('# only comments\n# more comments\n'), []);
  });

  it('trims whitespace from lines', () => {
    const result = parseGitignore('  node_modules  \n  .env  \n');
    assert.deepStrictEqual(result, ['node_modules', '.env']);
  });

  it('excludes negation patterns (lines starting with !)', () => {
    const content = 'node_modules\n!important.md\n.env\n';
    const result = parseGitignore(content);
    assert.deepStrictEqual(result, ['node_modules', '.env']);
  });

  it('handles CRLF line endings', () => {
    const content = '# comment\r\nnode_modules\r\n.env\r\n';
    const result = parseGitignore(content);
    assert.deepStrictEqual(result, ['node_modules', '.env']);
  });
});

describe('addToGitignore', () => {
  it('appends missing entries under ingred section', () => {
    const existing = 'node_modules\n.env\n';
    const result = addToGitignore(existing, ['CLAUDE.md', '.cursorrules']);
    assert.ok(result.includes('# ingred (generated)'));
    assert.ok(result.includes('CLAUDE.md'));
    assert.ok(result.includes('.cursorrules'));
    assert.ok(result.indexOf('# ingred (generated)') < result.indexOf('CLAUDE.md'));
  });

  it('does not duplicate existing entries', () => {
    const existing = 'node_modules\nCLAUDE.md\n';
    const result = addToGitignore(existing, ['CLAUDE.md', '.cursorrules']);
    const claudeCount = (result.match(/CLAUDE\.md/g) ?? []).length;
    assert.equal(claudeCount, 1);
    assert.ok(result.includes('.cursorrules'));
  });

  it('is idempotent — adding same paths twice returns same content', () => {
    const existing = 'node_modules\n';
    const first = addToGitignore(existing, ['CLAUDE.md']);
    const second = addToGitignore(first, ['CLAUDE.md']);
    assert.equal(first, second);
  });

  it('returns existing content unchanged when all paths already present', () => {
    const existing = 'node_modules\nCLAUDE.md\n';
    const result = addToGitignore(existing, ['node_modules', 'CLAUDE.md']);
    assert.equal(result, existing);
  });

  it('handles empty existing content without leading blank line', () => {
    const result = addToGitignore('', ['CLAUDE.md']);
    assert.ok(result.startsWith('# ingred (generated)'), 'should not have a leading blank line');
    assert.ok(result.includes('CLAUDE.md'));
  });

  it('does not add ingred section header twice when called with more paths', () => {
    const existing = 'node_modules\n';
    const first = addToGitignore(existing, ['CLAUDE.md']);
    const second = addToGitignore(first, ['.cursorrules']);
    const sectionCount = (second.match(/# ingred \(generated\)/g) ?? []).length;
    assert.equal(sectionCount, 1);
  });

  it('inserts new paths within the ingred section, not at EOF', () => {
    const existing = 'node_modules\n\n# ingred (generated)\nCLAUDE.md\n\n# user section\nmy-stuff\n';
    const result = addToGitignore(existing, ['.cursorrules']);
    const sectionIdx = result.indexOf('# ingred (generated)');
    const userIdx = result.indexOf('# user section');
    const cursorIdx = result.indexOf('.cursorrules');
    assert.ok(cursorIdx > sectionIdx, '.cursorrules should be after ingred section header');
    assert.ok(cursorIdx < userIdx, '.cursorrules should be before user section');
  });

  it('preserves CRLF line endings when present', () => {
    const existing = 'node_modules\r\n.env\r\n';
    const result = addToGitignore(existing, ['CLAUDE.md']);
    assert.ok(result.includes('\r\n'));
    assert.ok(result.includes('CLAUDE.md'));
  });

  it('does not treat negation patterns as existing entries for dedup', () => {
    const existing = '!CLAUDE.md\nnode_modules\n';
    const result = addToGitignore(existing, ['CLAUDE.md']);
    const lines = result.split('\n');
    const nonNegatedOccurrences = lines.filter(l => l.trim() === 'CLAUDE.md');
    assert.equal(nonNegatedOccurrences.length, 1, 'should have exactly one non-negated CLAUDE.md line');
    assert.ok(result.includes('!CLAUDE.md'), 'should preserve the original negation line');
  });
});
