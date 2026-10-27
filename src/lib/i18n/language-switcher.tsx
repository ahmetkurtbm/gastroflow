import type { Locale } from "./dictionaries";
import { setLocale } from "./actions";

/** İki düğmeli dil değiştirici — bir form/dropdown yerine bilinçli olarak
 * en az sürtünmeli seçenek: paylaşımlı tablette garson tek dokunuşla
 * değiştirebilmeli. */
export function LanguageSwitcher({ locale, tone = "light" }: { locale: Locale; tone?: "light" | "dark" }) {
  const idle =
    tone === "dark"
      ? "text-slate-300 hover:bg-white/10 hover:text-white"
      : "text-ink-muted hover:bg-surface-sunken hover:text-ink";
  return (
    <form
      action={setLocale}
      className={`flex overflow-hidden rounded-lg border text-xs font-medium ${tone === "dark" ? "border-white/15" : "border-line"}`}
    >
      {(["tr", "en"] as const).map((value) => (
        <button
          key={value}
          type="submit"
          name="locale"
          value={value}
          disabled={locale === value}
          aria-current={locale === value}
          className={`min-h-8 px-2.5 uppercase transition-colors ${locale === value ? "bg-brand-600 text-white" : idle}`}
        >
          {value}
        </button>
      ))}
    </form>
  );
}
