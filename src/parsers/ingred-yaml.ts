import type { ExternalMapping } from '../types.js';

/**
 * Parse an `ingred.yaml` file into an array of external mappings.
 *
 * Expected structure:
 * ```yaml
 * mappings:
 *   - files: ["a.md", "b.md"]
 *     when:
 *       dependencies: ["react"]
 *       files_present: ["pubspec.yaml"]
 * ```
 *
 * Returns an empty array on any parse failure.
 */
export function parseIngredYaml(content: string): ExternalMapping[] {
  try {
    return doParse(content);
  } catch {
    return [];
  }
}

function doParse(content: string): ExternalMapping[] {
  const lines = content.split('\n');

  // Find the `mappings:` top-level key
  let startIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === 'mappings:' || trimmed === 'mappings: []') {
      if (trimmed === 'mappings: []') return [];
      startIndex = i + 1;
      break;
    }
  }

  if (startIndex === -1) return [];

  const mappings: ExternalMapping[] = [];
  let current: Partial<ExternalMapping> | null = null;
  let inWhen = false;
  let lastWhenKey: 'dependencies' | 'filesPresent' | null = null;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // If we hit a non-indented line (another top-level key), stop
    if (line.match(/^\S/) && !trimmed.startsWith('-')) break;

    // New mapping entry: `  - files: [...]`
    if (trimmed.startsWith('- files:')) {
      // Save the previous mapping if valid
      if (current && current.files) {
        mappings.push(finalize(current));
      }

      const filesValue = trimmed.slice('- files:'.length).trim();
      current = {
        files: parseInlineArray(filesValue),
        when: {},
      };
      inWhen = false;
      lastWhenKey = null;
      continue;
    }

    // `    files:` on its own line (block-style under a `- ` item)
    if (trimmed === 'files:' && current !== null) {
      current.files = [];
      inWhen = false;
      lastWhenKey = null;
      continue;
    }

    // Block array item for files (when current is set and we're not in `when:`)
    if (trimmed.startsWith('- ') && current !== null && !inWhen && current.files !== undefined) {
      const indent = line.length - line.trimStart().length;
      if (indent >= 4) {
        current.files!.push(stripQuotes(trimmed.slice(2).trim()));
        continue;
      }
    }

    // `    when:` block
    if (trimmed === 'when:') {
      inWhen = true;
      lastWhenKey = null;
      if (current && !current.when) {
        current.when = {};
      }
      continue;
    }

    // Inside `when:` block — parse dependencies and files_present
    if (inWhen && current) {
      if (trimmed.startsWith('dependencies:')) {
        const value = trimmed.slice('dependencies:'.length).trim();
        lastWhenKey = 'dependencies';
        if (value === '' || value === '[]') {
          current.when!.dependencies = [];
        } else {
          current.when!.dependencies = parseInlineArray(value);
        }
        continue;
      }

      if (trimmed.startsWith('files_present:')) {
        const value = trimmed.slice('files_present:'.length).trim();
        lastWhenKey = 'filesPresent';
        if (value === '' || value === '[]') {
          current.when!.filesPresent = [];
        } else {
          current.when!.filesPresent = parseInlineArray(value);
        }
        continue;
      }

      // Block array items — use tracked lastWhenKey
      if (trimmed.startsWith('- ') && lastWhenKey) {
        const arrayValue = stripQuotes(trimmed.slice(2).trim());
        if (lastWhenKey === 'dependencies') {
          if (!current.when!.dependencies) current.when!.dependencies = [];
          current.when!.dependencies.push(arrayValue);
        } else {
          if (!current.when!.filesPresent) current.when!.filesPresent = [];
          current.when!.filesPresent.push(arrayValue);
        }
        continue;
      }
    }
  }

  // Save the last mapping
  if (current && current.files) {
    mappings.push(finalize(current));
  }

  return mappings;
}

function finalize(partial: Partial<ExternalMapping>): ExternalMapping {
  return {
    files: partial.files ?? [],
    when: {
      dependencies: partial.when?.dependencies,
      filesPresent: partial.when?.filesPresent,
    },
  };
}

function parseInlineArray(raw: string): string[] {
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
