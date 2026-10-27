import { AlertTriangle, ArrowUpRight, ClipboardCheck, ClipboardList, Receipt, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { requireAppUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/db/client";
import { loadOverview } from "@/lib/reports/overview";

import { RevenueChart } from "./revenue-chart";

export const metadata: Metadata = { title: "Genel Bakış" };

const lira = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const todayLabel = new Intl.DateTimeFormat("tr-TR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Istanbul",
});

const METHOD_LABEL: Record<string, string> = {
  cash: "Nakit",
  card: "Kart",
  meal_card: "Yemek kartı",
  on_account: "Açık hesap",
};

const REPORT_LINKS = [
  { href: "/inventory/varyans", label: "Teorik/fiili varyans" },
  { href: "/reports/fis-mutabakati", label: "Fiş mutabakatı" },
  { href: "/reports/hakedis-mutabakati", label: "Hakediş mutabakatı" },
  { href: "/reports/muhasebe-ozeti", label: "Muhasebe özeti" },
];

function Kpi({
  icon: Icon,
  label,
  value,
  detail,
  href,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  detail: string;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        <Icon size={18} aria-hidden="true" className="text-ink-muted" />
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-muted">{detail}</p>
    </>
  );
  const className = "rounded-xl border border-line bg-surface-raised p-4 shadow-sm";
  return href ? (
    <Link href={href} className={`${className} transition-colors hover:border-brand-400`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export default async function ReportsPage() {
  await requireAppUser();
  const supabase = await createClient();
  const [tenant, overview] = await Promise.all([
    supabase.from("tenants").select("name").maybeSingle(),
    loadOverview(),
  ]);

  const total14 = overview.daily.reduce((sum, d) => sum + d.revenue, 0);
  const methodTotal = overview.methods.reduce((sum, m) => sum + m.amount, 0);
  const topMax = Math.max(1, ...overview.topItems.map((i) => i.quantity));

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-muted">{todayLabel.format(new Date())}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            {tenant.data?.name ?? "Genel bakış"}
          </h1>
        </div>
        <nav aria-label="Raporlar" className="flex flex-wrap gap-2">
          {REPORT_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-line bg-surface-raised px-3 text-sm font-medium text-ink transition-colors hover:border-brand-400"
            >
              {link.label}
              <ArrowUpRight size={14} aria-hidden="true" className="text-ink-muted" />
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={Wallet}
          label="Bugünkü ciro"
          value={lira.format(overview.today.revenue)}
          detail={`${overview.today.payments} ödeme`}
        />
        <Kpi
          icon={Receipt}
          label="Ortalama adisyon"
          value={lira.format(overview.today.averageTicket)}
          detail={`${overview.today.orders} kapanan adisyon`}
        />
        <Kpi
          icon={ClipboardList}
          label="Açık adisyon"
          value={String(overview.openOrders)}
          detail="Şu an serviste"
          href="/orders"
        />
        <Kpi
          icon={ClipboardCheck}
          label="Bekleyen onay"
          value={String(overview.pendingApprovals)}
          detail="İkram/indirim ve satın alma"
          href="/approvals"
        />
      </div>

      {overview.lowStock > 0 ? (
        <Link
          href="/inventory"
          className="mt-3 flex items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-ink transition-colors hover:bg-warn/15"
        >
          <AlertTriangle size={18} aria-hidden="true" className="shrink-0 text-warn" />
          <span>
            <strong className="font-semibold">{overview.lowStock} hammadde</strong> kritik seviyenin altında.
          </span>
          <span className="ml-auto text-warn">Stoğa git →</span>
        </Link>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section aria-labelledby="ciro-baslik" className="rounded-xl border border-line bg-surface-raised p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="ciro-baslik" className="text-sm font-semibold text-ink">
              Son 14 gün ciro
            </h2>
            <p className="text-sm text-ink-muted">
              Toplam <span className="font-semibold tabular-nums text-ink">{lira.format(total14)}</span>
              <span className="mx-2 text-line">|</span>
              Günlük ort. <span className="font-semibold tabular-nums text-ink">{lira.format(total14 / overview.daily.length)}</span>
            </p>
          </div>
          <RevenueChart data={overview.daily} />
        </section>

        <section aria-labelledby="yontem-baslik" className="rounded-xl border border-line bg-surface-raised p-5 shadow-sm">
          <h2 id="yontem-baslik" className="text-sm font-semibold text-ink">
            Ödeme yöntemleri
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">Son 7 gün</p>
          {overview.methods.length === 0 ? (
            <p className="mt-6 text-sm text-ink-muted">Bu dönemde ödeme yok.</p>
          ) : (
            <ul className="mt-5 space-y-4">
              {overview.methods.map((m) => {
                const share = methodTotal ? m.amount / methodTotal : 0;
                return (
                  <li key={m.method}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-ink">{METHOD_LABEL[m.method] ?? m.method}</span>
                      <span className="tabular-nums text-ink-muted">
                        <span className="font-medium text-ink">%{Math.round(share * 100)}</span> · {lira.format(m.amount)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-sunken">
                      <div className="h-full rounded-full bg-[var(--chart-bar)]" style={{ width: `${share * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="top-baslik" className="mt-4 rounded-xl border border-line bg-surface-raised p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h2 id="top-baslik" className="text-sm font-semibold text-ink">
            En çok satanlar
          </h2>
          <p className="text-xs text-ink-muted">Son 7 gün, adet</p>
        </div>
        {overview.topItems.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">Bu dönemde satış yok.</p>
        ) : (
          <ol className="mt-4 divide-y divide-line">
            {overview.topItems.map((item, index) => (
              <li key={item.name} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3 py-2.5 sm:grid-cols-[1.5rem_12rem_1fr_auto]">
                <span className="font-mono text-xs text-ink-muted">{index + 1}</span>
                <span className="truncate text-sm font-medium text-ink">{item.name}</span>
                <span aria-hidden="true" className="hidden h-2 overflow-hidden rounded-full bg-surface-sunken sm:block">
                  <span
                    className="block h-full rounded-full bg-[var(--chart-bar)]"
                    style={{ width: `${(item.quantity / topMax) * 100}%` }}
                  />
                </span>
                <span className="text-right text-sm tabular-nums text-ink-muted">
                  <span className="font-medium text-ink">{item.quantity}</span> · {lira.format(item.revenue)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
