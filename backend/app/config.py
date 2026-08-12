from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "mysql+pymysql://cpc:cpc_dev_pw@localhost:3306/cpc"
    # The `iss` claim inside tokens — must match what the browser used (external/host address).
    zitadel_issuer: str = "http://localhost:8080"
    # Where the backend itself reaches Zitadel over the Docker network — "localhost" from
    # inside the backend container means the backend container, not the zitadel container.
    zitadel_internal_url: str = "http://zitadel:8080"
    zitadel_client_id: str = ""
    cors_origins: str = "http://localhost:5173"
    seed_on_start: bool = True
    superadmin_zitadel_sub: str = ""
    superadmin_email: str = "admin@cpc.local"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"


settings = Settings()
