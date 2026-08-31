// Must match backend/app/ikev2_manager.py's PKCS12_EXPORT_PASSWORD exactly
// — this is the password every exported .p12 client certificate is
// wrapped with. Not a secret (it protects nothing beyond what HTTPS-in-
// transit and possessing the file already implies) — it exists only
// because some PKCS#12 parsers (notably Android's, confirmed by a real
// "wrong password" failure with an empty password) don't reliably accept
// an empty/blank password the way OpenSSL/NSS tools do. iOS and Windows
// consume this programmatically (embedded in the .mobileconfig / passed
// to Import-PfxCertificate); Android has no such field in the .sswan
// schema, so the user must type it in by hand — see the Android hint text
// in translations.ts.
export const PKCS12_EXPORT_PASSWORD = "ikev2vpn";
