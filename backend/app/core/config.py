from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Configuracion del backend. Lee variables PG_* del .env en la raiz del repo."""

    PG_HOST: str = "localhost"
    PG_PORT: int = 5432
    PG_USER: str = "postgres"
    PG_PASSWORD: str = ""
    PG_DATABASE: str = "mi_proyecto"

    # Security
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001"
    ENVIRONMENT: str = "development"  # "production" disables /docs

    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{self.PG_USER}:{self.PG_PASSWORD}"
            f"@{self.PG_HOST}:{self.PG_PORT}/{self.PG_DATABASE}"
        )

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
