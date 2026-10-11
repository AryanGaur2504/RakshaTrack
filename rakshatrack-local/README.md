
## Live moving GPS dot (v1.3.0)

- Keep the RakshaTrack HTTPS page visible, grant **Precise location**, enable the device's Location service, and open the journey map. Each new browser `watchPosition` fix updates the map as soon as the browser delivers it; there is **no timer-based 15-second delay** for marker movement.
- One persistent blue marker and accuracy circle follow successive readings. Short transitions are visually interpolated for smooth movement, and the map camera follows unless you manually drag the map. The saved trip trace updates separately; the marker isn't rebuilt for every GPS fix.
- Every real fix retains its original OS timestamp. Repeated/stale callbacks are ignored. Smooth display frames are **never stored as GPS samples** or used for route or emergency calculations. The UI shows how old the last real fix is.
- If no real update arrives for 10 seconds, the app requests another fresh high-accuracy fix. At 30 seconds it restarts a stalled watch and attempts an approximate fallback, keeping old coordinates labelled as stale. These are **recovery thresholds, not location update intervals or guarantees**.
- The Geolocation API cannot require a 1 Hz hardware position stream, especially when the browser is backgrounded/locked. Reliable second-by-second Android acquisition requires a native app using the Android fused location provider and a foreground location service, with user consent and appropriate permissions.

### Validate on a physical phone

1. Serve the production build on HTTPS; do not test under an HTTP LAN address.
2. Enable precise location for the browser, open the live map, and begin a real journey.
3. Walk outdoors for 60–90 seconds and observe whether the blue dot moves and how many seconds old its newest *real* location is. Map animation will be smooth between actual readings, but it stops when the OS stops updating.
4. If fix age repeatedly exceeds 30 seconds even outdoors with the app visible, check OS GPS/precise permission, battery policy, and test in the phone's Maps app; a PWA cannot enforce a hardware fix interval.

# RakshaTrack

**Your journey. Your safety. Your control.**

A standalone React/TypeScript passenger-safety web app. Run it on your computer, put the source in your own GitHub repository, deploy the frontend to GitHub Pages, or run the optional Node/SQLite backend on a server you control. The default OpenStreetMap mode needs no ChatGPT login, Cloudflare account, or paid API key. Optional Google services require your own billing-enabled project.

## Previous GPS recovery changes in v1.2.2 (superseded by v1.3.0)

- **GPS request recovery:** The old build retried every 15 seconds. In v1.3.0, every real `watchPosition` event updates the dot immediately and one-shot `getCurrentPosition` requests are made only when the stream has stopped reporting (for 10 seconds or more). Actual GPS fix frequency is controlled by the device/browser.
- **30-second watchdog:** if no genuinely newer reading arrives for 30 seconds, the continuous watch is restarted. Previously registered watch callbacks are discarded; manual refresh can override an automatic GPS request. On browser foreground/resume, the watch restarts and an immediate fresh-fix request is made.
- **Visible monitoring truth:** the ride screen shows the elapsed age of the most recent fix and explicitly warns when it reaches 30 seconds without a new fix. Stale points are retained as last-known locations but do not qualify for live safety checks. Transient timeouts are not fatal while a recent fix remains valid. A saved-place coordinate request remains pending through recoverable timeouts. When high-accuracy fixes stall, a cache-free network/coarse position is requested as a fallback; it is labelled approximate and is excluded from route safety checks if inaccurate.
- **Platform limit:** Chrome/Safari web pages cannot guarantee an actual GPS coordinate every 30 seconds, particularly under battery optimization, low signal, background tabs, or a locked screen. Reliable screen-off/continuous tracking needs a native Android foreground service with location permission and a persistent notification; do not represent this PWA as equivalent.

## Updates in version 1.2.1

