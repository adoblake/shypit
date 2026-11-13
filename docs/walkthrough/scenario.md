# Good-case shipment walkthrough

Silent, captioned browser recording. All companies, accounts, credentials, cargo and payouts are fictional sample data.

Cedar Supply Co. sells 8 pallets of office organizers to Harbor Office Goods. Open Road Logistics LLC accepts the Phoenix–Los Angeles shipment, confirms pickup, records a delivery-proof filename, and completes delivery. The company then reviews its delivery status and customer update.

The browser interactions use intercepted authentication/database responses. The cross-workspace dispatch handoff is simulated in the recording harness, not implemented as a live dispatch integration. No real account was used, freight moved, file uploaded, or money paid. Founder account activation is separate.

Final video: [Shypit good-case walkthrough](../../public/walkthrough/shypit-good-case.mp4), approximately 55 seconds, silent with burned-in captions. The deployed player is `/shypit/walkthrough/`.

Reproduce with the local app running: `npm run record:walkthrough`, then `npm run encode:walkthrough`. Playwright needs its ffmpeg runtime (install with `npx playwright install ffmpeg`); final encoding uses the system ffmpeg command.

Scenario dates: November 14–15, 2026. The final company update uses a simulated November 15 clock so delivery follows pickup.
