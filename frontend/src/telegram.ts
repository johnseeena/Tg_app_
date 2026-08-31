export interface TelegramUser {
  id: number;
  username?: string;
  first_name?: string;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramUser };
  colorScheme: "light" | "dark";
  ready: () => void;
  expand: () => void;
  showAlert: (message: string) => void;
  showConfirm: (message: string, callback: (confirmed: boolean) => void) => void;
  openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
  onEvent?: (event: string, handler: () => void) => void;
  offEvent?: (event: string, handler: () => void) => void;
  platform?: string;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | undefined {
  return window.Telegram?.WebApp;
}

// True on mobile Telegram (iOS/Android), where the in-app WebView can't
// save a downloaded file at all — so the "Download .conf" button is hidden
// there (Open in Amnezia / Copy handle it instead). Desktop and web clients
// can download normally.
export function isMobileTelegram(): boolean {
  const p = getTelegramWebApp()?.platform;
  return p === "ios" || p === "android" || p === "android_x";
}

export function confirmAction(message: string): Promise<boolean> {
  const webApp = getTelegramWebApp();
  // telegram-web-app.js always defines window.Telegram.WebApp, even
  // outside the real Telegram client — an empty initData is the reliable
  // signal that there's no real native bridge behind it (showConfirm would
  // otherwise silently fail: "Method showPopup is not supported").
  if (!webApp?.initData) {
    return Promise.resolve(window.confirm(message));
  }
  return new Promise((resolve) => webApp.showConfirm(message, resolve));
}
