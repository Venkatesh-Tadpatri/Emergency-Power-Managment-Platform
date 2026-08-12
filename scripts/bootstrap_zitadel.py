#!/usr/bin/env python3
"""One-time setup script: creates the "CPC" Zitadel project and a public/PKCE
OIDC application for the React frontend, then prints the values to drop into
.env (VITE_ZITADEL_CLIENT_ID / ZITADEL_CLIENT_ID).

Why this can't be fully automated via docker-compose env vars alone: Zitadel's
ZITADEL_FIRSTINSTANCE_* variables bootstrap an org and an admin *human* user,
but creating a Project + OIDC Application still requires calling the
Management API, which requires a bearer token — and getting that first token
for a fresh instance is the actual chicken-and-egg problem. The stable,
version-independent way to break that loop is a Personal Access Token (PAT).

Important: Zitadel only issues PATs to *machine* (service) users, never to
human accounts — so the PAT this script uses does NOT belong to the human
admin who logs into the web app. Do not use it to determine who the seeded
superadmin should be (an earlier version of this script tried to and got it
wrong). Look up the human admin's own user ID separately: Console -> Users ->
your human admin account -> the "ID" field on that page -> put that in
SUPERADMIN_ZITADEL_SUB in .env, not anything this script prints.

Usage:
  1. docker compose up -d mysql zitadel-db zitadel
  2. Open http://localhost:8080, log in as the bootstrapped admin
     (ZITADEL_ADMIN_USERNAME / ZITADEL_ADMIN_PASSWORD from your .env).
  3. Console -> Users -> Service Users -> "+ New" -> create a machine user
     (e.g. "bootstrap-automation").
  4. Console -> Organization -> "+" next to the manager avatars -> add that
     machine user as a manager with the "Org Owner" role (or at least
     "Org Project Creator").
  5. On that machine user's page -> Personal Access Tokens -> "+ New" -> copy
     the token.
  6. python scripts/bootstrap_zitadel.py --pat <token> [--issuer http://localhost:8080]
  7. Copy the printed ZITADEL_CLIENT_ID / VITE_ZITADEL_CLIENT_ID into .env.
     Separately set SUPERADMIN_ZITADEL_SUB to your *human* admin's ID (see
     note above), then `docker compose up`.
"""
import argparse
import json
import sys
import urllib.error
import urllib.request

REDIRECT_URI = "http://localhost:5173/callback"
POST_LOGOUT_REDIRECT_URI = "http://localhost:5173"


def call(issuer: str, pat: str, method: str, path: str, body: dict | None = None) -> dict:
    url = f"{issuer}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {pat}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        print(f"Request to {path} failed ({exc.code}): {detail}", file=sys.stderr)
        raise


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pat", required=True, help="Personal Access Token from the Zitadel Console")
    parser.add_argument("--issuer", default="http://localhost:8080")
    parser.add_argument("--project-name", default="CPC")
    parser.add_argument("--app-name", default="CPC Web")
    args = parser.parse_args()

    print("Creating project...")
    project = call(args.issuer, args.pat, "POST", "/management/v1/projects", {"name": args.project_name})
    project_id = project["id"]
    print(f"  project id: {project_id}")

    print("Creating OIDC application (PKCE, public client)...")
    app = call(
        args.issuer,
        args.pat,
        "POST",
        f"/management/v1/projects/{project_id}/apps/oidc",
        {
            "name": args.app_name,
            "redirectUris": [REDIRECT_URI],
            "responseTypes": ["OIDC_RESPONSE_TYPE_CODE"],
            "grantTypes": ["OIDC_GRANT_TYPE_AUTHORIZATION_CODE"],
            "appType": "OIDC_APP_TYPE_USER_AGENT",
            "authMethodType": "OIDC_AUTH_METHOD_TYPE_NONE",
            "postLogoutRedirectUris": [POST_LOGOUT_REDIRECT_URI],
            "devMode": True,
            "accessTokenType": "OIDC_TOKEN_TYPE_JWT",
        },
    )
    client_id = app["clientId"]

    print("\n" + "=" * 60)
    print("Done. Add these to your .env file:")
    print("=" * 60)
    print(f"ZITADEL_CLIENT_ID={client_id}")
    print(f"VITE_ZITADEL_CLIENT_ID={client_id}")
    print("=" * 60)
    print(
        "SUPERADMIN_ZITADEL_SUB is NOT this script's PAT owner (that's a\n"
        "service account). Set it to your human admin's own ID instead:\n"
        "Console -> Users -> your human admin account -> the 'ID' field."
    )
    print("Then run: docker compose up")


if __name__ == "__main__":
    main()
