export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "buffer-theme";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

// Runs in the document head before content is painted. No user data is included.
export const themeBootstrap = `(() => {
  let mode = "system";
  try {
    const saved = localStorage.getItem("${THEME_STORAGE_KEY}");
    if (["light", "dark", "system"].includes(saved)) mode = saved;
  } catch {}
  const root = document.documentElement;
  root.dataset.themeMode = mode;
  root.dataset.theme = mode === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : mode;
})();`;
