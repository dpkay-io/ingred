import type { Target, CompiledOutput, DetectedStack } from '../types.js';
import { INGRED_SENTINEL } from '../types.js';

export const agents: Target = {
  id: 'agents',
  outputPath: 'AGENTS.md',
  format(compiled: CompiledOutput, _stack: DetectedStack): string {
    const parts: string[] = [INGRED_SENTINEL, '', '# Agent Instructions'];

    if (compiled.personaSection) {
      parts.push('', '## Interaction Guidelines', '', compiled.personaSection);
    }

    if (compiled.engineeringSection) {
      parts.push('', '## Engineering Standards', '', compiled.engineeringSection);
    }

    return parts.join('\n') + '\n';
  },
  privateReference(compiledDir: string): string {
    return `<!-- Read and follow: ${compiledDir}/private-agents.md -->`;
  },
};
