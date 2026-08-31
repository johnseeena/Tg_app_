from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    telegram_bot_token: str
    telegram_admin_ids_raw: str = Field(default="", alias="TELEGRAM_ADMIN_IDS")

    domain: str = ""
    # Host clients use to reach the IKEv2 tunnel. Falls back to `domain`
    # (the sslip.io Mini App hostname) if unset — set this to the server's
    # raw public IP if that domain's DNS is ever unreliable on some networks.
    # Also embedded in the server certificate's CN/SAN (see ipsec/entrypoint.sh),
    # so changing this after first boot means re-issuing the server cert.
    ipsec_endpoint_host: str = ""

    max_devices_per_user: int = 5
    init_data_max_age_seconds: int = 86400
    admin_session_ttl_seconds: int = 28800  # 8h — how long an admin-panel login stays valid

    nss_db_path: str = "/etc/ipsec.d"
    ca_cert_path: str = "/etc/ipsec.d/ca_cert_base64.p12"

    @property
    def telegram_admin_ids(self) -> set[int]:
        return {int(x) for x in self.telegram_admin_ids_raw.split(",") if x.strip()}

    @property
    def vpn_endpoint_host(self) -> str:
        return self.ipsec_endpoint_host or self.domain


settings = Settings()
