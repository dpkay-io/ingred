import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getCacheDir } from '../core/config.js';
import { ensureDir, fileExists } from '../utils/fs.js';
import { shortHash } from '../utils/hash.js';
import { httpGetJson } from '../utils/http.js';
import { log } from '../utils/logger.js';
import { IngredError } from '../utils/errors.js';

const SEARCH_CACHE_TTL_MS = 60 * 60 * 1_000; // 1 hour
const GITHUB_SEARCH_URL = 'https://api.github.com/search/repositories';
const RESULTS_PER_PAGE = 10;

interface GitHubRepo {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  updated_at: string;
  html_url: string;
}

interface GitHubSearchResponse {
  total_count: number;
  items: GitHubRepo[];
}

interface CachedResult {
  fetchedAt: number;
  data: GitHubSearchResponse;
}

function getCacheFilePath(query: string): string {
  return join(getCacheDir(), 'search', `${shortHash(query)}.json`);
}

async function loadFromCache(query: string): Promise<GitHubSearchResponse | null> {
  const cachePath = getCacheFilePath(query);
  if (!(await fileExists(cachePath))) return null;

  try {
    const raw = await readFile(cachePath, 'utf-8');
    const cached = JSON.parse(raw) as CachedResult;
    const ageMs = Date.now() - cached.fetchedAt;
    if (ageMs > SEARCH_CACHE_TTL_MS) return null;
    return cached.data;
  } catch {
    return null;
  }
}

async function saveToCache(query: string, data: GitHubSearchResponse): Promise<void> {
  const cachePath = getCacheFilePath(query);
  await ensureDir(join(getCacheDir(), 'search'));
  const cached: CachedResult = { fetchedAt: Date.now(), data };
  await writeFile(cachePath, JSON.stringify(cached, null, 2) + '\n', 'utf-8');
}

function formatUpdatedAt(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

export async function searchCommand(query: string): Promise<void> {
  const cacheKey = `topic:ingred-ingredients+${query}`;

  let cached = await loadFromCache(cacheKey);
  let fromCache = false;

  if (cached) {
    fromCache = true;
  } else {
    const url = `${GITHUB_SEARCH_URL}?q=topic:ingred-ingredients+${encodeURIComponent(query)}&sort=stars&per_page=${RESULTS_PER_PAGE}`;
    try {
      cached = await httpGetJson<GitHubSearchResponse>(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('HTTP 403')) {
        throw new IngredError(
          'GitHub API rate limit exceeded.',
          'Wait a minute and try again, or authenticate via GITHUB_TOKEN environment variable.',
        );
      }
      throw new IngredError(
        `Search failed: ${msg}`,
        'Check your network connection and try again.',
      );
    }
    await saveToCache(cacheKey, cached);
  }

  const { total_count, items } = cached;

  log.info('');
  log.header(`Search results for "${query}"`);
  if (fromCache) log.hint('  (cached)');
  log.info('');

  if (items.length === 0) {
    log.warn(`No ingredient repos found for "${query}".`);
    log.hint('Try a broader query or browse https://github.com/topics/ingred-ingredients');
    return;
  }

  log.hint(`  Showing ${items.length} of ${total_count} results\n`);

  for (const repo of items) {
    log.info(`  ${repo.full_name}`);
    if (repo.description) {
      log.hint(`    ${repo.description}`);
    }
    log.item('    Stars', String(repo.stargazers_count));
    log.item('    Updated', formatUpdatedAt(repo.updated_at));
    log.item('    URL', repo.html_url);
    log.info('');
  }

  log.hint(`Run \`ingred add <URL>\` to link a repo.`);
}
