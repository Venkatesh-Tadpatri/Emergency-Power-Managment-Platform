from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "mysql+pymysql://cpc:cpc_dev_pw@localhost:3306/cpc"
    # The `iss` claim inside tokens — must match what the browser used (external/host address).
    zitadel_issuer: str = "http://localhost:8080"
    # Extra trusted issuers beyond zitadel_issuer, comma-separated — e.g. a Cloudflare
    # tunnel hostname used for customer/UAT testing (see docs/cloudflare-customer-testing.md).
    # Zitadel's JWKS is shared across every domain registered on the one instance, so a
    # token issued via any trusted domain verifies against the same signing keys; this only
    # widens which `iss` string is accepted, not which keys are trusted.
    zitadel_additional_issuers: str = ""
    # Where the backend itself reaches Zitadel over the Docker network — "localhost" from
    # inside the backend container means the backend container, not the zitadel container.
    zitadel_internal_url: str = "http://zitadel:8080"
    zitadel_client_id: str = ""
    cors_origins: str = "http://localhost:5173"
    seed_on_start: bool = True
    superadmin_zitadel_sub: str = ""
    superadmin_email: str = "admin@cpc.local"
    mqtt_enabled: bool = False
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str = ""
    mqtt_password: str = ""
    mqtt_topic_filter: str = "#"
    mqtt_tls: bool = False
    influxdb_url: str = "http://influxdb:8086"
    influxdb_token: str = "cpc-development-token-change-me"
    influxdb_org: str = "cpc"
    influxdb_bucket: str = "telemetry"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def zitadel_issuer_list(self) -> list[str]:
        extra = [i.strip() for i in self.zitadel_additional_issuers.split(",") if i.strip()]
        return [self.zitadel_issuer, *extra]

    class Config:
        env_file = ".env"


settings = Settings()
