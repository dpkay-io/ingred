import { join, relative } from 'node:path';
import { readdir } from 'node:fs/promises';
import { fileExists, readText } from '../utils/fs.js';
import { log } from '../utils/logger.js';
import type { DetectedStack } from '../types.js';
import {
  parsePackageJson,
  parsePackageJsonWorkspaces,
  parseCargoToml,
  parseGoMod,
  parsePyprojectToml,
  parseRequirementsTxt,
  parseGemfile,
  parsePubspecYaml,
  parseComposerJson,
  parsePomXml,
  parseBuildGradle,
  parseCsproj,
  parseFsproj,
  parseBuildSbt,
  parseMixExs,
  parseCabal,
  parseDepsEdn,
} from '../parsers/manifest.js';
import { parsePnpmWorkspace, parseLernaJson } from '../parsers/workspace.js';

// ---------------------------------------------------------------------------
// Alias normalization table
// ---------------------------------------------------------------------------

const ALIASES: Record<string, string[]> = {
  'next': ['nextjs', 'next.js'],
  'react-dom': ['react'],
  'vue': ['vuejs', 'vue.js'],
  '@angular/core': ['angular'],
  'svelte': ['sveltejs'],
  'tailwindcss': ['tailwind'],
  'express': ['expressjs'],
  'nuxt': ['nuxtjs', 'nuxt.js'],
  'fastify': ['fastifyjs'],
  'nestjs': ['nest'],
  '@nestjs/core': ['nestjs', 'nest'],
  'gatsby': ['gatsbyjs'],
  'remix': ['remixjs'],
  'astro': ['astrojs'],
  'vite': ['vitejs'],
  'webpack': ['webpackjs'],
  'rollup': ['rollupjs'],
  'esbuild': ['esbuildjs'],
  'prisma': ['prismajs'],
  'drizzle-orm': ['drizzle'],
  'typeorm': ['typeormjs'],
  'mongoose': ['mongoosejs'],
  'sequelize': ['sequelizejs'],
  'jest': ['jestjs'],
  'vitest': ['vitestjs'],
  'mocha': ['mochajs'],
  'storybook': ['storybookjs'],
  '@storybook/react': ['storybook', 'storybookjs'],
  'django': ['djangoframework'],
  'flask': ['flaskframework'],
  'fastapi': ['fastapiframework'],
  'spring-boot': ['springboot', 'spring'],
  'spring-boot-starter-web': ['springboot', 'spring', 'spring-web'],
  'actix-web': ['actix'],
  'rocket': ['rocketrs'],
  'gin': ['gin-gonic'],
  'fiber': ['gofiber'],
  'echo': ['labstack-echo'],
  'laravel': ['laravelphp'],
  'symfony': ['symfonyphp'],
  'react-native': ['reactnative', 'rn'],
  'electron': ['electronjs'],
  'tauri': ['taurirs'],
  'three': ['threejs', 'three.js'],
  'd3': ['d3js', 'd3.js'],
  'chart.js': ['chartjs'],
  'socket.io': ['socketio'],
  'redux': ['reduxjs'],
  '@reduxjs/toolkit': ['redux', 'reduxjs', 'rtk'],
  'zustand': ['zustandjs'],
  'mobx': ['mobxjs'],
  'pinia': ['piniajs'],
  'styled-components': ['styledcomponents'],
  'emotion': ['emotionjs'],
  '@emotion/react': ['emotion', 'emotionjs'],
};

// ---------------------------------------------------------------------------
// Detection registry
// ---------------------------------------------------------------------------

type ParserFn = (content: string) => string[];

interface DetectionEntry {
  parser: ParserFn | null; // null = existence-only check
  existenceTokens?: string[];
}

