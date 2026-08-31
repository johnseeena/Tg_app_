from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


class PeerCreate(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def name_len(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 64:
            raise ValueError("name must be 1-64 characters")
        return v


class PeerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    client_uuid: str
    created_at: datetime
    traffic_used_bytes: int
    traffic_limit_bytes: int | None
    expires_at: datetime | None


class PeerLimitsUpdate(BaseModel):
    # Full-replace, not a partial patch: the admin form always submits both
    # fields: null means "no limit". Simpler than tri-state unset-tracking
    # and matches how the form actually works.
    traffic_limit_bytes: int | None = None
    expires_at: datetime | None = None

    @field_validator("traffic_limit_bytes")
    @classmethod
    def positive_limit(cls, v: int | None) -> int | None:
        if v is not None and v <= 0:
            raise ValueError("traffic_limit_bytes must be positive")
        return v


class ServerParams(BaseModel):
    endpoint_host: str
    # Base64 of the CA certificate every client needs to validate the
    # server (same CA that signs every issued client cert) — see
    # ikev2_manager.get_ca_cert_base64.
    ca_cert_base64: str


class PeerCertOut(BaseModel):
    """Separate from PeerOut on purpose: this carries the actual signed
    certificate (+ private key, inside the .p12) and is only ever returned
    from the explicit "reveal config" action, never from the bulk peer
    list — see routers/peers.py."""

    client_uuid: str
    cert_base64: str


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    telegram_id: int
    username: str | None
    role: str
    status: str
    active_peer_count: int
    created_at: datetime


class AdminPeerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    client_uuid: str
    created_at: datetime
    traffic_used_bytes: int
    traffic_limit_bytes: int | None
    expires_at: datetime | None


class IosProfileToken(BaseModel):
    token: str


class VpnPeerStatus(BaseModel):
    client_uuid: str
    in_bytes: int
    out_bytes: int


class VpnStatus(BaseModel):
    peer_count: int
    peers: list[VpnPeerStatus]


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_telegram_id: int
    action: str
    target: str | None
    detail: str | None
    created_at: datetime
