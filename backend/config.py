import os
import time
from enum import Enum


class EnvironmentType(str, Enum):
    LOCALHOSPITAL = "LOCALHOSPITAL"
    REMOTEBACKUP = "REMOTEBACKUP"


class Settings:
    # Detect environment from env var
    ENVIRONMENT: EnvironmentType = EnvironmentType(
        os.getenv("MEDIBOT_ENVIRONMENT", "LOCALHOSPITAL")
    )

    # API Configuration
    API_HOST: str = os.getenv("API_HOST", "0.0.0.0")
    API_PORT: int = int(os.getenv("API_PORT", 8000))
    API_BASE_URL: str = os.getenv(
        "API_BASE_URL",
        f"http://localhost:{int(os.getenv('API_PORT', 8000))}"
        if EnvironmentType(os.getenv("MEDIBOT_ENVIRONMENT", "LOCALHOSPITAL"))
           == EnvironmentType.LOCALHOSPITAL
        else "https://medibot-backup.example.com"
    )

    # Database Configuration
    # REMOTEBACKUP uses /tmp/medibot.db — writable on Railway, shared across
    # all get_db() calls within the same process lifetime.
    # NOTE: /tmp is ephemeral on Railway restarts — that is acceptable for the
    # remote backup role (data is received via sync push from the local server).
    if EnvironmentType(os.getenv("MEDIBOT_ENVIRONMENT", "LOCALHOSPITAL")) \
       == EnvironmentType.LOCALHOSPITAL:
        DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./medibot.db")
        DB_PATH: str = os.getenv("DB_PATH", "./medibot.db")
    else:
        DATABASE_URL: str = os.getenv(
            "DATABASE_URL",
            "sqlite:////tmp/medibot.db"
        )
        DB_PATH: str = os.getenv("DB_PATH", "/tmp/medibot.db")

    # MQTT Configuration (local only)
    MQTT_ENABLED: bool = (
        EnvironmentType(os.getenv("MEDIBOT_ENVIRONMENT", "LOCALHOSPITAL"))
        == EnvironmentType.LOCALHOSPITAL
    )
    MQTT_BROKER_HOST: str = os.getenv("MQTT_BROKER_HOST", "127.0.0.1")
    MQTT_BROKER_PORT: int = int(os.getenv("MQTT_BROKER_PORT", 1883))

    # Session & Auth
    SESSION_TIMEOUT_MINUTES: int = (
        30 if EnvironmentType(os.getenv("MEDIBOT_ENVIRONMENT", "LOCALHOSPITAL"))
           == EnvironmentType.LOCALHOSPITAL else 60
    )
    AUTH_POLICY: str = (
        "LOCAL" if EnvironmentType(os.getenv("MEDIBOT_ENVIRONMENT", "LOCALHOSPITAL"))
                == EnvironmentType.LOCALHOSPITAL else "REMOTESTRONG"
    )

    # CORS — allow all origins on Railway so the Vercel frontend can reach it
    CORS_ORIGINS: list = (
        ["http://localhost", "http://127.0.0.1", "http://192.168.1."]
        if EnvironmentType(os.getenv("MEDIBOT_ENVIRONMENT", "LOCALHOSPITAL"))
           == EnvironmentType.LOCALHOSPITAL
        else ["*"]
    )

    # Sync / Backup
    SYNC_MODE: str = (
        "PUSH_TO_REMOTE"
        if EnvironmentType(os.getenv("MEDIBOT_ENVIRONMENT", "LOCALHOSPITAL"))
           == EnvironmentType.LOCALHOSPITAL else "RECEIVE"
    )
    BACKUP_ENABLED: bool = (
        EnvironmentType(os.getenv("MEDIBOT_ENVIRONMENT", "LOCALHOSPITAL"))
        == EnvironmentType.LOCALHOSPITAL
    )
    REMOTE_SYNC_ENDPOINT: str = os.getenv(
        "REMOTE_SYNC_ENDPOINT",
        "https://medibot-backup.example.com/api/sync"
    )
    SYNC_INTERVAL_SECONDS: int = 300

    # Audit Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    AUDIT_LOG_PATH: str = (
        "./logs/audit.log"
        if EnvironmentType(os.getenv("MEDIBOT_ENVIRONMENT", "LOCALHOSPITAL"))
           == EnvironmentType.LOCALHOSPITAL
        else "/tmp/medibot_audit.log"
    )


settings = Settings()

# Backward-compatibility exports for existing backend imports.
ENVIRONMENT = settings.ENVIRONMENT
IS_LOCAL = ENVIRONMENT == EnvironmentType.LOCALHOSPITAL
IS_REMOTE = ENVIRONMENT == EnvironmentType.REMOTEBACKUP

DB_PATH = settings.DB_PATH
MQTT_HOST = settings.MQTT_BROKER_HOST
MQTT_PORT = settings.MQTT_BROKER_PORT
MQTT_WS_PORT = int(os.getenv("MQTT_WS_PORT", "9001"))
TOPIC_CMD = os.getenv("TOPIC_CMD", "robot/ROBOT001/cmd/dispense")
APP_START = time.time()

SYNC_ENABLED = os.getenv("SYNC_ENABLED", "true").strip().lower() in ("1", "true", "yes", "on")
SYNC_RETRY_ATTEMPTS = int(os.getenv("SYNC_RETRY_ATTEMPTS", "5"))
SYNC_RETRY_BACKOFF_SECONDS = int(os.getenv("SYNC_RETRY_BACKOFF_SECONDS", "60"))
BACKUP_URL = os.getenv("BACKUP_URL", "https://medibot-backup.example.com")
BACKUP_API_KEY = os.getenv("BACKUP_API_KEY", "")

AUDIT_HMAC_KEY = os.getenv("AUDIT_HMAC_KEY", "medibot-dev-audit-key")
REQUIRE_HTTPS = os.getenv("REQUIRE_HTTPS", "false").strip().lower() in ("1", "true", "yes", "on")
RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").strip().lower() in ("1", "true", "yes", "on")
RATE_LIMIT_REQUESTS_PER_MIN = int(os.getenv("RATE_LIMIT_REQUESTS_PER_MIN", "120"))

ALLOW_PRESCRIPTION_EDIT = os.getenv(
    "ALLOW_PRESCRIPTION_EDIT",
    "true" if IS_LOCAL else "false",
).strip().lower() in ("1", "true", "yes", "on")
ALLOW_PRESCRIPTION_DELETE = os.getenv(
    "ALLOW_PRESCRIPTION_DELETE",
    "true" if IS_LOCAL else "false",
).strip().lower() in ("1", "true", "yes", "on")
