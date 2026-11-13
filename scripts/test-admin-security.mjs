import { PGlite } from "@electric-sql/pglite";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const db = new PGlite();
const owner = "11111111-1111-4111-8111-111111111111",
  ron = "22222222-2222-4222-8222-222222222222",
  delegate = "33333333-3333-4333-8333-333333333333";
try {
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid(),auth.jwt() to authenticated,anon;insert into auth.users values('${owner}','owner@example.test',now()),('${ron}','ron@example.test',now()),('${delegate}','delegate@example.test',now());`,
  );
  await db.exec(
    execFileSync(
      process.execPath,
      [
        "scripts/provision-founders.mjs",
        "owner@example.test",
        "ron@example.test",
        "--fresh",
      ],
      { encoding: "utf8" },
    ),
  );
  await db.query(
    "insert into public.memberships select $1,workspace_id,role,display_name,true from public.memberships where user_id=$2",
    [delegate, owner],
  );
  for (const id of [owner, ron, delegate])
    await db.query(
      "select public.shypit_permit_session($1,$1,repeat('a',64),now()+interval '15 minutes')",
      [id],
    );
  async function as(id) {
    await db.exec("reset role;set role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
      [id, JSON.stringify({ session_id: id })],
    );
  }
  const profile = async () =>
    (await db.query("select public.shypit_admin_profile() as p")).rows[0].p;
  const read = async (section) =>
    (await db.query("select public.shypit_admin_read($1) as d", [section]))
      .rows[0].d;
  const change = async (action, target, options) =>
    db.query("select public.shypit_admin_change($1,$2,$3)", [
      action,
      target,
      JSON.stringify(options),
    ]);
  await db.exec("set role anon");
  await assert.rejects(db.query("select public.shypit_admin_profile()"));
  await as(delegate);
  assert.equal(await profile(), null);
  await assert.rejects(read("stats"));
  await assert.rejects(db.query("select * from shypit_private.admin_grants"));
  await assert.rejects(
    change("admin-access", delegate, { active: true, capabilities: ["stats"] }),
  );
  await as(owner);
  assert.equal((await profile()).owner, true);
  assert.equal((await read("stats")).workspaces, 2);
  await assert.rejects(
    change("admin-access", ron, { active: false, capabilities: [] }),
  );
  await assert.rejects(
    change("admin-access", owner, { active: false, capabilities: [] }),
  );
  await assert.rejects(
    change("admin-access", delegate, {
      active: true,
      capabilities: ["arbitrary"],
    }),
  );
  await change("admin-access", delegate, {
    active: true,
    capabilities: ["stats", "access"],
  });
  await as(delegate);
  assert.deepEqual((await profile()).capabilities, ["access", "stats"]);
  assert.equal((await read("stats")).workspaces, 2);
  await read("access");
  await assert.rejects(read("operations"));
  await assert.rejects(read("audit"));
  await assert.rejects(
    change("admin-access", ron, { active: false, capabilities: [] }),
  );
  await as(ron);
  assert.equal((await profile()).owner, true);
  await change("admin-access", delegate, { active: false, capabilities: [] });
  assert.equal((await read("audit")).length, 2);
  await change("membership-access", delegate, {
    workspace_id: "a1111111-1111-4111-8111-111111111111",
    active: false,
  });
  await as(delegate);
  assert.equal(await profile(), null);
  await assert.rejects(read("stats"));
  assert.equal(
    (await db.query("select * from public.workspaces where kind='business'"))
      .rows.length,
    0,
  );
  await db.exec("reset role");
  await db.query(
    "delete from shypit_private.session_permits where user_id=$1",
    [owner],
  );
  await as(owner);
  assert.equal(await profile(), null);
  await assert.rejects(read("stats"));
  await assert.rejects(
    change("admin-access", delegate, { active: true, capabilities: ["stats"] }),
  );
  console.log(
    "PASS admin: anonymous/nonadmin/expired sessions denied; both founders protected; scoped reads, owner-only changes, immediate revocation and audit enforced",
  );
} finally {
  await db.close();
}
