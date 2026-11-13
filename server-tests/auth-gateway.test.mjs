import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  makeAuthHandler,
  emailKey,
} from "../supabase/functions/shypit-auth/core.mjs";
let db, handler, stats;
const email = "approved@example.test",
  user = "11111111-1111-4111-8111-111111111111",
  sid = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const jwt =
  "e30." +
  Buffer.from(
    JSON.stringify({
      session_id: sid,
      exp: Math.floor(Date.now() / 1000) + 900,
    }),
  ).toString("base64url") +
  ".provider-test-signature";
before(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth,public to anon,authenticated,service_role;grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`,
  );
  await db.exec(await readFile("supabase/schema.sql", "utf8"));
  await db.exec(await readFile("supabase/auth-security.sql", "utf8"));
  await db.exec(
    `insert into auth.users values('${user}');insert into public.workspaces(id,kind,data) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','business','{"shipments":[{}],"loads":[{}],"jobs":[]}');insert into public.memberships values('${user}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','business','Company',true)`,
  );
  await db.query(
    "insert into shypit_private.preview_invitations values($1,$2,$3,$4,true)",
    [
      await emailKey(email),
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "business",
      "Company",
    ],
  );
});
after(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec(
    "truncate shypit_private.auth_limits,shypit_private.auth_reservations,shypit_private.session_permits,shypit_private.recovery_receipts,shypit_private.access_help",
  );
  stats = { password: 0, invite: 0, recover: 0, updates: 0 };
  handler = makeAuthHandler({
    supabaseUrl: "https://provider.test",
    publicKey: "public-test-key",
    serviceKey: "server-test-secret",
    siteUrl: "https://app.test/",
    fetchImpl: async (url, init = {}) => {
      const u = new URL(url),
        body = init.body ? JSON.parse(init.body) : {};
      if (u.pathname.startsWith("/rest/v1/rpc/")) {
        assert.equal(init.headers.Authorization, "Bearer server-test-secret");
        const name = u.pathname.split("/").at(-1);
        const entries = Object.entries(body);
        const result = await db.query(
          "select public." +
            name +
            "(" +
            entries.map(([key], i) => key + ":=$" + (i + 1)).join(",") +
            ") as result",
          entries.map(([, value]) => value),
        );
        return Response.json(result.rows[0].result);
      }
      if (u.pathname === "/auth/v1/token") {
        stats.password++;
        return body.password === "correct-password"
          ? Response.json({
              access_token: jwt,
              refresh_token: "must-never-reach-client",
            })
          : Response.json({ error: "invalid_credentials" }, { status: 400 });
      }
      if (u.pathname === "/auth/v1/user" && init.method === "PUT") {
        stats.updates++;
        return Response.json({ id: user });
      }
      if (u.pathname === "/auth/v1/user")
        return ["Bearer " + jwt, "Bearer recovery-session"].includes(
          init.headers.Authorization,
        )
          ? Response.json({ id: user, email })
          : Response.json({ error: "invalid" }, { status: 401 });
      if (u.pathname === "/auth/v1/invite") {
        stats.invite++;
        return Response.json({ id: user });
      }
      if (u.pathname === "/auth/v1/recover") {
        stats.recover++;
        return Response.json({});
      }
      if (u.pathname === "/auth/v1/verify")
        return body.token_hash === "valid-once"
          ? Response.json({ access_token: "recovery-session" })
          : Response.json({ error: "expired" }, { status: 400 });
      throw Error("Unexpected upstream path");
    },
  });
});
const call = (body) =>
  handler(
    new Request("https://edge.test/", {
      method: "POST",
      headers: {
        Origin: "https://app.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
test("ten failed sign-ins lock the account; a fresh handler request cannot bypass it", async () => {
  for (let i = 0; i < 10; i++) {
    const r = await call({ action: "signin", email, password: "bad" });
    assert.equal(r.status, i === 9 ? 429 : 400);
  }
  const r = await call({
    action: "signin",
    email,
    password: "correct-password",
  });
  assert.equal(r.status, 429);
  assert.equal(stats.password, 10);
});
test("verified approved credentials receive a permitted session without refresh token or server secret", async () => {
  const r = await call({
    action: "signin",
    email,
    password: "correct-password",
  });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.access_token, jwt);
  assert.equal(body.refresh_token, undefined);
  assert.equal(JSON.stringify(body).includes("server-test-secret"), false);
  assert.equal(
    (await db.query("select * from shypit_private.session_permits")).rows
      .length,
    1,
  );
});
test("known and unknown setup addresses receive the same response; only approved invitations send mail", async () => {
  const known = await call({ action: "setup", email }),
    unknown = await call({ action: "setup", email: "unknown@example.test" });
  assert.equal(known.status, 200);
  assert.deepEqual(await known.json(), await unknown.json());
  assert.equal(stats.invite, 1);
});
test("recovery requests stop after ten across clients", async () => {
  for (let i = 0; i < 10; i++)
    assert.equal((await call({ action: "reset", email })).status, 200);
  assert.equal((await call({ action: "reset", email })).status, 429);
  assert.equal(stats.recover, 10);
});
test("password setup requires valid email proof, enforces password length, and prevents replay", async () => {
  assert.equal(
    (
      await call({
        action: "complete",
        email,
        tokenHash: "expired",
        type: "invite",
        password: "a-long-new-password",
      })
    ).status,
    400,
  );
  assert.equal(stats.updates, 0);
  assert.equal(
    (
      await call({
        action: "complete",
        email,
        tokenHash: "valid-once",
        type: "invite",
        password: "short",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call({
        action: "complete",
        email,
        tokenHash: "valid-once",
        type: "invite",
        password: "a-long-new-password",
      })
    ).status,
    200,
  );
  assert.equal(stats.updates, 1);
  assert.equal(
    (
      await call({
        action: "complete",
        email,
        accessToken: "recovery-session",
        password: "another-long-password",
      })
    ).status,
    400,
  );
  assert.equal(stats.updates, 1);
});
test("forgot-email records administrator review without disclosing an account", async () => {
  const r = await call({
    action: "email-help",
    email: "alternate@example.test",
    name: "Preview founder",
    organization: "Small company",
  });
  assert.equal(r.status, 200);
  assert.equal(
    (await db.query("select * from shypit_private.access_help")).rows.length,
    1,
  );
  assert.equal(
    JSON.stringify(await r.json()).includes("approved@example.test"),
    false,
  );
});
test("unexpected browser origins and malformed input do not create a session", async () => {
  const r = await handler(
    new Request("https://edge.test/", {
      method: "POST",
      headers: { Origin: "https://untrusted.test" },
      body: "{}",
    }),
  );
  assert.equal(r.status, 403);
  assert.equal(
    (await call({ action: "signin", email: "invalid", password: "bad" }))
      .status,
    400,
  );
  assert.equal(stats.password, 0);
});
test("logout revokes its own application session permit", async () => {
  assert.equal(
    (await call({ action: "signin", email, password: "correct-password" }))
      .status,
    200,
  );
  assert.equal(
    (await db.query("select * from shypit_private.session_permits")).rows
      .length,
    1,
  );
  assert.equal(
    (await call({ action: "logout", accessToken: jwt })).status,
    200,
  );
  assert.equal(
    (await db.query("select * from shypit_private.session_permits")).rows
      .length,
    0,
  );
});
