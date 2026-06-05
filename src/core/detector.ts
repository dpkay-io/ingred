import { join } from 'node:path';
import { fileExists, readText } from '../utils/fs.js';
import { log } from '../utils/logger.js';
import type { DetectedStack } from '../types.js';
import {
  parsePackageJson,
  parseCargoToml,
  parseGoMod,
  parsePyprojectToml,
  parseRequirementsTxt,
  parseGemfile,
  parsePubspecYaml,
  parseComposerJson,
  parsePomXml,
  parseBuildGradle,
} from '../parsers/manifest.js';

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
};

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

  // Apply alias normalization
  applyAliases(technologies);

  return { technologies, detectedFiles, workspaceRoot };
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
