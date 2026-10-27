const WIDTH = 640;
const HEIGHT = 180;
const TOP = 6;
const BAR_MAX = 24;

const compact = new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 });
const lira = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const dayLabel = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", timeZone: "UTC" });

function niceMax(value: number): number {
  if (value <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value)!;
  return step * magnitude;
}

/**
 * Tek seri sütun grafiği: günlük ciro. Sütunlar SVG'de, eksen yazıları HTML'de;
 * böylece dar ekranda grafik küçülse de yazılar okunur boyutta kalır.
 * Ayrıntı her sütunun ipucunda ve altındaki tabloda.
 */
export function RevenueChart({ data }: { data: { day: string; revenue: number }[] }) {
  const max = niceMax(Math.max(...data.map((d) => d.revenue)));
  const plotH = HEIGHT - TOP;
  const band = WIDTH / data.length;
  const barW = Math.min(BAR_MAX, band - 6);
  const ticks = [max, max / 2, 0];
  const y = (value: number) => TOP + plotH - (value / max) * plotH;

  return (
    <figure>
      <div className="flex gap-2">
        <div aria-hidden="true" className="relative w-9 shrink-0 text-right text-xs tabular-nums text-ink-muted">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${(y(tick) / HEIGHT) * 100}%` }}
            >
              {compact.format(tick)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="block h-auto w-full"
            role="img"
            aria-label="Son 14 günün günlük cirosu; değerler aşağıdaki tabloda"
          >
            {ticks.map((tick) => (
              <line key={tick} x1={0} x2={WIDTH} y1={y(tick)} y2={y(tick)} stroke="var(--line)" strokeWidth={1} />
            ))}
            {data.map((d, i) => {
              const x = i * band + (band - barW) / 2;
              const top = y(d.revenue);
              const h = HEIGHT - top;
              const r = Math.min(4, h);

              return (
                <g key={d.day} className="group">
                  <title>{`${dayLabel.format(new Date(`${d.day}T00:00:00Z`))}: ${lira.format(d.revenue)}`}</title>
                  {/* Görünmez geniş alan: ipucu ince sütunun dışından da yakalanır. */}
                  <rect x={i * band} y={0} width={band} height={HEIGHT} fill="transparent" />
                  {h > 0 ? (
                    <path
                      d={`M${x},${HEIGHT} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${HEIGHT} Z`}
                      className="fill-[var(--chart-bar)] transition-opacity group-hover:opacity-80"
                    />
                  ) : null}
                </g>
              );
            })}
          </svg>

          <div aria-hidden="true" className="mt-1.5 grid text-xs text-ink-muted" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
            {data.map((d, i) => {
              const isToday = i === data.length - 1;
              // Bugünden geriye her ikinci gün; dar ekranda her dördüncü.
              const step = data.length - 1 - i;
              const visibility = step % 2 !== 0 ? "invisible" : step % 4 !== 0 ? "invisible sm:visible" : "";
              return (
                <span key={d.day} className={`whitespace-nowrap text-center ${visibility} ${isToday ? "font-semibold text-ink" : ""}`}>
                  {isToday ? "Bugün" : dayLabel.format(new Date(`${d.day}T00:00:00Z`))}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <details className="mt-3 text-sm">
        <summary className="text-ink-muted hover:text-ink">Tablo olarak göster</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-xs text-ink-muted">
              <th className="py-1 font-medium">Gün</th>
              <th className="py-1 text-right font-medium">Ciro</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.map((d) => (
              <tr key={d.day} className="border-t border-line">
                <td className="py-1.5 text-ink">{dayLabel.format(new Date(`${d.day}T00:00:00Z`))}</td>
                <td className="py-1.5 text-right text-ink">{lira.format(d.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
