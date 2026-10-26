"use client";

/** Tek dokunuşla sepete ekler; offline kuyruğa gider, bağlantı yokken de çalışır. */
export function AddItemButton({
  name,
  price,
  imageUrl = null,
  hasOptions = false,
  onAdd,
}: {
  name: string;
  price: number;
  imageUrl?: string | null;
  /** Seçenek grubu varsa eklemeden önce seçim paneli açılacağını gösterir. */
  hasOptions?: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex h-full w-full flex-col items-start gap-1.5 rounded-xl border border-line bg-surface-raised p-3 text-left transition-colors hover:border-brand-400 active:bg-brand-50"
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- tenant tarafından yüklenen değişken sayıda görsel, next/image optimizasyonu gereksiz
        <img src={imageUrl} alt="" className="h-16 w-full rounded-lg object-cover" />
      ) : null}
      <span className="text-sm font-medium text-ink">
        {name}
        {hasOptions ? <span className="ml-1 text-ink-muted">···</span> : null}
      </span>
      <span className="text-xs tabular-nums text-ink-muted">
        {price.toLocaleString("tr-TR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}{" "}
        ₺
      </span>
    </button>
  );
}