const DETECTION_REGISTRY: Record<string, DetectionEntry> = {
  'package.json': { parser: parsePackageJson },
  'tsconfig.json': { parser: null, existenceTokens: ['typescript', 'node'] },
  'Cargo.toml': { parser: parseCargoToml },
  'go.mod': { parser: parseGoMod },
  'pyproject.toml': { parser: parsePyprojectToml },
  'requirements.txt': { parser: parseRequirementsTxt },
  'Gemfile': { parser: parseGemfile },
  'pubspec.yaml': { parser: parsePubspecYaml },
  'composer.json': { parser: parseComposerJson },
  'pom.xml': { parser: parsePomXml },
  'build.gradle': {
    parser: (content: string) => parseBuildGradle(content, false),
  },
  'build.gradle.kts': {
    parser: (content: string) => parseBuildGradle(content, true),
  },
  'Package.swift': { parser: null, existenceTokens: ['swift', 'ios'] },
  'Dockerfile': { parser: null, existenceTokens: ['docker'] },
  'docker-compose.yml': { parser: null, existenceTokens: ['docker'] },
  'docker-compose.yaml': { parser: null, existenceTokens: ['docker'] },
  'build.sbt': { parser: parseBuildSbt },
  'mix.exs': { parser: parseMixExs },
  'deps.edn': { parser: parseDepsEdn },
  'global.json': { parser: null, existenceTokens: ['dotnet'] },
};

// ---------------------------------------------------------------------------
// Glob-based detection entries (for files matched by extension, not exact name)
// ---------------------------------------------------------------------------

type GlobEntry = {
  extension: string;
  parser: (content: string) => string[];
};

const GLOB_DETECTION_ENTRIES: GlobEntry[] = [
  { extension: '.csproj', parser: parseCsproj },
  { extension: '.fsproj', parser: parseFsproj },
  { extension: '.cabal', parser: parseCabal },
];

// ---------------------------------------------------------------------------
// Main detection function
// ---------------------------------------------------------------------------

export async function detectStack(workspaceRoot: string): Promise<DetectedStack> {
  const technologies = new Set<string>();
  const detectedFiles = new Map<string, string[]>();

  for (const [filename, entry] of Object.entries(DETECTION_REGISTRY)) {
    const filePath = join(workspaceRoot, filename);

    if (!(await fileExists(filePath))) continue;

    let tokens: string[];

    if (entry.parser === null) {
      // Existence-only detection
      tokens = entry.existenceTokens ?? [];
    } else {
      try {
        const content = await readText(filePath);
        tokens = entry.parser(content);
      } catch (err) {
        log.warn(`Failed to parse ${filename}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
    }

    // Extra: if package.json found and tsconfig.json exists, add typescript
    if (filename === 'package.json') {
      const tsconfigPath = join(workspaceRoot, 'tsconfig.json');
      if (await fileExists(tsconfigPath)) {
        tokens.push('typescript');
      }
    }

    detectedFiles.set(filename, tokens);
    for (const token of tokens) {
      technologies.add(token);
    }
  }

  // Glob-based detection: scan root for files matching known extensions
  try {
    const rootEntries = await readdir(workspaceRoot, { withFileTypes: true });
    for (const entry of rootEntries) {
      if (!entry.isFile()) continue;
      for (const globEntry of GLOB_DETECTION_ENTRIES) {
        if (entry.name.endsWith(globEntry.extension)) {
          try {
            const content = await readText(join(workspaceRoot, entry.name));
            const tokens = globEntry.parser(content);
            detectedFiles.set(entry.name, tokens);
            for (const token of tokens) technologies.add(token);
          } catch (err) {
            log.warn(`Failed to parse ${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
          }
          break;
        }
      }
    }
  } catch {
    // readdir failure is non-fatal
  }

  // Monorepo workspace detection: scan sub-packages and merge their tokens
  const workspaceGlobs = await resolveWorkspaceGlobs(workspaceRoot);
  if (workspaceGlobs.length > 0) {
    const subPackageDirs = await resolveGlobDirs(workspaceRoot, workspaceGlobs);
    for (const subDir of subPackageDirs) {
      const relBase = relative(workspaceRoot, subDir).replace(/\\/g, '/');
      for (const [filename, entry] of Object.entries(DETECTION_REGISTRY)) {
        const filePath = join(subDir, filename);
        if (!(await fileExists(filePath))) continue;

        let tokens: string[];
        if (entry.parser === null) {
          tokens = entry.existenceTokens ?? [];
        } else {
          try {
            const content = await readText(filePath);
            tokens = entry.parser(content);
          } catch (err) {
            log.warn(`Failed to parse ${relBase}/${filename}: ${err instanceof Error ? err.message : String(err)}`);
            continue;
          }
        }

        const key = `workspace:${relBase}/${filename}`;
        detectedFiles.set(key, tokens);
        for (const token of tokens) technologies.add(token);
      }

      // Glob-based entries for sub-packages
      try {
        const subEntries = await readdir(subDir, { withFileTypes: true });
        for (const subEntry of subEntries) {
          if (!subEntry.isFile()) continue;
          for (const globEntry of GLOB_DETECTION_ENTRIES) {
            if (subEntry.name.endsWith(globEntry.extension)) {
              try {
                const content = await readText(join(subDir, subEntry.name));
                const tokens = globEntry.parser(content);
                const key = `workspace:${relBase}/${subEntry.name}`;
                detectedFiles.set(key, tokens);
                for (const token of tokens) technologies.add(token);
              } catch (err) {
                log.warn(
                  `Failed to parse ${relBase}/${subEntry.name}: ${err instanceof Error ? err.message : String(err)}`,
                );
              }
              break;
            }
          }
        }
      } catch {
        // readdir failure for sub-package is non-fatal
      }
    }
  }

  // Apply alias normalization
  applyAliases(technologies);

  return { technologies, detectedFiles, workspaceRoot };
}

