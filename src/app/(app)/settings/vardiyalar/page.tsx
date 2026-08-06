import type { Metadata } from "next";
import Link from "next/link";

import { deleteShift, saveWeekSchedule } from "@/lib/shifts/actions";
import {
  addDaysToDateStr,
  loadShiftSchedule,
  loadWeekSchedule,
  mondayOfWeek,
  splitShiftSchedule,
  todayIstanbulDateStr,
  type WeekCell,
} from "@/lib/shifts/queries";
import { loadBranchOptions, loadStaff } from "@/lib/staff/queries";

import { ShiftForm } from "./shift-form";

export const metadata: Metadata = { title: "Vardiya Planlama" };

const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
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
const DAY_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

/**
 * "Kim ne zaman çalışacak" planı — `cash_sessions`daki kasa vardiyasıyla
 * KARIŞTIRILMAMALI (bkz. migration 0018'in doc-comment'i). Burada yalnızca
 * bir çizelge var, para hareketi yok.
 */
export default async function ShiftsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await searchParams;
  const weekStart = mondayOfWeek(week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : todayIstanbulDateStr());
  const weekEnd = addDaysToDateStr(weekStart, 6);
  const prevWeek = addDaysToDateStr(weekStart, -7);
  const nextWeek = addDaysToDateStr(weekStart, 7);

  const [shifts, staff, branches, weekCells] = await Promise.all([
    loadShiftSchedule(),
    loadStaff(),
    loadBranchOptions(),
    loadWeekSchedule(weekStart),
  ]);

  const activeStaff = staff.filter((s) => s.isActive);
  const { upcoming, past } = splitShiftSchedule(shifts);
  const cellByKey = new Map(weekCells.map((c) => [`${c.userId}-${c.dayIndex}`, c] as const));
  const branchId = branches[0]?.id ?? "";

  function ShiftRow({ shift }: { shift: (typeof shifts)[number] }) {
    const starts = new Date(shift.startsAt);
    const ends = new Date(shift.endsAt);
    return (
      <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
        <div className="min-w-0">
          <p className="text-ink">
            <span className="font-medium">{shift.staffName}</span>
            {shift.branchName ? <span className="text-ink-muted"> · {shift.branchName}</span> : null}
          </p>
          <p className="text-xs text-ink-muted">
            {dateFormatter.format(starts)} · {timeFormatter.format(starts)}–{timeFormatter.format(ends)}
            {shift.note ? ` · ${shift.note}` : ""}
          </p>
        </div>
        <form action={deleteShift}>
          <input type="hidden" name="id" value={shift.id} />
          <button type="submit" className="shrink-0 text-xs text-danger hover:underline">
            Sil
          </button>
        </form>
      </li>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/settings" className="text-sm text-ink-muted hover:text-ink">
        ← Ayarlar
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold tracking-tight text-ink">Vardiya Planlama</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Kim ne zaman çalışacak — kasa açma/kapama oturumundan bağımsız, önceden hazırlanan çizelge.
      </p>

      <section className="rounded-xl border border-line bg-surface-raised">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Haftalık tablo</h2>
          <div className="flex items-center gap-3 text-xs">
            <Link href={`/settings/vardiyalar?week=${prevWeek}`} className="text-ink-muted hover:text-ink">
              ← Önceki
            </Link>
            <span className="font-medium text-ink">
              {dateFormatter.format(new Date(`${weekStart}T00:00:00`))} – {dateFormatter.format(new Date(`${weekEnd}T00:00:00`))}
            </span>
            <Link href={`/settings/vardiyalar?week=${nextWeek}`} className="text-ink-muted hover:text-ink">
              Sonraki →
            </Link>
            <a
              href={`/api/export/vardiya?week=${weekStart}`}
              className="text-brand-700 underline underline-offset-2"
            >
              Excel indir (WhatsApp&apos;tan paylaş)
            </a>
          </div>
        </div>

        {activeStaff.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            Tablo doldurmak için önce{" "}
            <Link href="/settings/personel" className="underline underline-offset-2">
              personel
            </Link>{" "}
            eklenmeli.
          </p>
        ) : (
          <form action={saveWeekSchedule} className="p-4">
            <input type="hidden" name="weekStart" value={weekStart} />
            <input type="hidden" name="branchId" value={branchId} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-separate border-spacing-1 text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="p-1.5 text-left text-xs font-medium text-ink-muted">
                      Personel
                    </th>
                    {DAY_LABELS.map((label, day) => (
                      <th key={day} scope="col" className="p-1.5 text-center text-xs font-medium text-ink-muted">
                        {label}
                        <div className="font-normal text-ink-muted/70">
                          {addDaysToDateStr(weekStart, day).slice(8, 10)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeStaff.map((member) => (
                    <tr key={member.userId}>
                      <th scope="row" className="whitespace-nowrap p-1.5 text-left text-xs font-medium text-ink">
                        {member.fullName}
                      </th>
                      {DAY_LABELS.map((_, day) => {
                        const cell: WeekCell | undefined = cellByKey.get(`${member.userId}-${day}`);
                        return (
                          <td key={day} className="p-1">
                            <div className="flex flex-col gap-0.5">
                              <input
                                type="time"
                                name={`start-${member.userId}-${day}`}
                                defaultValue={cell?.startTime}
                                className="w-full rounded border border-line bg-surface px-1 py-1 text-xs text-ink"
                              />
                              <input
                                type="time"
                                name={`end-${member.userId}-${day}`}
                                defaultValue={cell?.endTime}
                                className="w-full rounded border border-line bg-surface px-1 py-1 text-xs text-ink"
                              />
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Boş bıraktığın hücreler o gün için vardiya yok demektir. Kaydettiğinde bu haftanın TÜMÜ
              (aşağıdaki tekil formdan eklenenler dahil) buradaki tabloyla değiştirilir.
            </p>
            <button
              type="submit"
              className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              Haftayı kaydet
            </button>
          </form>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          Tekil vardiya ekle (not ile)
        </h2>
        {activeStaff.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">Önce personel eklenmeli.</p>
        ) : (
          <ShiftForm
            staff={activeStaff.map((s) => ({ userId: s.userId, fullName: s.fullName }))}
            branches={branches}
          />
        )}
      </section>

      <section className="mt-6 rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
          Yaklaşan vardiyalar ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">Planlanmış vardiya yok.</p>
        ) : (
          <ul className="divide-y divide-line">
            {upcoming.map((shift) => (
              <ShiftRow key={shift.id} shift={shift} />
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 ? (
        <details className="mt-6 rounded-xl border border-line bg-surface-raised">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">
            Geçmiş vardiyalar ({past.length})
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {past.map((shift) => (
              <ShiftRow key={shift.id} shift={shift} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