- **Immediate ride start:** A real ride record starts after consent without waiting for GPS or an online route. The consent shortcut on the start form preserves the selected destination and starts the ride automatically after consent. A valid last-known point from the preceding two minutes can seed the ride with its original timestamp. Otherwise the record begins with no points and clearly waits for location. GPS tracking and route checks begin only when real usable fixes arrive; starting a record is not a promise of active monitoring.
- **Fresh manual refresh:** The continuous watch and every manual refresh request now forbid cached GPS positions (`maximumAge: 0`). A separate quick cached/network request improves initial map startup but cannot block a manual refresh. Repeated refresh taps share a single in-flight precise request, and the app requests a fresh fix when returning to the foreground. The last-known position remains visible, labelled with its original timestamp. Actual GPS acquisition can still take time or fail depending on device, location services, and browser.
- **Mobile permission recovery:** Detect HTTP/IP origins, missing browser support, denied permission, and temporary GPS failure separately. Saved-place GPS coordinates also fill automatically after the next new position rather than requiring repeated taps. Consent on the ride-start screen resumes the selected ride. Pausing or revoking consent invalidates late GPS callbacks.
- **Broader free search:** Up to 20 matches per search, optional nearby preference without excluding other cities, additional results when available, cached repeated searches, cancellation of outdated queries, and a search timeout. It is still OpenStreetMap data, not Google's place database. Actual Google type-ahead is enabled by the optional key below.
- **Phone testing:** A trusted local HTTPS development command is provided, alongside the existing GitHub Pages HTTPS deployment.

## Updates in version 1.1

- **Cannot-speak SOS:** “I can’t speak · Text Contact 1” creates an explicit SOS and opens a prepared SMS asking the contact **not to call**. It does not start a voice call, app alarm, vibration, or notification. The passenger still has to press **Send** in the phone’s messaging app. No delivery is automatically asserted. SMS body-prefill support varies by phone/browser; the incident also provides a copy-text fallback. Without location-sharing consent the message is text-only, rather than blocking help.
- **Dark mode:** Light, dark, or system theme, saved on this device. Use the sun/moon shortcut or Settings → Appearance.
- **Real maps:** Leaflet map controls for drag, pinch, wheel, zoom buttons, route fit, refresh and recenter. The map retains the user's chosen zoom and stops following while dragged. It draws the current fix with a real accuracy radius and labels approximate/stale positions. The offline view is a plain coordinate grid, not illustrated roads.
- **Destination search:** Search a place/address/landmark and select a result to populate a destination or saved place. OpenStreetMap results work without a key on explicit search. Google Maps/Places autocomplete is available when a Google key is configured below.
- **Mobile layout:** Bottom navigation, persistent SOS access, larger touch targets, sticky header, safe-area padding, and bottom-sheet dialogs. This remains a web/PWA interface, not an APK.

### Update an existing local copy

Stop the existing dev server with Ctrl+C. Extract the updated ZIP into a **new folder** or overwrite the old source files, then run `npm install` followed by `npm run dev` from the folder containing `package.json`. Keep the same localhost origin/port to retain browser-local records. Do not clear browser storage to update. `data/` and `.env` are not included in the ZIP and should not be overwritten or committed.

## Quick start on Windows, macOS, or Linux

1. Install **Node.js 24 LTS** (minimum supported version: 22.13) from https://nodejs.org/.
2. Extract this ZIP and open a terminal in the `rakshatrack-local` directory containing `package.json`.
3. Run:

```sh
npm install
npm run dev
```

4. Open **http://localhost:5173/**.
5. Start with **Explore a demo journey**, then configure trusted contacts, saved places, and location consent for real journeys.

Do not open `index.html` directly with `file://`. The app needs a local HTTP server. Localhost supports browser location and cryptography; public deployments require HTTPS.

**Default mode is browser-local.** Contacts, destinations, trips, settings, and incidents are encrypted in IndexedDB on this browser. Nothing is synchronised to a server in this mode. Phone calls and SMS still use the device's apps. Clearing browser storage removes your device records; export before clearing.

## Put the project on GitHub

Create an empty repository on GitHub, then run these commands from this project directory. Replace `YOUR_USERNAME` and `rakshatrack` with your account and repository names:

```sh
git init
git add .
git commit -m "Add RakshaTrack passenger safety app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/rakshatrack.git
git push -u origin main
```

The included `.gitignore` excludes dependencies, generated builds, `.env`, SQLite files, and runtime records. Do not commit your exported journey records or real contact details.

## Host on GitHub Pages

1. Push this entire project, including `.github/workflows/pages.yml` and `package-lock.json`, to GitHub.
2. In the repository, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Open **Actions → Deploy RakshaTrack to GitHub Pages → Run workflow**, or push another commit to `main`.
4. When deployment succeeds, open the URL shown in Pages or the workflow result, normally `https://YOUR_USERNAME.github.io/rakshatrack/`.

