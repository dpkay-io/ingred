import type { WorkspaceConfig } from '../types.js';

/**
 * Parse a `.ingred.yaml` workspace config file.
 *
 * Supported keys:
 *   profile: my-profile
 *   targets: [claude, cursor]
 *   exclude:
 *     - source/file.md
 *     - other/file.md
 */
export function parseWorkspaceConfig(content: string): WorkspaceConfig {
  const result: WorkspaceConfig = {};
  const lines = content.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = trimmed.slice(0, colonIdx).trim();
    const valueRaw = trimmed.slice(colonIdx + 1).trim();

    if (key === 'profile') {
      result.profile = stripQuotes(valueRaw);
      i++;
      continue;
    }

    if (key === 'targets') {
      if (valueRaw.startsWith('[')) {
        result.targets = parseInlineArray(valueRaw);
      } else if (valueRaw !== '') {
        result.targets = [stripQuotes(valueRaw)];
      } else {
        // Block array
        const items: string[] = [];
        i++;
        while (i < lines.length) {
          const innerLine = lines[i];
          const innerTrimmed = innerLine.trim();
          if (innerTrimmed === '' || innerTrimmed.startsWith('#')) {
            i++;
            continue;
          }
          if (!innerTrimmed.startsWith('- ')) break;
          items.push(stripQuotes(innerTrimmed.slice(2).trim()));
          i++;
        }
        result.targets = items;
        continue;
      }
      i++;
      continue;
    }

    if (key === 'exclude') {
      if (valueRaw.startsWith('[')) {
        result.exclude = parseInlineArray(valueRaw);
      } else if (valueRaw !== '') {
        result.exclude = [stripQuotes(valueRaw)];
      } else {
        // Block array
        const items: string[] = [];
        i++;
        while (i < lines.length) {
          const innerLine = lines[i];
          const innerTrimmed = innerLine.trim();
          if (innerTrimmed === '' || innerTrimmed.startsWith('#')) {
            i++;
            continue;
          }
          if (!innerTrimmed.startsWith('- ')) break;
          items.push(stripQuotes(innerTrimmed.slice(2).trim()));
          i++;
        }
        result.exclude = items;
        continue;
      }
      i++;
      continue;
    }

    i++;
  }

  return result;
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
