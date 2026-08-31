import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { translations, type Locale, type TranslationKey } from "./translations";

const STORAGE_KEY = "amnezia_locale";
const DEFAULT_LOCALE: Locale = "ru";

function loadStoredLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "ru" || stored === "en" ? stored : DEFAULT_LOCALE;
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(loadStoredLocale);

  const value = useMemo<I18nContextValue>(() => {
    function setLocale(next: Locale) {
      localStorage.setItem(STORAGE_KEY, next);
      setLocaleState(next);
    }

    function t(key: TranslationKey, vars?: Record<string, string | number>): string {
      let text: string = translations[locale][key] ?? translations[DEFAULT_LOCALE][key] ?? key;
      if (vars) {
        for (const [name, val] of Object.entries(vars)) {
          text = text.split(`{${name}}`).join(String(val));
        }
      }
      return text;
    }

    return { locale, setLocale, t };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
