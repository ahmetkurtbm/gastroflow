import { createClient } from "@/lib/supabase/server";

export type ShiftScheduleEntry = {
  id: string;
  userId: string;
  staffName: string;
  branchName: string | null;
  startsAt: string;
  endsAt: string;
  note: string | null;
};

/**
 * Vardiya planı — geçmişi de gösteriyoruz (yalnızca gelecek değil), çünkü
 * "geçen hafta kim çalışmıştı" sorusu maaş/prim hesaplarken gerçekten
 * soruluyor. En yakın vardiya en üstte.
 *
 * `shift_schedules.user_id` `auth.users`'a referans veriyor, `profiles`'a
 * değil — PostgREST ikisi arasında FK olmadığı için otomatik embed edemiyor
 * (bkz. `loadPendingDiscounts`'taki aynı desen, src/lib/orders/queries.ts).
 */
export async function loadShiftSchedule(): Promise<ShiftScheduleEntry[]> {
  const supabase = await createClient();

  const { data: shifts } = await supabase
    .from("shift_schedules")
    .select("id, user_id, starts_at, ends_at, note, branches(name)")
    .order("starts_at", { ascending: false });

  const rows = shifts ?? [];
  const userIds = [...new Set(rows.map((s) => s.user_id))];

  const namesById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
    for (const p of profiles ?? []) namesById.set(p.id, p.full_name);
  }

  return rows.map((s) => ({
    id: s.id,
    userId: s.user_id,
    staffName: namesById.get(s.user_id) ?? "Bilinmeyen personel",
    branchName: s.branches?.name ?? null,
    startsAt: s.starts_at,
    endsAt: s.ends_at,
    note: s.note,
  }));
}

export type SplitShiftSchedule = {
  upcoming: ShiftScheduleEntry[];
  past: ShiftScheduleEntry[];
};

/**
 * `loadShiftSchedule`'ı "yaklaşan"/"geçmiş" olarak ikiye ayırır.
 *
 * `Date.now()` bilerek BİR Server Component'in RENDER'ı içinde değil, burada
 * çağrılıyor — `react-hooks/purity` kuralı bileşen gövdesinde saf olmayan
 * çağrıları reddediyor; sorgu katmanı bir bileşen olmadığı için bu kısıtın
 * dışında.
 */
export function splitShiftSchedule(shifts: ShiftScheduleEntry[]): SplitShiftSchedule {
  const now = Date.now();
  return {
    upcoming: shifts.filter((s) => new Date(s.endsAt).getTime() >= now).reverse(),
    past: shifts.filter((s) => new Date(s.endsAt).getTime() < now),
  };
}
