import { PGlite } from "@electric-sql/pglite";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const db = new PGlite();
try {
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;insert into auth.users values('11111111-1111-4111-8111-111111111111','owner@example.test',now()),('22222222-2222-4222-8222-222222222222','ronald@example.test',now());`,
  );
  const sql = execFileSync(
    process.execPath,
    [
      "scripts/provision-founders.mjs",
      "owner@example.test",
      "ronald@example.test",
      "--fresh",
    ],
    { encoding: "utf8" },
  );
  await db.exec(sql);
  assert.equal(
    (await db.query("select * from public.memberships")).rows.length,
    4,
  );
  assert.equal(
    (await db.query("select * from public.workspaces")).rows.length,
    2,
  );
  console.log(
    "PASS both founders receive two explicitly approved preview memberships",
  );
  await db.exec(
    `set role authenticated;set "request.jwt.claim.sub"='11111111-1111-4111-8111-111111111111'`,
  );
  assert.equal(
    (await db.query("select * from public.workspaces")).rows.length,
    2,
  );
  await db.exec(
    `update public.workspaces set data=jsonb_set(data,'{shipments,0,status}','"Awaiting carrier"') where kind='business';update public.workspaces set data=jsonb_set(data,'{jobs}','[{"id":"job-preview"}]') where kind='driver'`,
  );
  await assert.rejects(db.query(`update public.memberships set active=true`));
  console.log(
    "PASS approved workspace roles work without granting membership administration",
  );
  await db.exec(
    `reset role;update public.memberships set active=false where user_id='22222222-2222-4222-8222-222222222222' and role='driver'`,
  );
  const repeat = execFileSync(
    process.execPath,
    [
      "scripts/provision-founders.mjs",
      "owner@example.test",
      "ronald@example.test",
      "--existing",
    ],
    { encoding: "utf8" },
  );
  await db.exec(repeat);
  assert.equal(
    (
      await db.query(
        "select data->'shipments'->0->>'status' as status from public.workspaces where kind='business'",
      )
    ).rows[0].status,
    "Awaiting carrier",
  );
  assert.equal(
    (
      await db.query(
        "select active from public.memberships where user_id='22222222-2222-4222-8222-222222222222' and role='driver'",
      )
    ).rows[0].active,
    false,
  );
  console.log(
    "PASS repeat provisioning preserves preview changes and revoked memberships",
  );
} finally {
  await db.close();
}
