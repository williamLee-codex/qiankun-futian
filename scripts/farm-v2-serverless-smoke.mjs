import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
const url = new URL(
  process.env.FARM_V2_TEST_DATABASE_URL || "postgresql://127.0.0.1/invalid",
);
if (url.hostname !== "127.0.0.1" || !url.pathname.startsWith("/farm_v2_"))
  throw new Error("ISOLATED_DATABASE_REQUIRED");
const require = createRequire(path.resolve("lib/db/package.json"));
const { Pool } = require("pg");
const admin = new Pool({ connectionString: url.toString() });
const role = `farm_v2_smoke_${process.pid}`;
const temp = mkdtempSync(path.join(tmpdir(), "farm-v2-smoke-"));
const child = path.join(temp, "probe.mjs");
const code = `
import app from ${JSON.stringify(pathToFileURL(path.resolve("api/index.mjs")).href)};
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const base='http://127.0.0.1:'+server.address().port;
const paths=['/api/healthz','/api/healthz/ready','/api/farm/v2/state?farmV2=1'];
const statuses=[];for(const path of paths){const r=await fetch(base+path);statuses.push(r.status);await r.text();}
const session=await fetch(base+'/api/farm/v2/session',{method:'POST',headers:{'authorization':'Bearer test-only','content-type':'application/json'},body:'{}'});statuses.push(session.status);await session.text();
console.log(JSON.stringify({statuses}));server.close();process.exit(0);
`;
writeFileSync(child, code);
try {
  await admin.query(
    `CREATE ROLE ${role} LOGIN; GRANT USAGE ON SCHEMA public,core TO ${role}; GRANT SELECT,INSERT,UPDATE ON farm_v2_player_state,farm_v2_land,farm_v2_mutation,farm_v2_authorization_attempt TO ${role}; GRANT EXECUTE ON FUNCTION farm_v2_apply_atomic_pot_wallet(uuid,uuid,text,jsonb,text) TO ${role}`,
  );
  url.username = role;
  const result = spawnSync(process.execPath, [child], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: url.toString(),
      PLATFORM_BASE_URL: "https://platform.test",
      REPLIT_APP_SHARED_SECRET: "isolated-test-only",
      FARM_V2_ENTRY_ENABLED: "0",
      LOG_LEVEL: "silent",
    },
    encoding: "utf8",
    timeout: 20000,
  });
  if (result.status !== 0) throw new Error("SERVERLESS_SMOKE_FAILED");
  const output = JSON.parse(result.stdout.trim());
  assert.deepEqual(output.statuses, [200, 200, 503, 503]);
  console.log(
    "PASS: compiled Functions handler, restricted-role readiness, direct parameter/session blocked",
  );
  await admin.query(
    `REVOKE EXECUTE ON FUNCTION farm_v2_apply_atomic_pot_wallet(uuid,uuid,text,jsonb,text) FROM ${role}`,
  );
  const blocked = spawnSync(process.execPath, [child], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: url.toString(),
      PLATFORM_BASE_URL: "https://platform.test",
      REPLIT_APP_SHARED_SECRET: "isolated-test-only",
      FARM_V2_ENTRY_ENABLED: "0",
      LOG_LEVEL: "silent",
    },
    encoding: "utf8",
    timeout: 20000,
  });
  if (blocked.status !== 0) throw new Error("SERVERLESS_SMOKE_FAILED");
  assert.deepEqual(
    JSON.parse(blocked.stdout.trim()).statuses,
    [200, 503, 503, 503],
  );
  console.log(
    "PASS: missing runtime RPC grant fails readiness without exposing internals",
  );
  writeFileSync(
    child,
    `import app from ${JSON.stringify(pathToFileURL(path.resolve("api/index.mjs")).href)};
const s=app.listen(0,'127.0.0.1');await new Promise(r=>s.once('listening',r));
const statuses=[];for(const origin of ['https://platform.test','https://other.test']){const r=await fetch('http://127.0.0.1:'+s.address().port+'/api/healthz',{headers:{origin}});statuses.push(r.status);await r.text();}console.log(JSON.stringify(statuses));s.close();process.exit(0);`,
  );
  const cors = spawnSync(process.execPath, [child], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL:
        "postgresql://runtime:isolated-test-only@unused.example/db?sslmode=require",
      FARM_V2_ALLOWED_ORIGIN: "https://platform.test",
      LOG_LEVEL: "silent",
    },
    encoding: "utf8",
    timeout: 20000,
  });
  if (cors.status !== 0) throw new Error("SERVERLESS_CORS_SMOKE_FAILED");
  assert.deepEqual(JSON.parse(cors.stdout.trim()), [200, 403]);
  console.log(
    "PASS: production CORS permits only the configured main origin (no database connection)",
  );
} finally {
  await admin.query(`DROP OWNED BY ${role}; DROP ROLE ${role}`).catch(() => {});
  await admin.end();
  rmSync(temp, { force: true, recursive: true });
}
