import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  LockKey,
  ArrowRight,
  SignOut,
  ShieldCheck,
} from "@phosphor-icons/react";
const Workspace = createContext(null);
export function useWorkspaceField(field) {
  const value = useContext(Workspace);
  return [value.data[field] ?? [], (update) => value.update(field, update)];
}
function validConfig(c) {
  try {
    const u = new URL(c.url);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== "/"
    )
      return false;
    if (typeof c.publicKey !== "string" || !c.publicKey) return false;
    if (c.publicKey.startsWith("sb_secret_")) return false;
    if (!c.publicKey.startsWith("sb_publishable_")) {
      const payload = JSON.parse(
        atob(
          c.publicKey.split(".")[1].replaceAll("-", "+").replaceAll("_", "/"),
        ),
      );
      if (payload.role !== "anon") return false;
    }
    return true;
  } catch {
    return false;
  }
}
function validData(d) {
  return (
    d &&
    Array.isArray(d.shipments) &&
    d.shipments.length > 0 &&
    Array.isArray(d.loads) &&
    d.loads.length > 0 &&
    Array.isArray(d.jobs) &&
    (!Object.hasOwn(d, "packages") || Array.isArray(d.packages))
  );
}
export function AuthGate({ children }) {
  const [config, setConfig] = useState(null),
    [configured, setConfigured] = useState(null),
    [stage, setStage] = useState("email"),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [account, setAccount] = useState(null),
    [data, setData] = useState(null),
    [saveState, setSaveState] = useState("");
  const callbackHandled = useRef(false);
  const token = useRef(null),
    accountRef = useRef(null),
    queue = useRef(Promise.resolve()),
    revision = useRef(0),
    serverData = useRef(null),
    epoch = useRef(0),
    expires = useRef(0);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [account]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(new URL("auth-config.json", document.baseURI), {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((c) => {
        setConfigured(validConfig(c));
        if (validConfig(c)) setConfig(c);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setConfigured(false);
      });
    for (const key of [
      "shypit.shipments.v1",
      "shypit.jobs.v1",
      "shypit.packages.v1",
    ])
      try {
        localStorage.removeItem(key);
      } catch {}
    return () => controller.abort();
  }, []);
  async function api(
    path,
    { method = "GET", body, access = token.current, signal } = {},
  ) {
    const r = await fetch(config.url.replace(/\/$/, "") + path, {
      method,
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: signal || AbortSignal.timeout(20000),
      headers: {
        apikey: config.publicKey,
        ...(access ? { Authorization: "Bearer " + access } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
        Prefer: "return=representation",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!r.ok) throw new Error("Request failed");
    if (r.status === 204) return null;
    return r.json();
  }
  function clearSession(reason = "") {
    epoch.current++;
    token.current = null;
    accountRef.current = null;
    expires.current = 0;
    setAccount(null);
    setData(null);
    serverData.current = null;
    setStage("email");
    setCode("");
    setMessage(reason);
    setError("");
    setSaveState("");
    queue.current = Promise.resolve();
  }
  async function signOut(reason = "You have been signed out.") {
    const access = token.current;
    clearSession(reason);
    if (access)
      try {
        await api("/auth/v1/logout", { method: "POST", access });
      } catch {
        /* Local access is already cleared. The short-lived provider token expires separately. */
      }
  }
  useEffect(() => {
    if (!account) return;
    let last = Date.now();
    const mark = () => {
      last = Date.now();
    };
    for (const name of ["pointerdown", "keydown", "touchstart"])
      window.addEventListener(name, mark, { passive: true });
    const check = () => {
      if (Date.now() >= expires.current || Date.now() - last >= 15 * 60 * 1000)
        signOut("Your session ended. Sign in again to continue.");
    };
    const timer = setInterval(check, 1000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      for (const name of ["pointerdown", "keydown", "touchstart"])
        window.removeEventListener(name, mark);
    };
  }, [account]);
  useEffect(() => {
    if (!account) return;
    const current = epoch.current;
    const checkMembership = async () => {
      try {
        const rows = await api(
          "/rest/v1/memberships?select=workspace_id,role&user_id=eq." +
            encodeURIComponent(account.userId) +
            "&active=eq.true",
        );
        if (
          rows.length !== 1 ||
          rows[0].workspace_id !== account.workspace_id ||
          rows[0].role !== account.role
        )
          throw Error();
      } catch {
        if (current === epoch.current)
          signOut(
            "Your workspace access changed. Contact your administrator before signing in again.",
          );
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") checkMembership();
    };
    const timer = setInterval(checkMembership, 60000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [account]);
  async function sendCode(e) {
    e.preventDefault();
    if (busy || !configured) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/auth/v1/otp", {
        method: "POST",
        body: { email: email.trim().toLowerCase(), create_user: false },
        access: null,
      });
    } catch {
      /* Same response for unknown accounts and failed requests to avoid enumeration. */
    } finally {
      setStage("code");
      setBusy(false);
      setMessage(
        "If this email has an active invitation, a sign-in code will arrive shortly. Check your inbox and spam folder.",
      );
    }
  }
  async function establishSession(session, attempt) {
    if (!session.access_token || attempt !== epoch.current) throw Error();
    const user = await api("/auth/v1/user", { access: session.access_token });
    const members = await api(
      "/rest/v1/memberships?select=workspace_id,role,display_name&user_id=eq." +
        encodeURIComponent(user.id) +
        "&active=eq.true",
      { access: session.access_token },
    );
    if (
      members.length !== 1 ||
      !["business", "driver"].includes(members[0].role)
    )
      throw Error();
    const member = members[0];
    const rows = await api(
      "/rest/v1/workspaces?select=id,data,revision&id=eq." +
        encodeURIComponent(member.workspace_id),
      { access: session.access_token },
    );
    if (rows.length !== 1 || !validData(rows[0].data)) throw Error();
    if (attempt !== epoch.current) return;
    token.current = session.access_token;
    expires.current = Math.min(
      Number(session.expires_at) * 1000 || Date.now() + 900000,
      Date.now() + 900000,
    );
    revision.current = rows[0].revision;
    serverData.current = rows[0].data;
    accountRef.current = { ...member, userId: user.id, email: user.email };
    setAccount(accountRef.current);
    setData(rows[0].data);
    setCode("");
  }
  async function verify(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const attempt = epoch.current;
    try {
      const session = await api("/auth/v1/verify", {
        method: "POST",
        body: {
          email: email.trim().toLowerCase(),
          token: code.trim(),
          type: "email",
        },
        access: null,
      });
      await establishSession(session, attempt);
    } catch {
      setError(
        "Unable to sign in. Check your code or ask your organization administrator to confirm your access.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function beginGoogle() {
    setBusy(true);
    setError("");
    try {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const verifier = btoa(String.fromCharCode(...bytes))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(verifier),
      );
      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
      sessionStorage.setItem(
        "shypit.pkce",
        JSON.stringify({ verifier, created: Date.now() }),
      );
      const url = new URL(config.url.replace(/\/$/, "") + "/auth/v1/authorize");
      url.searchParams.set("provider", "google");
      url.searchParams.set("redirect_to", location.origin + location.pathname);
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "s256");
      location.assign(url);
    } catch {
      setError("Unable to start sign-in. Allow session storage and try again.");
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!config || callbackHandled.current) return;
    const params = new URLSearchParams(location.search);
    if (!params.has("code") && !params.has("error")) return;
    callbackHandled.current = true;
    const authCode = params.get("code");
    history.replaceState(null, "", location.pathname);
    let pending;
    try {
      pending = JSON.parse(sessionStorage.getItem("shypit.pkce"));
    } catch {}
    sessionStorage.removeItem("shypit.pkce");
    if (
      !authCode ||
      !pending?.verifier ||
      Date.now() - pending.created > 900000
    ) {
      setError("Sign-in expired or was cancelled. Please try again.");
      return;
    }
    setBusy(true);
    const attempt = epoch.current;
    api("/auth/v1/token?grant_type=pkce", {
      method: "POST",
      access: null,
      body: { auth_code: authCode, code_verifier: pending.verifier },
    })
      .then((session) => establishSession(session, attempt))
      .catch(() =>
        setError(
          "Unable to sign in. Ask your administrator to confirm your workspace invitation.",
        ),
      )
      .finally(() => setBusy(false));
  }, [config]);
  function update(field, updater) {
    const owner = accountRef.current;
    if (!owner || !["shipments", "jobs", "packages"].includes(field)) return;
    const next =
      typeof updater === "function" ? updater(data[field] ?? []) : updater;
    setData((current) => ({ ...current, [field]: next }));
    setSaveState("Saving…");
    const requestEpoch = epoch.current;
    queue.current = queue.current
      .then(async () => {
        if (requestEpoch !== epoch.current) return;
        const merged = { ...serverData.current, [field]: next };
        const rows = await api(
          "/rest/v1/workspaces?id=eq." +
            encodeURIComponent(owner.workspace_id) +
            "&revision=eq." +
            revision.current,
          { method: "PATCH", body: { data: merged } },
        );
        if (requestEpoch !== epoch.current) return;
        if (!rows || rows.length !== 1) throw Error();
        serverData.current = rows[0].data;
        revision.current = rows[0].revision;
        setSaveState("Saved securely");
      })
      .catch(() => {
        if (requestEpoch === epoch.current) {
          signOut(
            "Your changes could not be saved. Sign in to reload the workspace before trying again.",
          );
        }
      });
  }
  if (account && data)
    return (
      <Workspace.Provider value={{ data, update }}>
        <div className="session-strip">
          <span>
            <ShieldCheck size={17} />
            Signed in as {account.display_name || account.email} ·{" "}
            {account.role === "business" ? "Business" : "Carrier"}
          </span>
          <span role="status">{saveState}</span>
          <button onClick={() => signOut()}>
            <SignOut size={18} />
            Sign out
          </button>
        </div>
        {children({ account, initialData: data })}
      </Workspace.Provider>
    );
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a href="#" className="brand">
          Shypit
        </a>
        <div>
          <p className="eyebrow">YOUR PEOPLE. YOUR FREIGHT.</p>
          <h1>
            Good work starts
            <br />
            with trust.
          </h1>
          <p>
            A private workspace for your shipping team and the carriers who keep
            it moving.
          </p>
        </div>
        <span>
          <ShieldCheck />
          Invitation-only access
        </span>
      </section>
      <section className="auth-form-panel">
        <div className="auth-form">
          <span className="auth-lock">
            <LockKey size={30} />
          </span>
          <p className="eyebrow">WELCOME TO SHYPIT</p>
          <h2>Sign in to your workspace.</h2>
          <p className="muted">
            Use the email address invited by your business or carrier
            administrator.
          </p>
          {configured === null ? (
            <p role="status">Checking sign-in availability…</p>
          ) : !configured ? (
            <div className="auth-setup" role="status">
              <strong>Sign-in is being set up.</strong>
              <p>
                This workspace is locked until the identity service is
                connected. Please contact your Shypit administrator.
              </p>
            </div>
          ) : (
            <>
              <button
                className="primary google-signin"
                onClick={beginGoogle}
                disabled={busy}
              >
                {busy ? "Please wait…" : "Continue with Google"}
                <ArrowRight />
              </button>
              <p className="helper">
                Use the Google account associated with your invitation.
              </p>
              {error && !config.emailOtpEnabled && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              {message && !config.emailOtpEnabled && (
                <p role="status">{message}</p>
              )}
              {config.emailOtpEnabled && (
                <form onSubmit={stage === "email" ? sendCode : verify}>
                  <label htmlFor="email">Work email</label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    disabled={stage === "code" || busy}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  {stage === "code" && (
                    <>
                      <label htmlFor="code">Email verification code</label>
                      <input
                        id="code"
                        autoFocus
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                        pattern="[0-9]{6,10}"
                        maxLength={10}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        aria-describedby="code-help"
                      />
                      <p className="helper" id="code-help">
                        Enter the code from your sign-in email. Codes expire;
                        use the latest one you received.
                      </p>
                    </>
                  )}
                  {message && (
                    <p role="status" className="auth-message">
                      {message}
                    </p>
                  )}
                  {error && (
                    <p role="alert" className="error">
                      {error}
                    </p>
                  )}
                  <button type="submit" className="primary" disabled={busy}>
                    {busy
                      ? "Please wait…"
                      : stage === "email"
                        ? "Send sign-in code"
                        : "Verify & sign in"}
                    <ArrowRight />
                  </button>
                  {stage === "code" && (
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        setStage("email");
                        setCode("");
                        setError("");
                        setMessage("");
                      }}
                    >
                      Change email or request a new code
                    </button>
                  )}
                </form>
              )}
            </>
          )}
          {!configured && message && <p role="status">{message}</p>}
          <p className="auth-note">
            No account? Ask your organization administrator for an invitation.
            Workspace access requires an invitation.
          </p>
          <p className="auth-note">
            <LockKey />
            Sessions end after 15 minutes of inactivity. Signing in again is
            required after a refresh.
          </p>
        </div>
      </section>
    </main>
  );
}
