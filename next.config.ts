import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The trained detector and the committed evidence are read at runtime with
   * `readFileSync(path.join(process.cwd(), ...))`. Next's static tracer cannot
   * see a path built at runtime, so on a serverless target these files are not
   * bundled and `loadModel()` throws ENOENT on the first request. Trace them
   * in explicitly.
   */
  outputFileTracingIncludes: {
    "/api/**": ["./data/models/**", "./data/evidence/**"],
    "/": ["./data/models/**", "./data/evidence/**"],
  },
};

export default nextConfig;
