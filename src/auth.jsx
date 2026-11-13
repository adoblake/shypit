import Admin from "./Admin";
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
import AccountAccess, {
  accountRequest,
  readRecoveryLink,
} from "./AccountAccess";
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
  const [adminProfile, setAdminProfile] = useState(null);
  const [recovery, setRecovery] = useState(readRecoveryLink);
  const [accessMode, setAccessMode] = useState(null);
  const [signInLocked, setSignInLocked] = useState(null);
  const [accountService, setAccountService] = useState("checking");
  const [config, setConfig] = useState(null),
    [configured, setConfigured] = useState(null),
    [stage, setStage] = useState("email"),
    [password, setPassword] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [pendingUser, setPendingUser] = useState(null),
    [memberships, setMemberships] = useState([]),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [account, setAccount] = useState(null),
    [data, setData] = useState(null),
    [saveState, setSaveState] = useState("");
  useEffect(() => {
    if (!signInLocked) return;
    const timer = setTimeout(
      () => setSignInLocked(null),
      Math.max(0, new Date(signInLocked).getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [signInLocked]);
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
  async function checkAccountService(currentConfig = config) {
    if (!currentConfig) return;
    setAccountService("checking");
    try {
      const response = await fetch(
        currentConfig.url.replace(/\/$/, "") +
          "/functions/v1/shypit-auth/health",
        {
          headers: { apikey: currentConfig.publicKey },
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        },
      );
      const result = await response.json();
      setAccountService(
        response.ok && result.ready === true ? "ready" : "unavailable",
      );
    } catch {
      setAccountService("unavailable");
    }
  }
  useEffect(() => {
    if (config) checkAccountService(config);
  }, [config]);
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
    setPendingUser(null);
    setMemberships([]);
    setAdminProfile(null);
    setPassword("");
    setShowPassword(false);
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
        await accountRequest(config, { action: "logout", accessToken: access });
      } catch {
        /* Local access is already cleared; the short-lived server permit still expires. */
      }
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
        if (account.role === "admin") {
          const profile = await adminRequest("shypit_admin_profile", {});
          if (!profile) throw Error();
          setAdminProfile(profile);
          return;
        }
        const rows = await api(
          "/rest/v1/memberships?select=workspace_id,role&user_id=eq." +
            encodeURIComponent(account.userId) +
            "&workspace_id=eq." +
            encodeURIComponent(account.workspace_id) +
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
    if (busy || !configured || accountService !== "ready") return;
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
    let profile = null;
    try {
      profile = await api("/rest/v1/rpc/shypit_admin_profile", {
        method: "POST",
        body: {},
        access: session.access_token,
      });
    } catch {
      /* Admin schema may not yet be deployed; regular access remains available. */
    }
    if (profile?.capabilities?.length)
      members.unshift({
        workspace_id: "admin",
        role: "admin",
        display_name: "Platform administration",
      });
    setAdminProfile(profile);
    if (
      !members.length ||
      members.some(
        (member) => !["business", "driver", "admin"].includes(member.role),
      )
    )
      throw Error();
    if (attempt !== epoch.current) return;
    token.current = session.access_token;
    expires.current = Math.min(
      Number(session.expires_at) * 1000 || Date.now() + 900000,
      Date.now() + 900000,
    );
    setMemberships(members);
    setPassword("");
    setShowPassword(false);
    if (members.length > 1) {
      setPendingUser(user);
      return;
    }
    await openWorkspace(members[0], user, attempt);
  }
  async function openWorkspace(member, user, attempt = epoch.current) {
    setBusy(true);
    setError("");
    try {
      if (member.role === "admin") {
        const profile = await adminRequest("shypit_admin_profile", {});
        if (!profile || !profile.capabilities?.length) throw Error();
        if (attempt !== epoch.current) return;
        setAdminProfile(profile);
        accountRef.current = { ...member, userId: user.id, email: user.email };
        setAccount(accountRef.current);
        setData({});
        setPendingUser(null);
        return;
      }
      const rows = await api(
        "/rest/v1/workspaces?select=id,data,revision&id=eq." +
          encodeURIComponent(member.workspace_id),
        { access: token.current },
      );
      if (rows.length !== 1 || !validData(rows[0].data)) throw Error();
      if (attempt !== epoch.current) return;
      revision.current = rows[0].revision;
      serverData.current = rows[0].data;
      accountRef.current = { ...member, userId: user.id, email: user.email };
      setAccount(accountRef.current);
      setData(rows[0].data);
      setCode("");
      setPendingUser(null);
    } catch {
      if (attempt === epoch.current) {
        setError(
          "Unable to open this workspace. Your access may have changed.",
        );
      }
    } finally {
      setBusy(false);
    }
  }
  async function passwordSignIn(e) {
    e.preventDefault();
    if (busy || !configured || accountService !== "ready") return;
    setBusy(true);
    setError("");
    setMessage("");
    const attempt = epoch.current;
    try {
      const session = await accountRequest(config, {
        action: "signin",
        email: email.trim().toLowerCase(),
        password,
      });
      await establishSession(session, attempt);
    } catch (e) {
      setPassword("");
      setShowPassword(false);
      setError(
        e.status === 429
          ? e.message
          : e.status === 400
            ? "Unable to sign in. Check your email and password, or confirm your preview invitation."
            : "Account services are not activated or are unavailable. Please contact your administrator.",
      );
      if (e.status === 429)
        setSignInLocked(
          e.lockedUntil || new Date(Date.now() + 86400000).toISOString(),
        );
    } finally {
      setBusy(false);
    }
  }
  async function switchWorkspace() {
    setBusy(true);
    await queue.current;
    if (!token.current) {
      setBusy(false);
      return;
    }
    const session = {
      access_token: token.current,
      expires_at: expires.current / 1000,
    };
    setAccount(null);
    setData(null);
    try {
      await establishSession(session, epoch.current);
    } catch {
      await signOut("Your access changed. Please sign in again.");
    } finally {
      setBusy(false);
    }
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
  async function adminRequest(name, body) {
    return api("/rest/v1/rpc/" + name, { method: "POST", body });
  }
  if (account && data)
    return (
      <Workspace.Provider value={{ data, update }}>
        <div className="session-strip">
          <span>
            <ShieldCheck size={17} />
            Signed in as {account.display_name || account.email} ·{" "}
            {account.role === "admin"
              ? "Admin"
              : account.role === "business"
                ? "Business"
                : "Carrier"}
          </span>
          <span role="status">{saveState}</span>
          {memberships.length > 1 && (
            <button onClick={switchWorkspace} disabled={busy}>
              Switch workspace
            </button>
          )}
          <button onClick={() => signOut()}>
            <SignOut size={18} />
            Sign out
          </button>
        </div>
        {account.role === "admin" ? (
          <Admin
            request={adminRequest}
            profile={adminProfile}
            onAccessChanged={async () => {
              try {
                const p = await adminRequest("shypit_admin_profile", {});
                if (!p) await signOut("Your admin access changed.");
                else setAdminProfile(p);
              } catch {
                await signOut("Please sign in again.");
              }
            }}
          />
        ) : (
          children({ account, initialData: data })
        )}
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
          {!(accessMode || recovery) && (
            <>
              <p className="eyebrow">WELCOME TO SHYPIT</p>
              <h2>
                {pendingUser
                  ? "Choose your workspace."
                  : "Sign in to your workspace."}
              </h2>
              <p className="muted">
                Use the email address invited by your business or carrier
                administrator.
              </p>
            </>
          )}
          {configured && !account && accountService !== "ready" && (
            <div className="account-availability" role="status">
              <strong>
                {accountService === "checking"
                  ? "Checking account service…"
                  : "Account setup is not ready yet."}
              </strong>
              <p>
                {accountService === "checking"
                  ? "Please wait while we check the secure connection."
                  : "The secure authentication service is unavailable. No setup or recovery email has been confirmed. Your administrator needs to connect the service before you can continue."}
              </p>
              <button
                type="button"
                className="text-button"
                onClick={() => checkAccountService()}
                disabled={accountService === "checking"}
              >
                Check connection again
              </button>
            </div>
          )}
          {configured && (accessMode || recovery) ? (
            <AccountAccess
              key={accessMode || "password-link"}
              config={config}
              available={accountService === "ready"}
              mode={accessMode || "reset"}
              email={email}
              setEmail={setEmail}
              recovery={recovery}
              onBack={() => {
                setAccessMode(null);
                setRecovery(null);
                setError("");
                setMessage("");
              }}
            />
          ) : pendingUser ? (
            <div className="workspace-choices">
              <p className="muted">
                Only workspaces assigned to your account are available.
              </p>
              {memberships.map((member) => (
                <button
                  className="workspace-choice"
                  key={member.workspace_id}
                  onClick={() => openWorkspace(member, pendingUser)}
                  disabled={busy}
                >
                  <span>
                    <strong>
                      {member.role === "admin"
                        ? "Admin workspace"
                        : member.role === "business"
                          ? "Company workspace"
                          : "Carrier / LLC workspace"}
                    </strong>
                    <small>{member.display_name}</small>
                  </span>
                  <ArrowRight />
                </button>
              ))}
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="text-button" onClick={() => signOut()}>
                Sign out
              </button>
            </div>
          ) : configured === null ? (
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
              {config.passwordEnabled !== false && (
                <form onSubmit={passwordSignIn} className="password-form">
                  <label htmlFor="login-email">Email address</label>
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    required
                    maxLength={254}
                    value={email}
                    disabled={busy}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setSignInLocked(false);
                    }}
                  />
                  <label htmlFor="login-password">Password</label>
                  <div className="password-input">
                    <input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      disabled={busy}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  <button
                    type="submit"
                    className="primary"
                    disabled={
                      busy || signInLocked || accountService !== "ready"
                    }
                  >
                    {busy ? "Signing in…" : "Sign in"}
                    <ArrowRight />
                  </button>
                  <div className="account-links">
                    <button
                      type="button"
                      onClick={() => setAccessMode("setup")}
                    >
                      Create your password
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccessMode("reset")}
                    >
                      Forgot password?
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccessMode("email-help")}
                    >
                      Forgot email?
                    </button>
                  </div>
                  <p className="auth-note">
                    10 failed attempts lock sign-in for 24 hours. Limits are
                    enforced by the server.
                  </p>
                </form>
              )}
              {config.googleEnabled && (
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
                </>
              )}
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
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setSignInLocked(false);
                    }}
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
