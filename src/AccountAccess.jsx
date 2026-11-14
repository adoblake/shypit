import React, { useState, useEffect } from "react";
import { ArrowRight } from "@phosphor-icons/react";
export async function accountRequest(config, body) {
  let response;
  try {
    response = await fetch(
      config.url.replace(/\/$/, "") + "/functions/v1/shypit-auth",
      {
        method: "POST",
        headers: {
          apikey: config.publicKey,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25000),
      },
    );
  } catch {
    const error = new Error(
      "Account services cannot be reached right now. No email delivery was confirmed. Please try again after the service is connected.",
    );
    error.code = "ACCOUNT_UNAVAILABLE";
    throw error;
  }
  let result;
  try {
    result = await response.json();
  } catch {
    result = {};
  }
  if (!response.ok) {
    const e = new Error(
      response.status === 404
        ? "Account services are not connected yet. Please contact your administrator."
        : result.error ||
            "Account services are unavailable. Please try again later.",
    );
    e.status = response.status;
    e.lockedUntil = result.lockedUntil;
    throw e;
  }
  return result;
}
export function readRecoveryLink() {
  const query = new URLSearchParams(location.search),
    fragment = new URLSearchParams(location.hash.slice(1));
  if (query.has("token_hash") || fragment.has("access_token")) {
    const result = {
      tokenHash: query.get("token_hash") || "",
      accessToken: fragment.get("access_token") || "",
      type:
        query.get("type") ||
        fragment.get("type") ||
        (query.get("flow") === "setup" ? "invite" : "recovery"),
    };
    history.replaceState(null, "", location.pathname);
    return result;
  }
  return null;
}
export default function AccountAccess({
  config,
  mode,
  email,
  setEmail,
  recovery,
  onBack,
  available = true,
}) {
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [name, setName] = useState(""),
    [organization, setOrganization] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [lockedUntil, setLockedUntil] = useState(null),
    [complete, setComplete] = useState(false);
  useEffect(() => {
    if (!lockedUntil) return;
    const timer = setTimeout(
      () => {
        setLockedUntil(null);
        setError("");
        setMessage("The waiting period has ended. You can try again.");
      },
      Math.max(0, new Date(lockedUntil).getTime() - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [lockedUntil]);
  const setting = Boolean(recovery),
    help = mode === "email-help";
  const title = setting
    ? "Choose your password."
    : help
      ? "Forgot your email?"
      : mode === "setup"
        ? "Create your password."
        : "Reset your password.";
  async function submit(event) {
    event.preventDefault();
    if (busy || lockedUntil || !available) return;
    setError("");
    setMessage("");
    if (
      setting &&
      (password.length < 12 || password.length > 128 || password !== confirm)
    ) {
      setError("Use 12–128 characters and make sure both passwords match.");
      return;
    }
    setBusy(true);
    try {
      const result = await accountRequest(config, {
        action: setting ? "complete" : mode,
        email,
        ...(setting ? { password, ...recovery } : {}),
        ...(help ? { name, organization } : {}),
      });
      setMessage(result.message);
      if (setting) {
        setPassword("");
        setConfirm("");
        setComplete(true);
      }
    } catch (e) {
      setPassword("");
      setConfirm("");
      setError(e.message);
      if (e.status === 429)
        setLockedUntil(
          e.lockedUntil || new Date(Date.now() + 86400000).toISOString(),
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="eyebrow">PRIVATE ACCOUNT ACCESS</p>
      <h1 tabIndex={-1}>{title}</h1>
      <p className="muted">
        {setting
          ? "Verify the invited email address, then choose a strong, unique password."
          : help
            ? "Use an alternate contact email. An administrator must verify your identity before helping recover account access. Registered addresses are never revealed here."
            : "We’ll send a secure link only if this email has approved Shypit access. You must open that link before creating or changing a password."}
      </p>
      {!complete && (
        <form onSubmit={submit}>
          {help && (
            <>
              <label htmlFor="recovery-name">Full name</label>
              <input
                id="recovery-name"
                required
                maxLength={120}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <label htmlFor="recovery-org">Business or LLC name</label>
              <input
                id="recovery-org"
                required
                maxLength={160}
                autoComplete="organization"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
              />
            </>
          )}
          <label htmlFor="recovery-email">
            {help ? "Contact email" : "Email address"}
          </label>
          <input
            id="recovery-email"
            required
            type="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy || Boolean(lockedUntil) || !available}
          />
          {setting && (
            <>
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                aria-describedby="password-help"
                required
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <label htmlFor="confirm-password">Confirm new password</label>
              <input
                id="confirm-password"
                aria-describedby={
                  error ? "account-error password-help" : "password-help"
                }
                aria-invalid={Boolean(error && password !== confirm)}
                required
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <p className="helper" id="password-help">
                Use 12–128 characters. Your password is sent securely to the
                identity provider and is never saved in browser storage.
              </p>
            </>
          )}
          <button
            className="primary"
            disabled={busy || Boolean(lockedUntil) || !available}
            type="submit"
          >
            {busy
              ? "Please wait…"
              : setting
                ? "Save password"
                : help
                  ? "Request account help"
                  : "Send secure link"}
            <ArrowRight />
          </button>
        </form>
      )}
      {message && (
        <p className="auth-message" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="error" role="alert" id="account-error">
          {error}
        </p>
      )}
      {lockedUntil && (
        <p className="helper">
          {lockedUntil === "24 hours"
            ? "Try again after 24 hours."
            : "Try again after " +
              new Date(lockedUntil).toLocaleString("en-US", {
                timeZone: "America/Phoenix",
                timeZoneName: "short",
              }) +
              "."}
        </p>
      )}
      <p className="auth-note">
        10 failed sign-in or verification attempts lock that process for 24
        hours. Setup, reset and account-help requests are limited to 10 per 24
        hours. Browser changes do not reset these limits.
      </p>
      <button className="text-button" onClick={onBack} type="button">
        Back to sign-in
      </button>
    </>
  );
}
