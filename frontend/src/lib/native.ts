/**
 * Native platform helpers for Capacitor.
 *
 * Provides:
 * - Platform detection (isNative, isIOS, isAndroid)
 * - Secure token persistence via Capacitor Preferences (falls back to localStorage on web)
 */
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const TOKEN_KEY = "lactate-token";
const THEME_KEY = "lactate-theme";

// ── Platform detection ─────────────────────────────────────────────────────

export const isNative = Capacitor.isNativePlatform();
export const isIOS = Capacitor.getPlatform() === "ios";
export const isAndroid = Capacitor.getPlatform() === "android";
export const platform = Capacitor.getPlatform(); // "ios" | "android" | "web"

// ── Token persistence ──────────────────────────────────────────────────────
// On native: Capacitor Preferences (persists across app restarts, more
// reliable than localStorage which can be cleared by the OS).
// On web: localStorage (same as before).

export async function getStoredToken(): Promise<string | null> {
  if (isNative) {
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    return value;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export async function setStoredToken(token: string): Promise<void> {
  if (isNative) {
    await Preferences.set({ key: TOKEN_KEY, value: token });
  }
  // Always keep localStorage in sync (Capacitor webview uses it too)
  localStorage.setItem(TOKEN_KEY, token);
}

export async function removeStoredToken(): Promise<void> {
  if (isNative) {
    await Preferences.remove({ key: TOKEN_KEY });
  }
  localStorage.removeItem(TOKEN_KEY);
}

// ── Theme persistence ──────────────────────────────────────────────────────

export async function getStoredTheme(): Promise<string | null> {
  if (isNative) {
    const { value } = await Preferences.get({ key: THEME_KEY });
    return value;
  }
  return localStorage.getItem(THEME_KEY);
}

export async function setStoredTheme(theme: string): Promise<void> {
  if (isNative) {
    await Preferences.set({ key: THEME_KEY, value: theme });
  }
  localStorage.setItem(THEME_KEY, theme);
}
