import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTemplateVars } from '../../src/core/template.js';
import type { TemplateVars } from '../../src/core/template.js';

const VARS: TemplateVars = {
  stack: 'typescript, react',
  workspace: 'myproject',
  target: 'claude',
  date: '2026-06-21',
};

describe('resolveTemplateVars', () => {
  it('replaces a known variable', () => {
    const result = resolveTemplateVars('Stack: {{stack}}', VARS);
    assert.equal(result, 'Stack: typescript, react');
  });

  it('replaces all four known variables', () => {
    const text = '{{stack}} | {{workspace}} | {{target}} | {{date}}';
    const result = resolveTemplateVars(text, VARS);
    assert.equal(result, 'typescript, react | myproject | claude | 2026-06-21');
  });

  it('leaves unknown variables as-is', () => {
    const result = resolveTemplateVars('Hello {{unknown}}', VARS);
    assert.equal(result, 'Hello {{unknown}}');
  });

  it('handles escaped braces by stripping the leading backslash', () => {
    const result = resolveTemplateVars('literal \\{{stack}}', VARS);
    assert.equal(result, 'literal {{stack}}');
  });

  it('replaces multiple occurrences of the same variable', () => {
    const result = resolveTemplateVars('{{target}} and {{target}}', VARS);
    assert.equal(result, 'claude and claude');
  });

  it('returns the input unchanged when there are no braces', () => {
    const text = 'no template vars here';
    const result = resolveTemplateVars(text, VARS);
    assert.equal(result, text);
  });

  it('returns empty string for empty input', () => {
    const result = resolveTemplateVars('', VARS);
    assert.equal(result, '');
  });

  it('handles text with {{ but no closing braces', () => {
    const result = resolveTemplateVars('broken {{ template', VARS);
    assert.equal(result, 'broken {{ template');
  });
});
