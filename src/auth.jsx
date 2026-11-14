import {
  rememberBanking,
  bankingDestination,
  clearBankingDestination,
} from "./banking-return";
import Brand from "./Brand";
import SessionRenewal from "./SessionRenewal";
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
export function SessionWarning() {
  const { session } = useContext(Workspace);
  return (
    <>
      {session.warning && (
        <section
          className="session-warning"
          aria-label="Session expiry warning"
        >
          <p role="alert">
            Your secure session ends in about two minutes. Choose Keep working
            to add two minutes, or sign in again for a new session.
          </p>
          <button onClick={session.extend} disabled={session.extending}>
            {session.extending ? "Extending…" : "Keep working"}
          </button>
          <button onClick={session.renew}>Sign in again</button>
        </section>
      )}
      {session.message && (
        <p className="session-extension" role="status">
          {session.message}
        </p>
      )}
    </>
  );
}
export function useMarket() {
  return useContext(Workspace).marketRequest;
}
export function useBanking() {
  return useContext(Workspace);
}
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
  const [extending, setExtending] = useState(false);
  const [extensionMessage, setExtensionMessage] = useState("");
  const [sessionWarning, setSessionWarning] = useState(false);
  const [sessionLocked, setSessionLocked] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [loginKind, setLoginKind] = useState("workspace");
  const [initialPage, setInitialPage] = useState(null);
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
  useEffect(() => {
    if (!sessionLocked) return;
    const previousTitle = document.title;
    document.title = "Session locked | Shypit";
    return () => {
      document.title = previousTitle;
    };
  }, [sessionLocked]);
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
  const firstAuthView = useRef(true);
  useEffect(() => {
    if (!account)
      document.title = `${recovery ? "Choose your password" : accessMode === "email-help" ? "Account email help" : accessMode === "setup" ? "Create your password" : accessMode === "reset" ? "Reset your password" : pendingUser ? "Choose your workspace" : loginKind === "admin" ? "Admin sign-in" : "Sign in"} | Shypit`;
    if (firstAuthView.current) {
      firstAuthView.current = false;
      return;
    }
    if (!account) document.querySelector(".auth-form h1")?.focus();
  }, [accessMode, recovery, pendingUser, loginKind, account]);
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
    setSessionWarning(false);
    setSessionLocked(false);
    setRenewOpen(false);
    setExtensionMessage("");
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
    if (!account || sessionLocked) return;
    let last = Date.now();
    const mark = () => {
      last = Date.now();
    };
    for (const name of ["pointerdown", "keydown", "touchstart"])
      window.addEventListener(name, mark, { passive: true });
    const check = () => {
      const remaining = Math.min(
        expires.current - Date.now(),
        15 * 60 * 1000 - (Date.now() - last),
      );
      setSessionWarning(remaining > 0 && remaining <= 120000);
      if (remaining <= 0) {
        const old = token.current;
        token.current = null;
        setSessionLocked(true);
        setRenewOpen(true);
        if (old)
          accountRequest(config, { action: "logout", accessToken: old }).catch(
            () => {},
          );
      }
    };
    const timer = setInterval(check, 1000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      for (const name of ["pointerdown", "keydown", "touchstart"])
        window.removeEventListener(name, mark);
    };
  }, [account, sessionLocked]);
  useEffect(() => {
    if (!account || sessionLocked) return;
    const current = epoch.current;
    const checkMembership = async () => {
      const checkingToken = token.current;
      if (!checkingToken || Date.now() >= expires.current) return;
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
        if (
          current === epoch.current &&
          checkingToken === token.current &&
          Date.now() < expires.current
        )
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
  }, [account, sessionLocked]);
  async function extendSession() {
    if (extending || sessionLocked) return;
    setExtending(true);
    const parentDialog = document.activeElement?.closest("dialog");
    const attempt = epoch.current;
    try {
      const result = await api("/rest/v1/rpc/shypit_extend_session", {
        method: "POST",
        body: {},
      });
      if (attempt !== epoch.current || !token.current) return;
      const end = Number(result?.expires_at) * 1000;
      if (
        !Number.isFinite(end) ||
        end <= expires.current ||
        end > Date.now() + 241000
      )
        throw Error();
      expires.current = end;
      setSessionWarning(false);
      setExtensionMessage(
        "Session extended by two minutes. Your work stays open.",
      );
      requestAnimationFrame(() => {
        const target =
          parentDialog?.querySelector("input, select, .close") ||
          document.getElementById("main-content");
        target?.focus();
      });
    } catch {
      if (attempt === epoch.current) setRenewOpen(true);
    } finally {
      setExtending(false);
    }
  }
  async function renewSession(password) {
    const current = accountRef.current;
    const attempt = epoch.current;
    let fresh;
    try {
      fresh = await accountRequest(config, {
        action: "signin",
        email: current.email,
        password,
      });
      const user = await api("/auth/v1/user", { access: fresh.access_token });
      if (user.id !== current.userId) throw Error("Identity changed");
      if (current.role === "admin") {
        const profile = await api("/rest/v1/rpc/shypit_admin_profile", {
          method: "POST",
          body: {},
          access: fresh.access_token,
        });
        if (!profile?.capabilities?.length) throw Error("Access changed");
        setAdminProfile(profile);
      } else {
        const members = await api(
          "/rest/v1/memberships?select=workspace_id,role,display_name&user_id=eq." +
            encodeURIComponent(user.id) +
            "&active=eq.true",
          { access: fresh.access_token },
        );
        if (
          !members.some(
            (m) =>
              m.workspace_id === current.workspace_id &&
              m.role === current.role,
          )
        )
          throw Error("Access changed");
      }
      if (attempt !== epoch.current) throw Error("Session changed");
      const old = token.current;
      token.current = fresh.access_token;
      expires.current = Math.min(fresh.expires_at * 1000, Date.now() + 900000);
      setSessionLocked(false);
      setSessionWarning(false);
      setRenewOpen(false);
      // Change the account reference to restart the inactivity clock without remounting the workflow.
      setAccount({ ...current });
      if (old && old !== fresh.access_token)
        accountRequest(config, { action: "logout", accessToken: old }).catch(
          () => {},
        );
    } catch (e) {
      if (fresh?.access_token)
        accountRequest(config, {
          action: "logout",
          accessToken: fresh.access_token,
        }).catch(() => {});
      if (e.status === 429)
        setSignInLocked(
          e.lockedUntil || new Date(Date.now() + 86400000).toISOString(),
        );
      throw Error(
        e.status === 429
          ? e.message
          : "Unable to renew your session. Check your password and workspace access, or return to sign-in for account help.",
      );
    }
  }
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
    if (loginKind === "admin") {
      const admin = members.find((member) => member.role === "admin");
      if (!admin) {
        await signOut(
          "This account does not have admin access. Use workspace sign-in to continue.",
        );
        return;
      }
      await openWorkspace(admin, user, attempt);
      return;
    }
    const destination = bankingDestination();
    const resume = members.find(
      (member) =>
        member.role !== "admin" && member.workspace_id === destination,
    );
    if (resume) {
      await openWorkspace(resume, user, attempt);
      return;
    }
    if (destination) clearBankingDestination();
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
      setInitialPage(
        bankingDestination() === member.workspace_id
          ? member.role === "business"
            ? "Billing"
            : "Earnings"
          : null,
      );
      clearBankingDestination();
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
  async function marketRequest(action, body = {}) {
    const current = accountRef.current;
    if (!current || !["business", "driver"].includes(current.role))
      throw Error("Workspace access required");
    return api("/rest/v1/rpc/shypit_market_" + action, {
      method: "POST",
      body: { ...body, p_workspace: current.workspace_id },
    });
  }
  async function bankingRequest(action) {
    if (!token.current || !accountRef.current)
      throw Error("Please sign in again.");
    let response, result;
    try {
      response = await fetch(
        config.url.replace(/\/$/, "") + "/functions/v1/shypit-banking",
        {
          method: "POST",
          headers: {
            apikey: config.publicKey,
            Authorization: "Bearer " + token.current,
            "Content-Type": "application/json",
          },
          credentials: "omit",
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(25000),
          body: JSON.stringify({
            action,
            workspaceId: accountRef.current.workspace_id,
          }),
        },
      );
      result = await response.json();
    } catch {
      throw Error(
        "Banking services cannot be reached. Please try again later.",
      );
    }
    if (!response.ok) {
      const error = Error(result.error || "Banking services are unavailable.");
      error.status = response.status;
      throw error;
    }
    return result;
  }
  async function adminRequest(name, body) {
    return api("/rest/v1/rpc/" + name, { method: "POST", body });
  }
  if (account && data)
    return (
      <Workspace.Provider
        value={{
          data,
          update,
          session: {
            warning: sessionWarning,
            extending,
            message: extensionMessage,
            extend: extendSession,
            renew: () => setRenewOpen(true),
          },
          bankingRequest,
          marketRequest,
          prepareBankingReturn: () =>
            rememberBanking(accountRef.current.workspace_id),
          reauthenticateBanking: () => {
            rememberBanking(accountRef.current.workspace_id);
            setLoginKind("workspace");
            return signOut(
              "Sign in again to confirm your identity. We’ll return you to banking setup.",
            );
          },
        }}
      >
        <div className="signed-in-workspace" hidden={sessionLocked}>
          <section className="session-strip" aria-label="Account session">
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
            {account.role !== "admin" &&
              memberships.some((member) => member.role === "admin") && (
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await queue.current;
                    if (!token.current || !accountRef.current) {
                      setBusy(false);
                      return;
                    }
                    await openWorkspace(
                      memberships.find((member) => member.role === "admin"),
                      {
                        id: accountRef.current.userId,
                        email: accountRef.current.email,
                      },
                    );
                  }}
                >
                  Admin Login
                </button>
              )}
            <button onClick={() => signOut()}>
              <SignOut size={18} />
              Sign out
            </button>
          </section>
          <SessionWarning />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
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
            children({ account, initialData: data, initialPage })
          )}
        </div>
        {renewOpen && (
          <SessionRenewal
            locked={sessionLocked}
            onRenew={renewSession}
            onClose={() => setRenewOpen(false)}
            onSignOut={() => signOut()}
            email={account.email}
            blocked={Boolean(signInLocked)}
          />
        )}
      </Workspace.Provider>
    );
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a href="#" className="brand">
          <Brand light />
        </a>
        <div>
          <p className="eyebrow">YOUR PEOPLE. YOUR FREIGHT.</p>
          <p className="auth-story-title">
            Good work starts
            <br />
            with trust.
          </p>
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
      <section className="auth-form-panel" id="main-content" tabIndex={-1}>
        <div className="auth-form">
          <span className="auth-lock">
            <LockKey size={30} />
          </span>
          {!(accessMode || recovery) && (
            <>
              <p className="eyebrow">WELCOME TO SHYPIT</p>
              <h1 tabIndex={-1}>
                {pendingUser ? (
                  "Choose your workspace."
                ) : loginKind === "admin" ? (
                  "Admin sign-in."
                ) : (
                  <>
                    <span className="auth-desktop-copy">
                      Sign in to your workspace.
                    </span>
                    <span className="auth-mobile-copy">Sign in.</span>
                  </>
                )}
              </h1>
              <p className="muted">
                <span className="auth-desktop-copy">
                  {loginKind === "admin"
                    ? "Use your approved admin email and password. Admin permissions are checked after sign-in."
                    : "Use the email address invited by your business or carrier administrator."}
                </span>
                <span className="auth-mobile-copy">
                  {pendingUser
                    ? "Choose a workspace to continue."
                    : loginKind === "admin"
                      ? "Use your admin email."
                      : "Use your invited email."}
                </span>
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
              {memberships
                .filter((member) => member.role !== "admin")
                .map((member) => (
                  <button
                    className="workspace-choice"
                    key={member.workspace_id}
                    onClick={() => openWorkspace(member, pendingUser)}
                    disabled={busy}
                  >
                    <span>
                      <strong>
                        {member.role === "business"
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
              <div className="workspace-actions">
                {memberships
                  .filter((member) => member.role === "admin")
                  .map((member) => (
                    <button
                      key={member.workspace_id}
                      className="text-button"
                      disabled={busy}
                      onClick={() => openWorkspace(member, pendingUser)}
                    >
                      Admin Login
                    </button>
                  ))}
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => signOut()}
                >
                  Sign out
                </button>
              </div>
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
                    aria-describedby={error ? "login-error" : undefined}
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
                  <div className="field-help email-help">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setAccessMode("email-help")}
                    >
                      Forgot email?
                    </button>
                  </div>
                  <label htmlFor="login-password">Password</label>
                  <div className="password-input">
                    <input
                      id="login-password"
                      aria-describedby={error ? "login-error" : undefined}
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
                  <div className="field-help password-help">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setAccessMode("setup")}
                    >
                      Create your password
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setAccessMode("reset")}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <button
                    type="submit"
                    className="primary"
                    disabled={
                      busy || signInLocked || accountService !== "ready"
                    }
                  >
                    {busy
                      ? "Signing in…"
                      : loginKind === "admin"
                        ? "Sign in as admin"
                        : "Sign in"}
                    <ArrowRight />
                  </button>
                  <div className="login-route">
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy}
                      onClick={() => {
                        setLoginKind(
                          loginKind === "admin" ? "workspace" : "admin",
                        );
                        setPassword("");
                        setError("");
                        setMessage("");
                      }}
                    >
                      {loginKind === "admin"
                        ? "Back to workspace sign-in"
                        : "Admin Login"}
                    </button>
                  </div>

                  <p className="auth-note">
                    10 failed attempts lock sign-in for 24 hours.
                    <span className="auth-desktop-copy">
                      {" "}
                      Limits are enforced by the server.
                    </span>
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
                <p role="alert" className="error" id="login-error">
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
                    <p role="alert" className="error" id="login-error">
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
            <span className="auth-desktop-copy">
              No account? Ask your organization administrator for an invitation.
              Workspace access requires an invitation.
            </span>
            <span className="auth-mobile-copy">
              Need access? Ask your administrator.
            </span>
          </p>
          <p className="auth-note">
            <LockKey />
            <span className="auth-desktop-copy">
              Sessions lock after 15 minutes. A warning lets you extend your
              session or sign in again without losing your open form. Refreshing
              clears unsaved work.
            </span>
            <span className="auth-mobile-copy">
              15-minute sessions. Sign in again to keep working.
            </span>
          </p>
        </div>
      </section>
    </main>
  );
}
