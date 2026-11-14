# All sides: admin, shipper and carrier

Silent, captioned browser recording with fictional accounts and intercepted API responses. No real identity, bank account, shipment, verification or payment is used.

1. An owner enters the public Admin Login, reviews sample pilot counts, assigns Overview-only admin access and separate workspace finance access, and reviews audit history.
2. Cedar Supply Co. posts eight pallets of office supplies from Phoenix to Harbor Office Goods in Los Angeles, requesting private quotes. Street addresses and contacts are withheld from the member listing.
3. Open Road Logistics LLC signs in on mobile, searches route/equipment, reviews the listing and submits a private $920 quote.
4. The business confirms that carrier. The shared booking and conditional contact visibility use the same recorded sample store across account views. The finance-authorized shipper reviews Billing's test-mode bank setup.
5. The carrier sees the confirmed job and released booking details in My jobs, then reviews test-mode payout setup in Earnings.

This recording demonstrates current application screens and booking flows. The backend's access, transaction and privacy rules are separately tested against PostgreSQL. Provider-hosted bank verification is not filmed or completed, and no successful delivery, GPS integration, settlement, or live dispatch is implied. The practice-load simulation is excluded from this workflow.

Regenerate with a running Vite app on 127.0.0.1:4173, a Playwright-compatible recording FFmpeg binary, npm run record:walkthrough and npm run encode:walkthrough. Captions are held for at least 270 ms per word. SHYPIT_RECORD_ONLY=admin refreshes the admin clip only.
