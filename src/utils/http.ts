const DEFAULT_TIMEOUT = 10_000;
const USER_AGENT = 'ingred-cli';

export async function httpGetJson<T>(url: string, timeoutMs = DEFAULT_TIMEOUT): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}
