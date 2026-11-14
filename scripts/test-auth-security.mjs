import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
const key = "a".repeat(64),
  session = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  user = "11111111-1111-4111-8111-111111111111";
try {
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth,public to authenticated,anon,service_role;grant execute on function auth.uid(),auth.jwt() to authenticated,anon,service_role;`,
  );
  await db.exec(await readFile("supabase/schema.sql", "utf8"));
  await db.exec(await readFile("supabase/auth-security.sql", "utf8"));
  async function begin(action = "sign-in", k = key) {
    return (
      await db.query("select public.shypit_auth_begin($1,$2) as r", [k, action])
    ).rows[0].r;
  }
  async function finish(id, success) {
    return (
      await db.query("select public.shypit_auth_finish($1,$2) as r", [
        id,
        success,
      ])
    ).rows[0].r;
  }
  for (let i = 0; i < 9; i++) {
    const a = await begin();
    assert.equal(a.allowed, true);
    assert.equal((await finish(a.reservation, false)).locked_until, null);
  }
  const tenth = await begin();
  assert.equal(tenth.allowed, true);
  const locked = await finish(tenth.reservation, false);
  assert.equal(locked.allowed, false);
  assert.ok(locked.locked_until);
  assert.equal((await begin()).allowed, false);
  console.log("PASS exactly 10 failed attempts lock the server-side process");
  const hours = (new Date(locked.locked_until) - Date.now()) / 3600000;
  assert.ok(hours > 23.9 && hours <= 24.1);
  await db.exec(
    `update shypit_private.auth_limits set locked_until=now()-interval '1 second' where email_key='${key}'`,
  );
  assert.equal((await begin()).allowed, true);
  console.log("PASS 24-hour lock expires and grants a fresh budget");
  const goodKey = "b".repeat(64);
  for (let i = 0; i < 9; i++) {
    const a = await begin("sign-in", goodKey);
    await finish(a.reservation, false);
  }
  const success = await begin("sign-in", goodKey);
  assert.equal((await finish(success.reservation, true)).allowed, true);
  assert.equal(
    (
      await db.query(
        "select failures from shypit_private.auth_limits where email_key=$1",
        [goodKey],
      )
    ).rows[0].failures,
    0,
  );
  console.log(
    "PASS valid tenth attempt succeeds and resets failed-attempt count",
  );
  const requests = "c".repeat(64);
  for (let i = 0; i < 10; i++)
    assert.equal((await begin("reset-request", requests)).allowed, true);
  assert.equal((await begin("reset-request", requests)).allowed, false);
  console.log(
    "PASS recovery requests have a shared, non-resettable 10-per-day budget",
  );
  const concurrent = "d".repeat(64);
  for (let i = 0; i < 10; i++)
    assert.equal((await begin("sign-in", concurrent)).allowed, true);
  assert.equal((await begin("sign-in", concurrent)).allowed, false);
  console.log(
    "PASS reservations prevent concurrent attempts exceeding the budget",
  );
  await db.exec(
    `update shypit_private.auth_limits set locked_until=now()-interval '1 second' where email_key='${concurrent}'`,
  );
  assert.equal((await begin("sign-in", concurrent)).allowed, true);
  console.log(
    "PASS expired locks discard abandoned reservations rather than extending a lock",
  );
  await db.exec("set role anon");
  await assert.rejects(
    db.query("select public.shypit_auth_begin($1,$2)", [key, "sign-in"]),
  );
  await assert.rejects(db.query("select * from shypit_private.auth_limits"));
  await db.exec("reset role");
  console.log(
    "PASS public clients cannot edit counters or bypass gateway RPC permissions",
  );
  await db.exec(
    `insert into auth.users values('${user}');insert into public.workspaces(id,kind,data) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','business','{"shipments":[{}],"loads":[{}],"jobs":[]}');insert into public.memberships values('${user}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','business','Founder',true);set role authenticated;set "request.jwt.claim.sub"='${user}';set "request.jwt.claims"='{"session_id":"${session}"}';`,
  );
  assert.equal(
    (await db.query("select * from public.workspaces")).rows.length,
    0,
  );
  await db.exec("reset role");
  await db.query(
    "select public.shypit_permit_session($1,$2,$3,now()+interval '15 minutes')",
    [session, user, goodKey],
  );
  await db.exec("set role authenticated");
  assert.equal(
    (await db.query("select * from public.workspaces")).rows.length,
    1,
  );
  console.log(
    "PASS direct provider sessions cannot access workspaces without a gateway-issued session permit",
  );
  await db.exec("reset role");
  await db.exec(`set role anon`);
  await assert.rejects(db.query("select public.shypit_extend_session()"));
  await db.exec(
    `reset role;set role authenticated;set "request.jwt.claims"='{"session_id":"${session}","exp":${Math.floor(Date.now() / 1000) + 3600}}'`,
  );
  await assert.rejects(db.query("select public.shypit_extend_session()")); // Not in warning window.
  await db.exec("reset role");
  for (let extension = 0; extension < 10; extension++) {
    // Simulate arrival at each warning window without a real-time wait.
    await db.query(
      "update shypit_private.session_permits set expires_at=now()+interval '1 minute' where session_id=$1",
      [session],
    );
    await db.exec("set role authenticated");
    const renewed = (
      await db.query("select public.shypit_extend_session() as r")
    ).rows[0].r;
    assert.ok(renewed.expires_at * 1000 > Date.now() + 170000);
    assert.ok(renewed.expires_at * 1000 < Date.now() + 190000);
    await db.exec("reset role");
  }
  await db.exec(
    `set role authenticated;set "request.jwt.claims"='{"session_id":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","exp":${Math.floor(Date.now() / 1000) + 3600}}'`,
  );
  await assert.rejects(db.query("select public.shypit_extend_session()"));
  await db.exec(
    `reset role;update shypit_private.session_permits set expires_at=now()-interval '1 second';set role authenticated;set "request.jwt.claims"='{"session_id":"${session}","exp":${Math.floor(Date.now() / 1000) + 3600}}'`,
  );
  await assert.rejects(db.query("select public.shypit_extend_session()"));
  await db.exec("reset role");
  await db.query(
    "update shypit_private.session_permits set expires_at=now()+interval '1 minute' where session_id=$1",
    [session],
  );
  await db.exec(
    `set role authenticated;set "request.jwt.claims"='{"session_id":"${session}","exp":${Math.floor(Date.now() / 1000) + 60}}'`,
  );
  await assert.rejects(db.query("select public.shypit_extend_session()"));
  await db.exec(
    `reset role;set "request.jwt.claims"='{"session_id":"${session}","exp":${Math.floor(Date.now() / 1000) + 3600}}'`,
  );
  console.log(
    "PASS ten explicit warning-window extensions; public, foreign, expired and expiring-token sessions cannot extend",
  );
  for (let i = 0; i < 10; i++) {
    const a = await begin("sign-in", goodKey);
    await finish(a.reservation, false);
  }
  await db.exec("set role authenticated");
  assert.equal(
    (await db.query("select * from public.workspaces")).rows.length,
    0,
  );
  await assert.rejects(db.query("select public.shypit_extend_session()"));
  await db.exec("reset role");
  console.log(
    "PASS account lock also blocks previously permitted sessions from reading private data",
  );
  assert.equal(
    (
      await db.query("select public.shypit_consume_recovery($1) as r", [
        "e".repeat(64),
      ])
    ).rows[0].r,
    true,
  );
  assert.equal(
    (
      await db.query("select public.shypit_consume_recovery($1) as r", [
        "e".repeat(64),
      ])
    ).rows[0].r,
    false,
  );
  console.log("PASS recovery session can only be consumed once");
} finally {
  await db.close();
}