// ---------------------------------------------------------------------------
// Monorepo workspace helpers
// ---------------------------------------------------------------------------

/**
 * Resolve workspace glob patterns from package.json (workspaces field),
 * pnpm-workspace.yaml, and lerna.json at the given root.
 */
async function resolveWorkspaceGlobs(root: string): Promise<string[]> {
  const globs: string[] = [];

  // package.json workspaces
  const pkgPath = join(root, 'package.json');
  if (await fileExists(pkgPath)) {
    try {
      const content = await readText(pkgPath);
      globs.push(...parsePackageJsonWorkspaces(content));
    } catch {
      // non-fatal
    }
  }

  // pnpm-workspace.yaml
  const pnpmPath = join(root, 'pnpm-workspace.yaml');
  if (await fileExists(pnpmPath)) {
    try {
      const content = await readText(pnpmPath);
      globs.push(...parsePnpmWorkspace(content));
    } catch {
      // non-fatal
    }
  }

  // lerna.json
  const lernaPath = join(root, 'lerna.json');
  if (await fileExists(lernaPath)) {
    try {
      const content = await readText(lernaPath);
      globs.push(...parseLernaJson(content));
    } catch {
      // non-fatal
    }
  }

  return [...new Set(globs)];
}

/**
 * Resolve glob patterns like `packages/*` to actual sub-directories.
 * Supports single-level wildcard (`*`) at the end only.
 * Exact paths (no wildcard) are included if they exist and are directories.
 */
async function resolveGlobDirs(root: string, globs: string[]): Promise<string[]> {
  const dirs: string[] = [];

  for (const pattern of globs) {
    const wildcardIndex = pattern.indexOf('*');
    if (wildcardIndex === -1) {
      // Exact path — include if it exists as a directory
      const fullPath = join(root, pattern);
      try {
        const entries = await readdir(fullPath, { withFileTypes: true });
        // Existence confirmed — it's a directory
        void entries;
        dirs.push(fullPath);
      } catch {
        // Directory doesn't exist or not readable — skip
      }
      continue;
    }

    // Pattern with wildcard — resolve the parent directory, then list entries
    const parentGlob = pattern.slice(0, wildcardIndex).replace(/\/$/, '');
    const suffix = pattern.slice(wildcardIndex + 1).replace(/^\//, '');
    const parentDir = join(root, parentGlob);

    try {
      const entries = await readdir(parentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.')) continue;
        // If there's a suffix after the wildcard, it must match the end of the name
        if (suffix && !entry.name.endsWith(suffix)) continue;
        dirs.push(join(parentDir, entry.name));
      }
    } catch {
      // Parent directory doesn't exist or not readable — skip
    }
  }

  return dirs;
}

// ---------------------------------------------------------------------------
// Alias expansion
// ---------------------------------------------------------------------------

function applyAliases(technologies: Set<string>): void {
  // Snapshot the current set to avoid infinite iteration
  const current = [...technologies];
  for (const token of current) {
    const aliases = ALIASES[token];
    if (aliases) {
      for (const alias of aliases) {
        technologies.add(alias);
      }
    }
  }
}
