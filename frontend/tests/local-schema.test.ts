// @vitest-environment node
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

test("local D1 setup adds personal tables and preserves existing records on repeated runs", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(
      readFileSync(
        new URL("../../drizzle/0000_smiling_lenny_balinger.sql", import.meta.url),
        "utf8",
      ),
    );
    db.prepare(
      "INSERT INTO analyses(id,owner,type,title,created_at,payload) VALUES (?,?,?,?,?,?)",
    ).run("existing", "owner", "analysis", "Keep me", "2026-09-30", "{}");
    const schema = readFileSync(
      new URL("../../db/local-schema.sql", import.meta.url),
      "utf8",
    );
    db.exec(schema);
    db.prepare("INSERT INTO personal_limits(id,payload) VALUES (?,?)").run(
      "login",
      "{}",
    );
    db.exec(schema);
    expect(
      db.prepare("SELECT title FROM analyses WHERE id='existing'").get()?.title,
    ).toBe("Keep me");
    expect(
      db.prepare("SELECT count(*) AS count FROM personal_limits").get()?.count,
    ).toBe(1);
    expect(
      db.prepare("SELECT count(*) AS count FROM personal_records").get()?.count,
    ).toBe(0);
  } finally {
    db.close();
  }
});
