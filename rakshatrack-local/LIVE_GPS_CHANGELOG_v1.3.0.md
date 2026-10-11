# RakshaTrack v1.3.0 — Live moving GPS dot

**Behavioral fix:** The map no longer reconstructs the blue GPS marker on every update. A persistent Leaflet marker or Google AdvancedMarker now receives each incoming position from the continuous device watch and smoothly interpolates its on-screen position. Camera following moves with it.

- The recorded journey route is drawn separately so a new GPS event does not redraw the entire map and route.
- The high-accuracy GPS watch is the primary source; one-shot high-accuracy and network requests recover when real updates are missing. The watchdog doesn't poll a healthy live stream.
- Exact duplicate/out-of-order timestamps are rejected; display interpolation does not create new GPS records or influence safety rules.
- Real-device age of each actual GPS fix is shown. Stale readings aren't described as continuously live.
- Shell cache bumped to v7 to make updated assets easier to pick up after deployment.

**Important:** 1-second device fix frequency and screen-off tracking cannot be guaranteed by a browser PWA. For an assurance-oriented passenger-safety product, use native Android fused location tracking with a foreground service, user-visible notification and the required permissions.
