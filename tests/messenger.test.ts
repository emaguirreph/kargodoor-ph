import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MESSENGER_APP_URL,
  MESSENGER_PAGE_ID,
  MESSENGER_URL,
  messengerPlatform,
  startMessengerNavigation,
} from "../lib/contact-links";

test("Messenger uses the verified Page ID and canonical web fallback", () => {
  assert.equal(MESSENGER_PAGE_ID, "1348315835021469");
  assert.equal(MESSENGER_APP_URL, "fb-messenger://user-thread/1348315835021469");
  assert.equal(MESSENGER_URL, "https://m.me/KargoDoorPH");
});

test("Messenger platform detection covers iOS, iPadOS, Android and desktop", () => {
  assert.equal(messengerPlatform("Mozilla/5.0 (iPhone)"), "ios");
  assert.equal(messengerPlatform("Mozilla/5.0", "MacIntel", 5), "ios");
  assert.equal(messengerPlatform("Mozilla/5.0 (Linux; Android 15)"), "android");
  assert.equal(messengerPlatform("Mozilla/5.0 (Macintosh)", "MacIntel", 0), "desktop");
});

test("mobile Messenger tap attempts the native app then falls back once", () => {
  for (const platform of ["ios", "android"] as const) {
    const navigations: string[] = [];
    let fallback = () => {};
    const usedNative = startMessengerNavigation(platform, {
      navigate: (url) => navigations.push(url),
      schedule: (callback, delay) => {
        assert.equal(delay, 1200);
        fallback = callback;
      },
      onHidden: () => () => {},
      isHidden: () => false,
    });
    assert.equal(usedNative, true);
    assert.deepEqual(navigations, [MESSENGER_APP_URL]);
    fallback();
    assert.deepEqual(navigations, [MESSENGER_APP_URL, MESSENGER_URL]);
  }
});

test("successful app handoff suppresses fallback and desktop performs no scripted navigation", () => {
  const navigations: string[] = [];
  let fallback = () => {};
  let hidden = () => {};
  const navigation = {
    navigate: (url: string) => navigations.push(url),
    schedule: (callback: () => void) => { fallback = callback; },
    onHidden: (callback: () => void) => { hidden = callback; return () => {}; },
    isHidden: () => true,
  };
  startMessengerNavigation("ios", navigation);
  hidden();
  fallback();
  assert.deepEqual(navigations, [MESSENGER_APP_URL]);
  assert.equal(startMessengerNavigation("desktop", navigation), false);
  assert.deepEqual(navigations, [MESSENGER_APP_URL]);
});
