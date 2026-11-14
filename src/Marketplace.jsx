import React, { useEffect, useRef, useState } from "react";
import { useMarket } from "./auth";
import { usLocations } from "./nationwide";
import "./marketplace.css";
const money = (cents) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
const equipment = ["Dry van", "Reefer", "Flatbed", "Box truck"];
const cargo = [
  "General merchandise",
  "Office supplies",
  "Building materials",
  "Dry food products",
  "Machinery",
];
const clean = (form) => Object.fromEntries(new FormData(form));
export default function Marketplace({
  account,
  bookingsOnly = false,
  onPractice,
  onJobs,
  seed = null,
}) {
  const request = useMarket();
  const business = account.role === "business";
  const [listings, setListings] = useState([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [pricing, setPricing] = useState("quotes"),
    [view, setView] = useState(business ? "mine" : "open"),
    [creating, setCreating] = useState(Boolean(seed)),
    [selected, setSelected] = useState(null),
    [review, setReview] = useState(null),
    [offerFor, setOfferFor] = useState(null),
    [offerReview, setOfferReview] = useState(null);
  const requestId = useRef(crypto.randomUUID()),
    postForm = useRef(null),
    offerForm = useRef(null),
    postCardRef = useRef(null),
    detailRef = useRef(null);
  useEffect(() => {
    if (selected && detailRef.current) {
      detailRef.current.focus({ preventScroll: true });
      detailRef.current.scrollIntoView({ block: "start" });
    }
  }, [selected]);
  function closeDetail() {
    const id = selected;
    setSelected(null);
    requestAnimationFrame(() =>
      document.querySelector(`[data-listing-id="${id}"]`)?.focus(),
    );
  }
  useEffect(() => {
    if (review && postCardRef.current) {
      postCardRef.current.focus({ preventScroll: true });
      postCardRef.current.scrollIntoView({ block: "start" });
    }
  }, [Boolean(review)]);
  async function refresh() {
    setNotice("");
    setLoading(true);
    setError("");
    try {
      setListings(await request("list", {}));
    } catch {
      setError(
        "The member load board could not be loaded. Check your connection or sign in again.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    window.scrollTo(0, 0);
    refresh();
  }, [account.workspace_id]);
  async function mutate(action, payload, message) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request(action, payload);
      await refresh();
      setNotice(message);
      return { ok: true, result };
    } catch {
      setError(
        "This action could not be completed. The load or your access may have changed. Refresh before trying again.",
      );
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }
  const visible = listings.filter((l) => {
    if (
      bookingsOnly &&
      !l.offers.some((o) => ["accepted", "cancelled"].includes(o.state))
    )
      return false;
    if (
      !business &&
      !bookingsOnly &&
      (view === "open" ? l.state !== "open" : !l.offers.length)
    )
      return false;
    return (
      (filter === "all" || l.equipment === filter) &&
      `${l.origin} ${l.destination} ${l.business_name} ${l.cargo}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  });
  const detail = listings.find((l) => l.id === selected);
  async function publish() {
    const { listing, privateDetails } = review;
    const saved = await mutate(
      "post",
      {
        p_request: requestId.current,
        p_listing: listing,
        p_private: privateDetails,
      },
      "Shipment posted to approved carrier members.",
    );
    if (saved.ok) {
      requestId.current = crypto.randomUUID();
      setCreating(false);
      setReview(null);
      setSelected(saved.result);
    }
  }
  async function sendOffer() {
    const r = offerReview;
    const saved = await mutate(
      "offer",
      {
        p_listing: offerFor,
        p_name: r.carrier_name,
        p_amount: r.amount_cents,
        p_contact: r.contact,
      },
      "Request sent to the business. It becomes booked only after the business confirms.",
    );
    if (saved.ok) {
      setOfferFor(null);
      setOfferReview(null);
      setView("requests");
    }
  }
  return (
    <section
      className={bookingsOnly ? "market-shell market-bookings" : "market-shell"}
      aria-label={bookingsOnly ? "Load board bookings" : "Member load board"}
    >
      <div className="market-heading">
        <div>
          <p className="eyebrow">
            {bookingsOnly
              ? "SHARED LOAD BOARD"
              : "YOUR PEOPLE. YOUR NEXT OPPORTUNITY."}
          </p>
          <h1>
            {bookingsOnly
              ? "Booked through the load board"
              : business
                ? "Post freight. Find your carrier."
                : "Find your next load."}
          </h1>
          <p className="muted">
            {business
              ? "Post a shipment, review private quotes, and confirm a carrier."
              : "Search member-posted loads and request work that fits your route."}
          </p>
        </div>
        <div className="market-actions">
          {business && !creating && (
            <button
              className="primary"
              onClick={() => {
                setCreating(true);
                setReview(null);
              }}
            >
              Post a shipment
            </button>
          )}
          <button
            className="small-button"
            disabled={loading || busy}
            onClick={refresh}
          >
            Refresh board
          </button>
        </div>
      </div>
      <p className="market-pilot">
        Invitation-only pilot. Requests and bookings are saved here; payments,
        GPS, and live dispatch are not connected. Confirm carrier credentials
        and shipment terms before moving freight.
      </p>
      {notice && (
        <p role="status" className="market-notice">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {creating && business && (
        <section ref={postCardRef} tabIndex={-1} className="market-card">
          <h2>{review ? "Review before posting" : "Post a shipment"}</h2>
          <p>
            Members see the business name, city-to-city route, cargo category,
            dates, equipment, and rate. Exact addresses and contacts are shared
            only after you confirm a carrier.
          </p>
          <form
            ref={postForm}
            hidden={Boolean(review)}
            onSubmit={(e) => {
              e.preventDefault();
              const f = clean(e.currentTarget);
              if (f.delivery < f.pickup) {
                setError("Delivery date must be on or after pickup.");
                return;
              }
              setError("");
              setReview({
                listing: {
                  business_name: f.business_name.trim(),
                  origin: f.origin.trim(),
                  destination: f.destination.trim(),
                  pickup: f.pickup,
                  delivery: f.delivery,
                  equipment: f.equipment,
                  cargo: f.cargo,
                  pallets: Number(f.pallets),
                  weight: Number(f.weight),
                  rate_cents:
                    f.pricing === "quotes"
                      ? null
                      : Math.round(Number(f.rate) * 100),
                },
                privateDetails: {
                  pickup_address: f.pickup_address.trim(),
                  delivery_address: f.delivery_address.trim(),
                  contact_name: f.contact_name.trim(),
                  contact_email: f.contact_email.trim(),
                  contact_phone: f.contact_phone.trim(),
                },
              });
            }}
          >
            <fieldset>
              <legend>Member-visible listing</legend>
              <div className="market-grid">
                <Field
                  label="Business name"
                  name="business_name"
                  defaultValue={account.display_name}
                  maxLength={100}
                  minLength={2}
                />
                <Field
                  label="Pickup city and state"
                  name="origin"
                  defaultValue={seed?.from}
                  list="market-cities"
                  pattern={String.raw`[A-Za-z .'\-]{2,70}, [A-Z]{2}`}
                  placeholder="Phoenix, AZ"
                />
                <Field
                  label="Delivery city and state"
                  name="destination"
                  defaultValue={seed?.to}
                  list="market-cities"
                  pattern={String.raw`[A-Za-z .'\-]{2,70}, [A-Z]{2}`}
                  placeholder="Los Angeles, CA"
                />
                <Field
                  label="Pickup date"
                  name="pickup"
                  type="date"
                  defaultValue={seed?.pickup}
                />
                <Field
                  label="Delivery date"
                  name="delivery"
                  type="date"
                  defaultValue={seed?.delivery}
                />
                <label>
                  Equipment
                  <select
                    name="equipment"
                    defaultValue={seed?.equipment || equipment[0]}
                  >
                    {equipment.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Cargo category
                  <select name="cargo">
                    {cargo.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Pallets"
                  name="pallets"
                  type="number"
                  min="1"
                  max="100"
                  defaultValue={seed?.pallets || 1}
                />
                <Field
                  label="Weight (lb)"
                  name="weight"
                  type="number"
                  min="1"
                  max="100000"
                  defaultValue={seed?.weight || 1000}
                />
                <label>
                  Pricing
                  <select
                    name="pricing"
                    value={pricing}
                    onChange={(e) => setPricing(e.target.value)}
                  >
                    <option value="quotes">Request private quotes</option>
                    <option value="fixed">Offer a fixed rate</option>
                  </select>
                </label>
                <Field
                  label="Offered rate (USD)"
                  name="rate"
                  type="number"
                  min="1"
                  max="1000000"
                  step="0.01"
                  required={pricing === "fixed"}
                  disabled={pricing !== "fixed"}
                  defaultValue={seed?.price || ""}
                />
              </div>
              <p className="helper">
                Use a business name and city/state only in these public fields.
                Keep street addresses and personal contact details below.
              </p>
            </fieldset>
            <fieldset>
              <legend>Private booking details</legend>
              <div className="market-grid">
                <Field
                  label="Pickup street address"
                  name="pickup_address"
                  maxLength={240}
                />
                <Field
                  label="Delivery street address"
                  name="delivery_address"
                  maxLength={240}
                />
                <Field
                  label="Shipping contact name"
                  name="contact_name"
                  minLength={2}
                  maxLength={100}
                />
                <Field
                  label="Shipping contact email"
                  name="contact_email"
                  type="email"
                  maxLength={254}
                />
                <Field
                  label="Shipping contact phone"
                  name="contact_phone"
                  type="tel"
                  minLength={7}
                  maxLength={30}
                />
              </div>
            </fieldset>
            <datalist id="market-cities">
              {usLocations.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <div className="market-actions">
              <button className="primary" type="submit">
                Review listing
              </button>
              <button type="button" onClick={() => setCreating(false)}>
                Cancel
              </button>
            </div>
          </form>
          {review && (
            <div>
              <h3>
                {review.listing.origin} → {review.listing.destination}
              </h3>
              <p>
                {review.listing.business_name} · {review.listing.cargo} ·{" "}
                {review.listing.equipment}
              </p>
              <p>
                {review.listing.pickup} → {review.listing.delivery} ·{" "}
                {review.listing.pallets} pallets · {review.listing.weight} lb
              </p>
              <strong>
                {review.listing.rate_cents
                  ? money(review.listing.rate_cents)
                  : "Private quotes requested"}
              </strong>
              <p className="helper">
                Your private addresses and contacts will not appear on the
                member-visible listing.
              </p>
              <div className="market-actions">
                <button className="primary" disabled={busy} onClick={publish}>
                  Publish to member load board
                </button>
                <button disabled={busy} onClick={() => setReview(null)}>
                  Edit listing
                </button>
              </div>
            </div>
          )}
        </section>
      )}
      {!business && !bookingsOnly && (
        <div className="market-switch">
          <button
            aria-pressed={view === "open"}
            onClick={() => setView("open")}
          >
            Available loads
          </button>
          <button
            aria-pressed={view === "requests"}
            onClick={() => setView("requests")}
          >
            My requests
          </button>
          {onPractice && (
            <button className="text-button" onClick={onPractice}>
              Practice with sample loads
            </button>
          )}
        </div>
      )}
      <div className="market-filters">
        <label>
          Search member loads
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="City, route, business or cargo"
          />
        </label>
        <label>
          Load equipment
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All equipment</option>
            {equipment.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      {loading ? (
        <p role="status">Loading member listings…</p>
      ) : !visible.length ? (
        <div className="market-card">
          <h2>
            {business
              ? "Your first shipment starts here."
              : bookingsOnly
                ? "No load-board bookings yet."
                : "No matching member loads yet."}
          </h2>
          <p>
            {business
              ? "Post a shipment to invite carrier quotes or booking requests."
              : "Try another route or check back after a business posts a shipment."}
          </p>
        </div>
      ) : (
        <div className="market-list">
          {visible.map((l) => (
            <button
              className="market-listing"
              key={l.id}
              onClick={() => {
                setSelected(l.id);
                requestAnimationFrame(() =>
                  detailRef.current?.scrollIntoView({ block: "start" }),
                );
                setOfferFor(null);
                setOfferReview(null);
              }}
              aria-expanded={selected === l.id}
            >
              <span className="market-route">
                {l.origin} → {l.destination}
              </span>
              <span>
                {l.business_name} · {l.equipment} · {l.cargo}
              </span>
              <span>
                {l.pickup} → {l.delivery} · {l.pallets} pallets ·{" "}
                {l.weight.toLocaleString()} lb
              </span>
              <strong>
                {l.rate_cents ? money(l.rate_cents) : "Request a quote"}
              </strong>
              <span className="market-state">
                {l.state}
                {l.offers.length
                  ? ` · ${l.offers.length} ${business ? (l.offers.length === 1 ? "request" : "requests") : l.offers[0].state}`
                  : ""}
              </span>
            </button>
          ))}
        </div>
      )}
      {detail && (
        <section
          ref={detailRef}
          tabIndex={-1}
          className="market-card market-detail"
          aria-label="Load details"
        >
          <div className="market-heading">
            <h2>
              {detail.origin} → {detail.destination}
            </h2>
            <button onClick={closeDetail}>Close details</button>
          </div>
          <p>
            {detail.business_name} · {detail.cargo} · {detail.equipment}
          </p>
          <p>
            Pickup {detail.pickup} · Delivery {detail.delivery}
          </p>
          <p>
            {detail.pallets} pallets · {detail.weight.toLocaleString()} lb ·{" "}
            {detail.rate_cents
              ? money(detail.rate_cents)
              : "Private quotes requested"}
          </p>
          {detail.private_details ? (
            <div className="market-private">
              <h3>Private booking details</h3>
              <p>Pickup: {detail.private_details.pickup_address}</p>
              <p>Delivery: {detail.private_details.delivery_address}</p>
              <p>
                Shipping contact: {detail.private_details.contact_name} ·{" "}
                {detail.private_details.contact_email} ·{" "}
                {detail.private_details.contact_phone}
              </p>
            </div>
          ) : (
            <p className="helper">
              Exact addresses and shipping contacts are shared after the
              business confirms your booking.
            </p>
          )}
          <h3>{business ? "Carrier requests" : "Your request"}</h3>
          {!detail.offers.length && <p>No requests yet.</p>}
          {detail.offers.map((o) => (
            <article className="market-offer" key={o.id}>
              <strong>
                {o.carrier_name} · {money(o.amount_cents)}
              </strong>
              <p>{o.state}</p>
              {o.contact && (
                <p>
                  Carrier contact: {o.contact.name} · {o.contact.email} ·{" "}
                  {o.contact.phone}
                </p>
              )}
              {business && o.state === "pending" && detail.state === "open" && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Confirm ${o.carrier_name} at ${money(o.amount_cents)}? This shares your private shipment addresses and contacts with this carrier. Other requests will be declined. No payment or live dispatch is triggered.`,
                      )
                    )
                      mutate(
                        "accept",
                        { p_offer: o.id, p_revision: o.revision },
                        "Carrier confirmed. Booking details are now shared with the selected carrier.",
                      );
                  }}
                >
                  Confirm carrier booking
                </button>
              )}
              {!business &&
                o.state === "pending" &&
                detail.state === "open" && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Withdraw this booking request?"))
                        mutate(
                          "withdraw",
                          { p_offer: o.id },
                          "Request withdrawn.",
                        );
                    }}
                  >
                    Withdraw request
                  </button>
                )}
            </article>
          ))}
          {!business &&
            detail.state === "open" &&
            (!detail.offers.length ||
              detail.offers.every((o) => o.state === "withdrawn")) &&
            !offerFor && (
              <button
                className="primary"
                onClick={() => setOfferFor(detail.id)}
              >
                {detail.rate_cents ? "Request booking" : "Submit a quote"}
              </button>
            )}
          {offerFor === detail.id && (
            <div>
              <p>
                Your quote is private to this business. Your contact information
                is shared with it only after booking is confirmed.
              </p>
              <form
                ref={offerForm}
                hidden={Boolean(offerReview)}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = clean(e.currentTarget);
                  setOfferReview({
                    carrier_name: f.carrier_name.trim(),
                    amount_cents:
                      detail.rate_cents || Math.round(Number(f.amount) * 100),
                    contact: {
                      name: f.name.trim(),
                      email: f.email.trim(),
                      phone: f.phone.trim(),
                    },
                  });
                }}
              >
                <div className="market-grid">
                  <Field
                    label="Carrier / LLC name"
                    name="carrier_name"
                    defaultValue={account.display_name}
                    minLength={2}
                    maxLength={100}
                  />
                  {!detail.rate_cents && (
                    <Field
                      label="Your quote (USD)"
                      name="amount"
                      type="number"
                      min="1"
                      max="1000000"
                      step="0.01"
                    />
                  )}
                  <Field
                    label="Carrier contact name"
                    name="name"
                    minLength={2}
                    maxLength={100}
                  />
                  <Field
                    label="Carrier contact email"
                    name="email"
                    type="email"
                    maxLength={254}
                  />
                  <Field
                    label="Carrier contact phone"
                    name="phone"
                    type="tel"
                    minLength={7}
                    maxLength={30}
                  />
                </div>
                <button className="primary" type="submit">
                  Review request
                </button>
              </form>
              {offerReview && (
                <div className="market-private">
                  <p>
                    {offerReview.carrier_name} ·{" "}
                    {money(offerReview.amount_cents)}
                  </p>
                  <p>
                    The business must confirm your request before this becomes a
                    booking. No payout is scheduled.
                  </p>
                  <div className="market-actions">
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={sendOffer}
                    >
                      Send request to business
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => setOfferReview(null)}
                    >
                      Edit request
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {business && ["open", "booked"].includes(detail.state) && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    detail.state === "booked"
                      ? "Cancel this booking? The carrier will see it cancelled, and access to private shipment details will end. Coordinate any real-world arrangements separately."
                      : "Close this post and decline pending requests?",
                  )
                )
                  mutate(
                    "close",
                    { p_listing: detail.id, p_expected_state: detail.state },
                    "Post closed.",
                  );
              }}
            >
              {detail.state === "booked" ? "Cancel booking" : "Close post"}
            </button>
          )}
          {!business && detail.state === "booked" && onJobs && (
            <button className="text-button" onClick={onJobs}>
              View in My jobs
            </button>
          )}
        </section>
      )}
      <p className="helper">
        Showing up to 100 member listings. This board is separate from practice
        loads and their illustrative earnings.
      </p>
    </section>
  );
}
function Field({ label, ...props }) {
  return (
    <label>
      {label}
      <input required {...props} />
    </label>
  );
}
