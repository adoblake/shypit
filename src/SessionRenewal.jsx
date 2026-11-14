import React, { useEffect, useRef, useState } from "react";

// Keeps the current workflow mounted while credentials are checked again.
// Credentials and the workspace draft stay in memory, never browser storage.
export default function SessionRenewal({
  locked,
  onRenew,
  onClose,
  onSignOut,
  email,
  blocked,
}) {
  const dialog = useRef(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    element.showModal();
    element.querySelector("input[type=password]")?.focus();
    return () => {
      element.close();
      if (previous?.isConnected) previous.focus();
      else
        (
          document.querySelector("dialog[open] input") ||
          document.getElementById("main-content")
        )?.focus();
    };
  }, []);
  async function submit(e) {
    e.preventDefault();
    if (busy || blocked) return;
    setBusy(true);
    setError("");
    try {
      await onRenew(password);
    } catch (e) {
      setError(e.message);
      setPassword("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-modal="true"
      aria-labelledby="renew-title"
      aria-describedby="renew-help"
      onCancel={(e) => {
        e.preventDefault();
        if (!locked && !busy) onClose();
      }}
    >
      <h2 id="renew-title">
        {locked ? "Sign in to resume your work." : "Keep your work open."}
      </h2>
      <p id="renew-help">
        Confirm your password to start another secure session. Your open form
        stays in this tab. Refreshing or signing out clears unsaved work.
      </p>
      <form onSubmit={submit}>
        <label htmlFor="renew-email">Email address</label>
        <input
          id="renew-email"
          type="email"
          autoComplete="username"
          value={email}
          readOnly
        />
        <label htmlFor="renew-password">Password</label>
        <input
          id="renew-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={error ? "renew-error" : undefined}
        />
        {error && (
          <p id="renew-error" role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy || blocked}>
          {busy ? "Checking…" : "Sign in & resume"}
        </button>
      </form>
      {!locked && (
        <button className="text-button" disabled={busy} onClick={onClose}>
          Keep working for now
        </button>
      )}
      <button className="text-button" disabled={busy} onClick={onSignOut}>
        Sign out & return to sign-in
      </button>
    </dialog>
  );
}
