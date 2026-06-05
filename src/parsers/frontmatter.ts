import type { IngredientMeta, Scope } from '../types.js';
import { DEFAULT_META } from '../types.js';

/**
 * Parse YAML frontmatter from a markdown ingredient file.
 *
 * Supported value types: string, number, boolean, string arrays (inline or block).
 * Returns default meta + full content on any parse failure or missing frontmatter.
 */
export function parseFrontmatter(raw: string): {
  meta: IngredientMeta;
  content: string;
} {
  raw = raw.replace(/\r\n/g, '\n');

  if (!raw.startsWith('---')) {
    return { meta: { ...DEFAULT_META, triggers: [] }, content: raw };
  }

  // Find closing fence: `\n---` followed by optional whitespace then newline or end of string.
  let closingIndex = -1;
  let searchFrom = 3;
  while (searchFrom < raw.length) {
    const idx = raw.indexOf('\n---', searchFrom);
    if (idx === -1) break;
    let pos = idx + 4;
    while (pos < raw.length && (raw[pos] === ' ' || raw[pos] === '\t')) pos++;
    if (pos >= raw.length || raw[pos] === '\n') {
      closingIndex = idx;
      break;
    }
    searchFrom = pos;
  }

  if (closingIndex === -1) {
    return { meta: { ...DEFAULT_META, triggers: [] }, content: raw };
  }

  const yamlBlock = raw.slice(3, closingIndex).trim();
  let afterFence = closingIndex + 4;
  while (afterFence < raw.length && raw[afterFence] !== '\n') afterFence++;
  if (afterFence < raw.length && raw[afterFence] === '\n') afterFence++;
  const content = raw.slice(afterFence);

  try {
    const meta = parseYamlBlock(yamlBlock);
    return { meta, content };
  } catch {
    return { meta: { ...DEFAULT_META, triggers: [] }, content: raw };
  }
}

function parseYamlBlock(block: string): IngredientMeta {
  const meta: IngredientMeta = { ...DEFAULT_META, triggers: [] };
  const lines = block.split('\n');

  let currentKey: string | null = null;
  let collectingArray: string[] | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Check if this is a block-style array item (starts with `- `)
    if (trimmed.startsWith('- ') && collectingArray !== null) {
      const value = trimmed.slice(2).trim();
      collectingArray.push(stripQuotes(value));
      continue;
    }

    // If we were collecting a block array and hit a non-array-item line,
    // finalize the array
    if (collectingArray !== null && currentKey !== null) {
      assignArrayValue(meta, currentKey, collectingArray);
      collectingArray = null;
      currentKey = null;
    }

    // Must be a key: value line
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    const rawValue = trimmed.slice(colonIndex + 1).trim();

    // If value is empty, the next lines might be block-style array items
    if (rawValue === '') {
      currentKey = key;
      collectingArray = [];
      continue;
    }

    // Inline array: `[value1, value2]`
    if (rawValue.startsWith('[')) {
      const arrValues = parseInlineArray(rawValue);
      assignArrayValue(meta, key, arrValues);
      continue;
    }

    // Scalar value
    assignScalarValue(meta, key, rawValue);
  }

  // Finalize any trailing block array
  if (collectingArray !== null && currentKey !== null) {
    assignArrayValue(meta, currentKey, collectingArray);
  }

  return meta;
}

function parseInlineArray(raw: string): string[] {
  // Strip brackets
  let inner = raw.trim();
  if (inner.startsWith('[')) inner = inner.slice(1);
  if (inner.endsWith(']')) inner = inner.slice(0, -1);

  if (inner.trim() === '') return [];

  return inner.split(',').map((item) => stripQuotes(item.trim()));
}

function stripQuotes(s: string): string {
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function assignScalarValue(meta: IngredientMeta, key: string, rawValue: string): void {
  const value = stripQuotes(rawValue);

  switch (key) {
    case 'scope': {
      const lower = value.toLowerCase();
      if (lower === 'engineering' || lower === 'persona') {
        meta.scope = lower as Scope;
        meta.scopeExplicit = true;
      }
      break;
    }
    case 'priority': {
      const num = Number(value);
      if (!Number.isNaN(num)) {
        meta.priority = num;
      }
      break;
    }
    case 'always': {
      meta.always = value === 'true' || value === 'True' || value === 'TRUE';
      break;
    }
    case 'global': {
      meta.global = value === 'true' || value === 'True' || value === 'TRUE';
      break;
    }
    case 'triggers': {
      // Single string trigger on one line: `triggers: react`
      meta.triggers = [value];
      break;
    }
    default:
      break;
  }
}

function assignArrayValue(meta: IngredientMeta, key: string, values: string[]): void {
  if (key === 'triggers') {
    meta.triggers = values;
  }
  // Other array-valued keys could be handled here in the future
}
