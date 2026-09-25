import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Pin the Turbopack workspace root to this project.
   *
   * Without it, Next walks up and finds a `pnpm-lock.yaml` in a parent directory
   * that is outside this repository, which produces a confusing warning and can
   * resolve packages from the wrong place.
   */
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
