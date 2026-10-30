import type { NextConfig } from "next";
import path from "node:path";

// Next development must use the real app directory, not the compatibility
// symlink at the repository root (which its route watcher does not traverse).
const projectRoot = process.env.PERSONAL_PROJECT_ROOT || path.resolve("..");
const config: NextConfig = {
  output: "standalone",
  distDir: ".next-personal",
  outputFileTracingRoot: projectRoot,
  webpack(config, { webpack }) {
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /^cloudflare:workers$/,
        path.join(projectRoot, "frontend/adapters/cloudflare-node.ts"),
      ),
    );
    return config;
  },
};
export default config;