The workflow installs dependencies, runs the tests, and builds for your repository's subdirectory automatically. It also supports a `YOUR_USERNAME.github.io` repository at the root URL. For a custom domain or unusual path, create the GitHub Actions repository variable `PAGES_BASE_PATH` with `/` or your desired `/subdirectory/`.

**GitHub Pages is static hosting.** It runs the browser-local mode, not the optional backend. Each browser has its own private local records; there is no shared database, account login, or cross-device sync on Pages. This is a real storage mode, not a simulated sync indicator.

The GitHub Actions deployment has been prepared, but has not been executed in your GitHub account.

## Google Maps & Google Places (optional)

The default uses OpenStreetMap maps and explicit-submit place search. It does **not** scrape Google Maps or pretend those are Google results.

To use actual Google place predictions and a Google Map:

1. In your own Google Cloud project, enable billing, **Maps JavaScript API**, and **Places API (New)**.
2. Create a browser API key and restrict it to the Maps/Places APIs and the exact allowed HTTP referrers. Include your local URL (for example `http://localhost:5173/*`) and your hosted URL. Add `http://127.0.0.1:5173/*` only if you use that URL too. For trusted local phone HTTPS testing, also allow `https://localhost:5173/*` and `https://YOUR_LAPTOP_IP:5173/*`, replacing the IP placeholder with the actual address.
3. Copy `.env.example` to `.env`, preserving any existing server password, and add:

```text
VITE_GOOGLE_MAPS_API_KEY=your-restricted-browser-key
VITE_GOOGLE_MAPS_MAP_ID=your-google-map-id
```

The prototype uses `DEMO_MAP_ID` if no map ID is supplied. Use your own Google Map ID for production. Restart `npm run dev`, or rebuild for hosting. Enable **Online maps, search & routing** in Settings; the destination search then uses Google's supported PlaceAutocompleteElement and the map switches to Google Maps. The app does not load Google code before provider consent. Google account/API usage charges, if any, are billed to your own project.

For the included GitHub Pages workflow, add the repository secret **GOOGLE_MAPS_API_KEY** and optionally the repository variable **GOOGLE_MAPS_MAP_ID**, then redeploy. This is a browser key: Vite embeds it in the public frontend. A GitHub secret prevents committing the source value, but cannot make a browser key private. Referrer/API restrictions are essential.

Google service access cannot be tested without your enabled key. An invalid or restricted key shows a loading/authentication error; it is not represented as a successful place lookup.

Public Google Maps content is subject to Google's service, attribution, storage, Terms of Use, and Privacy Policy requirements. Review those requirements for a public release. The original offline geometry/trail features do not download Google street maps.

### Are Google maps and place searches free?

The default build uses **OpenStreetMap tiles, Nominatim place search, and OSRM routing**. It does not use or bill a Google Maps Platform project unless you configure the Google key. Public OSM services have usage policies and availability limits; this default is for moderate prototype use, not an unlimited production service. Nominatim prohibits autocomplete and limits the application to one request per second. The app submits only explicit searches; a rapid second uncached submit may wait briefly to respect that limit. Saved destinations and cached repeated searches do not need a new search request.

**Google Maps Platform requires billing and a key.** Free monthly usage is available per SKU; exceeding it can create charges. The consumer Google Maps app being free does not make Maps Platform APIs unlimited. Pricing checked on 11 October 2026:

| Product | Global free monthly events | Eligible India free monthly events |
| --- | ---: | ---: |
| Dynamic Maps | 10,000 | 70,000 |
| Autocomplete Requests (New) | 10,000 | 70,000 |
| Place Details Pro | 5,000 | 35,000 |

India eligibility requires billing in India and a large majority of usage in India. Counts are billable events, not users or rides; Google map loads, predictions, sessions, and fetched place-detail fields have their own billing rules. This integration fetches `displayName`, `formattedAddress`, and `location`; check the current SKU/session rules in your Google console. Do not interpret these caps as a guaranteed zero bill. Set API quotas and billing alerts, and restrict the browser key. Budget alerts alone do not stop usage.

