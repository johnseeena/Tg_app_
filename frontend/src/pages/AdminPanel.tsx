import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { formatBytes } from "../format";
import { useI18n } from "../i18n";
import { confirmAction } from "../telegram";
import type { AdminPeer, AdminUser, AuditLogEntry, VpnStatus } from "../types";

type Tab = "users" | "peers" | "vpn" | "audit";

export function AdminPanel() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("users");
  const [error, setError] = useState<string | null>(null);

  const tabLabels: Record<Tab, string> = {
    users: t("tabUsers"),
    peers: t("tabPeers"),
    vpn: t("tabVpn"),
    audit: t("tabAudit"),
  };

  return (
    <div>
      <h2>{t("adminTitle")}</h2>
      {error && <p className="error">{error}</p>}
      <nav className="tabs">
        {(["users", "peers", "vpn", "audit"] as const).map((tb) => (
          <button key={tb} className={tb === tab ? "active" : ""} onClick={() => setTab(tb)}>
            {tabLabels[tb]}
          </button>
        ))}
      </nav>
      {tab === "users" && <UsersTab onError={setError} />}
      {tab === "peers" && <PeersTab onError={setError} />}
      {tab === "vpn" && <VpnTab onError={setError} />}
      {tab === "audit" && <AuditTab onError={setError} />}
    </div>
  );
}

function useErrorHandler(onError: (msg: string | null) => void, requestFailedMsg: string) {
  return async (fn: () => Promise<void>) => {
    onError(null);
    try {
      await fn();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : requestFailedMsg);
    }
  };
}

function UsersTab({ onError }: { onError: (msg: string | null) => void }) {
  const { t } = useI18n();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const run = useErrorHandler(onError, t("requestFailed"));

  const load = () => run(async () => setUsers(await api.adminListUsers()));
  useEffect(() => {
    void load();
  }, []);

  if (!users) return <p>{t("loading")}</p>;

  return (
    <div className="table-wrap">
    <table className="admin-table">
      <thead>
        <tr>
          <th>{t("colTelegramId")}</th>
          <th>{t("colUsername")}</th>
          <th>{t("colRole")}</th>
          <th>{t("colStatus")}</th>
          <th>{t("colDevices")}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id}>
            <td>{u.telegram_id}</td>
            <td>{u.username ?? "—"}</td>
            <td>{u.role}</td>
            <td>{u.status}</td>
            <td>{u.active_peer_count}</td>
            <td>
              {u.role !== "admin" &&
                (u.status === "active" ? (
                  <button
                    className="danger"
                    onClick={() =>
                      run(async () => {
                        await api.adminBlockUser(u.telegram_id);
                        await load();
                      })
                    }
                  >
                    {t("block")}
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      run(async () => {
                        await api.adminUnblockUser(u.telegram_id);
                        await load();
                      })
                    }
                  >
                    {t("unblock")}
                  </button>
                ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

interface PeerEdit {
  limitMb: string;
  expiresAt: string;
}

function editFromPeer(p: AdminPeer): PeerEdit {
  return {
    limitMb: p.traffic_limit_bytes !== null ? String(Math.round(p.traffic_limit_bytes / (1024 * 1024))) : "",
    expiresAt: p.expires_at ? p.expires_at.slice(0, 10) : "",
  };
}

function PeersTab({ onError }: { onError: (msg: string | null) => void }) {
  const { t } = useI18n();
  const [peers, setPeers] = useState<AdminPeer[] | null>(null);
  const [edits, setEdits] = useState<Record<number, PeerEdit>>({});
  const run = useErrorHandler(onError, t("requestFailed"));

  const load = () =>
    run(async () => {
      const list = await api.adminListPeers();
      setPeers(list);
      setEdits((prev) => {
        const next = { ...prev };
        for (const p of list) {
          if (!(p.id in next)) next[p.id] = editFromPeer(p);
        }
        return next;
      });
    });
  useEffect(() => {
    void load();
  }, []);

  if (!peers) return <p>{t("loading")}</p>;

  return (
    <div className="table-wrap">
    <table className="admin-table">
      <thead>
        <tr>
          <th>{t("colName")}</th>
          <th>{t("colUserId")}</th>
          <th>{t("colClientId")}</th>
          <th>{t("colUsage")}</th>
          <th>{t("colLimitMb")}</th>
          <th>{t("colExpires")}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {peers.map((p) => {
          const edit = edits[p.id] ?? editFromPeer(p);
          return (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.user_id}</td>
              <td className="mono">{p.client_uuid.slice(0, 8)}…</td>
              <td>{formatBytes(p.traffic_used_bytes)}</td>
              <td>
                <input
                  type="number"
                  min="1"
                  placeholder={t("noLimitPlaceholder")}
                  value={edit.limitMb}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [p.id]: { ...edit, limitMb: e.target.value } }))}
                  className="limit-input"
                />
              </td>
              <td>
                <input
                  type="date"
                  value={edit.expiresAt}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [p.id]: { ...edit, expiresAt: e.target.value } }))}
                />
              </td>
              <td className="device-actions">
                <button
                  onClick={() =>
                    run(async () => {
                      const limitBytes = edit.limitMb.trim() ? Number(edit.limitMb) * 1024 * 1024 : null;
                      const expiresAt = edit.expiresAt ? new Date(`${edit.expiresAt}T23:59:59Z`).toISOString() : null;
                      await api.adminSetPeerLimits(p.id, limitBytes, expiresAt);
                      await load();
                    })
                  }
                >
                  {t("save")}
                </button>
                <button
                  className="danger"
                  onClick={() =>
                    run(async () => {
                      const confirmed = await confirmAction(t("revokeDeviceConfirm", { name: p.name }));
                      if (!confirmed) return;
                      await api.adminRevokePeer(p.id);
                      await load();
                    })
                  }
                >
                  {t("revoke")}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}

