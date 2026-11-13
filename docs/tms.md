# Package tracking / TMS

Open **Business → Package tracking**. This module extends the existing Shypit React demo and uses its shipment IDs and visual system. It does not create a live transportation service.

## Available now

- Register an existing carrier tracking number or barcode value, or generate a unique Shypit number.
- Use a keyboard-wedge USB/Bluetooth barcode scanner in the package number input. Review required details before adding. Camera scanning and printable barcode labels are not included.
- Paste tab-separated rows from a spreadsheet. Columns, without a header: tracking number, carrier, company, origin, destination, optional order reference, optional shipment ID, optional ETA (YYYY-MM-DD). Valid rows are accepted; errors identify row numbers. Re-importing accepted rows reports duplicates.
- Deduplicate by carrier plus trimmed, uppercased tracking number, including duplicates within one batch. Different carriers may reuse a number.
- Link a package to a freight shipment, retain a company and purchase-order reference, search the queue, filter status, and record exceptions.
- Append timestamped status/location/notes and revise an estimated delivery date. Location represents the recorded handoff, not GPS position. Estimates are manually supplied.
- Preview a company report and download a text update for manual sharing. No message is automatically sent, and the preview is not a separately authorized customer portal.
- Save packages and travel history to the authenticated business workspace using the existing revision checks. Sign-in configuration, approved membership and the updated package permissions schema are required.

## Live service integration plan

EasyPost's multi-carrier tracking is a suitable reference: Shypit should retain its own package identity and operational events while a server adapter normalizes external carrier events. The frontend uses the existing Supabase identity and workspace backend. Carrier requests still need a separate server-side adapter and secret store; an API key must never be added to browser code or local storage.

Before using real shipment data, implement:

1. Preserve the existing authenticated memberships, workspace policies and role restrictions while expanding the production data model. A customer must only see their own company's packages. Use authorized, revocable share links if anonymous tracking is needed; never expose records through predictable package numbers alone.
2. A database for companies, shipments, packages, carrier tracker mappings, tracking events, and notification deliveries. Scope package uniqueness to organization + carrier + normalized number; model carrier number reuse/archival explicitly. Use atomic batch intake, server-side validation and idempotency keys.
3. A server-only EasyPost adapter to register external tracking numbers, store tracker IDs and synchronize status, estimated arrival and carrier handoffs. Confirm current supported carriers, account permissions, service costs and API contracts against EasyPost documentation before enabling it. Do not infer a carrier solely from a tracking-number pattern.
4. An authenticated webhook endpoint with provider-supported signature verification over the original request body, replay protection, deduplication and a durable retry queue. Preserve provider event time and receipt time separately. Late events should remain in history without regressing the current status. Maintain separate Shypit operational and external-carrier events, with provenance and an operator audit trail.
5. A company portal backed by tenant-scoped reads. Show last carrier sync, stale data, local time zones, exceptions, ETA changes and proof of delivery where supplied. Never show a fabricated travel route or GPS location.
6. An opt-in email/SMS notification outbox for pickup, transit milestones, exceptions and delivery. Record provider delivery status, deduplicate retries and support notification preferences. Carrier events must commit before notifications are dispatched.
7. Operational monitoring for failed webhooks, stale trackers, tenant isolation, retention, backups and access auditing. Test duplicate/reordered events, carrier errors, revoked access and delivery retries before a pilot.

An internal Shypit movement can be tracked without a third-party carrier; external carrier tracking augments that record. Barcode labels, a camera scanner, CSV upload and a bulk API can later feed the same validated intake endpoint.
