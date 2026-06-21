/**
 * Parsers for monorepo workspace definition files.
 */

/**
 * Parse pnpm-workspace.yaml and extract the packages array.
 * Input: "packages:\n  - 'packages/*'\n  - 'apps/*'"
 * Output: ['packages/*', 'apps/*']
 */
export function parsePnpmWorkspace(content: string): string[] {
  const results: string[] = [];
  const lines = content.split('\n');
  let inPackages = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === 'packages:') {
      inPackages = true;
      continue;
    }

    // Any non-empty top-level key (no leading spaces) ends the packages block
    if (inPackages && line.length > 0 && !line.startsWith(' ') && !line.startsWith('\t') && !trimmed.startsWith('-')) {
      inPackages = false;
      continue;
    }

    if (!inPackages) continue;
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // List items: `  - 'packages/*'` or `  - packages/*`
    const match = trimmed.match(/^-\s+['"]?([^'"]+?)['"]?\s*$/);
    if (match) {
      results.push(match[1]);
    }
  }

  return results;
}

/**
 * Parse lerna.json and extract the packages array.
 * Input: '{"packages": ["packages/*", "libs/*"]}'
 * Output: ['packages/*', 'libs/*']
 * Returns [] for malformed JSON or missing packages key.
 */
export function parseLernaJson(content: string): string[] {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed.packages)) {
      return parsed.packages.filter((p: unknown): p is string => typeof p === 'string');
    }
    return [];
  } catch {
    return [];
  }
}
