import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// The site is fully prerendered at build time: there is no on-demand or timed
// revalidation, so the read-only Static Assets cache is enough. Nothing is written
// to a bucket, and `revalidate` exports resolve to the build-time value — a page is
// as fresh as the last deploy.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
