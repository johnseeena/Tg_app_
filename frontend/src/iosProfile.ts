// Builds a real Apple Configuration Profile (.mobileconfig) for native
// iOS IKEv2 — bypassing the Amnezia app entirely.
//
// Why: Amnezia's own source (client/core/utils/containers/containerUtils.cpp,
// ContainerUtils::isSupportedByCurrentPlatform) returns FALSE for the
// Ipsec container on BOTH iOS and Android — confirmed by the app itself
// reporting "protocol not supported" on a real device. The human-readable
// description text elsewhere in that file ("has native support on the
// latest versions of Android and iOS") refers to the OS's own VPN stack,
// not Amnezia's app-level support — so importing via Amnezia's vpn://
// mechanism was never going to work for this protocol, regardless of any
// fix on our side. The correct fix is to skip Amnezia altogether and hand
// iOS a native configuration profile — which iOS Settings installs
// directly with no third-party app involved at all.
//
// Template verified against amnezia-client's own
// server_scripts/ipsec/mobileconfig.plist (same file Amnezia's own
// self-hosted installer generates) — field-for-field, not guessed.

import type { PeerCert, ServerParams } from "./types";
import { PKCS12_EXPORT_PASSWORD as PKCS12_PASSWORD } from "./pkcs12Password";

// `remark` is a user-supplied device name (PeerCreate.name, only length-
// validated server-side) and lands inside XML string content below — must
// be escaped, or a name containing & < > " ' would corrupt the plist.
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildMobileConfigXml(server: ServerParams, cert: PeerCert, remarkRaw: string): string {
  const remark = xmlEscape(remarkRaw);
  const certPayloadUuid = crypto.randomUUID().toUpperCase();
  const caPayloadUuid = crypto.randomUUID().toUpperCase();
  const topUuid = crypto.randomUUID().toUpperCase();
  const vpnPayloadUuid = crypto.randomUUID().toUpperCase();

  return `<?xml version="1.0" encoding="UTF-8"?>
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
        <string>${cert.client_uuid}</string>
        <key>PayloadCertificateUUID</key>
        <string>${certPayloadUuid}</string>
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
        <string>${server.endpoint_host}</string>
        <key>RemoteIdentifier</key>
        <string>${server.endpoint_host}</string>
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
      <string>com.apple.vpn.managed.${vpnPayloadUuid}</string>
      <key>PayloadType</key>
      <string>com.apple.vpn.managed</string>
      <key>PayloadUUID</key>
      <string>${vpnPayloadUuid}</string>
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
      <string>${remark}</string>
      <key>VPNType</key>
      <string>IKEv2</string>
    </dict>
    <dict>
      <key>PayloadCertificateFileName</key>
      <string>${cert.client_uuid}</string>
      <key>PayloadContent</key>
      <data>
${cert.cert_base64}
      </data>
      <key>PayloadDescription</key>
      <string>Adds a PKCS#12-formatted certificate</string>
      <key>PayloadDisplayName</key>
      <string>${remark}</string>
      <key>PayloadIdentifier</key>
      <string>com.apple.security.pkcs12.${certPayloadUuid}</string>
      <key>PayloadType</key>
      <string>com.apple.security.pkcs12</string>
      <key>PayloadUUID</key>
      <string>${certPayloadUuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>Password</key>
      <string>${PKCS12_PASSWORD}</string>
    </dict>
    <dict>
      <key>PayloadContent</key>
      <data>
${server.ca_cert_base64}
      </data>
      <key>PayloadCertificateFileName</key>
      <string>ikev2vpnca</string>
      <key>PayloadDescription</key>
      <string>Adds a CA root certificate</string>
      <key>PayloadDisplayName</key>
      <string>Certificate Authority (CA)</string>
      <key>PayloadIdentifier</key>
      <string>com.apple.security.root.${caPayloadUuid}</string>
      <key>PayloadType</key>
      <string>com.apple.security.root</string>
      <key>PayloadUUID</key>
      <string>${caPayloadUuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
    </dict>
  </array>
  <key>PayloadDisplayName</key>
  <string>IKEv2 VPN (${server.endpoint_host})</string>
  <key>PayloadIdentifier</key>
  <string>com.apple.vpn.managed.${topUuid}</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${topUuid}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
`;
}