function VpnTab({ onError }: { onError: (msg: string | null) => void }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<VpnStatus | null>(null);
  const run = useErrorHandler(onError, t("requestFailed"));

  const load = () => run(async () => setStatus(await api.adminVpnStatus()));
  useEffect(() => {
    void load();
  }, []);

  if (!status) return <p>{t("loading")}</p>;

  return (
    <div>
      <p>{t("activeConnections", { count: status.peer_count })}</p>
      <div className="device-actions">
        <button onClick={() => void load()}>{t("refresh")}</button>
      </div>
      <div className="table-wrap">
    <table className="admin-table">
        <thead>
          <tr>
            <th>{t("colClientId")}</th>
            <th>{t("colUplinkDownlink")}</th>
          </tr>
        </thead>
        <tbody>
          {status.peers.map((p) => (
            <tr key={p.client_uuid}>
              <td className="mono">{p.client_uuid.slice(0, 12)}…</td>
              <td>
                {(p.in_bytes / 1024).toFixed(1)} KB / {(p.out_bytes / 1024).toFixed(1)} KB
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function AuditTab({ onError }: { onError: (msg: string | null) => void }) {
  const { t } = useI18n();
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const run = useErrorHandler(onError, t("requestFailed"));

  useEffect(() => {
    void run(async () => setEntries(await api.adminAuditLog()));
  }, []);

  if (!entries) return <p>{t("loading")}</p>;

  return (
    <div className="table-wrap">
    <table className="admin-table">
      <thead>
        <tr>
          <th>{t("colWhen")}</th>
          <th>{t("colActor")}</th>
          <th>{t("colAction")}</th>
          <th>{t("colTarget")}</th>
          <th>{t("colDetail")}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.id}>
            <td>{new Date(e.created_at).toLocaleString()}</td>
            <td>{e.actor_telegram_id}</td>
            <td>{e.action}</td>
            <td>{e.target ?? "—"}</td>
            <td>{e.detail ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
