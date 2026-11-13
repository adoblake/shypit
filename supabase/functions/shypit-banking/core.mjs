// Server-only hosted banking setup. No charge, transfer or payout endpoint exists.
export function makeBankingHandler({
  supabaseUrl,
  publicKey,
  serviceKey,
  stripeKey = "",
  siteUrl = "https://adoblake.github.io/shypit/",
  fetchImpl = fetch,
}) {
  // Free sandbox only. Live keys are deliberately rejected.
  const mode = stripeKey.startsWith("sk_test_") ? "test" : null;
  const origin = new URL(siteUrl).origin,
    base = supabaseUrl.replace(/\/$/, "");
  return async (request) => {
    const headers = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "content-type,apikey,authorization",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
      Vary: "Origin",
    };
    const reply = (status, data) =>
      new Response(JSON.stringify(data), { status, headers });
    if (
      request.headers.get("origin") &&
      request.headers.get("origin") !== origin
    )
      return reply(403, { error: "Request not allowed." });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST")
      return reply(405, { error: "Request not allowed." });
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer "))
      return reply(401, { error: "Please sign in again." });
    async function rpc(name, body, privileged = false) {
      const r = await fetchImpl(base + "/rest/v1/rpc/" + name, {
        method: "POST",
        headers: {
          apikey: privileged ? serviceKey : publicKey,
          Authorization: privileged ? "Bearer " + serviceKey : authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) throw Error("Access or session could not be verified.");
      return r.status === 204 ? null : r.json();
    }
    async function stripe(path, params, key) {
      const r = await fetchImpl("https://api.stripe.com/v1/" + path, {
        method: params ? "POST" : "GET",
        headers: {
          Authorization: "Bearer " + stripeKey,
          "Stripe-Version": "2024-06-20",
          ...(params
            ? { "Content-Type": "application/x-www-form-urlencoded" }
            : {}),
          ...(key ? { "Idempotency-Key": key } : {}),
        },
        ...(params ? { body: new URLSearchParams(params).toString() } : {}),
        signal: AbortSignal.timeout(15000),
      });
      const data = await r.json();
      if (!r.ok) throw Error("Payment provider unavailable.");
      return data;
    }
    function safeUrl(url, type) {
      const u = new URL(url);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        !["checkout.stripe.com", "connect.stripe.com"].includes(u.hostname)
      )
        throw Error("Invalid provider response.");
      if (
        (u.port && u.port !== "443") ||
        u.hostname !==
          (type === "business" ? "checkout.stripe.com" : "connect.stripe.com")
      )
        throw Error("Invalid provider response.");
      return u.href;
    }
    try {
      const raw = await request.text();
      if (raw.length > 4096) return reply(413, { error: "Request too large." });
      let input;
      try {
        input = JSON.parse(raw);
      } catch {
        return reply(400, { error: "Invalid request." });
      }
      if (
        !input ||
        Object.keys(input).some(
          (k) => !["action", "workspaceId"].includes(k),
        ) ||
        !["status", "start"].includes(input.action) ||
        !/^[-a-f0-9]{36}$/i.test(input.workspaceId || "")
      )
        return reply(400, { error: "Invalid request." });
      let access;
      try {
        access = await rpc("shypit_banking_access", {
          p_workspace: input.workspaceId,
          p_manage: input.action === "start",
        });
      } catch {
        return reply(403, {
          error:
            "Only an authorized finance manager with a recent sign-in can manage this workspace’s banking. Sign out and sign in again, or contact your owner.",
        });
      }
      if (!mode)
        return reply(200, {
          configured: false,
          canManage: access.canManage,
          state: "unavailable",
        });
      if (!access.canManage)
        return reply(200, {
          configured: true,
          canManage: false,
          mode,
          state: "restricted",
        });
      let record = await rpc(
        "shypit_banking_get",
        { p_workspace: input.workspaceId, p_mode: mode },
        true,
      );
      if (input.action === "status") {
        if (!record?.provider_id)
          return reply(200, {
            configured: true,
            canManage: true,
            mode,
            state: "not_connected",
          });
        if (access.kind === "driver") {
          const account = await stripe(
            "accounts/" + encodeURIComponent(record.provider_id),
          );
          return reply(200, {
            configured: true,
            canManage: true,
            mode,
            state: account.payouts_enabled
              ? "connected"
              : "verification_pending",
          });
        }
        if (!record.setup_id)
          return reply(200, {
            configured: true,
            canManage: true,
            mode,
            state: "not_connected",
          });
        const session = await stripe(
          "checkout/sessions/" +
            encodeURIComponent(record.setup_id) +
            "?expand[]=setup_intent",
        );
        if (session.customer !== record.provider_id)
          throw Error("Provider account mismatch.");
        return reply(200, {
          configured: true,
          canManage: true,
          mode,
          state:
            session.setup_intent?.status === "succeeded"
              ? "connected"
              : session.status === "expired"
                ? "not_connected"
                : "verification_pending",
        });
      }
      const action =
        access.kind === "business" ? "business-setup" : "provider-onboarding";
      const started = await rpc(
        "shypit_banking_begin",
        {
          p_workspace: input.workspaceId,
          p_mode: mode,
          p_actor: access.userId,
          p_action: action,
        },
        true,
      );
      if (!started)
        return reply(429, {
          error: "Please wait one minute before opening banking setup again.",
        });
      let provider = record?.provider_id;
      if (!provider) {
        const data = await stripe(
          access.kind === "business" ? "customers" : "accounts",
          access.kind === "business"
            ? { "metadata[workspace_id]": input.workspaceId }
            : {
                type: "express",
                country: "US",
                business_type: "company",
                "capabilities[transfers][requested]": "true",
                "metadata[workspace_id]": input.workspaceId,
              },
          "shypit-" + mode + "-" + access.kind + "-" + input.workspaceId,
        );
        provider = data.id;
        if (
          typeof provider !== "string" ||
          !provider.startsWith(access.kind === "business" ? "cus_" : "acct_")
        )
          throw Error("Invalid provider account.");
        await rpc(
          "shypit_banking_save",
          {
            p_workspace: input.workspaceId,
            p_mode: mode,
            p_provider: provider,
            p_setup: null,
          },
          true,
        );
      }
      const returnUrl = siteUrl + "?banking=return";
      if (access.kind === "business") {
        const session = await stripe("checkout/sessions", {
          mode: "setup",
          customer: provider,
          currency: "usd",
          expires_at: String(Math.floor(Date.now() / 1000) + 1800),
          "payment_method_types[0]": "us_bank_account",
          success_url: returnUrl,
          cancel_url: siteUrl + "?banking=cancelled",
          client_reference_id: input.workspaceId,
        });
        const url = safeUrl(session.url, "business");
        await rpc(
          "shypit_banking_save",
          {
            p_workspace: input.workspaceId,
            p_mode: mode,
            p_provider: provider,
            p_setup: session.id,
          },
          true,
        );
        return reply(200, { url, mode });
      }
      const currentAccount = await stripe(
        "accounts/" + encodeURIComponent(provider),
      );
      if (currentAccount.payouts_enabled) {
        const dashboard = await stripe(
          "accounts/" + encodeURIComponent(provider) + "/login_links",
          {},
        );
        return reply(200, { url: safeUrl(dashboard.url, "driver"), mode });
      }
      const link = await stripe("account_links", {
        account: provider,
        refresh_url: siteUrl + "?banking=retry",
        return_url: returnUrl,
        type: "account_onboarding",
      });
      return reply(200, { url: safeUrl(link.url, "driver"), mode });
    } catch {
      return reply(503, {
        error:
          "Banking setup is unavailable. No bank details were saved by Shypit. Please try again later.",
      });
    }
  };
}
