// Verify direct personal access, a stable owner and same-origin write protection.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
const packagePath = require.resolve("vitest/package.json");
const cli = path.join(
  path.dirname(packagePath),
  require(packagePath).bin.vitest,
);
const result = spawnSync(
  process.execPath,
  [
    cli,
    "run",
    "frontend/tests/personal.test.ts",
    "--config",
    "vitest.config.ts",
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
