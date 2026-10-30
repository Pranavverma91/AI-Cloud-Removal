import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { cpSync, existsSync } from "node:fs";
const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
process.chdir(projectRoot);
await import("./build-personal-worker.mjs");
const command = process.argv[2];
if (!["dev", "build", "start"].includes(command))
  throw new Error("Use dev, build or start");
// Keep the user's existing root configuration and data location while Next
// reads routes from the actual frontend directory.
createRequire(require.resolve("next/package.json"))("@next/env").loadEnvConfig(
  projectRoot,
  command === "dev",
);
let args = [
  require.resolve("next/dist/bin/next"),
  command,
  path.join(projectRoot, "frontend"),
  ...(command === "start" ? [] : ["--webpack"]),
  ...(command === "build" ? [] : ["-p", process.env.PORT || "3000"]),
  ...(command === "dev"
    ? ["--hostname", process.env.PERSONAL_HOST || "127.0.0.1"]
    : []),
];
if (command === "start") {
  const build = path.join(projectRoot, "frontend/.next-personal");
  const standalone = path.join(build, "standalone/frontend");
  if (!existsSync(path.join(standalone, "server.js"))) {
    console.error(
      "No production build found. Run npm run build:next first, or npm start to build automatically.",
    );
    process.exit(1);
  }
  // Next's standalone output excludes these assets; the server needs both.
  cpSync(
    path.join(build, "static"),
    path.join(standalone, ".next-personal/static"),
    { recursive: true },
  );
  cpSync(
    path.join(projectRoot, "frontend/public"),
    path.join(standalone, "public"),
    { recursive: true },
  );
  // Next emits CommonJS for this nested app; the traced root package is ESM.
  // An explicit extension keeps Node from interpreting the entrypoint as ESM.
  cpSync(
    path.join(standalone, "server.js"),
    path.join(standalone, "server.cjs"),
  );
  args = [path.join(standalone, "server.cjs")];
}
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    SPACE_EYE_STANDALONE: "true",
    HOSTNAME: process.env.PERSONAL_HOST || "127.0.0.1",
    PERSONAL_PROJECT_ROOT: projectRoot,
    PERSONAL_DATA_DIR: path.resolve(
      projectRoot,
      process.env.PERSONAL_DATA_DIR || "data/personal",
    ),
  },
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
