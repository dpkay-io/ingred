import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeDiff } from '../../src/commands/diff.js';

describe('computeDiff', () => {
  it('returns null for identical content', () => {
    const content = 'line one\nline two\nline three';
    assert.equal(computeDiff(content, content), null);
  });

  it('returns null for two empty strings', () => {
    assert.equal(computeDiff('', ''), null);
  });

  it('shows additions with + prefix', () => {
    const current = 'line one\nline two';
    const next = 'line one\nline two\nline three';
    const diff = computeDiff(current, next);
    assert.ok(diff !== null);
    const lines = diff.split('\n');
    assert.ok(lines.some((l) => l === '+line three'));
  });

  it('shows removals with - prefix', () => {
    const current = 'line one\nline two\nline three';
    const next = 'line one\nline three';
    const diff = computeDiff(current, next);
    assert.ok(diff !== null);
    const lines = diff.split('\n');
    assert.ok(lines.some((l) => l === '-line two'));
  });

  it('shows unchanged lines with space prefix', () => {
    const current = 'alpha\nbeta';
    const next = 'alpha\ngamma';
    const diff = computeDiff(current, next);
    assert.ok(diff !== null);
    const lines = diff.split('\n');
    assert.ok(lines.some((l) => l === ' alpha'));
  });

  it('treats empty current as all additions', () => {
    const next = 'line one\nline two';
    const diff = computeDiff('', next);
    assert.ok(diff !== null);
    const lines = diff.split('\n');
    assert.ok(lines.every((l) => l.startsWith('+')));
    assert.ok(lines.some((l) => l === '+line one'));
    assert.ok(lines.some((l) => l === '+line two'));
  });
});
