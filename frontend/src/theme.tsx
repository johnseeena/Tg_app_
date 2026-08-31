import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getTelegramWebApp } from "./telegram";

export type ThemeMode = "light" | "dark" | "system";
type EffectiveTheme = "light" | "dark";

const STORAGE_KEY = "amnezia_theme_mode";

function systemPrefersDark(): boolean {
  const webApp = getTelegramWebApp();
  if (webApp?.colorScheme) return webApp.colorScheme === "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function resolveEffective(mode: ThemeMode): EffectiveTheme {
  return mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;
}

function loadStoredMode(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

interface ThemeContextValue {
  mode: ThemeMode;
  effective: EffectiveTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(loadStoredMode);
  const [effective, setEffective] = useState<EffectiveTheme>(() => resolveEffective(mode));

  useEffect(() => {
    const next = resolveEffective(mode);
    setEffective(next);
    document.documentElement.setAttribute("data-theme", next);
  }, [mode]);

  // Follow OS/Telegram theme changes live while in "system" mode.
  useEffect(() => {
    if (mode !== "system") return;
    const handler = () => {
      const next = resolveEffective("system");
      setEffective(next);
      document.documentElement.setAttribute("data-theme", next);
    };
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener("change", handler);
    const webApp = getTelegramWebApp();
    webApp?.onEvent?.("themeChanged", handler);
    return () => {
      mq?.removeEventListener("change", handler);
      webApp?.offEvent?.("themeChanged", handler);
    };
  }, [mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      effective,
      setMode: (next: ThemeMode) => {
        localStorage.setItem(STORAGE_KEY, next);
        setModeState(next);
      },
    }),
    [mode, effective],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
