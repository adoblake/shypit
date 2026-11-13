// Server-only. Never import this module into the frontend bundle.
const genericMail =
  "If this address has approved access, check its inbox for a secure link. If no email arrives, contact your administrator.";
const genericFailure =
  "Unable to complete this request. Check your details or contact your administrator.";
const bucket = {
  signin: "sign-in",
  setup: "setup-request",
  reset: "reset-request",
  complete: "password-complete",
  "email-help": "email-help",
};
const digest = async (value) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export const emailKey = (email) => digest(email.trim().toLowerCase());
export function makeAuthHandler({
  supabaseUrl,
  serviceKey,
  publicKey,
  siteUrl,
  fetchImpl = fetch,
}) {
  const base = supabaseUrl.replace(/\/$/, "");
  const origin = new URL(siteUrl).origin;
  return async (request) => {
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "content-type,apikey",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
      Vary: "Origin",
      "Cache-Control": "no-store",
    };
    const reply = (status, body, headers = {}) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          ...cors,
          "Content-Type": "application/json",
          ...(status === 429 && body.lockedUntil
            ? {
                "Retry-After": String(
                  Math.max(
                    1,
                    Math.ceil(
                      (new Date(body.lockedUntil).getTime() - Date.now()) /
                        1000,
                    ),
                  ),
                ),
              }
            : {}),
          ...headers,
        },
      });
    if (
      request.headers.get("origin") &&
      request.headers.get("origin") !== origin
    )
      return reply(403, { error: genericFailure });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply(405, { error: genericFailure });
    let reservation;
    async function upstream(
      path,
      { body, access = serviceKey, admin = true } = {},
    ) {
      const response = await fetchImpl(base + path, {
        method: body ? "POST" : "GET",
        headers: {
          apikey: admin ? serviceKey : publicKey,
          Authorization: "Bearer " + access,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15000),
      });
      let json;
      try {
        json = await response.json();
      } catch {
        json = null;
      }
      return { ok: response.ok, status: response.status, json };
    }
    async function rpc(name, body) {
      const r = await upstream("/rest/v1/rpc/" + name, { body });
      if (!r.ok) throw Error("Security service unavailable");
      return r.json;
    }
    try {
      const reader = request.body?.getReader();
      const chunks = [];
      let size = 0;
      if (reader)
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 12000) {
            await reader.cancel();
            return reply(413, { error: genericFailure });
          }
          chunks.push(value);
        }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const raw = new TextDecoder().decode(bytes);
      const input = JSON.parse(raw);
      if (!input || typeof input !== "object" || Array.isArray(input))
        return reply(400, { error: genericFailure });
      const action = input.action,
        email = String(input.email || "")
          .trim()
          .toLowerCase();
      if (action === "logout") {
        if (typeof input.accessToken === "string") {
          const identity = await upstream("/auth/v1/user", {
            access: input.accessToken,
            admin: false,
          });
          if (identity.ok) {
            const claims = JSON.parse(
              atob(
                input.accessToken
                  .split(".")[1]
                  .replaceAll("-", "+")
                  .replaceAll("_", "/"),
              ),
            );
            if (claims.session_id)
              await rpc("shypit_revoke_session", {
                p_session_id: claims.session_id,
                p_user_id: identity.json.id,
              });
          }
        }
        return reply(200, { message: "Signed out." });
      }
      if (
        !bucket[action] ||
        email.length > 254 ||
        !/^\S+@\S+\.\S+$/.test(email)
      )
        return reply(400, { error: genericFailure });
      const key = await emailKey(email);
      const start = await rpc("shypit_auth_begin", {
        p_email_key: key,
        p_action: bucket[action],
      });
      if (!start.allowed)
        return reply(
          429,
          {
            error: "Too many attempts. This process is locked for 24 hours.",
            lockedUntil: start.locked_until,
          },
          {},
        );
      reservation = start.reservation;
      const finish = (success) =>
        rpc("shypit_auth_finish", {
          p_reservation: reservation,
          p_success: success,
        });
      const invitations = await rpc("shypit_invitation_lookup", {
        p_email_key: key,
      });
      if (action === "setup" || action === "reset") {
        if (invitations.length) {
          let sent;
          if (action === "setup")
            sent = await upstream(
              "/auth/v1/invite?redirect_to=" +
                encodeURIComponent(siteUrl + "?flow=setup"),
              { body: { email } },
            );
          if (action === "reset" || sent?.status === 422)
            sent = await upstream(
              "/auth/v1/recover?redirect_to=" +
                encodeURIComponent(siteUrl + "?flow=reset"),
              { body: { email }, admin: false, access: publicKey },
            );
          if (!sent?.ok)
            console.warn(
              "Shypit authentication email delivery unavailable; check provider SMTP settings.",
            );
        }
        return reply(200, { message: genericMail });
      }
      if (action === "email-help") {
        const name = String(input.name || "").trim(),
          organization = String(input.organization || "").trim();
        if (!name || !organization)
          return reply(400, { error: genericFailure });
        await rpc("shypit_record_email_help", {
          p_email_key: key,
          p_name: name,
          p_organization: organization,
          p_contact: email,
        });
        return reply(200, {
          message:
            "Your access request has been recorded for administrator review. No registered email address is disclosed. An administrator must verify your identity before responding.",
        });
      }
      if (action === "signin") {
        if (
          typeof input.password !== "string" ||
          input.password.length > 1024
        ) {
          await finish(false);
          return reply(400, { error: genericFailure });
        }
        const signed = await upstream("/auth/v1/token?grant_type=password", {
          body: { email, password: input.password },
          admin: false,
          access: publicKey,
        });
        if (!signed.ok || !signed.json?.access_token) {
          const result = await finish(false);
          return reply(result.locked_until ? 429 : 400, {
            error: result.locked_until
              ? "Too many attempts. This process is locked for 24 hours."
              : genericFailure,
            ...(result.locked_until
              ? { lockedUntil: result.locked_until }
              : {}),
          });
        }
        // Validate identity with GoTrue before reading any JWT claim or granting an application session.
        const identity = await upstream("/auth/v1/user", {
          access: signed.json.access_token,
          admin: false,
        });
        if (!identity.ok || identity.json?.email?.toLowerCase() !== email) {
          await finish(false);
          return reply(400, { error: genericFailure });
        }
        const user = identity.json;
        await rpc("shypit_activate_invitation", {
          p_email_key: key,
          p_user_id: user.id,
        });
        // JWT came directly from verified GoTrue, not from caller input.
        const claims = JSON.parse(
          atob(
            signed.json.access_token
              .split(".")[1]
              .replaceAll("-", "+")
              .replaceAll("_", "/"),
          ),
        );
        if (!claims.session_id || !claims.exp)
          throw Error("Missing session identity");
        const allowed = await rpc("shypit_permit_session", {
          p_session_id: claims.session_id,
          p_user_id: user.id,
          p_email_key: key,
          p_expires_at: new Date(claims.exp * 1000).toISOString(),
        });
        if (!allowed) {
          await finish(false);
          return reply(400, { error: genericFailure });
        }
        const ended = await finish(true);
        if (!ended.allowed)
          return reply(429, {
            error: "Too many attempts. This process is locked for 24 hours.",
            lockedUntil: ended.locked_until,
          });

        return reply(200, {
          access_token: signed.json.access_token,
          expires_at: Math.min(claims.exp, Math.floor(Date.now() / 1000) + 900),
        });
      }
      if (action === "complete") {
        if (
          typeof input.password !== "string" ||
          input.password.trim().length < 12 ||
          input.password.length > 128
        ) {
          await finish(false);
          return reply(400, {
            error: "Use a password between 12 and 128 characters.",
          });
        }
        let access = input.accessToken;
        if (input.tokenHash) {
          if (!["invite", "recovery"].includes(input.type)) {
            await finish(false);
            return reply(400, { error: genericFailure });
          }
          const verified = await upstream("/auth/v1/verify", {
            body: { token_hash: input.tokenHash, type: input.type },
            admin: false,
            access: publicKey,
          });
          if (!verified.ok) {
            await finish(false);
            return reply(400, { error: genericFailure });
          }
          access = verified.json?.access_token;
        }
        if (typeof access !== "string" || access.length > 10000) {
          await finish(false);
          return reply(400, { error: genericFailure });
        }
        const identity = await upstream("/auth/v1/user", {
          access,
          admin: false,
        });
        if (
          !identity.ok ||
          identity.json?.email?.toLowerCase() !== email ||
          !invitations.length
        ) {
          await finish(false);
          return reply(400, { error: genericFailure });
        }
        const receipt = await rpc("shypit_consume_recovery", {
          p_token_key: await digest(access),
        });
        if (!receipt) {
          await finish(false);
          return reply(400, { error: genericFailure });
        }
        const completion = await finish(true);
        if (!completion.allowed)
          return reply(429, {
            error: "Too many attempts. This process is locked for 24 hours.",
            lockedUntil: completion.locked_until,
          });
        const updated = await fetchImpl(base + "/auth/v1/user", {
          method: "PUT",
          headers: {
            apikey: publicKey,
            Authorization: "Bearer " + access,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ password: input.password }),
          signal: AbortSignal.timeout(15000),
        });
        if (!updated.ok) {
          await finish(false);
          return reply(400, { error: genericFailure });
        }
        await rpc("shypit_activate_invitation", {
          p_email_key: key,
          p_user_id: identity.json.id,
        });
        return reply(200, {
          message:
            "Your password is set. Return to sign-in and use your email and new password.",
        });
      }
    } catch {
      if (reservation)
        try {
          await rpc("shypit_auth_finish", {
            p_reservation: reservation,
            p_success: false,
          });
        } catch {}
      return reply(503, {
        error:
          "Account services are unavailable. No access was granted. Please try again later.",
      });
    }
  };
}
