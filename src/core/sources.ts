import { join, relative } from 'node:path';
import { walkMarkdownFiles, readText, fileExists } from '../utils/fs.js';
import { gitPull } from '../utils/git.js';
import { parseFrontmatter } from '../parsers/frontmatter.js';
import { parseIngredYaml } from '../parsers/ingred-yaml.js';
import { log } from '../utils/logger.js';
import type { IngredSource, IngredientFile, ExternalMapping } from '../types.js';

export interface CollectedSource {
  ingredients: IngredientFile[];
  mappings: ExternalMapping[];
}

export async function syncSource(source: IngredSource): Promise<void> {
  if (source.type === 'git') {
    try {
      await gitPull(source.cachePath);
    } catch {
      log.warn(`Could not update "${source.name}". Using cached version.`);
    }
  } else {
    if (!(await fileExists(source.cachePath))) {
      log.warn(`Local source "${source.name}" not found at ${source.cachePath}`);
    }
  }
}

export async function collectIngredients(source: IngredSource): Promise<CollectedSource> {
  const ingredients: IngredientFile[] = [];
  let mappings: ExternalMapping[] = [];

  const mdFiles = await walkMarkdownFiles(source.cachePath);

  for (const filePath of mdFiles) {
    const rel = relative(source.cachePath, filePath).replace(/\\/g, '/');

    if (rel === 'README.md') continue;

    const raw = await readText(filePath);
    const { meta, content } = parseFrontmatter(raw);

    ingredients.push({
      filePath,
      relativePath: rel,
      sourceName: source.name,
      content,
      meta,
    });
  }

  const yamlPath = join(source.cachePath, 'ingred.yaml');
  if (await fileExists(yamlPath)) {
    const yamlContent = await readText(yamlPath);
    mappings = parseIngredYaml(yamlContent);
  }

  return { ingredients, mappings };
}
