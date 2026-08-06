import { createClient } from "@/lib/supabase/server";

// Türkiye 2016'dan beri yaz saati uygulamıyor — sabit UTC+3. Bu yüzden
// "haftalık tablo"daki saat girişlerini (İstanbul yerel saati) veritabanının
// beklediği UTC'ye çevirirken saat dilimi veritabanı yerine BASİT bir sabit
// ofsetle yapılabiliyor; DST hesaba katmaya gerek yok.
const ISTANBUL_UTC_OFFSET_HOURS = 3;

/** "YYYY-MM-DD" + "HH:mm" (İstanbul yerel saati) → UTC ISO zaman damgası. */
export function istanbulWallTimeToUtcIso(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [h, min] = timeStr.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, h - ISTANBUL_UTC_OFFSET_HOURS, min)).toISOString();
}

/** Bir UTC ISO zaman damgasının İstanbul takviminde hangi güne (YYYY-MM-DD) denk geldiği. */
function istanbulDateStrOf(isoString: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoString));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Bir UTC ISO zaman damgasının İstanbul yerel saatini "HH:mm" olarak verir. */
function istanbulTimeStrOf(isoString: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(isoString));
}

/** "YYYY-MM-DD" tarih dizisine N gün ekler (takvim aritmetiği, saat dilimi bağımsız). */
export function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function diffDays(fromStr: string, toStr: string): number {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

/** Bugünün İstanbul takvimindeki "YYYY-MM-DD"si. */
export function todayIstanbulDateStr(): string {
  return istanbulDateStrOf(new Date().toISOString());
}

/** Verilen tarihi içeren haftanın Pazartesi'si. */
export function mondayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Pazar
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDaysToDateStr(dateStr, diff);
}

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

export type WeekCell = { userId: string; dayIndex: number; startTime: string; endTime: string };

/**
 * `weekStartDateStr` (Pazartesi, "YYYY-MM-DD") ile başlayan 7 günlük
 * pencerede kim hangi gün kaç-kaça çalışıyor — haftalık tablo görünümü için.
 *
 * Bir kullanıcının aynı günde BİRDEN FAZLA vardiyası varsa (ör. mola arası
 * split shift) yalnızca İLKİ tabloya sığar — tablo tek hücreli, bu bilinçli
 * bir basitleştirme. Böyle bir durumda personel ikinci vardiyasını tekil
 * "Yeni vardiya" formundan (not alanıyla) eklemeli.
 */
export async function loadWeekSchedule(weekStartDateStr: string): Promise<WeekCell[]> {
  const supabase = await createClient();
  const startIso = istanbulWallTimeToUtcIso(weekStartDateStr, "00:00");
  const endIso = istanbulWallTimeToUtcIso(addDaysToDateStr(weekStartDateStr, 7), "00:00");

  const { data } = await supabase
    .from("shift_schedules")
    .select("user_id, starts_at, ends_at")
    .gte("starts_at", startIso)
    .lt("starts_at", endIso)
    .order("starts_at");

  const seen = new Set<string>();
  const cells: WeekCell[] = [];
  for (const s of data ?? []) {
    const dayIndex = diffDays(weekStartDateStr, istanbulDateStrOf(s.starts_at));
    if (dayIndex < 0 || dayIndex > 6) continue;
    const key = `${s.user_id}-${dayIndex}`;
    if (seen.has(key)) continue; // bkz. doc-comment: aynı gün ikinci vardiya tabloya sığmıyor
    seen.add(key);
    cells.push({
      userId: s.user_id,
      dayIndex,
      startTime: istanbulTimeStrOf(s.starts_at),
      endTime: istanbulTimeStrOf(s.ends_at),
    });
  }
  return cells;
}
