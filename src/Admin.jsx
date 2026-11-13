import Brand from "./Brand";
import React, { useEffect, useState } from "react";
import "./admin.css";
const sections = {
  stats: "Overview",
  operations: "Operations",
  access: "People & permissions",
  testing: "Build & test",
  audit: "Audit history",
};
const time = (value) => new Date(value).toLocaleString();
export default function Admin({ request, profile, onAccessChanged }) {
  const [section, setSection] = useState(profile.capabilities[0] || "");
  const [response, setResponse] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const data = response?.section === section ? response.value : null;
  function setData(value) {
    setResponse(value === null ? null : { section, value });
  }
  async function load() {
    if (!section) return;
    setBusy(true);
    setError("");
    setData(null);
    try {
      setData(await request("shypit_admin_read", { p_section: section }));
    } catch {
      setError("Unable to load this section. Your access may have changed.");
      onAccessChanged();
    } finally {
      setBusy(false);
    }
  }
  const permissions = profile.capabilities.join(",");
  useEffect(() => {
    if (!profile.capabilities.includes(section)) {
      setData(null);
      setSection(profile.capabilities[0] || "");
      return;
    }
    load();
  }, [section, permissions]);
  async function change(action, target, options) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request("shypit_admin_change", {
        p_action: action,
        p_target: target,
        p_options: options,
      });
      await load();
      setNotice("Access updated. The change is recorded in audit history.");
    } catch {
      setError(
        "Access could not be updated. Check your owner permissions and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-shell">
      <header className="admin-header">
        <a className="brand" href="#">
          <Brand />
        </a>
        <span className="admin-badge">
          ADMIN · {profile.owner ? "OWNER" : "LIMITED ACCESS"}
        </span>
      </header>
      <div className="admin-heading">
        <div>
          <p className="eyebrow">YOUR PLATFORM, AT A GLANCE</p>
          <h1>Keep good work moving.</h1>
          <p className="muted">
            Review the pilot, test the experience, and control who has access.
          </p>
        </div>
        <button onClick={load} disabled={busy}>
          Refresh data
        </button>
      </div>
      <nav className="admin-tabs" aria-label="Administration">
        {profile.capabilities.map((key) => (
          <button
            key={key}
            aria-current={section === key ? "page" : undefined}
            onClick={() => {
              setSection(key);
              setNotice("");
            }}
          >
            {sections[key]}
          </button>
        ))}
      </nav>
      {busy && <p role="status">Loading secure admin data…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {data && section === "stats" && (
        <>
          <div className="admin-metrics">
            {[
              ["Workspaces", data.workspaces],
              ["Active memberships", data.active_memberships],
              ["Shipment records", data.shipments],
              ["Carrier jobs", data.jobs],
              ["Tracked packages", data.packages],
            ].map(([label, value]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          <section className="admin-card">
            <h2>A clear view of the pilot</h2>
            <p>
              These counts come from saved workspace records, including sample
              freight. They are not revenue, completed transactions, or verified
              real-world deliveries.
            </p>
            <p>
              Use Switch workspace to test the company and carrier experiences
              with your assigned access.
            </p>
          </section>
        </>
      )}
      {data && section === "operations" && (
        <section className="admin-card">
          <h2>Workspace review</h2>
          <p className="muted">
            Read-only review of saved company and carrier records.
          </p>
          {data.map((w) => (
            <details key={w.id}>
              <summary>
                {w.kind === "business" ? "Company" : "Carrier"} workspace ·
                revision {w.revision}
              </summary>
              <small>{w.id}</small>
              {["shipments", "jobs", "packages"].map((field) => (
                <div key={field}>
                  <h3>
                    {field[0].toUpperCase() + field.slice(1)} (
                    {w.data[field]?.length || 0})
                  </h3>
                  {!w.data[field]?.length ? (
                    <p className="muted">No records yet.</p>
                  ) : (
                    <div className="admin-records">
                      {w.data[field].map((record, index) => (
                        <article
                          key={record.id || index}
                          className="admin-record"
                        >
                          <strong>
                            {record.id ||
                              record.trackingNumber ||
                              "Record " + (index + 1)}
                          </strong>
                          <p>
                            {record.from || record.origin || "Origin pending"} →{" "}
                            {record.to ||
                              record.destination ||
                              "Destination pending"}
                          </p>
                          <span>{record.status || "Status pending"}</span>
                          {record.pickup && (
                            <p className="muted">
                              Pickup: {record.pickup} · Delivery:{" "}
                              {record.delivery || "Pending"}
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </details>
          ))}
        </section>
      )}
      {data && section === "access" && (
        <section className="admin-card">
          <h2>People & permissions</h2>
          <p>
            {profile.owner
              ? "Grant only the permissions each person needs. Founder accounts are protected."
              : "You can review access. An owner must make changes."}{" "}
            Admin permissions apply across the pilot.
          </p>
          <p className="muted">
            Only verified accounts already in Shypit appear here. New account
            invitations require project administrator provisioning.
          </p>
          {data.users.map((user) => (
            <AccessUser
              key={user.id}
              user={user}
              memberships={data.memberships.filter(
                (m) => m.user_id === user.id,
              )}
              canEdit={profile.owner && !user.owner}
              busy={busy}
              change={change}
            />
          ))}
        </section>
      )}
      {data && section === "testing" && (
        <section className="admin-card">
          <p className="eyebrow">PRIVATE PILOT</p>
          <h2>Build, test, and review</h2>
          <p>
            Test both assigned workspaces on mobile and desktop. Confirm a
            shipment, find a load, complete the carrier steps, and review
            package updates. Changes made in those workspaces are saved; use
            clearly labeled test records.
          </p>
          <div className="admin-links">
            <a
              href="https://github.com/adoblake/shypit/tree/feat/shypit-foundation"
              target="_blank"
              rel="noreferrer"
            >
              Review source & changes ↗
            </a>
            <a
              href="https://github.com/adoblake/shypit/actions"
              target="_blank"
              rel="noreferrer"
            >
              Build & deployment checks ↗
            </a>
            <a href="walkthrough/" target="_blank" rel="noreferrer">
              Watch admin & shipment workflows ↗
            </a>
          </div>
          <h3>Before a real shipment</h3>
          <p>
            Dispatch, payments, GPS, secure document uploads, and cross-company
            synchronization are still pending. The walkthrough and saved freight
            examples are simulations.
          </p>
          <p className="muted">
            GitHub and Supabase keep their own access controls. Admin status
            here does not grant repository or infrastructure access.
          </p>
        </section>
      )}
      {data && section === "audit" && (
        <section className="admin-card">
          <h2>Access change history</h2>
          <p className="muted">
            Latest 100 admin access changes. This is not a full shipment
            activity log.
          </p>
          {!data.length ? (
            <p>No admin access changes yet.</p>
          ) : (
            data.map((event) => (
              <details key={event.id}>
                <summary>
                  {event.action} · {time(event.created_at)}
                </summary>
                <p>
                  Actor: {event.actor}
                  <br />
                  Target: {event.target}
                </p>
                <pre>{JSON.stringify(event.details, null, 2)}</pre>
              </details>
            ))
          )}
        </section>
      )}
    </main>
  );
}
function AccessUser({ user, memberships, canEdit, busy, change }) {
  const [caps, setCaps] = useState(user.capabilities),
    [active, setActive] = useState(user.active),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    setCaps(user.capabilities);
    setActive(user.active);
    setConfirm(false);
  }, [user]);
  return (
    <article className="admin-person">
      <h3>{user.email}</h3>
      <p>
        {user.owner
          ? "Protected owner"
          : user.active
            ? "Limited admin"
            : "No admin access"}
      </p>
      {!user.owner && (
        <>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={active}
              disabled={!canEdit || busy}
              onChange={(e) => {
                setActive(e.target.checked);
                setConfirm(false);
              }}
            />
            Admin access enabled
          </label>
          <fieldset disabled={!canEdit || busy}>
            <legend>Admin permissions</legend>
            {Object.entries(sections).map(([key, label]) => (
              <label className="admin-check" key={key}>
                <input
                  type="checkbox"
                  checked={caps.includes(key)}
                  onChange={(e) => {
                    setCaps(
                      e.target.checked
                        ? [...caps, key]
                        : caps.filter((c) => c !== key),
                    );
                    setConfirm(false);
                  }}
                />
                {label}
              </label>
            ))}
          </fieldset>
          {canEdit &&
            (confirm ? (
              <div className="admin-confirm">
                <p>Apply these admin permissions for {user.email}?</p>
                <button
                  disabled={busy}
                  onClick={() =>
                    change("admin-access", user.id, {
                      active,
                      capabilities: caps,
                    })
                  }
                >
                  Confirm admin changes
                </button>
                <button onClick={() => setConfirm(false)}>Cancel</button>
              </div>
            ) : (
              <button disabled={busy} onClick={() => setConfirm(true)}>
                Review admin changes
              </button>
            ))}
        </>
      )}
      <h4>Workspace access</h4>
      {memberships.map((m) => (
        <div className="admin-membership" key={m.workspace_id}>
          <span>
            {m.display_name} · {m.active ? "Active" : "Suspended"}
            {user.owner || m.finance_manager ? " · Finance manager" : ""}
          </span>
          {canEdit && m.active && (
            <button
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `${m.finance_manager ? "Remove" : "Grant"} finance management for ${user.email} in ${m.display_name}?`,
                  )
                )
                  change("finance-access", user.id, {
                    workspace_id: m.workspace_id,
                    active: !m.finance_manager,
                  });
              }}
            >
              {m.finance_manager
                ? "Remove finance access"
                : "Grant finance access"}
            </button>
          )}
          {canEdit && (
            <button
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    `${m.active ? "Suspend" : "Restore"} ${user.email}'s access to ${m.display_name}?`,
                  )
                )
                  change("membership-access", user.id, {
                    workspace_id: m.workspace_id,
                    active: !m.active,
                  });
              }}
            >
              {m.active ? "Suspend" : "Restore"}
            </button>
          )}
        </div>
      ))}
    </article>
  );
}
