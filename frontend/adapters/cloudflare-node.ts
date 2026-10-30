// Personal local mode: durable SQLite records and files, with the same API as Sites bindings.
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  statSync,
} from "node:fs";
import path from "node:path";
let database: DatabaseSync | undefined;
const root = () =>
  path.resolve(process.env.PERSONAL_DATA_DIR || "data/personal");
function db() {
  if (!database) {
    mkdirSync(root(), { recursive: true });
    database = new DatabaseSync(path.join(root(), "workspace.db"));
    database.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS personal_records(id TEXT PRIMARY KEY,owner TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_personal_owner_kind_created ON personal_records(owner,kind,created_at);
CREATE TABLE IF NOT EXISTS personal_limits(id TEXT PRIMARY KEY,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS analyses(id TEXT PRIMARY KEY,owner TEXT NOT NULL,type TEXT NOT NULL,title TEXT NOT NULL,created_at TEXT NOT NULL,payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_analyses_owner_created ON analyses(owner,created_at);`);
  }
  return database;
}
function prepare(sql: string, values: SQLInputValue[] = []) {
  return {
    bind(...v: SQLInputValue[]) {
      return prepare(sql, v);
    },
    async first() {
      return (
        db()
          .prepare(sql)
          .get(...values) || null
      );
    },
    async all() {
      return {
        results: db()
          .prepare(sql)
          .all(...values),
        success: true,
      };
    },
    async run() {
      const result = db()
        .prepare(sql)
        .run(...values);
      return { success: true, meta: { changes: Number(result.changes) } };
    },
  };
}
function file(key: string) {
  if (!/^[a-zA-Z0-9_./-]+$/.test(key) || key.split("/").includes(".."))
    throw Error("Invalid object key");
  return path.join(root(), "objects", key);
}
const bucket = {
  async put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string | ReadableStream,
  ) {
    const target = file(key);
    mkdirSync(path.dirname(target), { recursive: true });
    const data =
      typeof value === "string"
        ? Buffer.from(value)
        : value instanceof ArrayBuffer
          ? Buffer.from(value)
          : ArrayBuffer.isView(value)
            ? Buffer.from(value.buffer, value.byteOffset, value.byteLength)
            : Buffer.from(await new Response(value).arrayBuffer());
    writeFileSync(target, data);
    return { key, size: data.length };
  },
  async get(key: string) {
    const target = file(key);
    if (!existsSync(target)) return null;
    const data = readFileSync(target);
    return {
      key,
      size: data.length,
      body: new Blob([data]).stream(),
      arrayBuffer: async () =>
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      text: async () => data.toString("utf8"),
    };
  },
  async head(key: string) {
    return existsSync(file(key))
      ? { key, size: statSync(file(key)).size }
      : null;
  },
  async delete(key: string | string[]) {
    for (const k of typeof key === "string" ? [key] : key)
      if (existsSync(file(k))) unlinkSync(file(k));
  },
};
export const env = { ...process.env, DB: { prepare }, BUCKET: bucket };
