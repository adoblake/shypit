import React, { useEffect, useState } from "react";
import { Bank, LockKey, ArrowSquareOut } from "@phosphor-icons/react";
import { useBanking } from "./auth";
import "./banking.css";
export default function Banking({ kind }) {
  const request = useBanking();
  const [status, setStatus] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const business = kind === "business";
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setStatus(await request("status"));
    } catch {
      setStatus(null);
      setError(
        "Banking services are not connected or cannot be reached. Please try again later.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    refresh();
  }, [kind]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const result = await request("start");
      if (!result.url) throw Error("Banking setup is not connected yet.");
      const url = new URL(result.url);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !["checkout.stripe.com", "connect.stripe.com"].includes(url.hostname)
      )
        throw Error("Unable to open the banking provider.");
      window.location.assign(url.href);
    } catch (e) {
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
            You will leave Shypit for Stripe. You may need to sign in again when
            you return; open {business ? "Billing" : "Earnings"} and refresh the
            status. Bank verification may take time. For changes, sign in within
            the last five minutes.
          </p>
        </>
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
