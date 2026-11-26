import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = new URL("../../../../", import.meta.url).pathname;

describe("production migration isolation", () => {
  it("keeps harness fixtures out of the production migration directories", () => {
    for (const dir of ["supabase/migrations", "artifacts/api-server/supabase/migrations"]) {
      let files: string[] = [];
      try {
        files = readdirSync(join(root, dir)).filter((f) => f.endsWith(".sql"));
      } catch {
        continue;
      }
      for (const file of files) {
        const sql = readFileSync(join(root, dir, file), "utf8");
        expect(sql, `${dir}/${file}`).not.toContain("platform-fixtures");
        expect(sql, `${dir}/${file}`).not.toContain("_harness_applied");
      }
    }
  });
});
