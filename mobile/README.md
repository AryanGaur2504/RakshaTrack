# RakshaTrack Native Android (prototype)

A **separate Expo/React Native project**, preserving the GitHub Pages website. This project reuses RakshaTrack's safety/route-assessment algorithm, implements native trip recording, on-device notifications, local trusted contacts and manual SMS/phone fallback.

**Not a certified or production-ready emergency application.** Server-delivered cross-device SOS and native push-token registration are not yet connected. The existing Guardian backend is based on browser HttpOnly cookie sessions; it requires an authenticated mobile-token API before a native app can safely and reliably share requests.

## Build

1. Install Node.js and Android Studio, or use Expo EAS cloud builds.
2. From `mobile/`, run `npm install` followed by `npx expo install --fix` (Expo-compatible package versions) and `npm run typecheck`.
3. Create an EAS project with `npx eas-cli init` (Expo account required), then `npx eas-cli build -p android --profile preview` for an APK.
4. For native maps, provide `GOOGLE_MAPS_API_KEY` during the EAS build; without it map tiles may be unavailable.
5. Background location requires Android "Allow all the time", a native development/production build, foreground service, and battery exemptions; OS restrictions still apply. Expo Go is insufficient for dependable background permissions.

## Migration & remaining work

- GPS fixes and journeys use on-device SQLite. Background task persistence across app process restarts and per-trip recovery must be completed before production.
- Sign-in and connected trusted contacts require a secure mobile authentication API; only local contact names and manual SMS are supported in this initial port.
- Cloud-delivered notifications require Expo Push/FCM or native FCM and a backend subscribing/storing device tokens. Native notification sound and vibration remain subject to Android notification channels and Do Not Disturb.
- Cross-device sync, saved destinations/alternate route routing, safe session migration, polished map UX, and accessibility need integration and real-phone tests.

The original `rakshatrack-local/` web application is unchanged.
