"use client";

import { useRef, useState } from "react";

import { toggleTableOrientation, unplaceTable, updateTablePosition } from "@/lib/floor/actions";
import type { FloorTableAdmin } from "@/lib/floor/queries";

/** `/pos`'taki gerçek yerleşim görünümüyle AYNI ölçek — editörde büyük
 * gördüğün masa, garsonun ekranında da büyük görünmeli. */
function seatBoxSize(seats: number, vertical: boolean): { width: string; height: string } {
  const long = seats <= 2 ? "5rem" : seats <= 4 ? "6.5rem" : seats <= 8 ? "8rem" : "9.5rem";
  const short = "3.25rem";
  return vertical ? { width: short, height: long } : { width: long, height: short };
}

/**
 * Görsel masa düzeni editörü — sürükle-bırak.
 *
 * İki farklı etkileşim, iki farklı ihtiyaç için:
 *   1. Yerleşmiş masa (pos_x/pos_y dolu): canvas içinde SÜRÜKLENEBİLİR
 *      (Pointer Events — fare ve dokunmatik aynı kodla, ekstra kütüphane
 *      yok). En sık kullanım budur: mevcut düzeni ince ayarlamak.
 *   2. Yerleşmemiş masa (yeni eklenmiş, henüz konumu yok): sürüklemek yerine
 *      "seç → canvas'a dokun" — tıkla-yerleştir. Sebep: tepsideki bir öğeyi
 *      canvas'a sürüklemek (cross-container drag) çok daha kırılgan bir
 *      etkileşim; dokunmatikte "tıkla-yerleştir" zaten daha doğal.
 *
 * Konum yüzde (0-100) olarak saklanıyor (bkz. migration 0009) — canvas
 * hangi ekran genişliğinde render olursa olsun aynı GÖRECELİ düzeni korur.
 */
