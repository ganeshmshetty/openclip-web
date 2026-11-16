import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
  analyzerMode: "json",
});

const nextConfig: NextConfig = {
  // Static export to `out/`, served by Workers Static Assets (wrangler.jsonc). Pages,
  // RSC payloads and metadata files never run code; the few dynamic routes live in
  // worker.ts. Redirects and headers are in public/_redirects and public/_headers,
  // because `redirects()`/`headers()` are not supported by a static export.
  output: "export",
};

export default withBundleAnalyzer(nextConfig);
