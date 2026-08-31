"""Server-side builder for the Apple Configuration Profile (.mobileconfig).

Why this exists as well as frontend/src/iosProfile.ts: iOS will only install
a configuration profile that arrives as a real HTTPS response with
Content-Type application/x-apple-aspen-config. A blob: URL built in-page
(what the client-side builder produces) does NOT trigger iOS's "Profile
Downloaded -> install in Settings" flow — confirmed by a real device where
the profile simply never appeared under Settings. So for the actual install
path the backend serves the profile itself (see the /api/ios-profile/{token}
route in main.py); the TS version stays only as the desktop "download" fallback.

Keep this field-for-field in sync with frontend/src/iosProfile.ts — both are
copied from amnezia-client's own server_scripts/ipsec/mobileconfig.plist.
"""

import uuid
from xml.sax.saxutils import escape as _xml_escape

from .ikev2_manager import PKCS12_EXPORT_PASSWORD


def _esc(s: str) -> str:
    # xml.sax.saxutils.escape handles & < > by default; add the quote forms
    # so a device name with quotes can't break an attribute-like context.
    return _xml_escape(s, {'"': "&quot;", "'": "&apos;"})


def build_mobileconfig(
    endpoint_host: str,
    ca_cert_base64: str,
    client_uuid: str,
    cert_base64: str,
    remark_raw: str,
) -> str:
    remark = _esc(remark_raw)
    cert_payload_uuid = str(uuid.uuid4()).upper()
    ca_payload_uuid = str(uuid.uuid4()).upper()
    top_uuid = str(uuid.uuid4()).upper()
    vpn_payload_uuid = str(uuid.uuid4()).upper()

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>IKEv2</key>
      <dict>
        <key>AuthenticationMethod</key>
        <string>Certificate</string>
        <key>ChildSecurityAssociationParameters</key>
        <dict>
          <key>DiffieHellmanGroup</key>
          <integer>14</integer>
          <key>EncryptionAlgorithm</key>
          <string>AES-128-GCM</string>
          <key>LifeTimeInMinutes</key>
          <integer>1410</integer>
        </dict>
        <key>DeadPeerDetectionRate</key>
        <string>Medium</string>
        <key>DisableRedirect</key>
        <true/>
        <key>EnableCertificateRevocationCheck</key>
        <integer>0</integer>
        <key>EnablePFS</key>
        <integer>0</integer>
        <key>IKESecurityAssociationParameters</key>
        <dict>
          <key>DiffieHellmanGroup</key>
          <integer>14</integer>
          <key>EncryptionAlgorithm</key>
          <string>AES-256</string>
          <key>IntegrityAlgorithm</key>
          <string>SHA2-256</string>
          <key>LifeTimeInMinutes</key>
          <integer>1410</integer>
        </dict>
        <key>LocalIdentifier</key>
        <string>{client_uuid}</string>
        <key>PayloadCertificateUUID</key>
        <string>{cert_payload_uuid}</string>
        <key>OnDemandEnabled</key>
        <integer>0</integer>
        <key>OnDemandRules</key>
        <array>
          <dict>
          <key>Action</key>
          <string>Connect</string>
          </dict>
        </array>
        <key>RemoteAddress</key>
        <string>{endpoint_host}</string>
        <key>RemoteIdentifier</key>
        <string>{endpoint_host}</string>
        <key>UseConfigurationAttributeInternalIPSubnet</key>
        <integer>0</integer>
      </dict>
      <key>IPv4</key>
      <dict>
        <key>OverridePrimary</key>
        <integer>1</integer>
      </dict>
      <key>PayloadDescription</key>
      <string>Configures VPN settings</string>
      <key>PayloadDisplayName</key>
      <string>VPN</string>
      <key>PayloadOrganization</key>
      <string>IKEv2 VPN</string>
      <key>PayloadIdentifier</key>
      <string>com.apple.vpn.managed.{vpn_payload_uuid}</string>
      <key>PayloadType</key>
      <string>com.apple.vpn.managed</string>
      <key>PayloadUUID</key>
      <string>{vpn_payload_uuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>Proxies</key>
      <dict>
        <key>HTTPEnable</key>
        <integer>0</integer>
        <key>HTTPSEnable</key>
        <integer>0</integer>
      </dict>
      <key>UserDefinedName</key>
      <string>{remark}</string>
      <key>VPNType</key>
      <string>IKEv2</string>
    </dict>
    <dict>
      <key>PayloadCertificateFileName</key>
      <string>{client_uuid}</string>
      <key>PayloadContent</key>
      <data>
{cert_base64}
      </data>
      <key>PayloadDescription</key>
      <string>Adds a PKCS#12-formatted certificate</string>
      <key>PayloadDisplayName</key>
      <string>{remark}</string>
      <key>PayloadIdentifier</key>
      <string>com.apple.security.pkcs12.{cert_payload_uuid}</string>
      <key>PayloadType</key>
      <string>com.apple.security.pkcs12</string>
      <key>PayloadUUID</key>
      <string>{cert_payload_uuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>Password</key>
      <string>{PKCS12_EXPORT_PASSWORD}</string>
    </dict>
    <dict>
      <key>PayloadContent</key>
      <data>
{ca_cert_base64}
      </data>
      <key>PayloadCertificateFileName</key>
      <string>ikev2vpnca</string>
      <key>PayloadDescription</key>
      <string>Adds a CA root certificate</string>
      <key>PayloadDisplayName</key>
      <string>Certificate Authority (CA)</string>
      <key>PayloadIdentifier</key>
      <string>com.apple.security.root.{ca_payload_uuid}</string>
      <key>PayloadType</key>
      <string>com.apple.security.root</string>
      <key>PayloadUUID</key>
      <string>{ca_payload_uuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>PayloadDisplayName</key>
  <string>IKEv2 VPN ({endpoint_host})</string>
  <key>PayloadIdentifier</key>
  <string>com.apple.vpn.managed.{top_uuid}</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>{top_uuid}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
"""
