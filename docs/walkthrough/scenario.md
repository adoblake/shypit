# Admin and shipment workflow walkthrough

An approved sample owner enters Admin Login from the home page, reviews pilot counts, grants an Overview-only reviewer role, inspects audit history and operations, and opens Build & test.

Silent, captioned browser recording. All companies, accounts, credentials, cargo and payouts are fictional sample data.

Cedar Supply Co. sells 8 pallets of office organizers to Harbor Office Goods. Open Road Logistics LLC accepts the Phoenix–Los Angeles shipment, confirms pickup, records a delivery-proof filename, and completes delivery. The company then reviews its delivery status and customer update.

The browser interactions use intercepted authentication/database responses. The cross-workspace dispatch handoff is simulated in the recording harness, not implemented as a live dispatch integration. No real account was used, freight moved, file uploaded, or money paid. Founder account activation is separate.

Recordings: 00-admin.webm, 01-company.webm, 02-carrier-mobile.webm, 03-company-delivery.webm.

The player includes measured chapter seek buttons. Captions are embedded in the picture; the recording has no audio. A full text scenario is also available on the player page. Recording holds allow at least 250 ms per caption word.

To reproduce: run Vite on 127.0.0.1:4173, provide the Playwright recording FFmpeg dependency, then run npm run record:walkthrough and npm run encode:walkthrough. The encoder requires system ffmpeg and ffprobe. SHYPIT_RECORD_ONLY=admin refreshes only the admin source clip; re-encode afterward to update chapter offsets.
