/**
 * Fetch options that let Cloudflare's edge cache an upstream GitHub response for
 * 5 minutes, shared by every Worker isolate in a data center (the in-memory TTL
 * caches are per isolate, and isolates are short-lived). `cf` is ignored outside
 * workerd, so builds and `next dev` behave as before.
 */
export const EDGE_CACHE_5_MIN = { cf: { cacheTtl: 300 } } as RequestInit;
