import { useState, useEffect } from "react";
import { api, ApiError } from "../api";
import { buildMobileConfigXml } from "../iosProfile";
import { buildSswanProfile } from "../androidProfile";
import { buildWindowsSetupScript, safeWindowsFilename } from "../windowsScript";
import { PKCS12_EXPORT_PASSWORD } from "../pkcs12Password";
import { formatBytes } from "../format";
import { useI18n } from "../i18n";
import { confirmAction, getTelegramWebApp, isMobileTelegram } from "../telegram";
import type { Peer, PeerCert, ServerParams } from "../types";

interface Revealed {
  peerId: number;
  // null while the cert is being (re-)fetched — the signed certificate
  // lives server-side in the NSS database, so this always needs a round
  // trip. Each platform's config is built on demand from this + `server`
  // when its button is pressed, not precomputed — no reason to build all
  // three formats if the user only needs one.
  cert: PeerCert | null;
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function UserHome() {
  const { t } = useI18n();
  const [server, setServer] = useState<ServerParams | null>(null);
  const [peers, setPeers] = useState<Peer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newDeviceName, setNewDeviceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [revealedConfig, setRevealedConfig] = useState<Revealed | null>(null);

  async function refresh() {
    try {
      const [serverParams, peerList] = await Promise.all([api.serverParams(), api.listPeers()]);
      setServer(serverParams);
      setPeers(peerList);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failedToLoad"));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function reveal(peer: Peer) {
    setRevealedConfig({ peerId: peer.id, cert: null });
    try {
      const cert = await api.getPeerCert(peer.id);
      setRevealedConfig((cur) => (cur && cur.peerId === peer.id ? { ...cur, cert } : cur));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failedToLoad"));
      setRevealedConfig((cur) => (cur && cur.peerId === peer.id ? null : cur));
    }
  }

  async function addDevice() {
    setBusy(true);
    setError(null);
    try {
      const name = newDeviceName.trim() || "My device";
      const peer = await api.createPeer(name);
      setNewDeviceName("");
      await refresh();
      await reveal(peer);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failedToCreateDevice"));
    } finally {
      setBusy(false);
    }
  }

  async function revokeDevice(peer: Peer) {
    const confirmed = await confirmAction(t("revokeConfirm", { name: peer.name }));
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await api.revokePeer(peer.id);
      if (revealedConfig?.peerId === peer.id) setRevealedConfig(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failedToRevokeDevice"));
    } finally {
      setBusy(false);
    }
  }

  function toggleReveal(peer: Peer) {
    if (revealedConfig?.peerId === peer.id) {
      setRevealedConfig(null);
      return;
    }
    void reveal(peer);
  }

  // Both mobile installs now fetch their profile from the backend over a
  // short token URL (see installIos/installAndroid) rather than carrying it
  // in a URL #fragment via /open.html — the fragment approach broke on both
  // platforms for different reasons (iOS won't install from a blob:, and
  // long URLs get truncated on some Android browsers), so open.{html,js}
  // is no longer part of the install path.

  // iOS only installs a .mobileconfig delivered as a real HTTPS response
  // with the right Content-Type — a blob: URL built in-page silently fails
  // to register under Settings (confirmed on a real device). So we open the
  // backend's served-profile URL in the external browser: the Mini App mints
  // a short-lived, ownership-bound token, and Safari fetches the profile
  // from /api/ios-profile/{token}, which triggers the native install sheet.
  async function installIos(peer: Peer) {
    try {
      const { token } = await api.createIosProfileToken(peer.id);
      const url = `${window.location.origin}/api/ios-profile/${token}`;
      const webApp = getTelegramWebApp();
      if (webApp?.initData && webApp.openLink) {
        webApp.openLink(url);
      } else {
        window.location.href = url;
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failedToLoad"));
    }
  }

  function downloadIos(server: ServerParams, cert: PeerCert, name: string) {
    const xml = buildMobileConfigXml(server, cert, name);
    downloadBlob(new Blob([xml], { type: "application/x-apple-aspen-config" }), `${name}.mobileconfig`);
  }

  // Like iOS, the profile is fetched from the backend rather than carried in
  // the URL #fragment: with the PKCS#12 embedded it's ~6.5 KB, and some
  // Android browsers/ROMs silently truncate long URLs, so strongSwan received
  // a cut-off file ("Unterminated string at character NNNN" on a real device).
  async function installAndroid(peer: Peer, server: ServerParams, cert: PeerCert) {
    if (getTelegramWebApp()?.initData) {
      try {
        const { token } = await api.createIosProfileToken(peer.id);
        const url = `${window.location.origin}/api/android-profile/${token}`;
        getTelegramWebApp()?.openLink?.(url);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t("failedToLoad"));
      }
      return;
    }
    const json = buildSswanProfile(server, cert, peer.name);
    downloadBlob(new Blob([json], { type: "application/vnd.strongswan.profile" }), `${peer.name}.sswan`);
  }

  function downloadWindowsCert(cert: PeerCert, name: string) {
    // Same sanitized name the generated .ps1 expects in Downloads, so the
    // script can point straight at the file with no manual path editing.
    downloadBlob(base64ToBlob(cert.cert_base64, "application/x-pkcs12"), `${safeWindowsFilename(name)}.p12`);
  }

  function downloadWindowsCa(server: ServerParams) {
    downloadBlob(base64ToBlob(server.ca_cert_base64, "application/x-x509-ca-cert"), "ikev2-vpn-ca.cer");
  }

  function downloadWindowsScript(server: ServerParams, name: string) {
    const script = buildWindowsSetupScript(server, name);
    downloadBlob(new Blob([script], { type: "text/plain" }), `${safeWindowsFilename(name)}-vpn-setup.ps1`);
  }

  if (!server || !peers) {
    return <p>{error ?? t("loading")}</p>;
  }

  return (
    <div>
      <h2>{t("myDevicesTitle")}</h2>
      {error && <p className="error">{error}</p>}

      {peers.length === 0 && <p className="muted">{t("noDevicesYet")}</p>}

      <ul className="device-list">
        {peers.map((peer) => {
          const isRevealed = revealedConfig?.peerId === peer.id;
          const cert = isRevealed ? revealedConfig.cert : null;
          return (
            <li key={peer.id} className="card">
              <div className="device-row">
                <div>
                  <strong>{peer.name}</strong>
                  <div className="muted small">
                    {peer.traffic_limit_bytes !== null
                      ? t("usedOf", {
                          used: formatBytes(peer.traffic_used_bytes),
                          limit: formatBytes(peer.traffic_limit_bytes),
                        })
                      : t("usedNoLimit", { used: formatBytes(peer.traffic_used_bytes) })}
                    {peer.expires_at && ` · ${t("expiresOn", { date: new Date(peer.expires_at).toLocaleDateString() })}`}
                  </div>
                </div>
                <div className="device-actions">
                  <button onClick={() => toggleReveal(peer)}>{isRevealed ? t("hideConfig") : t("showConfig")}</button>
                  <button className="danger" disabled={busy} onClick={() => void revokeDevice(peer)}>
                    {t("revoke")}
                  </button>
                </div>
              </div>
              {isRevealed && !cert && <p className="muted small">{t("loading")}</p>}
              {isRevealed && cert && (
                <div className="config-reveal">
                  <div className="platform-section">
                    <strong>iOS</strong>
                    <div className="device-actions">
                      <button className="primary" onClick={() => void installIos(peer)}>
                        {t("installVpnProfile")}
                      </button>
                      {!isMobileTelegram() && (
                        <button onClick={() => downloadIos(server, cert, peer.name)}>{t("downloadConfig")}</button>
                      )}
                    </div>
                    <p className="muted small">{t("iosInstallHint")}</p>
                  </div>

                  <div className="platform-section">
                    <strong>Android</strong>
                    <div className="device-actions">
                      <button className="primary" onClick={() => void installAndroid(peer, server, cert)}>
                        {t("androidDownloadButton")}
                      </button>
                    </div>
                    <p className="muted small">{t("androidInstallHint", { password: PKCS12_EXPORT_PASSWORD })}</p>
                  </div>

                  {!isMobileTelegram() && (
                    <div className="platform-section">
                      <strong>Windows</strong>
                      <div className="device-actions">
                        <button onClick={() => downloadWindowsCa(server)}>{t("windowsDownloadCa")}</button>
                        <button onClick={() => downloadWindowsCert(cert, peer.name)}>{t("windowsDownloadCert")}</button>
                        <button className="primary" onClick={() => downloadWindowsScript(server, peer.name)}>
                          {t("windowsDownloadScript")}
                        </button>
                      </div>
                      <p className="muted small">{t("windowsInstallHint")}</p>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="card add-device">
        <h3>{t("addThisDevice")}</h3>
        <input
          type="text"
          placeholder={t("deviceNamePlaceholder")}
          value={newDeviceName}
          onChange={(e) => setNewDeviceName(e.target.value)}
          maxLength={64}
        />
        <button className="primary" disabled={busy} onClick={() => void addDevice()}>
          {busy ? t("working") : t("addDeviceButton")}
        </button>
      </div>
    </div>
  );
}
