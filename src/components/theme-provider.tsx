"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { isThemeMode, THEME_STORAGE_KEY, type ThemeMode } from "@/lib/theme";

const ThemeContext = createContext<{
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
} | null>(null);

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.dataset.themeMode = mode;
  root.dataset.theme = mode === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : mode;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, updateMode] = useState<ThemeMode>("system");

  useEffect(() => {
    const initial = document.documentElement.dataset.themeMode;
    const initialMode = isThemeMode(initial) ? initial : "system";
    updateMode(initialMode);
    applyTheme(initialMode);

    const systemPreference = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      if (document.documentElement.dataset.themeMode === "system") applyTheme("system");
    };
    const onStorageChange = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      const next = isThemeMode(event.newValue) ? event.newValue : "system";
      updateMode(next);
      applyTheme(next);
    };

    systemPreference.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorageChange);
    return () => {
      systemPreference.removeEventListener("change", onSystemChange);
      window.removeEventListener("storage", onStorageChange);
    };
  }, []);

  function setMode(next: ThemeMode) {
    updateMode(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Switching still works for this visit when storage is unavailable.
    }
  }

  return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("Theme controls require ThemeProvider.");
  return theme;
}
