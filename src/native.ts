import { Capacitor } from "@capacitor/core";
import { App as NativeApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { cloud } from "./cloud";
import { nativeCallback, parseNativeCallback } from "./native-auth";
import type { Card } from "./model";

export const isNative = Capacitor.isNativePlatform();
let authInProgress = false;
const seenCallbacks = new Set<string>();
let pendingCardId: string | undefined;

export function takeNotificationCard() {
  const id = pendingCardId;
  pendingCardId = undefined;
  return id;
}

export async function signInWithGoogle() {
  if (!cloud) throw Error("同期サービスが未設定です");
  const { data, error } = await cloud.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: isNative
        ? nativeCallback
        : `${location.origin}/auth/callback`,
      skipBrowserRedirect: isNative,
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
  if (isNative && data.url) await Browser.open({ url: data.url });
}

export async function initializeNative() {
  if (!isNative) return;
  document.documentElement.classList.add("native-app");
  const receive = async (value: string) => {
    const callback = parseNativeCallback(value);
    if (!callback || seenCallbacks.has(value) || authInProgress) return;
    // Supabase reloads the UI after an account change. Android retains the
    // launch intent, so don't exchange the same one-use code after that reload.
    if (sessionStorage.getItem("remio-native-callback") === value) return;
    seenCallbacks.add(value);
    sessionStorage.setItem("remio-native-callback", value);
    if (callback.error || !callback.code || !cloud) {
      window.dispatchEvent(new Event("notes-auth-error"));
      return;
    }
    authInProgress = true;
    try {
      const { error } = await cloud.auth.exchangeCodeForSession(callback.code);
      if (error) window.dispatchEvent(new Event("notes-auth-error"));
    } catch {
      window.dispatchEvent(new Event("notes-auth-error"));
    } finally {
      authInProgress = false;
      await Browser.close().catch(() => {});
    }
  };
  await NativeApp.addListener("appUrlOpen", ({ url }) => {
    void receive(url);
  });
  const launch = await NativeApp.getLaunchUrl();
  if (launch?.url) await receive(launch.url);
  await NativeApp.addListener("backButton", () => {
    const modal = document.querySelector('[role="dialog"]');
    if (modal) {
      (document.activeElement || document.body).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    } else {
      window.dispatchEvent(new CustomEvent("notes-native-back"));
    }
  });
  await LocalNotifications.addListener(
    "localNotificationActionPerformed",
    ({ notification }) => {
      pendingCardId = notification.extra?.cardId;
      window.dispatchEvent(
        new CustomEvent("notes-open-card", {
          detail: notification.extra?.cardId,
        }),
      );
    },
  );
  await NativeApp.addListener("appStateChange", ({ isActive }) => {
    if (isActive) window.dispatchEvent(new Event("notes-native-resume"));
  });
}

export const minimizeNative = () => NativeApp.minimizeApp();
export async function notificationPermission() {
  if (isNative) return (await LocalNotifications.checkPermissions()).display;
  return typeof Notification === "undefined"
    ? "unsupported"
    : Notification.permission;
}
export async function requestNotifications() {
  if (isNative) return (await LocalNotifications.requestPermissions()).display;
  return Notification.requestPermission();
}
let notificationQueue = Promise.resolve();
export function updateNativeReminders(cards: Card[]) {
  if (!isNative) return Promise.resolve();
  notificationQueue = notificationQueue
    .catch(() => {})
    .then(async () => {
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length)
        await LocalNotifications.cancel(pending);
      if ((await notificationPermission()) !== "granted") return;
      const upcoming = cards
        .filter(
          (c) =>
            !c.sample &&
            c.status === "active" &&
            c.reminderEnabled &&
            c.remindAt &&
            new Date(c.remindAt).getTime() > Date.now(),
        )
        .sort(
          (a, b) =>
            new Date(a.remindAt!).getTime() - new Date(b.remindAt!).getTime() ||
            a.id.localeCompare(b.id),
        )
        .slice(0, 60);
      if (upcoming.length)
        await LocalNotifications.schedule({
          notifications: upcoming.map((c, i) => ({
            id: i + 1,
            title: c.title || "remio-notes",
            body: c.content.slice(0, 160),
            isExactNotification: false,
            schedule: { at: new Date(c.remindAt!) },
            extra: { cardId: c.id },
          })),
        });
    });
  return notificationQueue;
}
export async function exportBackup(filename: string, content: string) {
  if (isNative) {
    const file = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({
      title: "remio-notes バックアップ",
      files: [file.uri],
      dialogTitle: "バックアップを保存・共有",
    });
    return;
  }
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
