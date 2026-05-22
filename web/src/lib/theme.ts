/**
 * Theme persistence + application. Two themes: "dark" (default) and "light".
 * Stored in localStorage under `ontoloviz-theme`. Applied by setting
 * `data-theme="…"` on `<html>`, which switches the CSS variables in
 * `src/index.css`.
 */

import { useEffect, useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "ontoloviz-theme";

const listeners = new Set<() => void>();

function readStored(): Theme {
  if (typeof window === "undefined") return "dark";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "light" ? "light" : "dark";
}

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

/** Call once before React mounts so the first paint is correct. */
export function bootstrapTheme(): void {
  applyTheme(readStored());
}

export function setTheme(theme: Theme): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(STORAGE_KEY, theme);
  }
  applyTheme(theme);
  listeners.forEach((fn) => fn());
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    readStored,
    () => "dark",
  );
}

/** Convenience: small effect that keeps the DOM in sync if anything outside React changes it. */
export function useEnsureThemeAttribute(): void {
  const theme = useTheme();
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
}
