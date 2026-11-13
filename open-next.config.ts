import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// The site is fully prerendered at build time: there is no on-demand or timed
// revalidation, so the read-only Static Assets cache is enough. Nothing is written
// to a bucket, and `revalidate` exports resolve to the build-time value — a page is
// as fresh as the last deploy.
const config = defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});

export default {
  ...config,
  // `bun run build` is the full OpenNext build (Workers Builds runs it before
  // `wrangler preview`/deploy, and the Worker entry imports .open-next/worker.js), so
  // the plain Next.js build lives under `build:next` to avoid OpenNext calling itself.
  buildCommand: "bun run build:next",
};
