export const MESSENGER_URL = "https://m.me/KargoDoorPH";
export const MESSENGER_PAGE_ID = "1348315835021469";
export const MESSENGER_APP_URL = `fb-messenger://user-thread/${MESSENGER_PAGE_ID}`;

export type MessengerPlatform = "ios" | "android" | "desktop";

export function messengerPlatform(
  userAgent: string,
  platform = "",
  maxTouchPoints = 0,
): MessengerPlatform {
  if (/android/i.test(userAgent)) return "android";
  if (/iPad|iPhone|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1)) return "ios";
  return "desktop";
}

export type MessengerNavigation = {
  navigate: (url: string) => void;
  schedule: (callback: () => void, delay: number) => void;
  onHidden: (callback: () => void) => () => void;
  isHidden: () => boolean;
};

export function startMessengerNavigation(
  platform: MessengerPlatform,
  navigation: MessengerNavigation,
) {
  if (platform === "desktop") return false;
  let active = true;
  const removeListener = navigation.onHidden(() => {
    active = false;
    removeListener();
  });
  navigation.navigate(MESSENGER_APP_URL);
  navigation.schedule(() => {
    if (active && !navigation.isHidden()) navigation.navigate(MESSENGER_URL);
    removeListener();
  }, 1200);
  return true;
}
