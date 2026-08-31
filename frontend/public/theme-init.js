// Runs synchronously in <head> before React mounts, to set the theme up
// front and avoid a flash of the wrong one. Kept as an external file (not
// inline in index.html) so the Content-Security-Policy can forbid inline
// scripts entirely. theme.tsx's ThemeProvider takes over once React loads.
(function () {
  var stored = localStorage.getItem("amnezia_theme_mode");
  var mode = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  var dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
})();
