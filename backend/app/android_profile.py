"""Server-side builder for the strongSwan Android ".sswan" profile.

Why this exists as well as frontend/src/androidProfile.ts: the client-side
builder hands the whole profile to the external browser inside the URL
#fragment, and the embedded PKCS#12 makes that ~6.5 KB. Some Android
browsers/ROMs silently truncate long URLs, so the receiving page rebuilt a
CUT-OFF file and strongSwan rejected it with "Unterminated string at
character NNNN" (confirmed on a real device). Serving the profile from a
short token URL removes the length limit entirely — same fix already applied
to the iOS .mobileconfig path.

Keep in sync with frontend/src/androidProfile.ts (kept as the desktop
download fallback). Format verified against strongSwan's own docs:
docs.strongswan.org/docs/latest/os/androidVpnClientProfiles.html
"""

import json
import uuid


def build_sswan(endpoint_host: str, cert_base64: str, remark: str) -> str:
    return json.dumps(
        {
            "uuid": str(uuid.uuid4()),
            "name": remark,
            "type": "ikev2-cert",
            "remote": {"addr": endpoint_host},
            "local": {"p12": cert_base64, "rsa-pss": True},
            "ike-proposal": "aes256-sha256-modp2048",
            "esp-proposal": "aes128gcm16",
        },
        indent=2,
        ensure_ascii=False,
    )
