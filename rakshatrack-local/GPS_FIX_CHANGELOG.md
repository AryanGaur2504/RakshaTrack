# RakshaTrack GPS update — v1.2.2

## Updated behavior

- At monitoring start, a continuous `watchPosition` (high accuracy, cache age 0) runs alongside an immediate precise one-shot request and a fast initial map lookup.
- While the web page is visible, a new **high-accuracy GPS fix is requested every 15 seconds**, even when the watch is stuck. A pending request that exceeds its expected 12-second timeout is superseded. Rapid manual refresh clicks are coalesced.
- If no genuinely new reading arrives in 30 seconds, the continuous GPS watch is restarted and a fresh, lower-accuracy network position is requested as a backup (`maximumAge: 0`). The backup is clearly approximate and cannot trigger accurate route-safety checks.
- A return from background immediately restarts the GPS watch and requests a new fix. Late results from a retired watch/request are ignored.
- The ride screen shows exact age of the latest location, warns after 30 seconds, and does not present stale coordinates as live tracking. In-place saved-location requests survive temporary timeouts.
- Each recorded location preserves the device-reported timestamp. No simulated GPS positions or timestamps are created.

## Verification

- 36 focused and safety test cases passed using Node 22 and TypeScript stripping (`node --experimental-strip-types --test tests/corrections.test.mjs tests/location-session.test.mjs tests/safety.test.mjs`).
- Source syntax validation of modified TypeScript and TSX passed.
- Full production build/backend tests **could not be run in this environment**. Runtime npm packages were not installed and the npm registry was not reachable. On a machine with npm access run `npm ci && npm run build && npm test` before deployment.
- Physical Android GPS and screen-lock tests remain necessary.

## Critical platform limitation

This is a React **web/PWA** app. JavaScript can *request* GPS coordinates every 15 seconds but cannot require Android/Chrome/Safari to return them within 30 seconds, especially when backgrounded, screen locked, in power saving mode, or out of signal range. For dependable location monitoring when the screen is off, a **native Android foreground location service** (with the correct location permissions, user-visible persistent notification, and appropriate battery settings) is required. Do not represent this version as guaranteeing 30-second location fixes or live remote tracking.
