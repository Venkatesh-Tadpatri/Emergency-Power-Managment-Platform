# CPC Mobile — Critical Power Command

Expo React Native client for Android and iOS. It uses the existing CPC API and Zitadel identity provider; there is no separate mobile backend.

## One-time Zitadel setup

1. In Zitadel Console (`http://localhost:8080` or your LAN host) → Projects → your project → **+ New** application → **Native**.
2. **Redirect Settings**: add **both** of these — you need both, they're used in different contexts:
   - `exp://<your-LAN-IP>:8081/--/auth` — used when running via `npm start` / Expo Go (see below for why the IP matters)
   - `cpc://auth` — used by a standalone build (EAS Build / a real installed APK or IPA). Expo Go and a real build generate different redirect URIs for the same app; skipping either one means login works in one context but silently fails in the other.
3. Do the same for **Post Logout URIs**.
4. **Token Settings → Auth Token Type → JWT.** This one is easy to miss and breaks something non-obvious: the default is Bearer (opaque) tokens, which the backend can't decode. The symptom isn't a login failure — login *succeeds*, but the user's role never resolves (`/api/me` returns `role: null`, the app shows "Pending role assignment" and every list stays empty) because the backend can't read the token at all. If mobile users are stuck on that screen despite the account clearly having a role assigned in the database, check this setting first.

## Local development (Expo Go)

1. Copy `.env.example` to `.env` and set `EXPO_PUBLIC_API_BASE`, `EXPO_PUBLIC_ZITADEL_AUTHORITY`, `EXPO_PUBLIC_ZITADEL_CLIENT_ID` (the native app's client ID from above), and `EXPO_PUBLIC_GRAFANA_URL`.
2. `localhost` in these values means *the phone itself*, not your computer — for a physical device, use your computer's LAN IP (e.g. `192.168.1.28`) for all of them, and make sure the backend/Zitadel/frontend containers are using that same host too (see the root README's "Testing from another device" section).
3. Run:
   ```powershell
   $env:REACT_NATIVE_PACKAGER_HOSTNAME="<your-LAN-IP>"
   npm start
   ```
   **The `REACT_NATIVE_PACKAGER_HOSTNAME` line is not optional if Docker Desktop, WSL, or Hyper-V is installed on your machine.** Those add virtual network adapters that confuse Expo's LAN-IP auto-detection, and it silently falls back to advertising `exp://127.0.0.1:8081` in the QR code instead of your real IP — which is meaningless to a phone (`127.0.0.1` on the phone means the phone itself). If Expo Go says "Could not connect to server" or hangs on "Opening project…", check the dev server's own printed URL (`Metro waiting on exp://...`) — if it says `127.0.0.1`, that's the cause.
4. Scan the QR code with Expo Go (Android: Camera app or Expo Go's scanner; iOS: Camera app). If you started the server from an assistant/background process without a visible QR code, use Expo Go's "Enter URL manually" with `exp://<your-LAN-IP>:8081`.

The app shows only authorized data. Site and equipment modifications remain guarded by the API: only Super Admins can modify them.

## Building a standalone Android APK (for testing outside Expo Go)

This produces a real installable `.apk` — no Expo Go required on the test device, but the app still needs to reach the same LAN-based backend, so the test device still needs to be on the same network as your computer.

```powershell
npm install -g eas-cli
eas login                                          # needs a free Expo account
eas build --platform android --profile preview      # first run auto-links the EAS project
```

This uploads the project to Expo's cloud build servers (no local Android SDK needed) and prints a download link + QR code when done (~10–15 min). `mobile/eas.json`'s `preview` profile already builds a direct-install `.apk` (Play Store requires the `production` profile's `.aab` instead) and already bakes in the `EXPO_PUBLIC_*` values it needs — update those in `eas.json` if your LAN IP changes.

Two things that only apply to standalone builds, already configured in this repo but worth knowing about if they regress:
- **Android blocks plaintext HTTP by default in release builds** (this backend runs on `http://`, not `https://`). Fixed via the `expo-build-properties` plugin in `app.json` (`android.usesCleartextTraffic: true`). Symptom if this breaks: the "Sign in securely" button stays permanently disabled — the discovery fetch is blocked at the OS level before it ever leaves the device, so it never resolves.
- **`mobile/.env` is gitignored**, and EAS Build excludes gitignored files from its upload — so the values from `.env` are *not* available during a cloud build. They're set explicitly in `eas.json`'s `build.preview.env` block instead.

## Building for iOS

Every real-device iOS build requires Apple code signing, which requires an **Apple Developer Program membership ($99/year)** — there's no free-tier way to get a real build onto someone else's iPhone. Until you have that:

- **Expo Go works exactly as described above, with no Apple account needed at all.** This is the right way to test on iOS in the meantime.
- Once enrolled, `eas build --platform ios --profile preview` builds an ad-hoc `.ipa` (requires registering each test device's UDID first via `eas device:create`), or use `eas submit --platform ios` after a `production` build to distribute via TestFlight instead (no UDID registration needed, better for testing with people who aren't you).
