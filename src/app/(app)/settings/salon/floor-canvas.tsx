"use client";

import { useRef, useState } from "react";

import { toggleTableOrientation, unplaceTable, updateTablePosition } from "@/lib/floor/actions";
import type { FloorTableAdmin } from "@/lib/floor/queries";

/** `/pos` yerleşim görünümüyle aynı ölçek. */
function seatBoxSize(seats: number, vertical: boolean): { width: string; height: string } {
  const long = seats <= 2 ? "5rem" : seats <= 4 ? "6.5rem" : seats <= 8 ? "8rem" : "9.5rem";
  const short = "3.25rem";
  return vertical ? { width: short, height: long } : { width: long, height: short };
}

/**
 * Sürükle-bırak masa düzeni editörü. Yerleşmiş masa canvas içinde sürüklenir,
 * yerleşmemiş masa seçilip canvas'a dokunularak yerleştirilir. Konum yüzde
 * (0-100) saklanır, ekran genişliğinden bağımsızdır.
 */
export function FloorCanvas({ tables }: { tables: FloorTableAdmin[] }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number } | null>>(
    () => Object.fromEntries(tables.map((t) => [t.id, t.posX !== null && t.posY !== null ? { x: t.posX, y: t.posY } : null])),
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedUnplacedId, setSelectedUnplacedId] = useState<string | null>(null);

  // Konum her render'da prop'tan türetilir; state yalnızca aktif sürükleme
  // sırasında üst katman olur. Sonradan eklenen masa böylece hep tanınır.
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
        // Yazılamazsa sayfa yenilenince eski konum geri gelir; kritik değil.
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
      {/* Mobilde yüzde konumlar kutuları üst üste bindirdiği için canvas yerine liste gösterilir. */}
      {placed.length > 0 ? (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface-raised text-sm sm:hidden">
          {placed.map((table) => (
            <li key={table.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="text-ink">
                {table.name} <span className="text-ink-muted">· {table.seats} kişilik</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <form action={toggleTableOrientation}>
                  <input type="hidden" name="id" value={table.id} />
                  <input type="hidden" name="isVertical" value={String(table.isVertical)} />
                  <button
                    type="submit"
                    className="rounded-md border border-line px-2 py-1 text-xs text-ink-muted hover:text-ink"
                  >
                    {table.isVertical ? "Dikey" : "Yatay"}
                  </button>
                </form>
                <form
                  action={unplaceTable}
                  onSubmit={() => setPositions((prev) => ({ ...prev, [table.id]: null }))}
                >
                  <input type="hidden" name="id" value={table.id} />
                  <button
                    type="submit"
                    className="rounded-md border border-line px-2 py-1 text-xs text-ink-muted hover:text-ink"
                  >
                    Yerleştirilmemiş yap
                  </button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div
        ref={canvasRef}
        onClick={handleCanvasClick}
        className={`relative hidden h-72 w-full rounded-xl border-2 border-dashed bg-surface bg-[radial-gradient(circle,theme(colors.line)_1px,transparent_1px)] bg-[length:20px_20px] sm:block ${
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
              {/* Buton içinde buton geçersiz olduğu için form düğmenin yanında. */}
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
          <p className="mb-2 text-xs text-ink-muted sm:hidden">
            Yerleştirilmemiş masalar — konumlandırmak için tablet/masaüstü genişliğinde bir ekran kullan:
          </p>
          <p className="mb-2 hidden text-xs text-ink-muted sm:block">
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
