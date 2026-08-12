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

## Security and repository hygiene

- Commit source code, configuration templates, migrations, documentation, and package lockfiles.
- Do not commit `.env` files, `node_modules`, Python virtual environments, caches, local database files, certificates, or private keys.
- Before sharing the repository, rotate any password, token, or SMTP credential that may have been placed in a local `.env` file.

## SMTP (optional)

SMTP is needed for Zitadel registration, activation, and password-reset emails. Set the `ZITADEL_SMTP_*` values before the first Zitadel startup, or configure and activate SMTP later in the Zitadel Console under **Instance → Settings → Notifications**.
