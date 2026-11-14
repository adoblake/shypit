// Browser-only fixture. Real authorization/transaction rules are exercised by PGlite tests.
export async function installMarketMock(page, store, workspace, role) {
  await page.route(
    "https://auth.shypit.test/rest/v1/rpc/shypit_market_*",
    async (route) => {
      const input = route.request().postDataJSON(),
        action = new URL(route.request().url()).pathname.split(
          "shypit_market_",
        )[1];
      if (input.p_workspace !== workspace)
        return route.fulfill({ status: 403, json: { error: "denied" } });
      if (action === "post") {
        if (role !== "business")
          return route.fulfill({ status: 403, json: { error: "denied" } });
        const old = store.find(
          (l) =>
            l.request_key === input.p_request && l.business_id === workspace,
        );
        if (old) return route.fulfill({ json: old.id });
        const id = crypto.randomUUID();
        store.unshift({
          ...input.p_listing,
          id,
          business_id: workspace,
          request_key: input.p_request,
          private_details: input.p_private,
          state: "open",
          offers: [],
          created_at: new Date().toISOString(),
        });
        return route.fulfill({ json: id });
      }
      if (action === "offer") {
        const l = store.find((l) => l.id === input.p_listing);
        if (!l || l.state !== "open" || role !== "driver")
          return route.fulfill({ status: 403, json: { error: "denied" } });
        const offer = {
          revision: 0,
          id: crypto.randomUUID(),
          carrier_id: workspace,
          carrier_name: input.p_name,
          amount_cents: l.rate_cents || input.p_amount,
          contact: input.p_contact,
          state: "pending",
        };
        l.offers = l.offers.filter((o) => o.carrier_id !== workspace);
        l.offers.push(offer);
        return route.fulfill({ json: offer.id });
      }
      if (action === "accept") {
        const l = store.find((l) =>
          l.offers.some((o) => o.id === input.p_offer),
        );
        if (
          !l ||
          l.business_id !== workspace ||
          role !== "business" ||
          l.state !== "open"
        )
          return route.fulfill({ status: 403, json: { error: "denied" } });
        if (
          l.offers.find((o) => o.id === input.p_offer)?.revision !==
          input.p_revision
        )
          return route.fulfill({ status: 409, json: { error: "changed" } });
        l.state = "booked";
        const chosen = l.offers.find((o) => o.id === input.p_offer);
        l.carrier_id = chosen.carrier_id;
        l.offers.forEach((o) => {
          o.state = o.id === input.p_offer ? "accepted" : "rejected";
        });
        return route.fulfill({ json: null });
      }
      if (action === "close") {
        const l = store.find(
          (l) => l.id === input.p_listing && l.business_id === workspace,
        );
        if (!l)
          return route.fulfill({ status: 403, json: { error: "denied" } });
        if (l.state !== input.p_expected_state)
          return route.fulfill({ status: 409, json: { error: "changed" } });
        l.state = l.state === "booked" ? "cancelled" : "closed";
        l.offers.forEach(
          (o) => (o.state = o.state === "accepted" ? "cancelled" : "rejected"),
        );
        return route.fulfill({ json: null });
      }
      if (action === "withdraw") {
        const l = store.find((l) =>
          l.offers.some(
            (o) => o.id === input.p_offer && o.carrier_id === workspace,
          ),
        );
        l.offers.find((o) => o.id === input.p_offer).state = "withdrawn";
        return route.fulfill({ json: null });
      }
      if (action === "list") {
        const rows = store
          .filter((l) =>
            role === "business"
              ? l.business_id === workspace
              : l.state === "open" ||
                l.offers.some((o) => o.carrier_id === workspace),
          )
          .map((l) => ({
            ...l,
            mine: l.business_id === workspace,
            private_details:
              l.business_id === workspace ||
              (l.state === "booked" && l.carrier_id === workspace)
                ? l.private_details
                : null,
            offers: l.offers
              .filter(
                (o) =>
                  l.business_id === workspace || o.carrier_id === workspace,
              )
              .map((o) => ({
                ...o,
                contact:
                  o.carrier_id === workspace ||
                  (l.state === "booked" &&
                    o.state === "accepted" &&
                    l.business_id === workspace)
                    ? o.contact
                    : null,
              })),
          }));
        return route.fulfill({ json: rows });
      }
      return route.fulfill({ status: 400, json: { error: "invalid" } });
    },
  );
}
