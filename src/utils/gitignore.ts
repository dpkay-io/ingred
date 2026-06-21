const INGRED_SECTION = '# ingred (generated)';

export function parseGitignore(content: string): string[] {
  return content.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
}

export function addToGitignore(existing: string, paths: string[]): string {
  const currentEntries = new Set(parseGitignore(existing));
  const toAdd = paths.filter(p => !currentEntries.has(p));
  if (toAdd.length === 0) return existing;

  let result = existing.trimEnd();
  if (result && !result.endsWith('\n')) result += '\n';
  if (!existing.includes(INGRED_SECTION)) {
    result += '\n' + INGRED_SECTION + '\n';
  }
  result += toAdd.join('\n') + '\n';
  return result;
}
