/**
 * Config file parsers for stack detection.
 * Each parser takes file content as a string and returns an array of technology tokens.
 */

export function parsePackageJson(content: string): string[] {
  const tokens: string[] = ['node', 'javascript'];
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(content);
  } catch {
    return tokens;
  }

  const depGroups = ['dependencies', 'devDependencies', 'peerDependencies'] as const;
  for (const group of depGroups) {
    const deps = pkg[group];
    if (deps && typeof deps === 'object' && !Array.isArray(deps)) {
      for (const name of Object.keys(deps as Record<string, unknown>)) {
        tokens.push(name.toLowerCase());
      }
    }
  }

  return tokens;
}

export function parseCargoToml(content: string): string[] {
  const tokens: string[] = ['rust', 'cargo'];
  const lines = content.split('\n');
  let inDependencies = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Section headers
    if (trimmed.startsWith('[')) {
      inDependencies =
        trimmed === '[dependencies]' ||
        trimmed === '[dev-dependencies]' ||
        trimmed === '[build-dependencies]';
      continue;
    }

    if (!inDependencies) continue;
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Match crate name: `serde = "1.0"` or `tokio = { version = "1" }`
    const match = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=/);
    if (match) {
      tokens.push(match[1].toLowerCase());
    }
  }

  return tokens;
}

export function parseGoMod(content: string): string[] {
  const tokens: string[] = ['go', 'golang'];
  const lines = content.split('\n');
  let inRequire = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^require\s*\($/.test(trimmed)) {
      inRequire = true;
      continue;
    }
    if (trimmed === ')') {
      inRequire = false;
      continue;
    }

    // Single-line require: `require github.com/foo/bar v1.0.0`
    const singleMatch = trimmed.match(/^require\s+(\S+)/);
    if (singleMatch) {
      const segments = singleMatch[1].split('/');
      tokens.push(segments[segments.length - 1].toLowerCase());
      continue;
    }

    if (!inRequire) continue;
    if (trimmed === '' || trimmed.startsWith('//')) continue;

    // Inside require block: `github.com/foo/bar v1.0.0`
    const blockMatch = trimmed.match(/^(\S+)/);
    if (blockMatch) {
      const segments = blockMatch[1].split('/');
      tokens.push(segments[segments.length - 1].toLowerCase());
    }
  }

  return tokens;
}

export function parsePyprojectToml(content: string): string[] {
  const tokens: string[] = ['python'];
  const lines = content.split('\n');
  let inDepsSection = false;
  let inArrayDeps = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Section headers
    if (trimmed.startsWith('[')) {
      inDepsSection =
        trimmed === '[project]' ||
        trimmed === '[tool.poetry.dependencies]' ||
        trimmed === '[tool.poetry.dev-dependencies]' ||
        (trimmed.startsWith('[tool.poetry.group.') && trimmed.endsWith('.dependencies]'));
      inArrayDeps = false;
      continue;
    }

    if (!inDepsSection) continue;

    // Handle `dependencies = [` in [project] section
    if (trimmed.startsWith('dependencies') && trimmed.includes('[')) {
      inArrayDeps = true;
      // Check if there are deps on the same line
      const inline = trimmed.match(/\[(.+)\]/);
      if (inline) {
        extractPepDeps(inline[1], tokens);
        inArrayDeps = false;
      }
      continue;
    }

    if (inArrayDeps) {
      if (trimmed === ']') {
        inArrayDeps = false;
        continue;
      }
      // Lines like `"flask>=2.0"` or `'django'`
      const depMatch = trimmed.match(/["']([a-zA-Z0-9_][a-zA-Z0-9_.~-]*)/);
      if (depMatch) {
        tokens.push(depMatch[1].toLowerCase().replace(/[._]/g, '-'));
      }
      continue;
    }

    // [tool.poetry.dependencies] uses `name = "version"` format
    if (trimmed.includes('=') && !trimmed.startsWith('#')) {
      const keyMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=/);
      if (keyMatch) {
        const key = keyMatch[1].toLowerCase();
        if (key !== 'python' && key !== 'dependencies') {
          tokens.push(key);
        }
      }
    }
  }

  return tokens;
}

