"use client";

import { useTheme } from "./theme-provider";

export function ThemeToggle() {
  const { mode, setMode } = useTheme();

  return (
    <div className="theme-toggle" role="group" aria-label="Color theme">
      {(["light", "dark", "system"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-label={`${option[0].toUpperCase()}${option.slice(1)} mode`}
          aria-pressed={mode === option}
          title={`${option[0].toUpperCase()}${option.slice(1)} mode`}
          onClick={() => setMode(option)}
        >
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            {option === "light" && <><circle cx="10" cy="10" r="3.3" /><path d="M10 1.5v1.7m0 13.6v1.7M1.5 10h1.7m13.6 0h1.7M4 4l1.2 1.2m9.6 9.6L16 16M4 16l1.2-1.2m9.6-9.6L16 4" /></>}
            {option === "dark" && <path d="M17.1 11.6A7.4 7.4 0 0 1 8.4 2.9a7.4 7.4 0 1 0 8.7 8.7Z" />}
            {option === "system" && <><rect x="2" y="3" width="16" height="11" rx="2" /><path d="M7 18h6m-3-4v4" /></>}
          </svg>
        </button>
      ))}
    </div>
  );
}
