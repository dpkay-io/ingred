import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Target, CompiledOutput, DetectedStack } from '../types.js';
import { INGRED_SENTINEL } from '../types.js';

export const claude: Target = {
  id: 'claude',
  outputPath: 'CLAUDE.md',
  globalOutputPath: join(homedir(), '.claude', 'CLAUDE.md'),
  globalEnsureDir: join(homedir(), '.claude'),
  format(compiled: CompiledOutput, _stack: DetectedStack): string {
    const parts: string[] = [INGRED_SENTINEL];

    if (compiled.personaSection) {
      parts.push('', '<system_persona>', '', compiled.personaSection, '', '</system_persona>');
    }

    if (compiled.engineeringSection) {
      parts.push('', '<engineering_rules>', '', compiled.engineeringSection, '', '</engineering_rules>');
    }

    return parts.join('\n') + '\n';
  },
  privateReference(compiledDir: string): string {
    return `@${compiledDir}/private-claude.md`;
  },
};
