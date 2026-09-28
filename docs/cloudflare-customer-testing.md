# Dual-mode setup: local dev + Cloudflare customer/UAT testing

Runs a **second** frontend (port 5174) alongside your normal local dev frontend
(port 5173), so a customer can hit a public Cloudflare Quick Tunnel URL for UAT
while you keep developing against `localhost` — without touching the backend,
Zitadel, or either database.

> **Read "Known limitation" near the bottom before you rely on this for a live
> customer demo.** Quick Tunnel URLs are randomly generated every time
> `cloudflared` restarts, and Zitadel login through a *brand-new* random
> hostname does **not** work out of the box — this was tested and confirmed
> in this environment, not assumed. See that section for what to do about it.

## What's shared vs. separate

| Service | Local dev | Customer testing |
| --- | --- | --- |
| Frontend | `localhost:5173` (existing `docker-compose.yml`, untouched) | `localhost:5174` (new `docker-compose.cloudflare.yml`) → tunneled publicly |
| Backend | `localhost:8000` — **same one container**, used by both | tunneled publicly, same container |
| Zitadel | `localhost:8080` — **same one instance**, used by both | tunneled publicly, same instance (see limitation below) |
| MySQL / Postgres | unchanged, never exposed publicly | unchanged |

Only the frontend is duplicated. The backend and Zitadel are the same
processes serving both audiences at once — there's no second backend or
second Zitadel to keep in sync.

## Files involved

