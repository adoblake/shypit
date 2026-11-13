import React, { useEffect, useState, useRef } from "react";
import { Bank, LockKey, ArrowSquareOut } from "@phosphor-icons/react";
import { useBanking } from "./auth";
import "./banking.css";
export default function Banking({ kind }) {
  const {
    bankingRequest: request,
    prepareBankingReturn,
    reauthenticateBanking,
  } = useBanking();
  const [hostedUrl, setHostedUrl] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const launched = useRef(false),
    poll = useRef(null),
    checking = useRef(false);
  const [status, setStatus] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const business = kind === "business";
  async function refresh() {
    if (checking.current) return;
    checking.current = true;
    setBusy(true);
    setError("");
    try {
      const current = await request("status");
      setStatus(current);
      if (current.state === "connected") {
        setHostedUrl("");
        launched.current = false;
        clearInterval(poll.current);
      }
    } catch {
      setStatus(null);
      setError(
        "Banking services are not connected or cannot be reached. Please try again later.",
      );
    } finally {
      checking.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    refresh();
    const returned = () => {
      if (launched.current && !document.hidden) refresh();
    };
    window.addEventListener("focus", returned);
    document.addEventListener("visibilitychange", returned);
    return () => {
      window.removeEventListener("focus", returned);
      document.removeEventListener("visibilitychange", returned);
      clearInterval(poll.current);
    };
  }, [kind]);
  async function start() {
    setBusy(true);
    setError("");
    setNeedsSignIn(false);
    setHostedUrl("");
    let popup = null;
    try {
      popup = window.open("about:blank", "_blank");
      if (popup) {
        popup.opener = null;
        popup.document.title = "Opening secure banking setup";
        popup.document.body.textContent =
          "Opening Stripe’s secure banking page. Keep your Shypit tab open.";
      }
    } catch {
      try {
        popup?.close();
      } catch {}
      popup = null;
    }
    try {
      const result = await request("start");
      if (!result.url) throw Error("Banking setup is not connected yet.");
      const url = new URL(result.url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        (url.port && url.port !== "443") ||
        !["checkout.stripe.com", "connect.stripe.com"].includes(url.hostname)
      )
        throw Error("Unable to open the banking provider.");
      prepareBankingReturn();
      launched.current = true;
      setHostedUrl(url.href);
      if (popup) {
        popup.location.replace(url.href);
        clearInterval(poll.current);
        poll.current = setInterval(() => {
          if (popup.closed) {
            clearInterval(poll.current);
            refresh();
          }
        }, 1000);
      }
      setBusy(false);
    } catch (e) {
      if (popup) popup.close();
      if (e.status === 403) setNeedsSignIn(true);
      setError(e.message || "Unable to start banking setup.");
      setBusy(false);
    }
  }
  const connected = status?.state === "connected",
    pending = status?.state === "verification_pending";
  return (
    <section className="banking-card" aria-labelledby="banking-heading">
      <div className="banking-title">
        <Bank size={30} />
        <div>
          <h2 id="banking-heading">
            {business ? "Business payment account" : "Provider payout account"}
          </h2>
          <p>
            {business
              ? "Add a verified bank payment method for future shipment billing."
              : "Connect your business bank account for future carrier payouts."}
          </p>
        </div>
      </div>
      <p className="banking-status" role="status">
        {busy
          ? "Checking banking setup…"
          : !status?.configured
            ? "Banking setup is not activated yet"
            : !status.canManage
              ? "Finance manager access required"
              : connected
                ? "Verified with the banking provider"
                : pending
                  ? "Verification or additional information is required"
                  : "No bank account connected"}
      </p>
      {status?.mode === "test" && (
        <p className="banking-test">
          <strong>Test mode:</strong> use only the provider’s test banking
          details. No real payments or payouts are enabled.
        </p>
      )}
      <ol className="banking-steps" aria-label="Banking setup steps">
        <li>Start setup here in Shypit.</li>
        <li>Verify your bank and business details in the secure Stripe tab.</li>
        <li>Come back here. We’ll check your verification status.</li>
      </ol>
      <p>
        <LockKey size={18} /> Bank details are entered on Stripe’s hosted page.
        Shypit does not collect or store your account or routing numbers.
      </p>
      {!status?.configured && (
        <p className="muted">
          Your administrator needs to activate the payment provider before
          banking can be added. Do not send bank details through chat, email, or
          shipment notes.
        </p>
      )}
      {status?.configured && !status.canManage && (
        <p className="muted">
          Ask your workspace owner to assign a finance manager.
        </p>
      )}
      {status?.configured && status.canManage && (
        <>
          <button className="primary" onClick={start} disabled={busy}>
            {connected
              ? business
                ? "Add another payment account"
                : "Manage payout account"
              : pending
                ? "Continue verification"
                : business
                  ? "Add payment account"
                  : "Connect payout account"}
            <ArrowSquareOut size={19} />
          </button>
          <p className="helper">
            Stripe opens in a separate tab; keep this workspace open. If a fresh
            sign-in is needed, we’ll bring you straight back to{" "}
            {business ? "Billing" : "Earnings"}. Verification can take time.
          </p>
        </>
      )}
      {hostedUrl && (
        <div className="banking-handoff" role="status">
          <strong>Your secure setup link is ready.</strong>
          <p>
            Complete verification in the Stripe tab, then return here. If the
            tab did not open, use the link below.
          </p>
          <a href={hostedUrl} target="_blank" rel="noopener noreferrer">
            Continue securely on Stripe <ArrowSquareOut size={18} />
          </a>
        </div>
      )}
      {needsSignIn && (
        <button className="primary" onClick={reauthenticateBanking}>
          Sign in again to continue banking
        </button>
      )}
      <button className="text-button" onClick={refresh} disabled={busy}>
        Refresh banking status
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="helper">
        Adding banking does not charge your account or schedule payouts.
        Shipment charges, subscriptions, and real payouts are still being built.
      </p>
    </section>
  );
}
