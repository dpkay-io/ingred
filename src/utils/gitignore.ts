const INGRED_SECTION = '# ingred (generated)';

export function parseGitignore(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('!'));
}

export function addToGitignore(existing: string, paths: string[]): string {
  const currentEntries = new Set(parseGitignore(existing));
  const toAdd = paths.filter(p => !currentEntries.has(p));
  if (toAdd.length === 0) return existing;

  const lineEnding = existing.includes('\r\n') ? '\r\n' : '\n';
  const lines = existing.split(/\r?\n/);

  const sectionLineIdx = lines.findIndex(l => l.trim() === INGRED_SECTION);
  if (sectionLineIdx !== -1) {
    let insertAt = sectionLineIdx + 1;
    while (insertAt < lines.length) {
      const trimmed = lines[insertAt].trim();
      if (trimmed && !trimmed.startsWith('#')) {
        insertAt++;
      } else {
        break;
      }
    }
    lines.splice(insertAt, 0, ...toAdd);
    return lines.join(lineEnding);
  }

  let result = existing.trimEnd();
  if (result) {
    result += lineEnding + lineEnding + INGRED_SECTION + lineEnding;
  } else {
    result = INGRED_SECTION + lineEnding;
  }
  result += toAdd.join(lineEnding) + lineEnding;
  return result;
}
