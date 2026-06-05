import { readdir, readFile, stat, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readText(filePath: string): Promise<string> {
  return readFile(filePath, 'utf-8');
}

export async function walkMarkdownFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  await walkDir(dir, results);
  return results;
}

async function walkDir(dir: string, results: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }

    if (entry.isDirectory()) {
      await walkDir(fullPath, results);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
      results.push(fullPath);
    }
  }
}
