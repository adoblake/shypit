import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
try {
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`,
  );
  await db.exec(await readFile("supabase/schema.sql", "utf8"));
  await db.exec(
    `insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333');insert into public.workspaces(id,kind,data) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','business','{"shipments":[{"id":"secret-a"}],"loads":[{}],"jobs":[]}'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','driver','{"shipments":[{"id":"secret-b"}],"loads":[{}],"jobs":[]}');insert into public.memberships values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','business','Business A',true),('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','driver','Carrier B',true);`,
  );
  await assert.rejects(
    db.query(
      "insert into public.memberships values('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','driver','Wrong role',true)",
    ),
  );
  console.log("PASS mixed business/carrier workspace membership denied");
  await db.exec("set role anon");
  await assert.rejects(db.query("select * from public.workspaces"));
  await db.exec("reset role");
  console.log("PASS anonymous workspace read denied");
  async function asUser(id) {
    await db.exec(
      `reset role;set role authenticated;set "request.jwt.claim.sub"='${id}';`,
    );
  }
  await asUser("11111111-1111-4111-8111-111111111111");
  assert.equal(
    (await db.query("select * from public.workspaces")).rows.length,
    1,
  );
  assert.equal(
    (await db.query("select * from public.memberships")).rows.length,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select * from public.workspaces where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'",
      )
    ).rows.length,
    0,
  );
  console.log("PASS cross-workspace read denied");
  await assert.rejects(db.query("update public.memberships set role='driver'"));
  await assert.rejects(
    db.query(
      "insert into public.memberships values('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','business','Intruder',true)",
    ),
  );
  console.log("PASS self-invitation and role escalation denied");
  await db.exec(
    `update public.workspaces set data=jsonb_set(data,'{shipments}','[{"id":"changed"}]') where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'`,
  );
  assert.equal(
    (await db.query("select revision from public.workspaces")).rows[0].revision,
    1,
  );
  await assert.rejects(
    db.query(
      `update public.workspaces set data=jsonb_set(data,'{jobs}','[{}]')`,
    ),
  );
  console.log("PASS business shipment update allowed; job update denied");
  await asUser("22222222-2222-4222-8222-222222222222");
  await db.exec(
    `update public.workspaces set data=jsonb_set(data,'{jobs}','[{"id":"job"}]')`,
  );
  await assert.rejects(
    db.query(
      `update public.workspaces set data=jsonb_set(data,'{shipments}','[{"id":"altered"}]')`,
    ),
  );
  console.log("PASS carrier job update allowed; shipment update denied");
  await asUser("33333333-3333-4333-8333-333333333333");
  assert.equal(
    (await db.query("select * from public.workspaces")).rows.length,
    0,
  );
  console.log("PASS authenticated nonmember denied");
  await db.exec(
    `reset role;update public.memberships set active=false where user_id='11111111-1111-4111-8111-111111111111'`,
  );
  await asUser("11111111-1111-4111-8111-111111111111");
  assert.equal(
    (await db.query("select * from public.workspaces")).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "update public.workspaces set data=jsonb_set(data,'{shipments}','[{\"id\":\"blocked\"}]') returning id",
      )
    ).rows.length,
    0,
  );
  console.log("PASS revoked membership read and write denied");
} finally {
  await db.close();
}
