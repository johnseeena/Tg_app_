import { useEffect, useState } from "react";
import { api, ApiError, getDevInitData } from "./api";
import { AdminAuthGate } from "./components/AdminAuthGate";
import { DevAuthBanner } from "./components/DevAuthBanner";
import { SettingsControls } from "./components/SettingsControls";
import { useI18n } from "./i18n";
import { UserHome } from "./pages/UserHome";
import { AdminPanel } from "./pages/AdminPanel";
import { getTelegramWebApp } from "./telegram";
import type { Me } from "./types";

export function App() {
  const { t } = useI18n();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<"home" | "admin">("home");

  const hasAuthContext = Boolean(getTelegramWebApp()?.initData) || (import.meta.env.DEV && Boolean(getDevInitData()));

  useEffect(() => {
    getTelegramWebApp()?.ready();
    getTelegramWebApp()?.expand();
  }, []);

  useEffect(() => {
    if (!hasAuthContext) return;
    api
      .me()
      .then(setMe)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("failedToAuthenticate")));
  }, [hasAuthContext, t]);

  if (!hasAuthContext) {
    if (import.meta.env.DEV) {
      return <DevAuthBanner onApply={() => window.location.reload()} />;
    }
    return <p className="error">{t("appOnlyInTelegram")}</p>;
  }

  if (error) return <p className="error">{error}</p>;
  if (!me) return <p>{t("loading")}</p>;

  const isAdmin = me.role === "admin";

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-top">
          <span className="app-user">{me.username ?? me.telegram_id}</span>
          <SettingsControls />
        </div>
        {isAdmin && (
          <nav className="segmented">
            <button className={section === "home" ? "active" : ""} onClick={() => setSection("home")}>
              {t("navMyDevices")}
            </button>
            <button className={section === "admin" ? "active" : ""} onClick={() => setSection("admin")}>
              {t("navAdmin")}
            </button>
          </nav>
        )}
      </header>
      <main>
        {section === "admin" && isAdmin ? (
          <AdminAuthGate>
            <AdminPanel />
          </AdminAuthGate>
        ) : (
          <UserHome />
        )}
      </main>
    </div>
  );
}
