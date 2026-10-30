import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { localBindings } from "./local-bindings.mjs";
const require = createRequire(import.meta.url);
export function prepareLocalD1() {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const directory = path.join(root, ".sites-runtime");
  mkdirSync(directory, { recursive: true });
  const config = path.join(directory, "local-d1.json");
  writeFileSync(
    config,
    JSON.stringify({
      name: "cloud-removal-local-setup",
      compatibility_date: "2026-05-15",
      d1_databases: localBindings.d1_databases,
    }),
  );
  const cli = path.join(
    path.dirname(require.resolve("wrangler/package.json")),
    "bin",
    "wrangler.js",
  );
  for (const database of localBindings.d1_databases) {
    const result = spawnSync(
      process.execPath,
      [
        cli,
        "d1",
        "execute",
        database.binding,
        "--local",
        "--config",
        config,
        "--persist-to",
        path.join(root, ".wrangler/state"),
        "--file",
        path.join(root, "db/local-schema.sql"),
      ],
      {
        cwd: root,
        stdio: "inherit",
        env: {
          ...process.env,
          WRANGLER_SEND_METRICS: "false",
          CLOUDFLARE_CF_FETCH_ENABLED: "false",
        },
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw Error(
        "Local database setup failed. Resolve the error above, then run npm run db:local again.",
      );
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) prepareLocalD1();
