import { getTelegramWebApp } from "./telegram";

// Dev-only escape hatch: outside the real Telegram client there's no
// initData to send, and the frontend must never be able to forge one
// (the bot token that signs it stays backend-only, on purpose — see
// PLAN.md's zero-knowledge design notes). For local testing, generate a
// signed initData string out-of-band (same HMAC algorithm as
// backend/app/telegram_auth.py, using the dev bot token from .env) and
// paste it via setDevInitData(). This branch is dead-code-eliminated
// from production builds by Vite since import.meta.env.DEV is statically
// known at build time.
const DEV_INIT_DATA_KEY = "amnezia_dev_init_data";

export function setDevInitData(initData: string): void {
  localStorage.setItem(DEV_INIT_DATA_KEY, initData);
}

export function getDevInitData(): string {
  return localStorage.getItem(DEV_INIT_DATA_KEY) ?? "";
}

function getInitData(): string {
  const real = getTelegramWebApp()?.initData;
  if (real) return real;
  if (import.meta.env.DEV) return getDevInitData();
  return "";
}

// The admin-panel session token, obtained after the admin password login.
// Held in localStorage and sent on every request (harmless on non-admin
// routes, which ignore it). Cleared on logout / 401.
const ADMIN_TOKEN_KEY = "amnezia_admin_token";

export function getAdminToken(): string {
  return localStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
}

export function setAdminToken(token: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const adminToken = getAdminToken();
  const headers: Record<string, string> = {
    Authorization: `tma ${getInitData()}`,
    ...(adminToken ? { "X-Admin-Token": adminToken } : {}),
    ...(options.body ? { "Content-Type": "application/json" } : {}),
  };

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") detail = body.detail;
    } catch {
      // response body wasn't JSON — fall back to statusText
    }
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  me: () => request<import("./types").Me>("/auth/me"),
  serverParams: () => request<import("./types").ServerParams>("/server/params"),

  listPeers: () => request<import("./types").Peer[]>("/peers"),
  createPeer: (name: string) =>
    request<import("./types").Peer>("/peers", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getPeerCert: (id: number) => request<import("./types").PeerCert>(`/peers/${id}/cert`),
  // Mints a short-lived token; the .mobileconfig itself is served (with the
  // Content-Type iOS needs) at the public /api/ios-profile/{token} route.
  createIosProfileToken: (id: number) =>
    request<{ token: string }>(`/peers/${id}/ios-profile-token`, { method: "POST" }),
  revokePeer: (id: number) => request<void>(`/peers/${id}`, { method: "DELETE" }),

  adminListUsers: () => request<import("./types").AdminUser[]>("/admin/users"),
  adminBlockUser: (telegramId: number) =>
    request<void>(`/admin/users/${telegramId}/block`, { method: "POST" }),
  adminUnblockUser: (telegramId: number) =>
    request<void>(`/admin/users/${telegramId}/unblock`, { method: "POST" }),
  adminListPeers: () => request<import("./types").AdminPeer[]>("/admin/peers"),
  adminRevokePeer: (id: number) => request<void>(`/admin/peers/${id}`, { method: "DELETE" }),
  adminSetPeerLimits: (id: number, trafficLimitBytes: number | null, expiresAt: string | null) =>
    request<import("./types").AdminPeer>(`/admin/peers/${id}/limits`, {
      method: "PATCH",
      body: JSON.stringify({ traffic_limit_bytes: trafficLimitBytes, expires_at: expiresAt }),
    }),
  adminVpnStatus: () => request<import("./types").VpnStatus>("/admin/vpn/status"),
  adminAuditLog: () => request<import("./types").AuditLogEntry[]>("/admin/audit-log"),

  // Admin-panel password/session.
  adminAuthState: () => request<{ password_set: boolean }>("/admin/auth/state"),
  adminAuthVerify: () => request<{ ok: boolean }>("/admin/auth/verify"),
  adminLogin: (password: string) =>
    request<{ token: string; must_change: boolean }>("/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    }),
  adminChangePassword: (currentPassword: string, newPassword: string) =>
    request<{ token: string }>("/admin/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
};
