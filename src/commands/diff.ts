import { join } from 'node:path';
import { runPipeline } from '../core/pipeline.js';
import { getTargetRegistry } from '../core/emitter.js';
import { fileExists, readText } from '../utils/fs.js';
import { log } from '../utils/logger.js';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';

const noColor = process.env['NO_COLOR'] !== undefined;

function colorLine(prefix: string, line: string): string {
  if (noColor) return prefix + line;
  if (prefix === '+') return `${GREEN}${prefix}${line}${RESET}`;
  if (prefix === '-') return `${RED}${prefix}${line}${RESET}`;
  return `${DIM} ${line}${RESET}`;
}

export function computeDiff(current: string, next: string): string | null {
  if (current === next) return null;

  const currentLines = current === '' ? [] : current.split('\n');
  const nextLines = next.split('\n');

  // Simple LCS-based diff
  const m = currentLines.length;
  const n = nextLines.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (currentLines[i - 1] === nextLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff output
  const outputLines: string[] = [];
  let i = m;
  let j = n;

  const pending: string[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && currentLines[i - 1] === nextLines[j - 1]) {
      pending.push(' ' + currentLines[i - 1]);
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      pending.push('+' + nextLines[j - 1]);
      j--;
    } else {
      pending.push('-' + currentLines[i - 1]);
      i--;
    }
  }

  for (const entry of pending.reverse()) {
    outputLines.push(entry);
  }

  return outputLines.join('\n');
}

export async function diffCommand(opts: { targets?: string }): Promise<void> {
  const { compiled, stack, targetIds } = await runPipeline({
    targets: opts.targets,
    quiet: true,
    skipSync: true,
  });

  const registry = getTargetRegistry();

  let anyChanges = false;

  for (const targetId of targetIds) {
    const target = registry.get(targetId);
    if (!target) continue;

    const wouldBeOutput = target.format(compiled.project, stack);
    const outputPath = join(stack.workspaceRoot, target.outputPath);
    const currentContent = (await fileExists(outputPath)) ? await readText(outputPath) : '';

    const diff = computeDiff(currentContent, wouldBeOutput);

    if (diff === null) {
      log.hint(`  ${targetId}: up to date`);
      continue;
    }

    anyChanges = true;
    log.header(`\n  ${targetId} (${target.outputPath})`);
    log.info('');

    for (const rawLine of diff.split('\n')) {
      const prefix = rawLine[0] as '+' | '-' | ' ';
      const content = rawLine.slice(1);
      if (prefix === '+') {
        log.info(colorLine('+', content));
      } else if (prefix === '-') {
        log.info(colorLine('-', content));
      } else {
        log.info(colorLine(' ', content));
      }
    }
  }

  if (!anyChanges) {
    log.info('');
    log.success('All targets are up to date');
  }
}
