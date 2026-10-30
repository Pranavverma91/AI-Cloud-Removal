import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(
    "Install Node.js 22.13 or newer from nodejs.org, then try again.",
  );
  process.exit(1);
}
if (!existsSync("node_modules/next/package.json")) {
  console.log("Installing project dependencies (first launch only)…");
  const r = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["--yes", "pnpm@11.25.0", "install", "--frozen-lockfile"],
    { stdio: "inherit", shell: process.platform === "win32" },
  );
  if (r.status !== 0) process.exit(r.status || 1);
}
const production = process.argv.includes("--production");
if (
  production &&
  (!existsSync("frontend/.next-personal/BUILD_ID") ||
    !existsSync("frontend/.next-personal/standalone/frontend/server.js"))
) {
  console.log("Building the production website (first start only)…");
  const result = spawnSync(
    process.execPath,
    ["scripts/run-next.mjs", "build"],
    {
      stdio: "inherit",
      env: { ...process.env, SCIENCE_API_URL: "" },
    },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(
  "\nPersonal mode · SQLite database created automatically.\nOpen http://localhost:" +
    (process.env.PORT || "3000") +
    " — leave this terminal running.\n",
);
// Explicit personal mode also overrides an old Python API URL in the environment.
const child = spawn(
  process.execPath,
  ["scripts/run-next.mjs", production ? "start" : "dev"],
  {
    stdio: "inherit",
    env: { ...process.env, SCIENCE_API_URL: "" },
  },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => (process.exitCode = code ?? 1));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