function extractPepDeps(inline: string, tokens: string[]): void {
  const parts = inline.split(',');
  for (const part of parts) {
    const match = part.trim().match(/["']([a-zA-Z0-9_][a-zA-Z0-9_.~-]*)/);
    if (match) {
      tokens.push(match[1].toLowerCase().replace(/[._]/g, '-'));
    }
  }
}

export function parseRequirementsTxt(content: string): string[] {
  const tokens: string[] = ['python'];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;

    // Strip version specifiers: >=, ==, ~=, !=, <=, >, <, ===, extras [...]
    // Also strip environment markers after ;
    const withoutMarkers = trimmed.split(';')[0].trim();
    const withoutExtras = withoutMarkers.replace(/\[.*?\]/, '');
    const match = withoutExtras.match(/^([a-zA-Z0-9_][a-zA-Z0-9_.-]*[a-zA-Z0-9]|[a-zA-Z0-9_])/);
    if (match) {
      tokens.push(match[1].toLowerCase().replace(/[._]/g, '-'));
    }
  }

  return tokens;
}

export function parseGemfile(content: string): string[] {
  const tokens: string[] = ['ruby'];
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^\s*gem\s+['"]([a-zA-Z0-9_-]+)['"]/);
    if (match) {
      tokens.push(match[1].toLowerCase());
    }
  }

  return tokens;
}

export function parsePubspecYaml(content: string): string[] {
  const tokens: string[] = ['dart'];
  const lines = content.split('\n');
  let inDependencies = false;
  let hasFlutter = false;

  for (const line of lines) {
    // Top-level keys have no indentation
    if (line.match(/^\S/) && line.includes(':')) {
      inDependencies = line.startsWith('dependencies:') || line.startsWith('dev_dependencies:');
      continue;
    }

    if (!inDependencies) continue;

    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // Dependency lines are indented: `  flutter:\n    sdk: flutter` or `  http: ^0.13.0`
    const depMatch = line.match(/^ {2}([a-zA-Z0-9_]+)\s*:/);
    if (depMatch) {
      const name = depMatch[1].toLowerCase();
      tokens.push(name);
      if (name === 'flutter') {
        hasFlutter = true;
      }
    }
  }

  if (!hasFlutter && content.includes('sdk: flutter')) {
    tokens.push('flutter');
  }

  return tokens;
}

export function parseComposerJson(content: string): string[] {
  const tokens: string[] = ['php'];
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(content);
  } catch {
    return tokens;
  }

  const depGroups = ['require', 'require-dev'] as const;

  for (const group of depGroups) {
    const deps = pkg[group];
    if (deps && typeof deps === 'object' && !Array.isArray(deps)) {
      for (const name of Object.keys(deps as Record<string, unknown>)) {
        // Take last segment after /
        const segments = name.split('/');
        const lastSegment = segments[segments.length - 1].toLowerCase();
        tokens.push(lastSegment);
      }
    }
  }

  return tokens;
}

export function parsePomXml(content: string): string[] {
  const tokens: string[] = ['java', 'maven'];

  // Extract artifactId from <dependency> blocks
  // Pattern: find all <dependency>...</dependency> blocks, extract <artifactId>
  const depBlockRegex = /<dependency\b[^>]*>([\s\S]*?)<\/dependency>/gi;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = depBlockRegex.exec(content)) !== null) {
    const block = blockMatch[1];
    const artifactMatch = block.match(/<artifactId>\s*([^<]+?)\s*<\/artifactId>/);
    if (artifactMatch) {
      tokens.push(artifactMatch[1].toLowerCase());
    }
  }

  return tokens;
}

export function parseBuildGradle(content: string, isKotlin: boolean): string[] {
  const tokens: string[] = [isKotlin ? 'kotlin' : 'java', 'gradle'];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Kotlin DSL: implementation("group:artifact:version")
    // Groovy DSL: implementation 'group:artifact:version'
    // Also: api, compileOnly, runtimeOnly, testImplementation, etc.
    const kotlinMatch = trimmed.match(
      /(?:implementation|api|compileOnly|runtimeOnly|testImplementation|testRuntimeOnly|kapt|annotationProcessor)\s*\(\s*["']([^"']+)["']\s*\)/,
    );
    if (kotlinMatch) {
      extractGradleArtifact(kotlinMatch[1], tokens);
      continue;
    }

    // Groovy DSL: implementation 'group:artifact:version'
    const groovyMatch = trimmed.match(
      /(?:implementation|api|compileOnly|runtimeOnly|testImplementation|testRuntimeOnly|kapt|annotationProcessor)\s+['"]([^'"]+)['"]/,
    );
    if (groovyMatch) {
      extractGradleArtifact(groovyMatch[1], tokens);
    }
  }

  return tokens;
}

function extractGradleArtifact(coord: string, tokens: string[]): void {
  // Format: group:artifact:version or group:artifact
  const parts = coord.split(':');
  if (parts.length >= 2) {
    tokens.push(parts[1].toLowerCase());
  }
}
