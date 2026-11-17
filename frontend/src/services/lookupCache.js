const FRESHNESS_MS = 5 * 60 * 1000;
const cache = new Map();

export function getCachedLookup(key, loader, now = Date.now()) {
  const cached = cache.get(key);
  if (cached?.value && cached.expiresAt > now)
    return Promise.resolve(cached.value);
  if (cached?.pending) return cached.pending;

  const pending = Promise.resolve()
    .then(loader)
    .then((value) => {
      cache.set(key, { value, expiresAt: Date.now() + FRESHNESS_MS });
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });
  cache.set(key, { pending });
  return pending;
}

export function clearLookupCache() {
  cache.clear();
}

export const LOOKUP_CACHE_FRESHNESS_MS = FRESHNESS_MS;
