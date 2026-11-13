export const packageStatuses = [
  "Queued",
  "Picked up",
  "In transit",
  "Out for delivery",
  "Delivered",
  "Exception",
];
export const packageKey = "shypit.packages.v1";
export const samplePackages = [
  {
    id: "PKG-DEMO-1001",
    number: "SHYP-DEMO-1001",
    carrier: "Shypit",
    company: "Acme Supply Co.",
    reference: "PO-2048",
    shipment: "SHP-1041",
    from: "Tucson, AZ",
    to: "Albuquerque, NM",
    eta: "2026-11-13",
    status: "In transit",
    events: [
      {
        id: "demo-1",
        status: "Queued",
        location: "Tucson, AZ",
        note: "Sample package registered",
        at: "2026-11-12T15:00:00Z",
      },
      {
        id: "demo-2",
        status: "In transit",
        location: "Socorro, NM",
        note: "Sample departure from transfer facility",
        at: "2026-11-13T14:00:00Z",
      },
    ],
  },
];
export function normalizeNumber(value) {
  return value.trim().toUpperCase();
}
export function intakePackages(rows, existing, now = new Date().toISOString()) {
  const seen = new Set(
    existing.map(
      (p) => `${p.carrier.toLowerCase()}|${normalizeNumber(p.number)}`,
    ),
  );
  const accepted = [],
    errors = [];
  rows.forEach((raw, index) => {
    const p = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, String(v ?? "").trim()]),
    );
    p.number = normalizeNumber(p.number || "");
    const key = `${(p.carrier || "").toLowerCase()}|${p.number}`;
    if (!p.number || !p.company || !p.carrier || !p.from || !p.to) {
      errors.push(
        `Row ${index + 1}: number, company, carrier, origin and destination are required.`,
      );
      return;
    }
    if (!/^[A-Z0-9][A-Z0-9._ /-]{0,99}$/.test(p.number)) {
      errors.push(
        `Row ${index + 1}: invalid package number (maximum 100 characters).`,
      );
      return;
    }
    if (seen.has(key)) {
      errors.push(
        `Row ${index + 1}: ${p.number} already exists for ${p.carrier}.`,
      );
      return;
    }
    if (
      p.eta &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(p.eta) ||
        !Number.isFinite(Date.parse(p.eta + "T12:00:00Z")) ||
        new Date(p.eta + "T12:00:00Z").toISOString().slice(0, 10) !== p.eta)
    ) {
      errors.push(`Row ${index + 1}: invalid estimated delivery date.`);
      return;
    }
    seen.add(key);
    accepted.push({
      ...p,
      id: crypto.randomUUID(),
      status: "Queued",
      events: [
        {
          id: crypto.randomUUID(),
          status: "Queued",
          location: p.from,
          note: "Package added to operations queue",
          at: now,
        },
      ],
    });
  });
  return { accepted, errors };
}
export function companyUpdate(p) {
  return [
    `Shypit shipment update`,
    `Company: ${p.company}`,
    `Package: ${p.number}`,
    `Carrier: ${p.carrier}`,
    `Reference: ${p.reference || "—"}`,
    `Route: ${p.from} → ${p.to}`,
    `Status: ${p.status}`,
    `Estimated delivery: ${p.eta || "Not available"}`,
    "",
    ...p.events.map(
      (e) =>
        `${new Date(e.at).toLocaleString(undefined, { timeZoneName: "short" })} · ${e.status} · ${e.location}\n${e.note}`,
    ),
    "",
    "Demo report: manually recorded updates; no live carrier connection.",
  ].join("\n");
}
