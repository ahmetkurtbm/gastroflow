import { NextResponse } from "next/server";

import { requireAppUser } from "@/lib/auth/current-user";
import { buildWorkbookBuffer } from "@/lib/excel/workbook";
import {
  addDaysToDateStr,
  istanbulWallTimeToUtcIso,
  mondayOfWeek,
  todayIstanbulDateStr,
} from "@/lib/shifts/queries";
import { createClient } from "@/lib/supabase/server";

const COLUMNS = [
  { header: "Personel", key: "staff", width: 24 },
  { header: "Gün", key: "day", width: 14 },
  { header: "Başlangıç", key: "start", width: 12 },
  { header: "Bitiş", key: "end", width: 12 },
  { header: "Not", key: "note", width: 24 },
];

const dayFormatter = new Intl.DateTimeFormat("tr-TR", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: "Europe/Istanbul",
});
const timeFormatter = new Intl.DateTimeFormat("tr-TR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Istanbul",
});

/**
 * Haftalık vardiya çizelgesini Excel olarak indirir — personel çoğunlukla
 * sisteme giriş yapmıyor, müdür bu dosyayı/görselini WhatsApp'tan paylaşıyor.
 * `?week=` bir Pazartesi tarihi (YYYY-MM-DD); verilmezse içinde bulunulan hafta.
 */
export async function GET(request: Request) {
  await requireAppUser();
  const url = new URL(request.url);
  const weekParam = url.searchParams.get("week");
  const weekStart = mondayOfWeek(
    weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? weekParam : todayIstanbulDateStr(),
  );
  const weekEnd = addDaysToDateStr(weekStart, 7);

  const supabase = await createClient();
  const { data: shifts } = await supabase
    .from("shift_schedules")
    .select("user_id, starts_at, ends_at, note")
    .gte("starts_at", istanbulWallTimeToUtcIso(weekStart, "00:00"))
    .lt("starts_at", istanbulWallTimeToUtcIso(weekEnd, "00:00"))
    .order("starts_at");

  const userIds = [...new Set((shifts ?? []).map((s) => s.user_id))];
  const namesById = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
    for (const p of profiles ?? []) namesById.set(p.id, p.full_name);
  }

  const rows = (shifts ?? []).map((s) => {
    const starts = new Date(s.starts_at);
    const ends = new Date(s.ends_at);
    return {
      staff: namesById.get(s.user_id) ?? "Bilinmeyen personel",
      day: dayFormatter.format(starts),
      start: timeFormatter.format(starts),
      end: timeFormatter.format(ends),
      note: s.note ?? "",
    };
  });

  const buffer = await buildWorkbookBuffer(`Vardiya ${weekStart}`, COLUMNS, rows);
  return new NextResponse(new Blob([buffer]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="vardiya-${weekStart}.xlsx"`,
    },
  });
}
