# CPC — Critical Power Command

CPC (Critical Power Command) is a full-stack platform for monitoring emergency-power equipment. It includes a FastAPI API with role-based access control, a React web dashboard, an Expo mobile client, Zitadel authentication, MySQL, and Grafana demo dashboards.

## Components

| Directory | Purpose |
| --- | --- |
| `backend/` | FastAPI, SQLAlchemy, Alembic migrations, MySQL integration, JWT/RBAC API |
| `frontend/` | React, Vite, TypeScript web application |
| `mobile/` | Expo React Native client for Android and iOS |
| `grafana/` | Provisioned Grafana dashboards and datasource configuration |
| `scripts/` | One-time Zitadel OIDC bootstrap utility |
| `reference/` | Original static-demo reference |

## Prerequisites

Install the following on the machine that will run the project:

| Tool | Required version | Used for |
| --- | --- | --- |
| Git | 2.52+ | Cloning and version control |
| Docker Desktop / Docker Engine | 29.6+ with Docker Compose v2 | Local services and web stack |
| Node.js | 20+ (22.14 used for development) | Frontend and mobile dependencies |
| npm | 10+ (10.9 used for development) | JavaScript package management |
| Python | 3.10+ (3.12 used for development) | Zitadel bootstrap script and optional backend tests |
| Expo Go | Current SDK 54-compatible release | Running the mobile app on a device |

The exact application dependencies are committed in `backend/requirements.txt`, `frontend/package-lock.json`, and `mobile/package-lock.json`. Use `npm ci` to install the locked JavaScript dependencies.

## Clone and start the web stack

```bash
git clone https://github.com/Venkatesh-Tadpatri/Emergency-Power-Managment-Platform.git
cd Emergency-Power-Managment-Platform
cp .env.example .env
```

On Windows PowerShell, copy the environment file with:

```powershell
Copy-Item .env.example .env
```

Edit `.env` before continuing. At minimum, set unique values for the database passwords, Zitadel administrator password, and `ZITADEL_MASTERKEY`. Generate the master key with:

```bash
openssl rand -base64 24
```

The generated master key must be exactly 32 characters. Never commit `.env` or credentials; `.env.example` is the safe template to share.

### Configure Zitadel once

Start Zitadel and its database first:

```bash
docker compose up -d mysql zitadel-db zitadel
docker compose ps
```

When Zitadel is healthy, open `http://localhost:8080` and sign in using `ZITADEL_ADMIN_USERNAME` and `ZITADEL_ADMIN_PASSWORD` from `.env`.

Create a Zitadel service user with the **Org Owner** role and generate a Personal Access Token for it. Then run:

```bash
python scripts/bootstrap_zitadel.py --pat <service-user-token>
```

Copy the printed `ZITADEL_CLIENT_ID` and `VITE_ZITADEL_CLIENT_ID` values into `.env`. Also set `SUPERADMIN_ZITADEL_SUB` to the ID of the human administrator account—not the service user.

### Testing from another device on your network (phone, tablet, second computer)

