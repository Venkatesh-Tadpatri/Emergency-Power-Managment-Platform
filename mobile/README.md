# CPC Mobile — Critical Power Command

Expo React Native client for Android and iOS. It uses the existing CPC API and Zitadel identity provider; there is no separate mobile backend.

## Start

1. Copy `.env.example` to `.env` and set the API, Zitadel authority, and native OIDC client ID.
2. In Zitadel, create a native application and register the redirect URI `cpc://auth`.
3. Add the mobile app origin/URL as needed to the backend's `CORS_ORIGINS` configuration.
4. Run `npm install`, then `npm start`. The default start command uses LAN mode so
   Expo Go on a phone can reach the development server. Scan the QR code shown
   in the terminal; do not use a QR code beginning with `exp://127.0.0.1`.

For a physical phone, `localhost` points to the phone itself. Use one shared LAN host/IP for Zitadel, the API, and the web frontend. Set `ZITADEL_EXTERNAL_DOMAIN`, `ZITADEL_ISSUER`, `VITE_API_BASE`, `VITE_ZITADEL_AUTHORITY`, and the mobile `EXPO_PUBLIC_*` values to that same host, then restart the affected Docker services. This keeps browser and phone sign-in on the same identity issuer.

The app shows only authorized data. Site and equipment modifications remain guarded by the API: only Super Admins can modify them.
