import { useState } from "react";
import { getDevInitData, setDevInitData } from "../api";

// Only ever rendered when import.meta.env.DEV is true (see App.tsx) — Vite
// strips this whole branch out of production builds.
export function DevAuthBanner({ onApply }: { onApply: () => void }) {
  const [value, setValue] = useState(getDevInitData());

  return (
    <div className="dev-banner">
      <p>
        Dev mode: no Telegram WebApp context detected. Paste a signed <code>initData</code> string (generate one
        the same way backend/app/telegram_auth.py verifies it, using the dev bot token from .env) to test against
        the real API.
      </p>
      <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} />
      <button
        onClick={() => {
          setDevInitData(value);
          onApply();
        }}
      >
        Apply & reload
      </button>
    </div>
  );
}
