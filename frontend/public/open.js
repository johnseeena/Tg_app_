// Reached only via the EXTERNAL system browser (Telegram's openLink opens it
// there) — needed for different reasons depending on payload type:
//
//   - `vpn://...` — Telegram's in-app WebView refuses custom URL schemes,
//     so this hands off to whatever app registers `vpn://` (only relevant
//     for protocols an Amnezia-app deep link still applies to).
//   - `MOBILECONFIG:<xml>` — a real Apple Configuration Profile for native
//     iOS IKEv2 (see frontend/src/iosProfile.ts). Telegram's mobile WebView
//     can't do file downloads at all (blob:/data: URIs silently no-op
//     there), so this needs the same external-browser hop even though
//     there's no custom scheme involved — real Safari, navigated directly
//     to a blob: URL with the right content-type, is what triggers iOS's
//     native "Install Profile" flow.
//   - `SSWAN:<json>` — a strongSwan Android VPN profile (see
//     frontend/src/androidProfile.ts). Delivered as a forced file download
//     (`<a download>`) rather than a direct blob navigation like the iOS
//     case: Android's "open with strongSwan" file-association trigger is
//     tied to its Downloads-manager file-open flow, not to in-page blob:
//     navigation the way Safari's content-type sniffing is — so the user
//     downloads the .sswan file, then opens it from Downloads/the
//     notification, and Android offers strongSwan to handle it.
//
// Either way the payload lives in the URL #fragment, which is never sent
// to the server.
//
// No automatic redirect here on purpose: iOS Safari/WebKit only allows
// navigation to a custom scheme, OR a blob: URL that triggers a system
// sheet, when it's the DIRECT result of a user tap. A script-triggered
// redirect (even via setTimeout(0)) is not considered a user gesture and
// WebKit silently blocks it — no error, nothing happens. The fix is to
// never rely on auto-navigation at all: render one big tappable link and
// let the tap itself be the gesture.
(function () {
  var raw = location.hash ? location.hash.slice(1) : "";
  var payload = "";
  try {
    payload = decodeURIComponent(raw);
  } catch (e) {
    payload = raw;
  }
  var openBtn = document.getElementById("open-btn");
  var loading = document.getElementById("loading");
  var broken = document.getElementById("broken");
  var MOBILECONFIG_PREFIX = "MOBILECONFIG:";
  var SSWAN_PREFIX = "SSWAN:";

  function showButton(href, downloadName, label) {
    if (!openBtn) return;
    openBtn.href = href;
    if (downloadName) {
      openBtn.setAttribute("download", downloadName);
    } else {
      openBtn.removeAttribute("download");
    }
    if (label) openBtn.textContent = label;
    openBtn.style.display = "inline-block";
    if (loading) loading.style.display = "none";
  }

  function showBroken() {
    if (!broken) return;
    broken.style.display = "block";
    if (loading) loading.style.display = "none";
  }

  if (payload.indexOf(MOBILECONFIG_PREFIX) === 0) {
    var xml = payload.slice(MOBILECONFIG_PREFIX.length);
    var mcBlob = new Blob([xml], { type: "application/x-apple-aspen-config" });
    showButton(URL.createObjectURL(mcBlob), null, "Установить VPN / Install VPN");
  } else if (payload.indexOf(SSWAN_PREFIX) === 0) {
    var json = payload.slice(SSWAN_PREFIX.length);
    var swBlob = new Blob([json], { type: "application/vnd.strongswan.profile" });
    showButton(URL.createObjectURL(swBlob), "vpn.sswan", "Скачать профиль / Download profile");
    var sswanHint = document.getElementById("sswan-hint");
    if (sswanHint) sswanHint.style.display = "block";
  } else if (payload.indexOf("vpn://") === 0) {
    showButton(payload, null, "Открыть Amnezia VPN / Open Amnezia VPN");
  } else {
    showBroken();
  }
})();
