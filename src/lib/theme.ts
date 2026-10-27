export const THEME_COOKIE = "gf-theme";
export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

/** Çerezdeki tema; tanınmayan ya da boş değer cihaz ayarını izler. */
export function parseTheme(value: string | undefined): Theme {
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : "system";
}
