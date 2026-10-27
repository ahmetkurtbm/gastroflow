"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";

import { THEME_COOKIE, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Açık tema", icon: Sun },
  { value: "dark", label: "Koyu tema", icon: Moon },
  { value: "system", label: "Cihaz ayarı", icon: Monitor },
];

function applyTheme(value: Theme) {
  const root = document.documentElement;
  if (value === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", value);
  document.cookie = `${THEME_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Açık / koyu / cihaz ayarı. Seçim `<html data-theme>` ile anında uygulanır ve
 * çereze yazılır; sunucu sonraki isteklerde sayfayı doğrudan bu temayla üretir.
 */
export function ThemeSwitcher({ initial, tone = "light" }: { initial: Theme; tone?: "light" | "dark" }) {
  const [theme, setTheme] = useState(initial);

  function choose(value: Theme) {
    setTheme(value);
    applyTheme(value);
  }

  const idle =
    tone === "dark"
      ? "text-slate-300 hover:bg-white/10 hover:text-white"
      : "text-ink-muted hover:bg-surface-sunken hover:text-ink";

  return (
    <div
      role="group"
      aria-label="Tema"
      className={`flex overflow-hidden rounded-lg border ${tone === "dark" ? "border-white/15" : "border-line"}`}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          onClick={() => choose(value)}
          aria-pressed={theme === value}
          aria-label={label}
          title={label}
          className={`flex min-h-8 w-8 items-center justify-center transition-colors ${
            theme === value ? "bg-brand-600 text-white" : idle
          }`}
        >
          <Icon size={14} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
