import asyncio
import os
import re
import shutil
import tempfile

from .config import settings

# Concurrent `certutil` calls against the same NSS sql: database are
# reasonably safe (NSS's sqlite backend has its own locking), but we still
# serialize backend-originated mutations in-process — matches this
# project's established pattern of never letting two concurrent requests
# race on a shared external store (see the old peers.py insert-then-mutate
# comments from the WireGuard/VLESS eras).
_nss_lock = asyncio.Lock()


class VpnCommandError(RuntimeError):
    pass


# client_id is always server-generated (see routers/peers.py, a fresh
# uuid4 hex string) and never derived from user input, but it still gets
# shell-interpolated below (process substitution for certutil's entropy
# source has no non-shell equivalent) — this guards against ever
# accidentally passing something else through.
_CLIENT_ID_RE = re.compile(r"^[a-f0-9]{32}$")


def _validate_client_id(client_id: str) -> None:
    if not _CLIENT_ID_RE.match(client_id):
        raise ValueError(f"invalid client_id format: {client_id!r}")


async def _run(*args: str, input_data: bytes | None = None) -> str:
    proc = await asyncio.create_subprocess_exec(
        *args,
        stdin=asyncio.subprocess.PIPE if input_data is not None else None,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate(input=input_data)
    if proc.returncode != 0:
        raise VpnCommandError(stderr.decode().strip() or stdout.decode().strip() or f"{args[0]} failed")
    return stdout.decode()


async def issue_client_cert(client_id: str) -> None:
    """Issues a client certificate signed by the shared "IKEv2 VPN CA",
    matching the exact command Amnezia's own app runs when self-hosting
    IKEv2 (verified against amnezia-client's Ikev2Configurator::
    prepareIkev2Config) — same CA name, same key params, same
    --extKeyUsage/-8 SAN flag. Certs live in the NSS sql: database in the
    ipsec-data volume, which persists across restarts — unlike this
    project's earlier xray/Cloak attempts, there's no in-memory user list
    to reconcile on backend startup.
    """
    _validate_client_id(client_id)
    async with _nss_lock:
        proc = await asyncio.create_subprocess_shell(
            f'certutil -z <(head -c 1024 /dev/urandom) -S -c "IKEv2 VPN CA" -n "{client_id}" '
            f'-s "O=IKEv2 VPN,CN={client_id}" -k rsa -g 3072 -v 120 '
            f'-d sql:{settings.nss_db_path} -t ",," '
            f"--keyUsage digitalSignature,keyEncipherment "
            f'--extKeyUsage serverAuth,clientAuth -8 "{client_id}"',
            executable="/bin/bash",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise VpnCommandError(stderr.decode().strip() or stdout.decode().strip() or "certutil failed")


#  Amnezia's own template exports with an empty PKCS#12 password (matches
# `connData.password = ""` in Ikev2Configurator::prepareIkev2Config), which
# works fine for iOS/Windows but broke on Android: strongSwan's .sswan
# schema has NO field to carry a p12 password at all (confirmed against
# strongSwan's own docs — the "local" object only has eap_id/id/
# shared_secret/p12/rsa-pss), so it always prompts interactively, and NSS's
# encoding of an "empty" PKCS#12 password doesn't round-trip cleanly
# through Android's Java-based PKCS#12 parser (a well-known interop gap
# between OpenSSL/NSS and Java crypto for this exact case) — the user
# tried leaving the prompt blank and got "wrong password". Fixed by using
# a real, fixed, non-secret password instead (it protects nothing beyond
# what HTTPS-in-transit and possessing the file already implies) and
# showing it in the UI next to the Android download button, since that's
# the one platform where the user must type it manually.
PKCS12_EXPORT_PASSWORD = "ikev2vpn"


async def export_client_cert(client_id: str) -> bytes:
    """Re-exportable at any time from the NSS db (the private key never
    leaves it) — this is what makes "view config again" possible without
    the backend having to separately store the .p12 anywhere itself.

    Exports to a real temp file rather than /dev/stdout: pk12util opens
    its `-o` target with flags that don't work against the stdout special
    file in this container (confirmed empirically — /dev/stdout export
    fails with PR_FILE_NOT_FOUND_ERROR here, a real file path doesn't)."""
    _validate_client_id(client_id)
    fd, path = tempfile.mkstemp(suffix=".p12")
    os.close(fd)
    try:
        async with _nss_lock:
            proc = await asyncio.create_subprocess_exec(
                "pk12util", "-W", PKCS12_EXPORT_PASSWORD, "-d", f"sql:{settings.nss_db_path}", "-n", client_id, "-o", path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            if proc.returncode != 0:
                raise VpnCommandError(stderr.decode().strip() or "pk12util export failed")
        with open(path, "rb") as f:
            return f.read()
    finally:
        os.unlink(path)


async def reencode_p12_legacy(p12_bytes: bytes) -> bytes:
    """Re-encodes a PKCS#12 into the legacy PBE format (3DES-encrypted key,
    RC2-40-encrypted certs, SHA-1 MAC).

    Apple's Configuration-Profile PKCS#12 parser cannot decrypt the modern
    PBES2 / AES-256 / PBKDF2-SHA256 encoding that this NSS `pk12util` emits,
    and reports it on install as "the certificate password is incorrect"
    (confirmed on a real iOS 17 device — the password is right, iOS just
    can't read the cipher). The legacy format is what Apple's own tooling
    produces and installs cleanly; strongSwan, Windows and OpenSSL all still
    read it too. The p12 password is non-secret (see PKCS12_EXPORT_PASSWORD),
    so the weaker cipher costs nothing here — it only guards a file already
    protected by HTTPS-in-transit and possession.

    Split into explicit key/leaf/CA extraction rather than a single combined
    PEM because `openssl pkcs12 -export` pairs the private key with the FIRST
    cert it sees; with the CA ahead of the leaf that fails X509_check_private
    _key. -inkey/-in/-certfile makes the pairing unambiguous.
    """
    P = PKCS12_EXPORT_PASSWORD
    workdir = tempfile.mkdtemp()
    try:
        in_p12 = os.path.join(workdir, "in.p12")
        key_pem = os.path.join(workdir, "key.pem")
        leaf_pem = os.path.join(workdir, "leaf.pem")
        ca_pem = os.path.join(workdir, "ca.pem")
        out_p12 = os.path.join(workdir, "out.p12")
        with open(in_p12, "wb") as f:
            f.write(p12_bytes)
        # Reading the modern (PBES2) input needs no special flag; only the
        # legacy WRITE below does.
        await _run("openssl", "pkcs12", "-in", in_p12, "-passin", f"pass:{P}", "-nocerts", "-nodes", "-out", key_pem)
        await _run("openssl", "pkcs12", "-in", in_p12, "-passin", f"pass:{P}", "-clcerts", "-nokeys", "-out", leaf_pem)
        await _run("openssl", "pkcs12", "-in", in_p12, "-passin", f"pass:{P}", "-cacerts", "-nokeys", "-out", ca_pem)
        await _run(
            "openssl", "pkcs12", "-export", "-inkey", key_pem, "-in", leaf_pem, "-certfile", ca_pem,
            "-passout", f"pass:{P}", "-legacy", "-macalg", "sha1", "-out", out_p12,
        )
        with open(out_p12, "rb") as f:
            return f.read()
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


async def delete_client_cert(client_id: str) -> None:
    """Deleting the NSS cert entry is IKEv2/Libreswan's equivalent of
    revocation: pluto validates each new IKE_AUTH against the live NSS
    trust store, so a deleted cert can no longer complete a handshake.
    Tolerates "could not find" so callers stay correct even if the cert
    was already removed some other way."""
    _validate_client_id(client_id)
    async with _nss_lock:
        proc = await asyncio.create_subprocess_exec(
            "certutil", "-D", "-n", client_id, "-d", f"sql:{settings.nss_db_path}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            err = stderr.decode().strip() or stdout.decode().strip()
            if "could not find" in err.lower() or "not found" in err.lower():
                return
            raise VpnCommandError(err or "certutil delete failed")


async def list_client_ids() -> str:
    """Raw `certutil -L` output (nickname list) — used by reconcile.py to
    check an active DB peer's cert is still present; not parsed into a
    structured list since callers only ever need substring membership."""
    return await _run("certutil", "-L", "-d", f"sql:{settings.nss_db_path}")


def get_ca_cert_base64() -> str:
    with open(settings.ca_cert_path, encoding="utf-8") as f:
        return f.read().strip()


# `ipsec whack --trafficstatus` line shape (Libreswan 4.5), e.g.:
#   006 #3: "ikev2-cp"[4]: 203.0.113.5, type=ESP, add_time=..., inBytes=123, outBytes=456, id='<client-id>'
#
# KNOWN GAP, not yet fixed: this currently always returns {} in practice.
# `ipsec whack` needs both the `ipsec` binary (only in the ipsec image, not
# backend's) AND the pluto control socket at /run/pluto/pluto.ctl (lives on
# the ipsec container's own filesystem — backend sharing its NETWORK
# namespace does not share its filesystem, unlike the NSS db, which works
# via an explicit shared VOLUME). Fixing this needs: (1) copy the `ipsec`/
# `whack` binaries into the backend image, (2) add a second shared volume
# for /run/pluto next to the existing ipsec-data one. Until then, traffic-
# limit enforcement (enforcement.py) and the admin panel's VPN status tab
# both silently see 0 bytes for everyone — expires_at-based revocation is
# unaffected (pure DB date comparison, no ipsec dependency). Also NOT
# verified against a real connected client (no IKEv2 client available to
# test with locally, unlike every other protocol tried this session) —
# parsing is defensive (returns {} on no match / any error) either way.
_TRAFFIC_RE = re.compile(r"inBytes=(\d+).*?outBytes=(\d+).*?id='([^']*)'")


async def list_traffic_stats() -> dict[str, tuple[int, int]]:
    """Returns {client_id: (in_bytes, out_bytes)} for every currently
    connected client. A client with no active session is simply absent —
    callers should treat a missing key as (0, 0), not as an error. See the
    KNOWN GAP note above _TRAFFIC_RE — this currently always returns {}."""
    try:
        raw = await _run("ipsec", "whack", "--trafficstatus")
    except (VpnCommandError, OSError):
        return {}
    result: dict[str, tuple[int, int]] = {}
    for line in raw.splitlines():
        m = _TRAFFIC_RE.search(line)
        if not m:
            continue
        in_bytes, out_bytes, client_id = m.groups()
        result[client_id] = (int(in_bytes), int(out_bytes))
    return result
