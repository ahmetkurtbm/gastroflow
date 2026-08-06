import { createClient } from "@/lib/supabase/server";

export type FloorTableAdmin = {
  id: string;
  name: string;
  seats: number;
  posX: number | null;
  posY: number | null;
  qrToken: string;
};

export type FloorAreaAdmin = {
  id: string;
  name: string;
  sortOrder: number;
  tables: FloorTableAdmin[];
};

/** Ayarlar → Salon ve masalar ekranı için: tüm alanlar + masaları (aktif/pasif fark etmez). */
export async function loadFloorAdmin(): Promise<FloorAreaAdmin[]> {
  const supabase = await createClient();

  const [areasResult, tablesResult] = await Promise.all([
    supabase.from("areas").select("id, name, sort_order").order("sort_order"),
    supabase.from("tables").select("id, name, seats, area_id, pos_x, pos_y, qr_token").order("name"),
  ]);

  const tablesByArea = new Map<string, FloorTableAdmin[]>();
  for (const table of tablesResult.data ?? []) {
    if (!table.area_id) continue;
    const list = tablesByArea.get(table.area_id) ?? [];
    list.push({
      id: table.id,
      name: table.name,
      seats: table.seats,
      posX: table.pos_x === null ? null : Number(table.pos_x),
      posY: table.pos_y === null ? null : Number(table.pos_y),
      qrToken: table.qr_token,
    });
    tablesByArea.set(table.area_id, list);
  }

  return (areasResult.data ?? []).map((area) => ({
    id: area.id,
    name: area.name,
    sortOrder: area.sort_order,
    tables: tablesByArea.get(area.id) ?? [],
  }));
}
