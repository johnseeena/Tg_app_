// Builds a strongSwan Android ".sswan" VPN Client Configuration profile —
// used instead of Amnezia's own app for the same reason as iOS's
// .mobileconfig: Amnezia's own source (isSupportedByCurrentPlatform)
// returns false for the Ipsec container on Android too, so its vpn://
// import would never work here either.
//
// strongSwan VPN Client (org.strongswan.android, free, official, Play
// Store/F-Droid) is a dedicated, actively maintained IKEv2 client that
// imports this exact JSON format — verified against strongSwan's own docs
// (docs.strongswan.org/docs/latest/os/androidVpnClientProfiles.html), not
// guessed, and matches the shape of Amnezia's own reference template
// (server_scripts/ipsec/strongswan.profile) field-for-field. File
// extension `.sswan`, media type `application/vnd.strongswan.profile`.
//
// No CA cert field needed: `pk12util`'s export (see backend/app/
// ikev2_manager.py) already bundles the signing CA into the client's
// PKCS#12 chain, which strongSwan extracts trust from directly — same
// reason Amnezia's own template omits `remote.cert` too.

import type { PeerCert, ServerParams } from "./types";

export function buildSswanProfile(server: ServerParams, cert: PeerCert, remark: string): string {
  return JSON.stringify(
    {
      uuid: crypto.randomUUID(),
      name: remark,
      type: "ikev2-cert",
      remote: { addr: server.endpoint_host },
      local: { p12: cert.cert_base64, "rsa-pss": true },
      "ike-proposal": "aes256-sha256-modp2048",
      "esp-proposal": "aes128gcm16",
    },
    null,
    2,
  );
}
