"use client";

import {
  BarChart3,
  ChefHat,
  ClipboardCheck,
  ClipboardList,
  History,
  LayoutGrid,
  type LucideIcon,
  Package,
  ScrollText,
  Settings,
  Smartphone,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, LucideIcon> = {
  "/pos": LayoutGrid,
  "/orders": ClipboardList,
  "/kds": ChefHat,
  "/cash": Wallet,
  "/inventory": Package,
  "/recipes": ScrollText,
  "/purchasing": Truck,
  "/reports": BarChart3,
  "/m": Smartphone,
  "/approvals": ClipboardCheck,
  "/audit": History,
  "/settings": Settings,
};

const GROUPS: { key: "service" | "stock" | "admin"; hrefs: string[] }[] = [
  { key: "service", hrefs: ["/pos", "/orders", "/kds", "/cash"] },
  { key: "stock", hrefs: ["/inventory", "/recipes", "/purchasing"] },
  { key: "admin", hrefs: ["/reports", "/m", "/approvals", "/audit", "/settings"] },
];

type NavItem = { href: string; label: string };

/** Masaüstü kenar çubuğu ve mobil menünün ortak listesi; öğeler sunucuda role göre süzülür. */
export function AppNav({
  items,
  groupLabels,
}: {
  items: readonly NavItem[];
  groupLabels: Record<"service" | "stock" | "admin", string>;
}) {
  const pathname = usePathname();
  const byHref = new Map(items.map((item) => [item.href, item]));

  return (
    <nav aria-label="Ana menü" className="flex flex-col gap-4 px-3 py-3">
      {GROUPS.map((group) => {
        const groupItems = group.hrefs.map((href) => byHref.get(href)).filter((item): item is NavItem => !!item);
        if (groupItems.length === 0) return null;

        return (
          <div key={group.key}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {groupLabels[group.key]}
            </p>
            <ul className="flex flex-col gap-0.5">
              {groupItems.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = ICONS[item.href] ?? LayoutGrid;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={[
                        "group flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
                        active
                          ? "bg-white/10 text-white"
                          : "text-slate-300 hover:bg-white/5 hover:text-white",
                      ].join(" ")}
                    >
                      <Icon
                        size={18}
                        aria-hidden="true"
                        className={active ? "text-brand-400" : "text-slate-400 group-hover:text-slate-200"}
                      />
                      {item.label}
                      {active ? <span aria-hidden="true" className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-400" /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
