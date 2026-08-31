import { useI18n } from "../i18n";
import { localeNames, type Locale } from "../i18n/translations";
import { useTheme, type ThemeMode } from "../theme";

export function SettingsControls() {
  const { locale, setLocale, t } = useI18n();
  const { mode, setMode } = useTheme();

  return (
    <div className="settings-controls">
      <select
        aria-label={t("settingsLanguage")}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
      >
        {(Object.keys(localeNames) as Locale[]).map((l) => (
          <option key={l} value={l}>
            {localeNames[l]}
          </option>
        ))}
      </select>
      <select aria-label={t("settingsTheme")} value={mode} onChange={(e) => setMode(e.target.value as ThemeMode)}>
        <option value="system">{t("themeSystem")}</option>
        <option value="light">{t("themeLight")}</option>
        <option value="dark">{t("themeDark")}</option>
      </select>
    </div>
  );
}
