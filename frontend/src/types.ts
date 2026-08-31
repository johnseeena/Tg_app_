export interface ServerParams {
  endpoint_host: string;
  ca_cert_base64: string;
}

export interface Peer {
  id: number;
  name: string;
  client_uuid: string;
  created_at: string;
  traffic_used_bytes: number;
  traffic_limit_bytes: number | null;
  expires_at: string | null;
}

export interface PeerCert {
  client_uuid: string;
  cert_base64: string;
}

export interface Me {
  telegram_id: number;
  role: "user" | "admin";
  username: string | null;
}

export interface AdminUser {
  id: number;
  telegram_id: number;
  username: string | null;
  role: string;
  status: string;
  active_peer_count: number;
  created_at: string;
}

export interface AdminPeer {
  id: number;
  user_id: number;
  name: string;
  client_uuid: string;
  created_at: string;
  traffic_used_bytes: number;
  traffic_limit_bytes: number | null;
  expires_at: string | null;
}

export interface VpnPeerStatus {
  client_uuid: string;
  in_bytes: number;
  out_bytes: number;
}

export interface VpnStatus {
  peer_count: number;
  peers: VpnPeerStatus[];
}

export interface AuditLogEntry {
  id: number;
  actor_telegram_id: number;
  action: string;
  target: string | null;
  detail: string | null;
  created_at: string;
}
