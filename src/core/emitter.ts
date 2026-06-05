import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
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

export interface PrivateEmitOptions {
  privateCompiled: CompileResult | null;
  compiledDir: string;
  tildeCompiledDir: string;
}

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
  privateRef?: string,
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

  let formatted = target.format(compiled, stack);
  if (privateRef) {
    formatted = formatted.trimEnd() + '\n\n' + privateRef + '\n';
  }
  await writeFile(outputPath, formatted, 'utf-8');
  return { target: target.id, location, status: 'written', path: outputPath };
}

async function writePrivateTarget(
  target: Target,
  compiled: CompiledOutput,
  stack: DetectedStack,
  compiledDir: string,
): Promise<void> {
  await ensureDirExists(compiledDir);
  const formatted = target.format(compiled, stack);
  // Strip the sentinel comment from private files (they aren't user-facing)
  const stripped = formatted.replace(INGRED_SENTINEL + '\n', '').replace(INGRED_SENTINEL, '');
  await writeFile(join(compiledDir, `private-${target.id}.md`), stripped, 'utf-8');
}

async function cleanupStalePrivateFile(
  targetId: TargetId,
  compiledDir: string,
): Promise<void> {
  const filePath = join(compiledDir, `private-${targetId}.md`);
  if (await fileExists(filePath)) {
    await unlink(filePath);
  }
}

export async function emit(
  result: CompileResult,
  stack: DetectedStack,
  targets: TargetId[],
  force: boolean,
  privateOpts?: PrivateEmitOptions,
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

    // Determine private reference for this target
    let privateRef: string | undefined;
    if (privateOpts) {
      const privateProjectCompiled = privateOpts.privateCompiled
        ? mergeOutputs(privateOpts.privateCompiled.global, privateOpts.privateCompiled.project)
        : null;

      if (privateProjectCompiled && hasContent(privateProjectCompiled)) {
        await writePrivateTarget(target, privateProjectCompiled, stack, privateOpts.compiledDir);
        privateRef = target.privateReference(privateOpts.tildeCompiledDir);
      } else {
        // No private content — clean up stale file if privateOpts was provided
        await cleanupStalePrivateFile(targetId, privateOpts.compiledDir);
      }
    }

    if (hasContent(projectCompiled) || privateRef) {
      const projectPath = join(stack.workspaceRoot, target.outputPath);
      const projectResult = await writeTarget(
        target,
        projectCompiled,
        stack,
        projectPath,
        force,
        'project',
        privateRef,
      );
      results.push(projectResult);
    }
  }

  return results;
}
