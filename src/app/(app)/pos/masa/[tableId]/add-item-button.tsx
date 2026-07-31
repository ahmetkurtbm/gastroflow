"use client";

/**
 * Tek dokunuşla sepete ekleme.
 *
 * Sunucu aksiyonuna bağlı bir form DEĞİL — tıklama offline kuyruğa
 * (`useOfflineOrder`'ın `addItem`'ı) gidiyor ki bağlantı kesikken de
 * çalışabilsin. Bilerek modal/form açmıyoruz: garson kalabalık bir
 * serviste ürüne dokunup devam edebilmeli.
 */
export function AddItemButton({
  name,
  price,
  onAdd,
}: {
  name: string;
  price: number;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex h-full w-full flex-col items-start gap-1 rounded-xl border border-line bg-surface-raised p-3 text-left transition-colors hover:border-brand-400 active:bg-brand-50"
    >
      <span className="text-sm font-medium text-ink">{name}</span>
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
