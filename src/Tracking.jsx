import React, { useState } from "react";
import { usLocations, connecticutPackage } from "./nationwide";
import { packageStatuses, intakePackages, companyUpdate } from "./tracking";
const blank = {
  number: "",
  carrier: "Shypit",
  company: "Acme Supply Co.",
  reference: "",
  shipment: "",
  from: "",
  to: "",
  eta: "",
};
export default function Tracking({
  packages,
  setPackages,
  shipments,
  onFreight,
}) {
  const [draft, setDraft] = useState(blank),
    [mode, setMode] = useState("Single package"),
    [bulk, setBulk] = useState(""),
    [message, setMessage] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All statuses"),
    [selected, setSelected] = useState(packages[0]?.id),
    [companyView, setCompanyView] = useState(false);
  const item = packages.find((p) => p.id === selected);
  const visible = packages.filter(
    (p) =>
      (filter === "All statuses" || p.status === filter) &&
      `${p.number} ${p.company} ${p.reference} ${p.shipment} ${p.carrier} ${p.from} ${p.to}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function intake(e) {
    e.preventDefault();
    const rows =
      mode === "Bulk import"
        ? bulk
            .split(/\r?\n/)
            .filter((l) => l.trim())
            .map((l) => {
              const [
                number,
                carrier,
                company,
                from,
                to,
                reference = "",
                shipment = "",
                eta = "",
              ] = l.split("\t");
              return {
                number,
                carrier,
                company,
                from,
                to,
                reference,
                shipment,
                eta,
              };
            })
        : [draft];
    if (!rows.length) {
      setMessage("Enter at least one package.");
      return;
    }
    const { accepted, errors } = intakePackages(rows, packages);
    if (accepted.length) {
      setPackages((p) => [...accepted, ...p]);
      setSelected(accepted[0].id);
      if (mode === "Bulk import" && !errors.length) setBulk("");
      else if (mode !== "Bulk import") setDraft({ ...draft, number: "" });
    }
    setMessage(`${accepted.length} package(s) added. ${errors.join(" ")}`);
  }
  function update(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const event = {
      id: crypto.randomUUID(),
      status: form.get("status"),
      location: form.get("location").trim(),
      note: form.get("note").trim(),
      at: new Date().toISOString(),
    };
    if (!event.location || !event.note) {
      setMessage("Enter a location and update note.");
      return;
    }
    const eta = form.get("eta");
    setPackages((all) =>
      all.map((p) =>
        p.id === item.id
          ? { ...p, status: event.status, eta, events: [...p.events, event] }
          : p,
      ),
    );
    e.currentTarget.reset();
    setMessage("Travel update recorded. Check the workspace save status.");
  }
  const field = (key, label, type = "text") => (
    <label>
      {label}
      <input
        type={type}
        list={["from", "to"].includes(key) ? "us-package-locations" : undefined}
        required={["number", "company", "from", "to"].includes(key)}
        maxLength={key === "number" ? 100 : 200}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <main className="tms">
      <div className="heading-row">
        <div>
          <p className="eyebrow">TRANSPORTATION MANAGEMENT</p>
          <h1>Every package. Every handoff.</h1>
          <p className="muted">
            Register, queue, and follow packages across your shipping services.
          </p>
        </div>
        <span className="status">Manual tracking demo</span>
      </div>
      <datalist id="us-package-locations">
        {usLocations.map((location) => (
          <option key={location} value={location} />
        ))}
      </datalist>
      <section className="national-intro" aria-label="Shipping test guide">
        <p className="eyebrow">PARTNER TEST DRIVE · PACKAGES + FREIGHT</p>
        <h2>Start in Connecticut. Ship across the U.S.</h2>
        <p>
          Try any U.S. origin and destination. Locations in all 50 states, DC,
          and territories can be entered; actual carrier service is not verified
          by this demo.
        </p>
        <ol>
          <li>
            Open the Connecticut sample or add a package using a tracking number
            or scanner.
          </li>
          <li>
            Record pickup, an in-transit location, then delivery or an
            exception.
          </li>
          <li>Preview the company update and download the travel report.</li>
          <li>
            Switch to freight to create a pallet shipment, review a demo
            booking, or test a driver pickup and delivery.
          </li>
        </ol>
        <div className="national-actions">
          <button
            className="small-button"
            onClick={() => {
              setPackages((all) =>
                all.some((p) => p.id === connecticutPackage.id)
                  ? all
                  : [connecticutPackage, ...all],
              );
              setSelected(connecticutPackage.id);
              setFilter("All statuses");
              setQuery("");
              setCompanyView(false);
              setMessage(
                "Connecticut sample opened. Scroll to Package details to record its next handoff.",
              );
            }}
          >
            Open Connecticut test package
          </button>
          <button className="small-button" onClick={onFreight}>
            Test freight shipping
          </button>
        </div>
        <p className="muted">
          Members of the same approved business workspace share saved records.
          Use sample information.
        </p>
      </section>
      <div className="tms-metrics">
        {[
          ["Total packages", packages.length],
          ["In queue", packages.filter((p) => p.status === "Queued").length],
          [
            "On the move",
            packages.filter((p) =>
              ["Picked up", "In transit", "Out for delivery"].includes(
                p.status,
              ),
            ).length,
          ],
          [
            "Exceptions",
            packages.filter((p) => p.status === "Exception").length,
          ],
        ].map(([label, n]) => (
          <div key={label}>
            <strong>{n}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="helper">
        Packages save to your authorized workspace. Live carrier sync and
        automatic notifications are not connected. Use sample information.
      </p>
      {message && (
        <p role="status" className="tms-message">
          {message}
        </p>
      )}
      <div className="tms-grid">
        <section className="tms-card">
          <h2>Add to the queue</h2>
          <label>
            Intake method
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option>Single package</option>
              <option>Barcode scanner</option>
              <option>Bulk import</option>
            </select>
          </label>
          <form onSubmit={intake}>
            {mode === "Bulk import" ? (
              <label>
                Paste tab-separated rows
                <textarea
                  rows={7}
                  value={bulk}
                  onChange={(e) => setBulk(e.target.value)}
                  placeholder={
                    "Tracking number\tCarrier\tCompany\tOrigin\tDestination\tReference\tShipment ID\tETA (YYYY-MM-DD)"
                  }
                />
                <small>
                  One package per line. First five columns required. Valid rows
                  are added; duplicate or invalid rows are reported.
                </small>
              </label>
            ) : (
              <>
                <p className="muted">
                  {mode === "Barcode scanner"
                    ? "Use a USB/Bluetooth scanner in the package number field, then review and add. Camera scanning is not enabled."
                    : "Use an existing carrier number, barcode value, or generate a Shypit number."}
                </p>
                <div className="form-grid">
                  {field("number", "Package / barcode number")}
                  <label>
                    Carrier
                    <select
                      value={draft.carrier}
                      onChange={(e) =>
                        setDraft({ ...draft, carrier: e.target.value })
                      }
                    >
                      {["Shypit", "UPS", "FedEx", "USPS", "DHL", "Other"].map(
                        (c) => (
                          <option key={c}>{c}</option>
                        ),
                      )}
                    </select>
                  </label>
                  {field("company", "Company")}
                  {field("reference", "Order / PO reference")}
                  {field("from", "Origin")}
                  {field("to", "Destination")}
                  {field("eta", "Estimated delivery", "date")}
                  <label>
                    Linked shipment
                    <select
                      value={draft.shipment}
                      onChange={(e) =>
                        setDraft({ ...draft, shipment: e.target.value })
                      }
                    >
                      <option value="">Standalone package</option>
                      {shipments.map((s) => (
                        <option key={s.id}>{s.id}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  className="small-button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      number: "SHYP-" + crypto.randomUUID().toUpperCase(),
                    })
                  }
                >
                  Generate package number
                </button>
              </>
            )}
            <button className="primary" type="submit">
              Add to queue
            </button>
          </form>
        </section>
        <section className="tms-card">
          <h2>Package queue</h2>
          <label>
            Search packages
            <input
              placeholder="Number, company, reference…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            Filter status
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {["All statuses", ...packageStatuses].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <div className="tms-queue">
            {visible.map((p) => (
              <button
                key={p.id}
                className={
                  "tms-package " + (p.id === selected ? "selected" : "")
                }
                aria-pressed={p.id === selected}
                onClick={() => {
                  setSelected(p.id);
                  setCompanyView(false);
                }}
              >
                <strong>{p.number}</strong>
                <span>
                  {p.company} · {p.carrier}
                </span>
                <span>
                  {p.from} → {p.to}
                </span>
                <span
                  className={
                    "status " + (p.status === "Exception" ? "exception" : "")
                  }
                >
                  {p.status}
                </span>
              </button>
            ))}
            {!visible.length && <p>No packages match this view.</p>}
          </div>
        </section>
      </div>
      {item && (
        <section className="tms-card tms-detail">
          <div className="heading-row">
            <div>
              <p className="eyebrow">
                {companyView ? "COMPANY UPDATE PREVIEW" : "PACKAGE DETAILS"}
              </p>
              <h2>{item.number}</h2>
            </div>
            <button
              className="small-button"
              onClick={() => setCompanyView(!companyView)}
            >
              {companyView ? "Back to operations" : "Preview company update"}
            </button>
          </div>
          <p>
            {item.company} · {item.carrier} ·{" "}
            {item.reference || "No order reference"} ·{" "}
            {item.shipment || "Standalone package"}
          </p>
          <div className="tms-route">
            <strong>
              {item.from} → {item.to}
            </strong>
            <span className="status">{item.status}</span>
            <span>Estimated delivery: {item.eta || "Not available"}</span>
          </div>
          <div className="tms-grid">
            <div>
              <h3>Travel history</h3>
              <ol className="tms-timeline">
                {[...item.events].reverse().map((e) => (
                  <li key={e.id}>
                    <strong>
                      {e.status} · {e.location}
                    </strong>
                    <time dateTime={e.at}>
                      {new Date(e.at).toLocaleString(undefined, {
                        timeZoneName: "short",
                      })}
                    </time>
                    <p>{e.note}</p>
                  </li>
                ))}
              </ol>
            </div>
            {!companyView && (
              <form key={item.id} onSubmit={update}>
                <h3>Record a travel update</h3>
                <label>
                  New status
                  <select name="status" defaultValue={item.status}>
                    {packageStatuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Current location
                  <input name="location" required maxLength={200} />
                </label>
                <label>
                  Update note
                  <textarea name="note" required maxLength={1000} rows={3} />
                </label>
                <label>
                  Estimated delivery
                  <input type="date" name="eta" defaultValue={item.eta} />
                </label>
                <button className="primary">Save travel update</button>
              </form>
            )}
          </div>
          {companyView && (
            <>
              <p className="muted">
                Preview only. Download a report to share through your own
                communication channel; no notification is sent.
              </p>
              <button
                className="small-button"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([companyUpdate(item)], { type: "text/plain" }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "shypit-package-update.txt";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Download company update
              </button>
            </>
          )}
        </section>
      )}
    </main>
  );
}
