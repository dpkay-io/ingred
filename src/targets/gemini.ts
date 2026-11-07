import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Target, CompiledOutput, DetectedStack } from '../types.js';
import { INGRED_SENTINEL } from '../types.js';

export const gemini: Target = {
  id: 'gemini',
  outputPath: 'GEMINI.md',
  globalOutputPath: join(homedir(), '.gemini', 'GEMINI.md'),
  globalEnsureDir: join(homedir(), '.gemini'),
  format(compiled: CompiledOutput, _stack: DetectedStack): string {
    const parts: string[] = [INGRED_SENTINEL];

    if (compiled.personaSection) {
      parts.push('', '## Communication Style', '', compiled.personaSection);
    }

    if (compiled.engineeringSection) {
      parts.push('', '## Coding Conventions', '', compiled.engineeringSection);
    }

    return parts.join('\n') + '\n';
  },
  privateReference(compiledDir: string): string {
    return `<!-- Read and follow: ${compiledDir}/private-gemini.md -->`;
  },
};
