import type { Metadata } from "next";
import Link from "next/link";

import { deleteShift } from "@/lib/shifts/actions";
import { loadShiftSchedule, splitShiftSchedule } from "@/lib/shifts/queries";
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

/**
 * "Kim ne zaman çalışacak" planı — `cash_sessions`daki kasa vardiyasıyla
 * KARIŞTIRILMAMALI (bkz. migration 0018'in doc-comment'i). Burada yalnızca
 * bir çizelge var, para hareketi yok.
 */
export default async function ShiftsSettingsPage() {
  const [shifts, staff, branches] = await Promise.all([
    loadShiftSchedule(),
    loadStaff(),
    loadBranchOptions(),
  ]);

  const activeStaff = staff.filter((s) => s.isActive);
  const { upcoming, past } = splitShiftSchedule(shifts);

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
    <div className="mx-auto max-w-2xl">
      <Link href="/settings" className="text-sm text-ink-muted hover:text-ink">
        ← Ayarlar
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-bold tracking-tight text-ink">Vardiya Planlama</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Kim ne zaman çalışacak — kasa açma/kapama oturumundan bağımsız, önceden hazırlanan çizelge.
      </p>

      <section className="rounded-xl border border-line bg-surface-raised">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Yeni vardiya</h2>
        {activeStaff.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">
            Vardiya eklemek için önce{" "}
            <Link href="/settings/personel" className="underline underline-offset-2">
              personel
            </Link>{" "}
            eklenmeli.
          </p>
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