export function FloorCanvas({ tables }: { tables: FloorTableAdmin[] }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number } | null>>(
    () => Object.fromEntries(tables.map((t) => [t.id, t.posX !== null && t.posY !== null ? { x: t.posX, y: t.posY } : null])),
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedUnplacedId, setSelectedUnplacedId] = useState<string | null>(null);

  // `positions` yalnızca MOUNT'ta kuruluyor (yukarıdaki useState initializer).
  // Bu bileşen `/settings/salon`'da kalıcı — bir masa eklendiğinde sayfa
  // yeniden render olur ama React bu bileşeni YENİDEN MOUNT ETMEZ, `tables`
  // prop'u güncellenir. Yeni masanın `positions`te henüz karşılığı olmadan
  // `positions[t.id]` `undefined` dönüyordu; eski `!== null` kontrolü bunu
  // "yerleşmiş" sayıp `pos.x`'e erişmeye çalışıyor, `pos` `undefined` olduğu
  // için sayfa çöküyordu ("Bu sayfa yüklenemedi" hatasının GERÇEK sebebi).
  // Effect içinde state senkronize etmek yerine (cascading render riski),
  // konumu her render'da PROP'TAN türetiyoruz — state yalnızca aktif
  // sürükleme/yerleştirme sırasında bir ÜST KATMAN olarak devreye giriyor.
  function positionFor(table: FloorTableAdmin): { x: number; y: number } | null {
    if (table.id in positions) return positions[table.id];
    return table.posX !== null && table.posY !== null ? { x: table.posX, y: table.posY } : null;
  }

  const placed = tables.filter((t) => positionFor(t) !== null);
  const unplaced = tables.filter((t) => positionFor(t) === null);

  function clientToPercent(clientX: number, clientY: number) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }

  function handleChipPointerDown(tableId: string, e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingId(tableId);
  }

  function handleChipPointerMove(e: React.PointerEvent) {
    if (!draggingId) return;
    const point = clientToPercent(e.clientX, e.clientY);
    setPositions((prev) => ({ ...prev, [draggingId]: point }));
  }

  function handleChipPointerUp() {
    if (!draggingId) return;
    const point = positions[draggingId];
    setDraggingId(null);
    if (point) {
      void updateTablePosition(draggingId, point.x, point.y).catch(() => {
        // Sunucuya yazılamadıysa bir sonraki sayfa yenilemesinde eski konum
        // geri gelir — burada sessizce yutuyoruz, kritik bir işlem değil.
      });
    }
  }

  function handleCanvasClick(e: React.MouseEvent) {
    if (!selectedUnplacedId) return;
    const point = clientToPercent(e.clientX, e.clientY);
    setPositions((prev) => ({ ...prev, [selectedUnplacedId]: point }));
    void updateTablePosition(selectedUnplacedId, point.x, point.y).catch(() => {});
    setSelectedUnplacedId(null);
  }

  return (
    <div className="space-y-3">
      <div
        ref={canvasRef}
        onClick={handleCanvasClick}
        className={`relative h-72 w-full rounded-xl border-2 border-dashed bg-surface bg-[radial-gradient(circle,theme(colors.line)_1px,transparent_1px)] bg-[length:20px_20px] ${
          selectedUnplacedId ? "cursor-crosshair border-brand-400" : "border-line"
        }`}
      >
        {placed.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-ink-muted">
            {selectedUnplacedId
              ? "Yerleştirmek için buraya dokun/tıkla"
              : "Henüz yerleştirilmiş masa yok — aşağıdaki listeden bir masa seçip buraya dokun"}
          </p>
        ) : null}

        {placed.map((table) => {
          const pos = positionFor(table)!;
          const size = seatBoxSize(table.seats, table.isVertical);
          return (
            <div
              key={table.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <button
                type="button"
                onPointerDown={(e) => handleChipPointerDown(table.id, e)}
                onPointerMove={handleChipPointerMove}
                onPointerUp={handleChipPointerUp}
                style={{ width: size.width, height: size.height }}
                className={`flex flex-col items-center justify-center rounded-lg border-2 bg-surface-raised px-2 py-1.5 text-center shadow-sm ${
                  draggingId === table.id
                    ? "z-10 cursor-grabbing border-brand-500"
                    : "cursor-grab border-line hover:border-brand-400"
                }`}
                title="Sürükleyerek taşı"
              >
                <span className="text-xs font-semibold text-ink">{table.name}</span>
                <span className="text-[10px] text-ink-muted">{table.seats} kişilik</span>
              </button>
              {/* Sürüklenebilir düğmenin İÇİNDE değil, yanında bir form —
                  buton içinde buton geçersiz HTML olurdu ve sürükleme
                  dinleyicileriyle çakışırdı. */}
              <form action={toggleTableOrientation} className="absolute -right-2 -top-2">
                <input type="hidden" name="id" value={table.id} />
                <input type="hidden" name="isVertical" value={String(table.isVertical)} />
                <button
                  type="submit"
                  title="Yönü değiştir (yatay/dikey)"
                  className="flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-[10px] text-ink-muted shadow-sm hover:text-ink"
                >
                  ⟳
                </button>
              </form>
            </div>
          );
        })}
      </div>

      {unplaced.length > 0 ? (
        <div className="rounded-lg border border-line bg-surface-raised p-3">
          <p className="mb-2 text-xs text-ink-muted">
            {selectedUnplacedId
              ? "Şimdi yukarıdaki canvas'a dokunarak yerleştir."
              : "Yerleştirilmemiş masalar — birine dokun, sonra canvas'ta yerini seç:"}
          </p>
          <div className="flex flex-wrap gap-2">
            {unplaced.map((table) => (
              <button
                key={table.id}
                type="button"
                onClick={() => setSelectedUnplacedId(selectedUnplacedId === table.id ? null : table.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  selectedUnplacedId === table.id
                    ? "border-brand-500 bg-brand-600 text-white"
                    : "border-line text-ink hover:bg-surface-sunken"
                }`}
              >
                {table.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {placed.length > 0 ? (
        <details className="text-xs text-ink-muted">
          <summary className="cursor-pointer select-none hover:text-ink">
            Bir masayı yeniden &quot;yerleştirilmemiş&quot; yap
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {placed.map((table) => (
              <form
                key={table.id}
                action={unplaceTable}
                onSubmit={() => setPositions((prev) => ({ ...prev, [table.id]: null }))}
              >
                <input type="hidden" name="id" value={table.id} />
                <button
                  type="submit"
                  className="rounded-lg border border-line px-2.5 py-1 text-xs text-ink-muted hover:bg-surface-sunken hover:text-ink"
                >
                  {table.name} ✕
                </button>
              </form>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
