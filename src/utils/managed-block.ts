export const GLOBAL_BLOCK_START = '<!-- ingred:global:start -->';
export const GLOBAL_BLOCK_END = '<!-- ingred:global:end -->';

/**
 * Insert or refresh the ingred-managed block inside a hand-written file.
 *
 * - Block already present: only the text between the markers is replaced.
 * - Block absent: it is appended after a blank line, leaving existing content untouched.
 * - Start marker without a matching end marker: returns null (refuse to guess).
 */
export function upsertManagedBlock(existing: string, body: string): string | null {
  const block = `${GLOBAL_BLOCK_START}\n${body}\n${GLOBAL_BLOCK_END}`;

  const startIndex = existing.indexOf(GLOBAL_BLOCK_START);
  if (startIndex !== -1) {
    const endIndex = existing.indexOf(GLOBAL_BLOCK_END, startIndex + GLOBAL_BLOCK_START.length);
    if (endIndex === -1) return null;
    return existing.slice(0, startIndex) + block + existing.slice(endIndex + GLOBAL_BLOCK_END.length);
  }

  const trimmed = existing.replace(/\s+$/, '');
  return trimmed.length > 0 ? `${trimmed}\n\n${block}\n` : `${block}\n`;
}
