import Marketplace from "./Marketplace";
import BankingReturn, { hasBankingReturn } from "./BankingReturn";
import Banking from "./Banking";
import Brand from "./Brand";
import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  Truck,
  Package,
  CalendarBlank,
  Clock,
  CheckCircle,
  ArrowRight,
  ArrowsClockwise,
  MapPin,
  Info,
  Buildings,
  Wallet,
  FileText,
  Plus,
  X,
} from "@phosphor-icons/react";
import { AuthGate, useWorkspaceField, SessionWarning } from "./auth";
import "./styles.css";
import Tracking from "./Tracking";
import { usLocations, nationalShipments } from "./nationwide";

const money = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
const date = (d) =>
  new Date(d + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
const city = (s) => s.split(",")[0];
function Status({ value }) {
  const Icon =
    value === "Delivered"
      ? CheckCircle
      : value === "In transit"
        ? Truck
        : Clock;
  return (
    <span className={"status " + value.toLowerCase().replaceAll(" ", "-")}>
      <Icon size={20} />
      {value}
    </span>
  );
}
function Route({ item }) {
  return (
    <div className="route-stops">
      <p>
        <MapPin />
        {item.from}
      </p>
      <p>
        <MapPin />
        {item.to}
      </p>
    </div>
  );
}
function App({ account, initialData, initialPage }) {
  const role = account.role;
  const [listingSeed, setListingSeed] = useState(null);
  const initialShipments = initialData.shipments;
  const loads = initialData.loads;
  const [page, setPage] = useState(
      initialPage ||
        (role === "business"
          ? new URLSearchParams(window.location.search).get("view") ===
            "tracking"
            ? "Package tracking"
            : "Shipments"
          : "Find loads"),
    ),
    [shipments, setShipments] = useWorkspaceField("shipments"),
    [jobs, setJobs] = useWorkspaceField("jobs"),
    [packages, setPackages] = useWorkspaceField("packages"),
    [selected, setSelected] = useState(initialShipments[0].id),
    [selectedLoad, setSelectedLoad] = useState(loads[0].id),
    [service, setService] = useState("Standard"),
    [modal, setModal] = useState(null),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [equipment, setEquipment] = useState("All equipment");
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    const dialog = document.querySelector("dialog");
    if (!dialog.open) dialog.showModal();
    const focusable = () =>
      [...dialog.querySelectorAll("button,input,select,[href]")].filter(
        (el) => !el.disabled,
      );
    focusable()[0]?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setModal(null);
      }
      if (e.key === "Tab") {
        const items = focusable(),
          first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = old;
      if (dialog.open) dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [modal]);
  useEffect(() => {
    document.title = `${page} | Shypit`;
    document.getElementById("main-content")?.focus();
    window.scrollTo(0, 0);
  }, [page]);
  const shipment = shipments.find((s) => s.id === selected) ?? shipments[0],
    load = loads.find((s) => s.id === selectedLoad) ?? loads[0];
  const total = shipment.price + (service === "Priority" ? 175 : 0);
  const tabs =
    role === "business"
      ? ["Shipments", "Load board", "Package tracking", "Network", "Billing"]
      : ["Find loads", "My jobs", "Earnings", "Documents"];
  const revealDetails = () => {
    if (window.matchMedia("(max-width: 700px)").matches)
      setTimeout(
        () =>
          document
            .querySelector("aside")
            ?.scrollIntoView({ behavior: "instant", block: "start" }),
        0,
      );
  };
  const flash = (t) => {
    setNotice(t);
    setTimeout(() => setNotice(""), 5000);
  };
  function book() {
    setShipments((all) =>
      all.map((s) =>
        s.id === shipment.id
          ? { ...s, status: "Awaiting carrier", service, price: total }
          : s,
      ),
    );
    setModal(null);
    flash("Shipment booked in demo. Awaiting carrier confirmation.");
  }
  function accept() {
    if (jobs.some((j) => j.id === load.id)) return;
    setJobs((all) => [...all, { ...load, status: "Accepted", proof: "" }]);
    setModal(null);
    setPage("My jobs");
    flash("Demo load accepted. Your pickup details are ready.");
  }
  function advance(job) {
    setJobs((all) =>
      all.map((j) =>
        j.id === job.id
          ? {
              ...j,
              status: j.status === "Accepted" ? "In transit" : "Delivered",
            }
          : j,
      ),
    );
    flash(
      job.status === "Accepted"
        ? "Pickup confirmed. Job is now in transit."
        : "Delivery confirmed. Payout marked pending.",
    );
  }
  const filtered = loads.filter(
    (l) =>
      !jobs.some((j) => j.id === l.id) &&
      (!query ||
        `${l.from} ${l.to}`.toLowerCase().includes(query.toLowerCase())) &&
      (equipment === "All equipment" || l.equipment === equipment),
  );
  return (
    <>
      <header className="topbar">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setPage(tabs[0]);
          }}
        >
          <Brand light />
        </a>
        <nav aria-label="Main navigation">
          {tabs.map((t) => (
            <button
              key={t}
              aria-current={
                page === t || (page === "Practice loads" && t === "Find loads")
                  ? "page"
                  : undefined
              }
              className={
                page === t || (page === "Practice loads" && t === "Find loads")
                  ? "active"
                  : ""
              }
              onClick={() => {
                if (t === "Load board") setListingSeed(null);
                setPage(t);
              }}
            >
              {t}
            </button>
          ))}
        </nav>
        <div className="role">
          <Buildings size={21} />
          <span>{account.display_name || account.email}</span>
        </div>
      </header>
      <div className="demo-bar" role="region" aria-label="Pilot status">
        <Info size={16} />
        <span>
          {["Load board", "Find loads", "My jobs"].includes(page)
            ? "Private pilot · Member bookings · Dispatch and payments not connected"
            : "Private pilot · Sample rates and dates · Workspace access restricted"}
        </span>
      </div>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle />
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X />
          </button>
        </div>
      )}
      {page === "Load board" || (role === "driver" && page === "Find loads") ? (
        <Marketplace
          key={account.workspace_id}
          account={account}
          seed={listingSeed}
          onPractice={() => setPage("Practice loads")}
          onJobs={() => setPage("My jobs")}
        />
      ) : page === "Package tracking" ? (
        <Tracking
          packages={packages}
          setPackages={setPackages}
          shipments={shipments}
          onFreight={() => setPage("Shipments")}
        />
      ) : role === "business" && page === "Shipments" ? (
        <main id="main-content" tabIndex={-1} className="workspace">
          <section className="main-panel">
            <div className="heading-row">
              <div>
                <p className="eyebrow">YOUR SHIPPING WORKSPACE</p>
                <h1>Keep your freight moving.</h1>
                <p className="muted subtitle">
                  Plan U.S. routes from Connecticut to the West Coast and
                  beyond. All rates and carrier availability are illustrative.
                </p>
              </div>
              <button className="small-button" onClick={() => setModal("new")}>
                <Plus />
                New shipment
              </button>
            </div>
            <div className="national-intro">
              <strong>U.S. shipping review</strong>
              <p>
                Create a freight shipment between any U.S. locations, or track
                individual packages and carrier handoffs.
              </p>
              <button
                className="small-button"
                onClick={() => setPage("Package tracking")}
              >
                Test package shipping
              </button>
              <button
                className="small-button"
                onClick={() => {
                  setShipments((all) => [
                    ...all,
                    ...nationalShipments.filter(
                      (s) => !all.some((p) => p.id === s.id),
                    ),
                  ]);
                  setSelected("SHP-US-CT");
                  revealDetails();
                }}
              >
                Explore Connecticut freight
              </button>
            </div>
            <div className="shipment-table">
              <div className="table-head">
                <span>Route</span>
                <span>Pickup</span>
                <span>Service</span>
                <span>Status</span>
              </div>
              {shipments.map((s) => (
                <button
                  key={s.id}
                  aria-pressed={shipment.id === s.id}
                  className={
                    "shipment-row " + (shipment.id === s.id ? "selected" : "")
                  }
                  onClick={() => {
                    setSelected(s.id);
                    setService(
                      s.service === "Priority" ? "Priority" : "Standard",
                    );
                    revealDetails();
                  }}
                >
                  <span className="route-cell">
                    <Truck size={24} />
                    <strong>
                      {city(s.from)} <span className="route-arrow">→</span>{" "}
                      {city(s.to)}
                    </strong>
                    <small>{s.id}</small>
                  </span>
                  <span className="pickup-cell">
                    <CalendarBlank size={20} />
                    {date(s.pickup)}
                  </span>
                  <span className="service-cell">
                    <Package size={20} />
                    {s.service}
                  </span>
                  <Status value={s.status} />
                </button>
              ))}
            </div>
            <section className="recent">
              <h2>Repeat a recent route</h2>
              {initialShipments
                .filter((s) => s.from.startsWith("Phoenix"))
                .map((s) => (
                  <button
                    className="recent-row"
                    key={s.id}
                    onClick={() => {
                      setSelected(s.id);
                      setModal("repeat");
                    }}
                  >
                    <ArrowsClockwise size={23} />
                    <span>
                      {city(s.from)} → {city(s.to)}
                    </span>
                    <span className="link">
                      Book again <ArrowRight />
                    </span>
                  </button>
                ))}
            </section>
            <p className="footnote">
              <CheckCircle /> Your next shipment, without the back-and-forth.
            </p>
          </section>
          <aside className="details">
            <p className="eyebrow">SHIPMENT DETAILS · {shipment.id}</p>
            <h2>
              {city(shipment.from)} to
              <br />
              {city(shipment.to)}
            </h2>
            <Route item={shipment} />
            <div className="specs">
              <span>
                <Package />
                {shipment.pallets} pallets
              </span>
              <span>{shipment.weight.toLocaleString()} lb</span>
              <span>
                <Truck />
                {shipment.equipment}
              </span>
            </div>
            {shipment.status === "Ready to book" ? (
              <>
                <h3>Select service</h3>
                {["Standard", "Priority"].map((s) => (
                  <label
                    className={
                      "service-option " + (service === s ? "chosen" : "")
                    }
                    key={s}
                  >
                    <input
                      type="radio"
                      name="service"
                      value={s}
                      checked={service === s}
                      onChange={() => setService(s)}
                    />
                    <span>
                      <strong>{s}</strong>
                      <small>
                        {s === "Standard"
                          ? "Typical 1–2 day transit"
                          : "Faster service, target next-day"}
                      </small>
                    </span>
                    <span className="price">
                      <strong>
                        {money(shipment.price + (s === "Priority" ? 175 : 0))}
                      </strong>
                      <small>Illustrative</small>
                    </span>
                  </label>
                ))}
                <p className="helper">
                  <Info />
                  Freight and service fee included
                </p>
                <button className="primary" onClick={() => setModal("review")}>
                  Review & book <ArrowRight />
                </button>
              </>
            ) : (
              <>
                <h3>Shipment progress</h3>
                <Status value={shipment.status} />
                <ol className="timeline">
                  <li>Shipment booked</li>
                  <li>
                    {shipment.status === "Awaiting carrier"
                      ? "Waiting for carrier confirmation"
                      : "Carrier assigned"}
                  </li>
                  <li>Pickup · {date(shipment.pickup)}</li>
                  <li>Delivery · {date(shipment.delivery)}</li>
                </ol>
                <p className="helper">
                  Tracking shown is sample data. Live location is not connected.
                </p>
              </>
            )}
            <button
              className="small-button"
              onClick={() => {
                setListingSeed({ ...shipment });
                setPage("Load board");
              }}
            >
              Post this shipment to load board
            </button>
            <div className="membership">
              <Buildings size={24} />
              <div>
                <strong>Business plan</strong>
                <p>
                  Book freight, work with eligible carriers, and keep your team
                  in the loop.
                </p>
              </div>
            </div>
          </aside>
        </main>
      ) : role === "driver" && page === "Practice loads" ? (
        <main id="main-content" tabIndex={-1} className="workspace">
          <section className="main-panel">
            <button
              className="text-button"
              onClick={() => setPage("Find loads")}
            >
              Back to member load board
            </button>
            <p className="eyebrow">PRACTICE LOADS · SAMPLE DATA</p>
            <h1>Find your next good mile.</h1>
            <p className="muted subtitle">
              Clear payouts. Loads that fit your route.
            </p>
            <div className="filters">
              <label>
                Route or city
                <input
                  placeholder="Search Phoenix, Los Angeles…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label>
                Equipment
                <select
                  aria-label="Equipment"
                  value={equipment}
                  onChange={(e) => setEquipment(e.target.value)}
                >
                  <option>All equipment</option>
                  <option>Dry van</option>
                  <option>Box truck</option>
                </select>
              </label>
            </div>
            <h2>
              {filtered.length} available{" "}
              {filtered.length === 1 ? "load" : "loads"}
            </h2>
            <div className="load-list">
              {filtered.map((l) => (
                <button
                  className={
                    "load-row " + (selectedLoad === l.id ? "selected" : "")
                  }
                  key={l.id}
                  aria-pressed={selectedLoad === l.id}
                  onClick={() => {
                    setSelectedLoad(l.id);
                    revealDetails();
                  }}
                >
                  <div>
                    <strong>
                      {city(l.from)} → {city(l.to)}
                    </strong>
                    <small>
                      {l.equipment} · {l.pallets} pallets · Pickup{" "}
                      {date(l.pickup)}
                    </small>
                    <small>
                      {l.deadhead} mi to pickup · {l.miles} loaded mi
                    </small>
                  </div>
                  <div className="load-pay">
                    <strong>{money(l.pay)}</strong>
                    <small>
                      ${(l.pay / (l.miles + l.deadhead)).toFixed(2)}/total mi
                    </small>
                  </div>
                </button>
              ))}
              {!filtered.length && (
                <Empty
                  title="No matching loads"
                  text="Try another city or equipment type. Accepted loads are in My jobs."
                />
              )}
            </div>
            <p className="helper">
              <Info />
              Payout per mile includes travel to pickup. Fuel and operating
              expenses are not deducted.
            </p>
          </section>
          <aside className="details">
            <p className="eyebrow">LOAD DETAILS · {load.id}</p>
            <h2>
              {city(load.from)} to
              <br />
              {city(load.to)}
            </h2>
            <Route item={load} />
            <div className="payout">
              <small>Driver payout · illustrative</small>
              <strong>{money(load.pay)}</strong>
            </div>
            <dl>
              <div>
                <dt>Pickup</dt>
                <dd>
                  {date(load.pickup)} · {load.window}
                </dd>
              </div>
              <div>
                <dt>Delivery</dt>
                <dd>{date(load.delivery)}</dd>
              </div>
              <div>
                <dt>Cargo</dt>
                <dd>{load.cargo}</dd>
              </div>
              <div>
                <dt>Equipment</dt>
                <dd>
                  {load.equipment} · {load.weight.toLocaleString()} lb
                </dd>
              </div>
              <div>
                <dt>Travel</dt>
                <dd>
                  {load.deadhead} empty + {load.miles} loaded miles
                </dd>
              </div>
            </dl>
            <p className="helper">
              <Info />
              Demo acceptance only. Live booking requires verified carrier
              authority, insurance, and availability. Waiting-time terms must be
              agreed before booking.
            </p>
            <button
              className="primary"
              disabled={jobs.some((j) => j.id === load.id)}
              onClick={() => setModal("accept")}
            >
              {jobs.some((j) => j.id === load.id)
                ? "Already accepted"
                : "Review load"}
              <ArrowRight />
            </button>
          </aside>
        </main>
      ) : (
        <main id="main-content" tabIndex={-1} className="simple-page">
          {role === "driver" && page === "My jobs" ? (
            <>
              <Marketplace account={account} bookingsOnly />
              <h2>Practice jobs</h2>
              <p className="muted">
                Sample pickup, proof, and earnings flows. Manage each stop when
                safely parked.
              </p>
              {!jobs.length ? (
                <Empty
                  title="No practice jobs yet"
                  text="Practice jobs and illustrative earnings are separate from your member bookings."
                  action={() => setPage("Practice loads")}
                  label="Explore practice loads"
                />
              ) : (
                jobs.map((j) => (
                  <article className="job" key={j.id}>
                    <div className="job-heading">
                      <div>
                        <small>{j.id}</small>
                        <h2>
                          {city(j.from)} → {city(j.to)}
                        </h2>
                      </div>
                      <Status value={j.status} />
                    </div>
                    <p>
                      {j.equipment} · {j.pallets} pallets · {money(j.pay)}{" "}
                      payout
                    </p>
                    <p>
                      Pickup {date(j.pickup)} · {j.window} · Delivery{" "}
                      {date(j.delivery)}
                    </p>
                    {j.status === "In transit" && (
                      <label className="proof">
                        Delivery document (filename saved to workspace; no file
                        upload)
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) => {
                            const name = e.target.files[0]?.name || "";
                            setJobs((all) =>
                              all.map((x) =>
                                x.id === j.id ? { ...x, proof: name } : x,
                              ),
                            );
                          }}
                        />
                        {j.proof && <span>{j.proof}</span>}
                      </label>
                    )}
                    {j.status !== "Delivered" ? (
                      <button
                        className="primary compact"
                        disabled={j.status === "In transit" && !j.proof}
                        onClick={() => advance(j)}
                      >
                        {j.status === "Accepted"
                          ? "Confirm pickup"
                          : "Confirm delivery"}
                      </button>
                    ) : (
                      <p className="helper">
                        <CheckCircle />
                        Delivery recorded · {j.proof} · Payout pending (demo)
                      </p>
                    )}
                  </article>
                ))
              )}
            </>
          ) : page === "Earnings" ? (
            <>
              <p className="eyebrow">EVERY MILE COUNTS</p>
              <h1>Your earnings.</h1>
              <p className="muted">
                Illustrative ledger. No real payments are processed.
              </p>
              <Banking kind="driver" />
              <div className="earnings-summary">
                <Wallet size={32} />
                <div>
                  <small>Pending payout</small>
                  <strong>
                    {money(
                      jobs
                        .filter((j) => j.status === "Delivered")
                        .reduce((n, j) => n + j.pay, 0),
                    )}
                  </strong>
                </div>
              </div>
              {jobs
                .filter((j) => j.status === "Delivered")
                .map((j) => (
                  <div className="ledger" key={j.id}>
                    <span>
                      {j.id} · {city(j.from)} → {city(j.to)}
                    </span>
                    <strong>{money(j.pay)}</strong>
                    <span>Pending</span>
                  </div>
                ))}
              {!jobs.some((j) => j.status === "Delivered") && (
                <Empty
                  title="No completed deliveries yet"
                  text="Completed jobs will appear here with their payout status."
                />
              )}
            </>
          ) : page === "Documents" ? (
            <>
              <p className="eyebrow">CARRIER READINESS</p>
              <h1>Your documents.</h1>
              <p className="muted">
                Before live bookings, carrier authority and insurance must be
                verified.
              </p>
              {[
                "Operating authority",
                "Insurance certificate",
                "Driver and equipment details",
              ].map((t) => (
                <div className="document" key={t}>
                  <FileText size={28} />
                  <div>
                    <h2>{t}</h2>
                    <p>Not connected · secure verification coming later</p>
                  </div>
                </div>
              ))}
              <p className="helper">
                Do not upload sensitive documents to this demo.
              </p>
            </>
          ) : page === "Network" ? (
            <>
              <p className="eyebrow">PEOPLE BEHIND THE MILES</p>
              <h1>Your carrier network.</h1>
              <p className="muted">
                Sample carrier profiles. Verification and dispatch integrations
                are not connected.
              </p>
              {["Desert West Transport", "Sonoran Freight Co."].map(
                (name, i) => (
                  <article className="document" key={name}>
                    <Truck size={32} />
                    <div>
                      <h2>{name}</h2>
                      <p>
                        {i ? "Southwest regional" : "Arizona & California"} ·
                        Dry van
                      </p>
                      <small>Sample profile · Verification pending</small>
                    </div>
                  </article>
                ),
              )}
            </>
          ) : (
            <>
              <p className="eyebrow">SIMPLE, TRANSPARENT COSTS</p>
              <h1>Your business plan.</h1>
              <p className="muted">
                A subscription for your team. A clear price for every shipment.
              </p>
              <div className="billing-plan">
                <Buildings size={32} />
                <div>
                  <h2>Business · Demo plan</h2>
                  <p>
                    Shipment workspace, carrier network, and team visibility.
                  </p>
                  <strong>Subscription pricing to be determined</strong>
                </div>
              </div>
              <Banking kind="business" />
              <h2>Shipment activity</h2>
              {shipments
                .filter((s) => s.status !== "Ready to book")
                .map((s) => (
                  <div className="ledger" key={s.id}>
                    <span>
                      {s.id} · {city(s.from)} → {city(s.to)}
                    </span>
                    <strong>{money(s.price)}</strong>
                    <span>{s.status}</span>
                  </div>
                ))}
              <p className="helper">
                <Info />
                Real subscription billing and shipment charges are not enabled.
              </p>
            </>
          )}
        </main>
      )}
      <footer>
        <Brand /> <span>Better together. Mile after mile.</span>
        <span>Private workspace</span>
      </footer>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <dialog
            aria-modal="true"
            aria-labelledby="modal-title"
            onCancel={() => setModal(null)}
          >
            <SessionWarning />
            <button
              className="close"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X />
            </button>
            {modal === "new" || modal === "repeat" ? (
              <ShipmentForm
                repeat={modal === "repeat" ? shipment : null}
                onCancel={() => setModal(null)}
                onSave={(s) => {
                  setShipments((all) => [s, ...all]);
                  setSelected(s.id);
                  setService("Standard");
                  setModal(null);
                  flash(
                    "Shipment draft created. Review the illustrative quote.",
                  );
                }}
              />
            ) : modal === "review" ? (
              <>
                <p className="eyebrow">ONE LAST LOOK</p>
                <h2 id="modal-title">Review your shipment</h2>
                <Route item={shipment} />
                <p>
                  {shipment.pallets} pallets ·{" "}
                  {shipment.weight.toLocaleString()} lb · {shipment.equipment}
                </p>
                <p>
                  Pickup {date(shipment.pickup)} · {service}
                </p>
                <div className="ledger">
                  <span>Freight</span>
                  <strong>{money(total - 45)}</strong>
                </div>
                <div className="ledger">
                  <span>Service fee</span>
                  <strong>$45</strong>
                </div>
                <div className="ledger total">
                  <span>Total · illustrative</span>
                  <strong>{money(total)}</strong>
                </div>
                <p className="helper">
                  Demo booking only. No charge will be made and no carrier will
                  be dispatched.
                </p>
                <button className="primary" onClick={book}>
                  Confirm demo booking
                </button>
              </>
            ) : modal === "accept" ? (
              <>
                <h2 id="modal-title">Review this load</h2>
                <Route item={load} />
                <p>
                  {load.cargo} · {load.equipment}
                </p>
                <p>
                  {load.deadhead + load.miles} total miles · Pickup{" "}
                  {date(load.pickup)} {load.window}
                </p>
                <h3>{money(load.pay)} driver payout</h3>
                <p className="helper">
                  Sample offer. No real freight is reserved. Eligibility,
                  waiting-time terms, and payment terms require live
                  verification.
                </p>
                <button className="primary" onClick={accept}>
                  Accept demo load
                </button>
              </>
            ) : null}
          </dialog>
        </div>
      )}
    </>
  );
}
function Empty({ title, text, action, label }) {
  return (
    <div className="empty">
      <Package size={36} />
      <h2>{title}</h2>
      <p>{text}</p>
      {action && (
        <button className="primary compact" onClick={action}>
          {label}
        </button>
      )}
    </div>
  );
}
function ShipmentForm({ repeat, onSave, onCancel }) {
  const [error, setError] = useState("");
  function submit(e) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    if (d.from.trim().toLowerCase() === d.to.trim().toLowerCase()) {
      setError("Pickup and delivery must be different locations.");
      return;
    }
    if (d.delivery < d.pickup) {
      setError("Delivery must be on or after pickup.");
      return;
    }
    onSave({
      ...d,
      from: d.from.trim(),
      to: d.to.trim(),
      pallets: Number(d.pallets),
      weight: Number(d.weight),
      id: "SHP-" + Date.now().toString().slice(-6),
      status: "Ready to book",
      service: "Standard",
      price: 965,
    });
  }
  return (
    <form onSubmit={submit}>
      <p className="eyebrow">LET’S GET IT MOVING</p>
      <h2 id="modal-title">{repeat ? "Repeat a route" : "New shipment"}</h2>
      <p className="helper">
        Enter any U.S. city and state, DC, or territory. Suggestions are
        optional. Demo quotes use a fixed sample rate; route pricing and carrier
        availability are not connected. Alaska, Hawaii and territory service
        requires carrier confirmation.
      </p>
      <datalist id="us-shipment-locations">
        {usLocations.map((location) => (
          <option key={location} value={location} />
        ))}
      </datalist>
      <div className="form-grid">
        <label>
          Pickup location
          <input
            required
            name="from"
            defaultValue={repeat?.from}
            placeholder="City, state (e.g. Hartford, CT)"
            list="us-shipment-locations"
            maxLength={80}
          />
        </label>
        <label>
          Delivery location
          <input
            required
            name="to"
            defaultValue={repeat?.to}
            placeholder="City, state (e.g. Hartford, CT)"
            list="us-shipment-locations"
            maxLength={80}
          />
        </label>
        <label>
          Pickup date
          <input required type="date" name="pickup" />
        </label>
        <label>
          Delivery date
          <input required type="date" name="delivery" />
        </label>
        <label>
          Pallets
          <input
            required
            type="number"
            name="pallets"
            min="1"
            max="30"
            defaultValue={repeat?.pallets ?? 8}
          />
        </label>
        <label>
          Total weight (lb)
          <input
            required
            type="number"
            name="weight"
            min="1"
            max="45000"
            defaultValue={repeat?.weight ?? 6400}
          />
        </label>
        <label>
          Equipment
          <select
            name="equipment"
            defaultValue={repeat?.equipment ?? "Dry van"}
          >
            <option>Dry van</option>
            <option>Box truck</option>
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="primary" type="submit">
        Create shipment draft <ArrowRight />
      </button>
      <button className="text-button" type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
createRoot(document.getElementById("root")).render(
  <>
    <a className="skip-link" href="#main-content">
      Skip to main content
    </a>
    {hasBankingReturn() ? (
      <BankingReturn>
        <AuthGate>{(props) => <App {...props} />}</AuthGate>
      </BankingReturn>
    ) : (
      <AuthGate>{(props) => <App {...props} />}</AuthGate>
    )}
  </>,
);
