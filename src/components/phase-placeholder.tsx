/**
 * Henüz yazılmamış ekranlar için dürüst bir yer tutucu.
 *
 * Boş sayfa veya 404 yerine bunu gösteriyoruz ki menüde gezinen biri neyin
 * eksik olduğunu ve ne zaman geleceğini görsün.
 */
export function PhasePlaceholder({
  title,
  phase,
  description,
  features,
}: {
  title: string;
  phase: string;
  description: string;
  features: readonly string[];
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <span className="inline-block rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-800">
          {phase}
        </span>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink">
          {title}
        </h1>
        <p className="mt-2 leading-relaxed text-ink-muted">{description}</p>
      </div>

      <div className="rounded-xl border border-line bg-surface-raised p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Bu ekranda olacaklar
        </h2>
        <ul className="space-y-2">
          {features.map((feature) => (
            <li
              key={feature}
              className="flex gap-2.5 text-sm leading-relaxed text-ink-muted"
            >
              <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-400" />
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
