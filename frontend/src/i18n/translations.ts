export type Locale = "ru" | "en";

export const localeNames: Record<Locale, string> = {
  ru: "Русский",
  en: "English",
};

export const translations = {
  ru: {
    appOnlyInTelegram: "Это приложение работает только внутри Telegram.",
    loading: "Загрузка…",
    failedToLoad: "Не удалось загрузить",
    failedToAuthenticate: "Не удалось авторизоваться",
    requestFailed: "Ошибка запроса",

    navMyDevices: "Мои устройства",
    navAdmin: "Админ",

    // UserHome
    myDevicesTitle: "Мои устройства",
    noDevicesYet: "Пока нет устройств.",
    showConfig: "Показать конфиг",
    hideConfig: "Скрыть",
    revoke: "Отозвать",
    addThisDevice: "Добавить это устройство",
    deviceNamePlaceholder: "Название устройства (например, Мой телефон)",
    addDeviceButton: "Добавить устройство",
    working: "Выполняется…",
    installVpnProfile: "Установить VPN",
    iosInstallHint: "Откроется браузер — там нажмите большую кнопку, чтобы установить профиль VPN через настройки устройства (сторонние приложения не нужны).",
    downloadConfig: "Скачать профиль (.mobileconfig)",
    androidDownloadButton: "Скачать профиль (.sswan)",
    androidInstallHint: "Нужно бесплатное приложение strongSwan VPN Client (Google Play / F-Droid). Файл скачается в «Загрузки» — откройте его оттуда и выберите strongSwan. При импорте попросит пароль сертификата — введите: {password}",
    windowsDownloadCa: "1. Корневой сертификат (.cer)",
    windowsDownloadCert: "2. Сертификат устройства (.p12)",
    windowsDownloadScript: "3. Скрипт настройки (.ps1)",
    windowsInstallHint:
      "Скачайте все три файла в папку «Загрузки». Затем щёлкните правой кнопкой по файлу .ps1 → «Выполнить с помощью PowerShell» — скрипт сам запросит права администратора, установит сертификаты и создаст VPN-подключение (пути подставляются автоматически). После завершения: Параметры → Сеть и Интернет → VPN → «IKEv2 VPN» → Подключиться.",
    revokeConfirm: 'Отозвать "{name}"? Устройство немедленно потеряет доступ.',
    failedToCreateDevice: "Не удалось создать устройство",
    failedToRevokeDevice: "Не удалось отозвать устройство",
    usedOf: "{used} из {limit} использовано",
    usedNoLimit: "{used} использовано",
    expiresOn: "истекает {date}",

    // Admin — tabs
    adminTitle: "Админ",
    tabUsers: "пользователи",
    tabPeers: "устройства",
    tabVpn: "vpn",
    tabAudit: "журнал",

    // Admin — users table
    colTelegramId: "Telegram ID",
    colUsername: "Имя пользователя",
    colRole: "Роль",
    colStatus: "Статус",
    colDevices: "Устройства",
    block: "Заблокировать",
    unblock: "Разблокировать",

    // Admin — peers table
    colName: "Название",
    colUserId: "ID пользователя",
    colClientId: "ID клиента",
    colUsage: "Использовано",
    colLimitMb: "Лимит (МБ)",
    colExpires: "Истекает",
    noLimitPlaceholder: "без лимита",
    save: "Сохранить",
    revokeDeviceConfirm: 'Отозвать устройство "{name}"?',

    // Admin — vpn tab
    activeConnections: "Активных подключений: {count}",
    refresh: "Обновить",
    colUplinkDownlink: "Входящий / исходящий трафик",

    // Admin — audit tab
    colWhen: "Когда",
    colActor: "Кто",
    colAction: "Действие",
    colTarget: "Объект",
    colDetail: "Детали",

    // Admin auth
    adminLoginTitle: "Вход в админ-панель",
    adminPasswordLabel: "Пароль",
    adminLoginButton: "Войти",
    adminLoggingIn: "Вход…",
    adminDefaultHint: "По умолчанию: admin / admin. После первого входа потребуется сменить пароль.",
    adminChangeTitle: "Смените пароль администратора",
    adminChangeHint: "Задайте новый пароль: минимум 8 символов, не «admin».",
    adminCurrentPassword: "Текущий пароль",
    adminNewPassword: "Новый пароль",
    adminConfirmPassword: "Повторите новый пароль",
    adminChangeButton: "Сохранить пароль",
    adminPasswordsMismatch: "Пароли не совпадают",
    adminLogout: "Выйти",

    // Settings
    settingsLanguage: "Язык",
    settingsTheme: "Тема",
    themeLight: "Светлая",
    themeDark: "Тёмная",
    themeSystem: "Как на устройстве",
  },
  en: {
    appOnlyInTelegram: "This app only works inside Telegram.",
    loading: "Loading…",
    failedToLoad: "Failed to load",
    failedToAuthenticate: "Failed to authenticate",
    requestFailed: "Request failed",

    navMyDevices: "My devices",
    navAdmin: "Admin",

    myDevicesTitle: "My devices",
    noDevicesYet: "No devices yet.",
    showConfig: "Show config",
    hideConfig: "Hide",
    revoke: "Revoke",
    addThisDevice: "Add this device",
    deviceNamePlaceholder: "Device name (e.g. My phone)",
    addDeviceButton: "Add device",
    working: "Working…",
    installVpnProfile: "Install VPN",
    iosInstallHint: "A browser tab will open — tap the big button there to install the VPN profile through your device's own settings (no third-party app needed).",
    downloadConfig: "Download profile (.mobileconfig)",
    androidDownloadButton: "Download profile (.sswan)",
    androidInstallHint: "Needs the free strongSwan VPN Client app (Google Play / F-Droid). The file downloads to your Downloads folder — open it from there and choose strongSwan. When it asks for the certificate password, enter: {password}",
    windowsDownloadCa: "1. Root certificate (.cer)",
    windowsDownloadCert: "2. Device certificate (.p12)",
    windowsDownloadScript: "3. Setup script (.ps1)",
    windowsInstallHint:
      "Download all three files into your Downloads folder. Then right-click the .ps1 file → \"Run with PowerShell\" — it will request Administrator rights, install the certificates and create the VPN connection (paths are filled in automatically). When it finishes: Settings → Network & Internet → VPN → \"IKEv2 VPN\" → Connect.",
    revokeConfirm: 'Revoke "{name}"? This device will lose access immediately.',
    failedToCreateDevice: "Failed to create device",
    failedToRevokeDevice: "Failed to revoke device",
    usedOf: "{used} of {limit} used",
    usedNoLimit: "{used} used",
    expiresOn: "expires {date}",

    adminTitle: "Admin",
    tabUsers: "users",
    tabPeers: "peers",
    tabVpn: "vpn",
    tabAudit: "audit",

    colTelegramId: "Telegram ID",
    colUsername: "Username",
    colRole: "Role",
    colStatus: "Status",
    colDevices: "Devices",
    block: "Block",
    unblock: "Unblock",

    colName: "Name",
    colUserId: "User ID",
    colClientId: "Client ID",
    colUsage: "Usage",
    colLimitMb: "Limit (MB)",
    colExpires: "Expires",
    noLimitPlaceholder: "no limit",
    save: "Save",
    revokeDeviceConfirm: 'Revoke device "{name}"?',

    activeConnections: "Active connections: {count}",
    refresh: "Refresh",
    colUplinkDownlink: "Inbound / outbound traffic",

    colWhen: "When",
    colActor: "Actor",
    colAction: "Action",
    colTarget: "Target",
    colDetail: "Detail",

    adminLoginTitle: "Admin panel login",
    adminPasswordLabel: "Password",
    adminLoginButton: "Log in",
    adminLoggingIn: "Logging in…",
    adminDefaultHint: "Default: admin / admin. You'll be asked to change it after the first login.",
    adminChangeTitle: "Change the admin password",
    adminChangeHint: "Set a new password: at least 8 characters, not \"admin\".",
    adminCurrentPassword: "Current password",
    adminNewPassword: "New password",
    adminConfirmPassword: "Confirm new password",
    adminChangeButton: "Save password",
    adminPasswordsMismatch: "Passwords don't match",
    adminLogout: "Log out",

    settingsLanguage: "Language",
    settingsTheme: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
  },
} satisfies Record<Locale, Record<string, string>>;

export type TranslationKey = keyof (typeof translations)["ru"];
