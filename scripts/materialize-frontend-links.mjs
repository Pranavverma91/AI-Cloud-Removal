// Recover compatibility paths only when an archive extractor did not preserve symlinks.
import { lstat, readFile, rm, symlink, cp } from "node:fs/promises";
import path from "node:path";
for (const name of ["app", "components", "hooks", "lib", "public", "vendor"]) {
  const source = path.resolve("frontend", name),
    destination = path.resolve(name);
  const stat = await lstat(destination).catch(() => null);
  if (stat?.isSymbolicLink() || stat?.isDirectory()) continue;
  if (
    stat &&
    (!stat.isFile() ||
      (await readFile(destination, "utf8")).trim() !== `frontend/${name}`)
  )
    throw new Error(`Refusing to replace existing ${name}`);
  if (stat) await rm(destination);
  try {
    await symlink(
      source,
      destination,
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch {
    await cp(source, destination, { recursive: true });
    console.warn(
      `${name} was copied; rerun this setup on a fresh extraction after future source changes.`,
    );
  }
}
