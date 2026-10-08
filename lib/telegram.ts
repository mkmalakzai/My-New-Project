export type TelegramMiniAppUser = {
  id: number;
  first_name: string;
  username?: string;
  photo_url?: string;
};

type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: { user?: TelegramMiniAppUser };
};

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return (window as any).Telegram?.WebApp ?? null;
}

export function getTelegramUser(): TelegramMiniAppUser | null {
  const tg = getTelegramWebApp();
  const user = tg?.initDataUnsafe?.user;
  if (!tg?.initData || !user?.id || !user?.first_name) return null;
  return {
    id: user.id,
    first_name: user.first_name,
    username: user.username,
    photo_url: user.photo_url,
  };
}

export function isInsideTelegram() {
  const tg = getTelegramWebApp();
  return Boolean(tg?.initData && tg?.initDataUnsafe?.user?.id);
}
