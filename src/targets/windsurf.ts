import type { Target, CompiledOutput, DetectedStack } from '../types.js';
import { INGRED_SENTINEL } from '../types.js';

export const windsurf: Target = {
  id: 'windsurf',
  outputPath: '.windsurfrules',
  format(compiled: CompiledOutput, _stack: DetectedStack): string {
    const hasPersona = !!compiled.personaSection;
    const hasEngineering = !!compiled.engineeringSection;
    const parts: string[] = [INGRED_SENTINEL];

    if (hasPersona && hasEngineering) {
      parts.push('', '## Interaction Style', '', compiled.personaSection);
      parts.push('', '## Coding Standards', '', compiled.engineeringSection);
    } else if (hasPersona) {
      parts.push('', compiled.personaSection);
    } else if (hasEngineering) {
      parts.push('', compiled.engineeringSection);
    }

    return parts.join('\n') + '\n';
  },
  privateReference(compiledDir: string): string {
    return `<!-- Read and follow: ${compiledDir}/private-windsurf.md -->`;
  },
};
