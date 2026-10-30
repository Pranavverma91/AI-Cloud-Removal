import { readFileSync } from "node:fs";
const { d1, r2 } = JSON.parse(
  readFileSync(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
);
// This placeholder is a stable identity for LOCAL storage, never a production resource ID.
export const localBindings = {
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: "00000000-0000-4000-8000-000000000000",
        },
      ]
    : [],
  r2_buckets: r2 ? [{ binding: r2, bucket_name: "site-creator-r2" }] : [],
};
