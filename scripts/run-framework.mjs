import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readExecutionProfile } from "./execution-profile.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "dev-cloudflare", "build"].includes(command))
  throw new Error("Expected dev, dev-cloudflare or build.");
const managedLinux = readExecutionProfile() === "managed-linux";

// A downloaded project opens in personal mode with an automatically initialized
// SQLite database. Hosted preview retains the required Cloudflare runtime.
if (command === "dev" && !managedLinux) {
  await import("./start-personal.mjs");
} else {
  await import("./build-personal-worker.mjs");
  if (command !== "build") {
    const { prepareLocalD1 } = await import("./prepare-local-d1.mjs");
    prepareLocalD1();
  }

  if (managedLinux && command === "build") {
    const result = spawnSync(
      "bash",
      [fileURLToPath(new URL("./build-verified.sh", import.meta.url)), ...args],
      { stdio: "inherit" },
    );
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
  }

  // Import in this process so the preview owner retains its PID and signals.
  const cli = new URL(
    managedLinux || command === "dev-cloudflare"
      ? "../node_modules/vite/bin/vite.js"
      : "../node_modules/vinext/dist/cli.js",
    import.meta.url,
  );
  process.argv = [
    process.execPath,
    fileURLToPath(cli),
    command === "dev-cloudflare" ? "dev" : command,
    ...(!managedLinux && command === "dev-cloudflare"
      ? ["--port", "5173"]
      : []),
    ...args,
  ];
  await import(cli.href);
}
