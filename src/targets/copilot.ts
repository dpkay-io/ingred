import type { Target, CompiledOutput, DetectedStack } from '../types.js';
import { INGRED_SENTINEL } from '../types.js';

export const copilot: Target = {
  id: 'copilot',
  outputPath: '.github/copilot-instructions.md',
  ensureDir: '.github',
  format(compiled: CompiledOutput, _stack: DetectedStack): string {
    const parts: string[] = [INGRED_SENTINEL];

    if (compiled.personaSection) {
      parts.push('', '## Communication', '', compiled.personaSection);
    }

    if (compiled.engineeringSection) {
      parts.push('', '## Coding Standards', '', compiled.engineeringSection);
    }

    return parts.join('\n') + '\n';
  },
};
