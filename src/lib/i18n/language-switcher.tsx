import type { Locale } from "./dictionaries";
import { setLocale } from "./actions";

/** İki düğmeli dil değiştirici — bir form/dropdown yerine bilinçli olarak
 * en az sürtünmeli seçenek: paylaşımlı tablette garson tek dokunuşla
 * değiştirebilmeli. */
export function LanguageSwitcher({ locale }: { locale: Locale }) {
  return (
    <form action={setLocale} className="flex overflow-hidden rounded-lg border border-line text-xs font-medium">
      {(["tr", "en"] as const).map((value) => (
        <button
          key={value}
          type="submit"
          name="locale"
          value={value}
          disabled={locale === value}
          aria-current={locale === value}
          className={`px-2 py-1 uppercase transition-colors ${
            locale === value
              ? "bg-brand-600 text-white"
              : "text-ink-muted hover:bg-surface-sunken hover:text-ink"
          }`}
        >
          {value}
        </button>
      ))}
    </form>
  );
}
