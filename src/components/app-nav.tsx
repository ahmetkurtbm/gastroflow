"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Kenar çubuğu menüsü.
 *
 * Maddeler sunucuda role göre süzülüp geliyor (bkz. navFor) ve aktif dile
 * çevrilmiş olarak geliyor. Buradaki tek iş aktif olanı işaretlemek — bu
 * yüzden client bileşeni.
 */
export function AppNav({ items }: { items: readonly { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Ana menü" className="flex gap-1 overflow-x-auto p-2 md:flex-col md:overflow-visible md:p-3">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={[
              "shrink-0 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-brand-600 text-white"
                : "text-ink-muted hover:bg-surface-sunken hover:text-ink",
            ].join(" ")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