Official references: [Google global prices](https://developers.google.com/maps/billing-and-pricing/pricing), [India prices](https://developers.google.com/maps/billing-and-pricing/pricing-india), [India eligibility](https://developers.google.com/maps/billing-and-pricing/india), [Maps billing requirements](https://developers.google.com/maps/documentation/javascript/usage-and-billing), and [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).

### Test phone GPS locally over HTTPS

`http://localhost:5173` works on the laptop, but `http://192.168.x.x:5173` on the phone is **not** a secure location origin. No app code can force a system permission popup there. The easiest phone test is your GitHub Pages **HTTPS** URL; use the deployment steps above.

To keep testing on your own network, install [mkcert](https://github.com/FiloSottile/mkcert) using its official installation instructions, find the laptop's Wi-Fi IPv4 address with `ipconfig` on Windows, and generate trusted development certificates. Replace the example `192.168.1.5` with your actual laptop IP. Run inside this project:

```sh
mkcert -install
mkdir .certs
mkcert -key-file .certs/key.pem -cert-file .certs/cert.pem localhost 127.0.0.1 192.168.1.5
npm run dev:https
```

Both devices must be on the same Wi-Fi. Open `https://192.168.1.5:5173` on the phone and allow your development server through the laptop firewall if needed. The certificate must be trusted **on the phone too**: `mkcert -CAROOT` shows the folder containing `rootCA.pem`. Install that public CA certificate in the phone's certificate settings (Android typically Settings → Security → Encryption & credentials → Install a certificate → CA certificate; labels vary). Use Chrome for browser testing. On iPhone install the CA profile and enable full trust in Settings. Share only `rootCA.pem` with your own testing device; keep `rootCA-key.pem` and `.certs/key.pem` private. `.certs/` is ignored by Git and excluded from the ZIP.

Open the HTTPS app, tap **Enable location**, and allow the browser prompt. If permission was already denied, change Location in the site's browser permissions and retry. If it was already granted, another popup may not appear. Enable Android device Location and precise location for the browser. If the phone still reports an untrusted connection, fix certificate trust or use GitHub Pages before testing GPS. Changing HTTP to HTTPS creates a different browser storage origin; records are not automatically transferred.

### Why location can look wrong on a laptop

The app uses the coordinates supplied by the browser; it cannot make a laptop acquire satellite GPS. Desktop network-derived fixes can be approximate even with `enableHighAccuracy` requested. Check the displayed coordinates and **± accuracy** value. Use the refresh/recenter button and browser location permission; on Android enable device location and **precise location** for your browser. A fresh precise fix replaces an approximate one; a much worse fix does not immediately replace a recent accurate one. No position is fabricated or inferred from an address.

A phone visiting a computer's `http://192.168...` address may be denied location because it is not a secure origin. Test real phone GPS through an HTTPS deployment, or run locally on that phone's own localhost. Localhost on a laptop is not the phone's localhost.

## Optional backend: local database and self-hosted sync

This is a single-owner instance. It stores the account in SQLite and uses a password and an HTTP-only session cookie. It is not a multi-user/contact portal.

1. Copy `.env.example` to `.env` and replace `APP_PASSWORD` with a long random password. Windows users can copy it in Explorer; macOS/Linux can use `cp .env.example .env`.
2. Run:

```sh
npm install
npm run dev:server
```

3. Open **http://localhost:5173/** and enter the password you put in `.env`.

The launcher starts the frontend on port 5173 and backend on 8787. The frontend proxies `/api` requests to the backend. SQLite is created automatically at `data/rakshatrack.sqlite`; no database service or manual migration is required. Browser-local and server modes use different device-storage keys. Changing mode does not automatically migrate an existing account.

For a production Node host:

```sh
npm ci
npm run build:server
npm start
```

Set these runtime environment variables on your host:

```text
HOST=0.0.0.0
PORT=8787
APP_PASSWORD=<a random password of at least 16 characters>
APP_ORIGIN=https://your-domain.example
DATA_DIR=/path/to/persistent/private/data
```

Use the host's assigned `PORT` if it provides one. Put HTTPS in front of Node through your hosting provider or reverse proxy. `APP_ORIGIN` must exactly match the browser-visible origin, without a trailing slash; this is checked for write requests. Remote binding is refused without both a strong password and an HTTPS origin. Make the data directory a persistent volume and back it up privately. The server exposes no cross-origin API. If hosting the backend, serve this frontend from that same origin instead of combining it with a different GitHub Pages origin.

Runtime password and instance data stay on the server and are not embedded in the frontend. Sessions expire after 24 hours and are revoked by signing out or restarting the server. The server database is protected by filesystem permissions, not application-level encryption; use encrypted disks if required. Browser data remains AES-GCM encrypted. For loopback-only development, omitting `APP_PASSWORD` allows passwordless local use; do not expose that configuration through a tunnel.

## Build and tests

```sh
npm run typecheck
npm test
npm run build
```

- `npm run build` creates the static browser-local frontend in `dist/`.
- `npm run build:pages` chooses a repository base path from `GITHUB_REPOSITORY`; `PAGES_BASE_PATH` overrides it.
- `npm run build:server` creates the frontend configured for the Node backend.
- `npm run preview` serves the current production frontend at localhost for checking. A server-mode build still needs its backend, so prefer `npm start` for that build.
- `npm start` serves `dist/` and the optional API together on port 8787.

The tests also verify non-blocking GPS sessions, repeated-refresh deduplication, late callback cancellation, location startup without fabricated fixes, search paging and cache behavior, location confidence handling, cannot-speak message text, sharing consent, SMS URL formats, and search-coordinate validation. The tests verify safety thresholds, stale/low-confidence GPS rejection, unknown destinations, prolonged stops, direct SOS, staged verification, conflict merges, login protection, data validation, origin checks, SQLite persistence, deletion, sign-out, and password-attempt limiting.

## Included features

- Consent-based foreground GPS, manual trip start/end, and foreground vehicle-movement suggestions.
- Transport modes, saved destinations, route geometry, journey points, timestamps, accuracy, and event records.
- Optional OpenStreetMap or Google street maps, place search, and OSRM road routing with explicit external-service consent.
- Persistent route-deviation checks and prolonged-stop checks. Concerns initiate verification, never automatic emergency calls.
- Two ordered trusted contacts, configurable readiness/verification timeouts, recorded acknowledgement, and failed-contact fallback.
- Deliberate immediate SOS workflow, emergency calling, SMS composer actions, incident report export, and timestamped snapshot sharing.
- Light/dark/system appearance and a labelled demo, simulated movement, simulated concerns, and disabled demo emergency calling/messaging.
- Encrypted device storage, optional server sync, offline app-shell caching, retention, deletion, and data exports.
- Responsive desktop/mobile UI, keyboard navigation, focus-contained dialogs, and reduced-motion support.

## Scope and device limitations

This is a **web app/PWA**, not an Android APK. Native Android activity recognition, guaranteed screen-off/background location, automatic SMS/push delivery, delivery receipts, a separate contact verification portal, and downloadable offline road maps are not included.

A voice call is not suitable in every threat situation. If a passenger cannot speak, text help is an available deliberate action, but if they cannot operate the phone at all, this web prototype cannot guarantee that anyone is notified. Automatic discreet remote delivery would require a configured delivery backend and reliable device monitoring.

Keep the browser app visible during real monitoring. The service worker is enabled in production builds (not the Vite development server). Its caching can make the app shell available after an online visit, but does not guarantee background GPS, offline server sign-in, or remote communication. The demo validates UI flows and does not establish field reliability.

Saved road geometry can support local checks for a journey from the same origin. It is not an offline routing graph or downloaded street-map package. New routes and road tiles need internet. No OpenStreetMap tiles are bulk downloaded. Map and routing services are external, best-effort dependencies. Location accuracy can vary; stale fixes are labelled last-known rather than live.

Real device GPS, SMS/call handoff, browser notifications, service-worker offline reload, and field safety performance require testing on your phones. Build/type checks and automated logic/backend tests do not replace those checks.

## Project structure

```text
src/                 React app, map, styling, safety logic, encrypted storage
server/              Optional Node HTTP API, SQLite, sessions, validated schema
public/              App icon, manifest, service worker
scripts/             Portable dev launcher and build helpers
tests/               Safety and backend tests
.github/workflows/   GitHub Pages deployment workflow
```

Deployment reference: https://vite.dev/guide/static-deploy.html
Leaflet reference: https://leafletjs.com/reference.html
Google Places widget: https://developers.google.com/maps/documentation/javascript/place-autocomplete-new
Nominatim policy (no typeahead on the public endpoint): https://operations.osmfoundation.org/policies/nominatim/
Node SQLite reference: https://nodejs.org/download/release/v22.13.0/docs/api/sqlite.html
