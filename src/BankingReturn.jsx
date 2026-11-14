import React, { useState, useEffect } from "react";
import Brand from "./Brand";
import { rememberBanking } from "./banking-return";
export function hasBankingReturn() {
  return ["return", "cancelled", "retry"].includes(
    new URLSearchParams(location.search).get("banking"),
  );
}
export default function BankingReturn({ children }) {
  const [continueHere, setContinueHere] = useState(false);
  useEffect(() => {
    if (!continueHere) document.title = "Return to banking setup | Shypit";
  }, [continueHere]);
  if (continueHere) return children;
  const params = new URLSearchParams(location.search),
    state = params.get("banking");
  function signIn() {
    const id = params.get("workspaceId");
    if (/^[a-f0-9-]{36}$/i.test(id || "")) rememberBanking(id);
    history.replaceState(null, "", location.pathname);
    setContinueHere(true);
  }
  return (
    <main id="main-content" tabIndex={-1} className="banking-return">
      <Brand />
      <p className="eyebrow">BACK TO SHYPIT</p>
      <h1>
        {state === "retry"
          ? "Get a fresh setup link."
          : state === "cancelled"
            ? "Continue when you’re ready."
            : "Continue your banking setup."}
      </h1>
      <p>
        {state === "retry"
          ? "Your setup link may have expired. Return to your workspace to open a fresh secure link."
          : "Return to your original Shypit tab. Your banking section will check the latest status with Stripe."}
      </p>
      <p className="muted">
        Returning here does not confirm bank verification. Shypit checks that
        directly with the provider.
      </p>
      <button className="primary" onClick={() => window.close()}>
        Close this tab & return to Shypit
      </button>
      <button className="text-button" onClick={signIn}>
        Sign in here instead
      </button>
      <p className="helper">
        If you no longer have the original tab open, sign in here to return to
        your assigned banking workspace.
      </p>
    </main>
  );
}