`localhost` only resolves on the machine running Docker. To reach the stack from any other device, every one of these values must point at the **same** LAN IP address (your computer's IP on the local network, e.g. `192.168.1.28`) — not a mix of `localhost` and the IP:

- `.env`: `ZITADEL_EXTERNAL_DOMAIN`, `ZITADEL_ISSUER`, `CORS_ORIGINS`, `VITE_API_BASE`, `VITE_ZITADEL_AUTHORITY`
- `mobile/.env`: `EXPO_PUBLIC_API_BASE`, `EXPO_PUBLIC_ZITADEL_AUTHORITY`, `EXPO_PUBLIC_GRAFANA_URL`

`ZITADEL_EXTERNAL_DOMAIN` and `ZITADEL_ISSUER` in particular must match exactly — Zitadel bakes the domain into every token's issuer claim, and the backend rejects tokens whose issuer doesn't match `ZITADEL_ISSUER` character-for-character. After changing any of these, recreate the affected containers so they pick up the new values:

```bash
docker compose up -d --force-recreate zitadel backend frontend
```

Your machine's LAN IP can change (new network, DHCP lease renewal, VPN). If login or API calls suddenly stop working after previously working, check `ipconfig` (Windows) / `ip addr` (Linux/Mac) for your current IP and re-sync the values above.

### Start all services

```bash
docker compose up --build
```

The backend waits for MySQL, applies Alembic migrations, and seeds demo data on its first startup. Open:

| Service | URL |
| --- | --- |
| Web dashboard | http://localhost:5173 |
| API documentation | http://localhost:8000/docs |
| Zitadel console | http://localhost:8080 |
| Grafana | http://localhost:3000 |

Stop the local stack with `docker compose down`. Add `-v` only when you intentionally want to remove the local MySQL and Zitadel data volumes.

## Local development without Docker

The infrastructure services still need to be available. Install the clients using their committed lockfiles:

```bash
# Web frontend
cd frontend
npm ci
npm run dev

# In a second terminal: Python backend
cd backend
python -m venv .venv
# Windows PowerShell: .\.venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Mobile app

The mobile app uses the same API and Zitadel instance.

```bash
cd mobile
cp .env.example .env
npm ci
npm start
```

For a physical device, replace `localhost` in `mobile/.env` with your computer’s LAN IP address. Create a native application in Zitadel, register the redirect URI `cpc://auth`, and set its client ID as `EXPO_PUBLIC_ZITADEL_CLIENT_ID`. Keep the API, Zitadel authority, and mobile app on the same reachable host.

## Tests and build checks

```bash
# Backend tests (with the Docker stack running)
docker compose exec backend pytest

# Frontend production build
cd frontend
npm run build
```

## Demo telemetry data

Live equipment readings (voltage, current, oil pressure, etc.) are not backed by a real MQTT/historian pipeline yet — the web app, the mobile app, and the Grafana dashboards all fall back to static demo fixtures for the specific devices they cover:

- `frontend/public/data/telemetry.json` — the primary fixture, matched by device name (e.g. `ASTER-GEN-001`)
- `frontend/src/data/mepstra-telemetry.json` — a secondary fallback matched by device ID, covering a wider range of Aster Prime's equipment (`GEN-0079`–`GEN-0099`, `ATS-0163`–`ATS-0186`)
- `mobile/src/data/telemetry.json` and `mobile/src/data/mepstra-telemetry.json` — copies of the same two files, used by the mobile app's own resolver (`mobile/src/telemetry.js`)

Devices outside those ID ranges show placeholder values (`—` / `WAITING`) — that's expected, not a bug. If you add new demo equipment and want it to show live-looking readings, extend these fixtures.

**Careful with `mobile/src/data/`**: the root `.gitignore` has a broad `data/` rule (it matches any directory named `data` at any depth) with explicit negation exceptions carved out for the paths above. If you add another `data/` directory anywhere in the repo, it will be silently gitignored — and critically, silently **excluded from EAS Build's upload archive** too, which fails the mobile build with a "module not found" error that gives no hint it's a gitignore problem. Add a matching `!path/to/your/data/` negation if you hit this.

## Customer branding and generated one-lines

- Each customer has a **Company Details** page where an administrator can upload a PNG or JPEG logo (maximum 2 MB).
- The uploaded customer logo is used in the report preview and in downloaded Generator Run and ATS Transfer PDFs. Reports fall back to the CPC label when a customer logo has not been uploaded.
- System pages include **System Details**, **One-Line Wizard**, and **One-Line**. The wizard saves the equipment and wiring configuration; the One-Line tab displays the generated interactive diagram.
- In generated diagrams, switchgear, distribution gear, breakers, ATS units, and generators expose contextual detail popups.

When upgrading an existing installation, apply the migrations before using these features:

```bash
cd backend
alembic upgrade head
```

## Troubleshooting

**Grafana container stuck restarting / crash-looping.** Usually stale internal SQLite state left over from a previous run conflicting with datasource provisioning (`data source with the same uid already exists` in `docker compose logs grafana`). Since Grafana's data directory isn't a mounted volume, recreating the container gives it a clean state:
```bash
docker compose up -d --force-recreate grafana
```

**Backend/Zitadel unreachable after changing `.env`.** Config changes only take effect on container *recreation*, not `docker compose restart`:
```bash
docker compose up -d --force-recreate zitadel backend frontend
```

## Security and repository hygiene

- Commit source code, configuration templates, migrations, documentation, and package lockfiles.
- Do not commit `.env` files, `node_modules`, Python virtual environments, caches, local database files, certificates, or private keys.
- Before sharing the repository, rotate any password, token, or SMTP credential that may have been placed in a local `.env` file.

## SMTP (optional)

SMTP is needed for Zitadel registration, activation, and password-reset emails. Set the `ZITADEL_SMTP_*` values before the first Zitadel startup, or configure and activate SMTP later in the Zitadel Console under **Instance → Settings → Notifications**.
