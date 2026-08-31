import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError, clearAdminToken, getAdminToken, setAdminToken } from "../api";
import { useI18n } from "../i18n";

type Stage = "checking" | "login" | "change" | "ready";

export function AdminAuthGate({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [stage, setStage] = useState<Stage>("checking");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // null = unknown; controls whether the "default is admin/admin" hint shows.
  const [passwordSet, setPasswordSet] = useState<boolean | null>(null);

  const [password, setPassword] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    // Tells the login form whether to show the "default admin/admin" hint.
    api
      .adminAuthState()
      .then((s) => setPasswordSet(s.password_set))
      .catch(() => setPasswordSet(null));

    if (!getAdminToken()) {
      setStage("login");
      return;
    }
    api
      .adminAuthVerify()
      .then(() => setStage("ready"))
      .catch((err) => {
        // 403 = valid admin but still on the default password → force change.
        // Anything else (401/expired) → drop the token and re-login.
        if (err instanceof ApiError && err.status === 403) {
          setStage("change");
        } else {
          clearAdminToken();
          setStage("login");
        }
      });
  }, []);

  async function submitLogin() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.adminLogin(password);
      setAdminToken(res.token);
      setPassword("");
      if (res.must_change) {
        setCurrent("admin");
        setStage("change");
      } else {
        setStage("ready");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function submitChange() {
    if (next !== confirm) {
      setError(t("adminPasswordsMismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.adminChangePassword(current, next);
      setAdminToken(res.token);
      setCurrent("");
      setNext("");
      setConfirm("");
      setPasswordSet(true); // no longer default, so hide the default hint on any later logout
      setStage("ready");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    clearAdminToken();
    setStage("login");
  }

  if (stage === "checking") return <p>{t("loading")}</p>;

  if (stage === "login") {
    return (
      <div className="card auth-card">
        <h3>{t("adminLoginTitle")}</h3>
        {passwordSet === false && <p className="muted small">{t("adminDefaultHint")}</p>}
        {error && <p className="error">{error}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitLogin();
          }}
        >
          <input
            type="password"
            autoComplete="current-password"
            placeholder={t("adminPasswordLabel")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="submit" disabled={busy || !password}>
            {busy ? t("adminLoggingIn") : t("adminLoginButton")}
          </button>
        </form>
      </div>
    );
  }

  if (stage === "change") {
    return (
      <div className="card auth-card">
        <h3>{t("adminChangeTitle")}</h3>
        <p className="muted small">{t("adminChangeHint")}</p>
        {error && <p className="error">{error}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitChange();
          }}
        >
          <input
            type="password"
            autoComplete="current-password"
            placeholder={t("adminCurrentPassword")}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder={t("adminNewPassword")}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder={t("adminConfirmPassword")}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <button type="submit" disabled={busy || !current || !next}>
            {t("adminChangeButton")}
          </button>
        </form>
      </div>
    );
  }

  return (
    <>
      {children}
      <div className="admin-logout">
        <button onClick={logout}>{t("adminLogout")}</button>
      </div>
    </>
  );
}
