# RakshaTrack Guardian — authenticated trusted contact service

This is a separate, same-origin passenger/contact portal deployed alongside the existing frontend. The existing GitHub Pages app remains browser-local and **cannot automatically relay emergency alerts**. To use cross-device alerts open the hosted Guardian portal at `https://YOUR-HOST/guardian/` and create independent passenger and trusted-contact accounts.

## Workflow
1. Each person registers and signs in at /guardian/.
2. Passenger creates an invitation for a named contact and shares the generated URL privately.
3. The contact signs in and accepts the invitation.
4. Contact enables browser notifications (permission required; VAPID keys configured on server).
5. Passenger can send check-in or SOS from the authenticated portal. The server persists one alert and each recipient sees it in their authenticated inbox; subscribed devices are sent a push request.
6. Contact opens an alert and responds 'acknowledged', 'calling', 'on my way', 'need information', or 'resolved'. Passenger can inspect statuses via Sent alerts.

Notifications may show sound/vibration depending on platform settings. Custom full-volume sirens, forced vibration, guaranteed delivery or background GPS require a native Android application and a dedicated reliable alerting service. A server response 'push accepted' **does not** prove device delivery. Contacts need a current push subscription and online delivery channel.

## Local development
`cd guardian && npm install && npm test`
`cd ../rakshatrack-local && npm ci && npm run build`
`cd ../guardian && GUARDIAN_ORIGIN=http://localhost:8788 node server.mjs`

For production set `HOST=0.0.0.0`, `GUARDIAN_ORIGIN=https://YOUR-HOST`, `GUARDIAN_DATA_DIR` to a backed-up persistent disk folder (SQLite).
Generate credentials with `npm run vapid` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto address). Never commit secrets. Use HTTPS, persistent storage and monitoring. Do **not** use an ephemeral free service filesystem for accounts and alerts.

## Current limitations
This stage adds a hosted Guardian portal. It **does not yet** replace the original single-device contact list or connect the original SOS button into the hosted portal. Do not mistake static GitHub Pages SOS for a remote notification. Browser notifications require OS permissions. There is no automatic SMS/calling integration, native background GPS, or independently confirmed notification delivery.
