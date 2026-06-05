import type { Target, CompiledOutput, DetectedStack } from '../types.js';
import { INGRED_SENTINEL } from '../types.js';

export const gemini: Target = {
  id: 'gemini',
  outputPath: 'GEMINI.md',
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
};
