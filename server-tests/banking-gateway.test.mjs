import { test } from "node:test";
import assert from "node:assert/strict";
import { makeBankingHandler } from "../supabase/functions/shypit-banking/core.mjs";
const workspace = "a1111111-1111-4111-8111-111111111111";
function fixture(options = {}) {
  const state = {
      kind: "business",
      canManage: true,
      userId: "11111111-1111-4111-8111-111111111111",
      record: null,
      allow: true,
      started: true,
      providerReady: false,
      ...options,
    },
    calls = [];
  const response = (json, status = 200) =>
    new Response(JSON.stringify(json), { status });
  const handler = makeBankingHandler({
    supabaseUrl: "https://data.example.test",
    publicKey: "public-example",
    serviceKey: "server-example",
    stripeKey: options.key ?? "sk_test_example_only",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (url.includes("/rpc/")) {
        const fn = url.split("/").pop(),
          b = JSON.parse(init.body);
        if (fn === "shypit_banking_access")
          return response(
            {
              kind: state.kind,
              canManage: state.canManage,
              userId: state.userId,
            },
            state.allow && (!b.p_manage || state.canManage) ? 200 : 403,
          );
        if (fn === "shypit_banking_get") return response(state.record);
        if (fn === "shypit_banking_begin") return response(state.started);
        if (fn === "shypit_banking_save") {
          state.record = { provider_id: b.p_provider, setup_id: b.p_setup };
          return response(null);
        }
      }
      if (url.endsWith("/customers")) return response({ id: "cus_sample" });
      if (url.endsWith("/accounts")) return response({ id: "acct_sample" });
      if (url.includes("/checkout/sessions/"))
        return response({
          customer: state.mismatch ? "cus_other" : state.record.provider_id,
          setup_intent: {
            status: state.providerReady ? "succeeded" : "requires_action",
          },
          status: "complete",
        });
      if (url.endsWith("/checkout/sessions"))
        return response({
          id: "cs_test_sample",
          url: state.badUrl
            ? "https://attacker.example.test"
            : "https://checkout.stripe.com/c/pay/test_sample",
        });
      if (url.includes("/accounts/"))
        return response({ payouts_enabled: state.providerReady });
      if (url.endsWith("/account_links"))
        return response({ url: "https://connect.stripe.com/setup/s/sample" });
      throw Error("Unexpected upstream request");
    },
  });
  const call = async (
    body = { action: "status", workspaceId: workspace },
    headers = {},
  ) =>
    handler(
      new Request("https://api.example.test", {
        method: "POST",
        headers: {
          Authorization: "Bearer example-session",
          Origin: "https://adoblake.github.io",
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    );
  return { state, calls, call };
}
test("unconfigured or live secret keys fail closed without calling Stripe", async () => {
  for (const key of ["", "sk_live_example_only"]) {
    const f = fixture({ key });
    const r = await f.call();
    assert.equal((await r.json()).configured, false);
    assert.equal(f.calls.filter((c) => c.url.includes("stripe.com")).length, 0);
  }
});
test("unauthorized workspace or finance access never reaches private storage or Stripe", async () => {
  for (const options of [{ allow: false }, { canManage: false }]) {
    const f = fixture(options);
    const r = await f.call({ action: "start", workspaceId: workspace });
    assert.equal(r.status, 403);
    assert.equal(f.calls.length, 1);
  }
});
test("bank data, redirect injection, wrong origin and workspace IDs are rejected", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.call({
        action: "start",
        workspaceId: workspace,
        accountNumber: "sample-only",
      })
    ).status,
    400,
  );
  assert.equal(
    (await f.call(undefined, { Origin: "https://attacker.example.test" }))
      .status,
    403,
  );
  assert.equal(
    (await f.call({ action: "start", workspaceId: "invalid" })).status,
    400,
  );
  assert.equal(f.calls.length, 0);
});
test("business setup returns only an approved hosted URL and stores provider IDs", async () => {
  const f = fixture();
  const r = await f.call({ action: "start", workspaceId: workspace });
  assert.equal(r.status, 200);
  assert.equal(
    (await r.json()).url,
    "https://checkout.stripe.com/c/pay/test_sample",
  );
  assert.deepEqual(f.state.record, {
    provider_id: "cus_sample",
    setup_id: "cs_test_sample",
  });
  const stripe = f.calls.filter((c) => c.url.includes("stripe.com"));
  assert.ok(
    stripe.every(
      (c) => c.init.headers.Authorization === "Bearer sk_test_example_only",
    ),
  );
  assert.match(stripe.at(-1).init.body, /mode=setup/);
  assert.ok(!stripe.at(-1).init.body.includes("amount="));
});
test("bank verification requires provider confirmation and matching customer", async () => {
  const f = fixture({
    record: { provider_id: "cus_sample", setup_id: "cs_test_sample" },
  });
  assert.equal((await (await f.call()).json()).state, "verification_pending");
  f.state.providerReady = true;
  assert.equal((await (await f.call()).json()).state, "connected");
  f.state.mismatch = true;
  assert.equal((await f.call()).status, 503);
});
test("carrier onboarding stays hosted and payout readiness comes from Stripe", async () => {
  const f = fixture({ kind: "driver" });
  assert.match(
    (await (await f.call({ action: "start", workspaceId: workspace })).json())
      .url,
    /^https:\/\/connect.stripe.com\//,
  );
  assert.equal((await (await f.call()).json()).state, "verification_pending");
  f.state.providerReady = true;
  assert.equal((await (await f.call()).json()).state, "connected");
});
test("rate limiting and malformed provider URLs fail safely", async () => {
  const f = fixture({ started: false });
  assert.equal(
    (await f.call({ action: "start", workspaceId: workspace })).status,
    429,
  );
  assert.equal(f.calls.filter((c) => c.url.includes("stripe.com")).length, 0);
  const bad = fixture({ badUrl: true });
  assert.equal(
    (await bad.call({ action: "start", workspaceId: workspace })).status,
    503,
  );
});
