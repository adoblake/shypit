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

  async function as(id, age = 0) {
    await db.exec("reset role;set role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
      [
        id,
        JSON.stringify({
          session_id: id,
          iat: Math.floor(Date.now() / 1000) - age,
        }),
      ],
    );
  }
  const business = "a1111111-1111-4111-8111-111111111111",
    carrier = "b2222222-2222-4222-8222-222222222222";
  const access = async (id, manage = false) =>
    (
      await db.query("select public.shypit_banking_access($1,$2) as a", [
        id,
        manage,
      ])
    ).rows[0].a;
  await db.exec("set role anon");
  await assert.rejects(
    db.query("select public.shypit_banking_access($1,false)", [business]),
  );
  await as(owner);
  assert.equal((await access(business, true)).canManage, true);
  await as(owner, 301);
  await assert.rejects(access(business, true));
  assert.equal((await access(business)).canManage, true);
  await as(delegate);
  assert.equal((await access(business)).canManage, false);
  await assert.rejects(access(business, true));
  await assert.rejects(
    db.query("select * from shypit_private.banking_accounts"),
  );
  await assert.rejects(
    db.query("select public.shypit_banking_save($1,'test','cus_sample',null)", [
      business,
    ]),
  );
  await as(owner);
  await db.query("select public.shypit_admin_change('finance-access',$1,$2)", [
    delegate,
    JSON.stringify({ workspace_id: carrier, active: true }),
  ]);
  await as(delegate);
  assert.equal((await access(carrier, true)).canManage, true);
  await assert.rejects(access(business, true));
  await as(owner);
  await db.query("select public.shypit_admin_change('finance-access',$1,$2)", [
    delegate,
    JSON.stringify({ workspace_id: carrier, active: false }),
  ]);
  await as(delegate);
  await assert.rejects(access(carrier, true));
  await db.exec("reset role");
  assert.equal(
    (
      await db.query(
        "select public.shypit_banking_begin($1,'test',$2,'business-setup') as ok",
        [business, owner],
      )
    ).rows[0].ok,
    true,
  );
  assert.equal(
    (
      await db.query(
        "select public.shypit_banking_begin($1,'test',$2,'business-setup') as ok",
        [business, owner],
      )
    ).rows[0].ok,
    false,
  );
  await db.query(
    "delete from shypit_private.session_permits where user_id=$1",
    [owner],
  );
  await as(owner);
  await assert.rejects(access(business));
  console.log(
    "PASS banking: workspace finance grants, recent sign-in, immediate revocation, private identifiers, launch throttling and session permits enforced",
  );
} finally {
  await db.close();
}
