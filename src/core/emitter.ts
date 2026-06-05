import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileExists, readText, ensureDir as ensureDirExists } from '../utils/fs.js';
import type {
  CompileResult,
  CompiledOutput,
  DetectedStack,
  EmitResult,
  Target,
  TargetId,
} from '../types.js';
import { INGRED_SENTINEL } from '../types.js';
import { claude } from '../targets/claude.js';
import { cursor } from '../targets/cursor.js';
import { copilot } from '../targets/copilot.js';
import { agents } from '../targets/agents.js';
import { gemini } from '../targets/gemini.js';

const TARGET_REGISTRY: Map<TargetId, Target> = new Map([
  ['claude', claude],
  ['cursor', cursor],
  ['copilot', copilot],
  ['agents', agents],
  ['gemini', gemini],
]);

function hasContent(compiled: CompiledOutput): boolean {
  return compiled.personaSection.length > 0 || compiled.engineeringSection.length > 0;
}

function mergeOutputs(a: CompiledOutput, b: CompiledOutput): CompiledOutput {
  return {
    personaSection: [a.personaSection, b.personaSection].filter(Boolean).join('\n\n'),
    engineeringSection: [a.engineeringSection, b.engineeringSection].filter(Boolean).join('\n\n'),
  };
}

async function writeTarget(
  target: Target,
  compiled: CompiledOutput,
  stack: DetectedStack,
  outputPath: string,
  force: boolean,
  location: 'project' | 'global',
): Promise<EmitResult> {
  if (target.ensureDir && location === 'project') {
    await ensureDirExists(join(stack.workspaceRoot, target.ensureDir));
  }
  if (target.globalEnsureDir && location === 'global') {
    await ensureDirExists(target.globalEnsureDir);
  }

  if (await fileExists(outputPath)) {
    const existing = await readText(outputPath);
    if (!existing.trimStart().startsWith(INGRED_SENTINEL)) {
      if (!force) {
        return {
          target: target.id,
          location,
          status: 'skipped',
          path: outputPath,
          reason: 'existing manual file detected',
        };
      }
    }
  }

  const formatted = target.format(compiled, stack);
  await writeFile(outputPath, formatted, 'utf-8');
  return { target: target.id, location, status: 'written', path: outputPath };
}

export async function emit(
  result: CompileResult,
  stack: DetectedStack,
  targets: TargetId[],
  force: boolean,
): Promise<EmitResult[]> {
  const results: EmitResult[] = [];

  for (const targetId of targets) {
    const target = TARGET_REGISTRY.get(targetId);
    if (!target) continue;

    if (target.globalOutputPath && hasContent(result.global)) {
      const globalResult = await writeTarget(
        target,
        result.global,
        stack,
        target.globalOutputPath,
        force,
        'global',
      );
      results.push(globalResult);
    }

    const projectCompiled = target.globalOutputPath
      ? result.project
      : mergeOutputs(result.global, result.project);

    if (hasContent(projectCompiled)) {
      const projectPath = join(stack.workspaceRoot, target.outputPath);
      const projectResult = await writeTarget(
        target,
        projectCompiled,
        stack,
        projectPath,
        force,
        'project',
      );
      results.push(projectResult);
    }
  }

  return results;
}
