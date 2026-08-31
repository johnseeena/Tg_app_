import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev server proxies /api to a locally published backend port (see
// docker-compose.override.yml). In production, Caddy serves this app's
// static build and reverse-proxies /api to the backend on the same
// origin — no proxy config needed there.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