| File | Purpose |
| --- | --- |
| `.env` (root) | Unchanged for `VITE_*`/`ZITADEL_ISSUER`/`ZITADEL_EXTERNAL_DOMAIN` (still `localhost`). `CORS_ORIGINS` now also lists the current customer-frontend tunnel origin — see [Backend CORS](#backend-cors) below. |
| `docker-compose.yml` | Unchanged. Still the source of truth for `localhost:5173`. |
| `docker-compose.cloudflare.yml` | **New.** Standalone compose project (`cpc-customer-testing`) defining one service, `frontend-cloudflare`, on port 5174. Run it with its own `-f` flag — it is never merged with the main compose file. |
| `.env.cloudflare` | **New, gitignored** (matches the `.env.*` pattern already in `.gitignore`). Holds the customer frontend's `VITE_*` values, pointed at the backend/Zitadel Cloudflare tunnels. |
| `.env.cloudflare.example` | **New, committed.** Template for the file above. |
| `frontend-release/` | **New, gitignored.** A separate copy of `frontend/`, with its own `node_modules` installed. `docker-compose.cloudflare.yml`'s `frontend-cloudflare` service serves from this folder, not `frontend/` — see "Releasing to the customer frontend" below. |

## Releasing to the customer frontend

**As of 2026-09-18, `frontend-cloudflare` no longer reads from `frontend/` directly.**
Originally both the 5173 (local dev) and 5174 (customer) frontends bind-mounted the same
`frontend/` folder, so every local edit — even unsaved work-in-progress — appeared on the
public customer URL instantly. That's rarely what you want during a live customer
test, so `frontend-cloudflare` now serves from a separate `frontend-release/` folder
instead. Editing `frontend/` only ever affects `localhost:5173`.

To push your current local changes out to the customer:

```powershell
cd "C:\Users\Venkatesh\Desktop\Emergency Power Management Platform"
robocopy frontend frontend-release /E /XD node_modules dist /NFL /NDL /NJH /NJS
docker compose -f docker-compose.cloudflare.yml up -d --force-recreate frontend-cloudflare
```

(Robocopy's exit code `1` means "files copied successfully" — not an error.)

Then confirm it actually deployed before telling the customer:

```powershell
curl https://empm-test.mepstrait.in/ | Select-String "<title>"
```

**Gotcha (hit and fixed on the first release under this setup):** don't run `npm install`
for `frontend-release/` on the Windows host and bind-mount the whole folder including
`node_modules` — native deps like Rollup's platform-specific binary
(`@rollup/rollup-linux-x64-gnu`) are built per-OS, so a Windows-installed `node_modules`
crashes Vite inside the Linux container (`Cannot find module '@rollup/rollup-linux-x64-gnu'`).
`docker-compose.cloudflare.yml` avoids this by mounting `node_modules` from a separate
named Docker volume (`frontend_release_node_modules`), seeded from the image's own
Linux-built `node_modules` (the Dockerfile's `RUN npm install`) rather than the host's copy
— `robocopy`'s `/XD node_modules` above keeps the host copy out of the sync entirely, so
this shouldn't come up again as long as that exclusion stays in the command.

None of `vite.config.ts`, `frontend/src/auth/oidcConfig.ts`, or the backend's
CORS *code* needed changes — they were already environment/origin-driven:

- `vite.config.ts` already has `host: true` and `allowedHosts: true`, and its
  `server.port: 5173` is only a default — the cloudflare compose file passes
  `--port 5174` on the CLI, which overrides it. Nothing to change here.
- `oidcConfig.ts` already builds `redirect_uri` from
  `window.location.origin`, so it produces `http://localhost:5173/callback`
  on the dev frontend and `https://<tunnel-host>/callback` on the customer
  frontend automatically, with no hardcoded URL.

## Start local development (unchanged)

```powershell
cd "C:\Users\Venkatesh\Desktop\Emergency Power Management Platform"
docker compose up -d
```

→ `http://localhost:5173`, login via `http://localhost:8080`. Exactly as before.

## Start customer testing

```powershell
cd "C:\Users\Venkatesh\Desktop\Emergency Power Management Platform"
docker compose -f docker-compose.cloudflare.yml up -d --build
docker compose -f docker-compose.cloudflare.yml ps
```

→ `http://localhost:5174` locally. This does **not** stop or restart anything
from the main `docker compose` project — both frontends run at once.

Verify it picked up the Cloudflare env values (don't assume — check):

```powershell
docker exec cpc-customer-testing-frontend-cloudflare-1 sh -c "echo $env:VITE_API_BASE; echo $env:VITE_ZITADEL_AUTHORITY"
```

(In bash: `docker exec cpc-customer-testing-frontend-cloudflare-1 sh -c 'echo $VITE_API_BASE; echo $VITE_ZITADEL_AUTHORITY'`.)

## Cloudflared tunnels

Three separate PowerShell windows, all left running for the duration of the
customer session:

```powershell
# Customer frontend — points at 5174, NOT 5173
& "C:\Users\Venkatesh\Cloudflared\cloudflared-windows-amd64.exe" tunnel --url http://localhost:5174

# Backend (same container local dev already uses)
& "C:\Users\Venkatesh\Cloudflared\cloudflared-windows-amd64.exe" tunnel --url http://localhost:8000

# Zitadel (same instance local dev already uses)
& "C:\Users\Venkatesh\Cloudflared\cloudflared-windows-amd64.exe" tunnel --url http://localhost:8080
```

Each prints a random `https://<random-words>.trycloudflare.com` URL. Copy the
three URLs into the places listed in [Updating the URLs](#updating-the-urls-when-a-quick-tunnel-restarts).

## Backend CORS

The backend is one shared FastAPI process serving both frontends, so its
CORS allow-list (`CORS_ORIGINS` in root `.env`) has to include **every**
origin that talks to it at once. That means the customer frontend's tunnel
origin does have to go into root `.env` — there's no way around this without
running a second backend (which was explicitly out of scope), since CORS is
a property of the one shared process, not of either frontend individually.

This is additive only — the existing `http://localhost:5173` and
`http://192.168.1.27:5173` origins are untouched, so local login/API calls
are unaffected:

```
CORS_ORIGINS=http://localhost:5173,http://192.168.1.27:5173,https://<current-customer-frontend-tunnel>.trycloudflare.com
```

Verified live in this session:

```
$ curl -X OPTIONS http://localhost:8000/api/companies -H "Origin: https://discovery-knows-gravity-cost.trycloudflare.com" ...
access-control-allow-origin: https://discovery-knows-gravity-cost.trycloudflare.com
$ curl -X OPTIONS http://localhost:8000/api/companies -H "Origin: http://localhost:5173" ...
access-control-allow-origin: http://localhost:5173
```

CORS_ORIGINS is read once at process start, so after editing it:

```powershell
docker compose up -d --force-recreate backend
```

## Known limitation: Zitadel and brand-new Quick Tunnel hostnames

**This was tested directly in this environment, not assumed.**

Zitadel resolves which "instance" a request belongs to by matching the
request's `Host` header against a fixed list of domains registered for that
instance — the list is set at the instance's true first initialization and
is not something a later container restart can add to.

What was verified:

- `http://localhost:8080` → resolves fine (issuer `http://localhost:8080`).
  `localhost` is registered.
- A `trycloudflare.com` hostname left over from a much earlier session
  (`ratios-mysql-indirect-shipment.trycloudflare.com`) also still resolves —
  it happened to be the `ZITADEL_EXTERNALDOMAIN` value at this instance's
  actual first init, months ago, and has stayed registered ever since.
- A **brand-new** hostname
  (`professionals-semester-vocals-vatican.trycloudflare.com`, the one given
  for this task) does **not** resolve:
  ```
  unable to set instance using origin &{professionals-semester-vocals-vatican.trycloudflare.com  http}
  (ExternalDomain is localhost): Message=Instance not found.
  ```
- Restarting the `zitadel` container with `ZITADEL_EXTERNAL_DOMAIN` set to
  that new hostname (i.e. `ZITADEL_EXTERNAL_DOMAIN=<new host> docker compose
  up -d --force-recreate zitadel`) was tried and **did not help** — the same
  "Instance not found" error persisted. This env var only matters at true
  first-init (`start-from-init` only actually initializes once per Postgres
  volume); on every later restart it's effectively ignored for domain
  purposes. (This test was reverted immediately afterward — `zitadel` is
  back on `ZITADEL_EXTERNAL_DOMAIN=localhost`, confirmed healthy, confirmed
  `http://localhost:8080` still resolves.)

**Net effect:** because a Cloudflare Quick Tunnel (`cloudflared tunnel --url
...`) gets a brand-new random hostname every single time it restarts, and
this Zitadel instance can't register a new domain post-init, **login through
the Zitadel Quick Tunnel URL will not work for a freshly-started tunnel**,
even though the frontend and backend tunnels work fine for everything that
doesn't require a Zitadel redirect. This is an architectural mismatch
between "ephemeral random-hostname tunnels" and "Zitadel's fixed instance
domain list," not a bug in this setup.

**Update (2026-09-18): moved to a named Cloudflare Tunnel.** `cloudflared` now runs as a
Windows service with a dashboard-managed token (`sc qc cloudflared`), routing stable
hostnames instead of Quick Tunnel's random ones:

- `https://empm-test.mepstrait.in` -> `localhost:5174` (customer frontend)
- `https://auth-test.mepstrait.in` -> `localhost:8080` (Zitadel)

A stable hostname fixes the "random domain every restart" problem, but **not** the
underlying issue described above — `ZITADEL_EXTERNALDOMAIN` is still only applied at true
first-init. Confirmed live on 2026-09-18 (before any other change):

```
$ curl -s http://localhost:8080/.well-known/openid-configuration -H "Host: auth-test.mepstrait.in"
unable to set instance using origin &{auth-test.mepstrait.in  http} (ExternalDomain is
localhost): Message=Instance not found.
```

This instance is not a fresh one (8+ weeks old, has a real org/admin user/OIDC client and
a `SUPERADMIN_ZITADEL_SUB` mapping), so recreating it from scratch is destructive and was
ruled out. The chosen fix (non-destructive): add `auth-test.mepstrait.in` as an additional
trusted domain on the *existing* instance via the Zitadel Console —

1. Open `http://localhost:8080/ui/console` and log in with `ZITADEL_ADMIN_USERNAME` /
   `ZITADEL_ADMIN_PASSWORD` from `.env`.
2. Go to **Instance** settings (gear/settings icon) → **Domains** tab.
3. Add `auth-test.mepstrait.in` as a custom instance domain.
4. Re-verify: `curl -s http://localhost:8080/.well-known/openid-configuration -H "Host: auth-test.mepstrait.in"` should return a discovery document with that host, not "Instance not found".
5. In the same Console, open the OIDC application for client `382760455313096708` and add
   `https://empm-test.mepstrait.in/callback` to its **Redirect URIs** (alongside the
   existing `http://localhost:5173/callback` — do not remove it), and add
   `https://empm-test.mepstrait.in` to **Post Logout Redirect URIs** / allowed origins as
   applicable.

Exact menu labels may vary slightly by Zitadel version — look for instance-level
"Domains" management if the above doesn't match exactly.

Paths forward that were considered but not taken (kept for reference):

1. **Recreate Zitadel from scratch** with `ZITADEL_EXTERNAL_DOMAIN` set to a
   *stable* hostname before the very first `start-from-init` — e.g. a named
   Cloudflare Tunnel (`cloudflared tunnel create` + a DNS route on a domain
   you actually own, not a `--url` quick tunnel) so the hostname never
   changes again. **This destroys the existing Zitadel database** (all
   orgs/users/clients) unless it's a fresh Postgres volume — do not do this
   without confirming you're fine losing current Zitadel data, and probably
   worth taking a backup first regardless.
2. **Use Zitadel's Instance Domains management API** to register an
   additional domain on the *existing* instance without recreating it. This
   is a real, documented Zitadel capability, but exercising it needs an
   authenticated admin/service-user API token, which this instance doesn't
   have set up (its token endpoint doesn't advertise the password grant, so
   there's no quick way to script this without first creating a machine user
   + key via the Zitadel Console — a manual step). Whether a
   `*.trycloudflare.com` hostname you don't control DNS for can even pass
   Zitadel's domain-ownership verification is unconfirmed.
3. **Get a named (non-quick) Cloudflare Tunnel** for Zitadel specifically, so
   its hostname is stable, then apply option 2 (or option 1) once, after
   which that one domain keeps working for every future customer-testing
   session without repeating this step.

None of these were performed — they're destructive or need your Cloudflare
account/domain details, so I stopped at documenting the limitation as
instructed rather than guessing my way through it.

## Updating the URLs when a Quick Tunnel restarts

Quick Tunnel hostnames are random and change every time `cloudflared`
restarts. Whenever that happens:

1. **Frontend tunnel (→ 5174) changed** — nothing to update in config; the
   frontend itself doesn't need to know its own public URL.
2. **Backend tunnel (→ 8000) changed** — edit `VITE_API_BASE` in
   `.env.cloudflare` to the new URL, then:
   ```powershell
   docker compose -f docker-compose.cloudflare.yml up -d --force-recreate frontend-cloudflare
   ```
3. **Zitadel tunnel (→ 8080) changed** — edit `VITE_ZITADEL_AUTHORITY` in
   `.env.cloudflare` the same way, **and** remember the "Known limitation"
   above: a new Zitadel tunnel hostname will not actually be able to
   complete login until that limitation is addressed.
4. **Customer frontend's own public origin changed** (new frontend tunnel
   hostname) — update `CORS_ORIGINS` in root `.env` to the new origin (see
   [Backend CORS](#backend-cors)), then
   `docker compose up -d --force-recreate backend`.
5. If the frontend tunnel's hostname is meant to double as the Zitadel
   redirect target, also update the redirect URI registered on the Zitadel
   application in the Console (see next section).

## Zitadel redirect URI

The OIDC client (`VITE_ZITADEL_CLIENT_ID=382760455313096708`, same one local
dev uses) is currently registered with exactly one redirect URI:
`http://localhost:5173/callback` (set by `scripts/bootstrap_zitadel.py`).
Zitadel clients support multiple registered redirect URIs at once, so the
customer frontend's callback can be added alongside it — it does not replace
the local one.

Whenever the customer frontend's tunnel hostname changes, add the new
`https://<current-frontend-tunnel-host>/callback` to that application's
"Redirect URIs" list in the Zitadel Console
(`http://localhost:8080/ui/console` → Projects → your app → Redirect URIs).
This is separate from, and in addition to, the domain-registration
limitation above — even once/if that's solved, this step is still needed
every time the frontend hostname changes.

## Stopping customer testing

```powershell
docker compose -f docker-compose.cloudflare.yml down
```

Leaves the main `docker compose` project (backend/zitadel/mysql/grafana/the
5173 frontend) running untouched. Then Ctrl+C the three `cloudflared`
windows.

## Verifying localhost still works

```powershell
curl http://localhost:5173
curl http://localhost:8000/health
curl http://localhost:8080/.well-known/openid-configuration
```

The last one should report `"issuer":"http://localhost:8080"`. Then log in
at `http://localhost:5173` as you normally would — this was re-verified
working in this session after all of the above changes.

## Current values (as of this setup)

As of 2026-09-18, frontend and Zitadel are served through a **named** (stable)
Cloudflare Tunnel — these hostnames do not change on restart, unlike the Quick Tunnel
URLs this section used to list:

- Customer frontend: `https://empm-test.mepstrait.in`
- Zitadel: `https://auth-test.mepstrait.in` (requires the one-time Console step above
  before login will work — see "Update (2026-09-18)")
- Backend: still the old Quick Tunnel URL below — no stable public backend route was set
  up as part of the named-tunnel migration. Update `VITE_API_BASE` in `.env.cloudflare`
  once one exists, then `docker compose -f docker-compose.cloudflare.yml up -d --force-recreate frontend-cloudflare`.
  `https://warranty-issues-solved-perform.trycloudflare.com` (likely stale/dead)
