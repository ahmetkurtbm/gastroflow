"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { AppNav } from "./app-nav";

/**
 * Mobilde kenar çubuğu yerine hamburger → kayar menü (drawer).
 *
 * Önceki tasarımda mobilde menü öğeleri yatay kaydırmalı bir şeritte
 * duruyordu — PC'deki dikey liste mantığı telefonda çalışmıyordu (kullanıcı
 * geri bildirimi). Artık masaüstüyle aynı gezinme deseni (aynı `AppNav`
 * bileşeni), yalnızca bir panel içinde açılıp kapanıyor.
 */
export function MobileNavDrawer({
  items,
  tenantName,
  branchName,
  fullName,
  roleLabel,
  signOutLabel,
  onSignOut,
}: {
  items: readonly { href: string; label: string }[];
  tenantName: string;
  branchName: string | null;
  fullName: string;
  roleLabel: string;
  signOutLabel: string;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPathname, setLastPathname] = useState(pathname);

  // Bir bağlantıya dokununca panel otomatik kapansın — aksi hâlde her
  // navigasyonda kullanıcı elle kapatmak zorunda kalır. React'ın önerdiği
  // "render sırasında state ayarla" deseni: bir effect'e gerek yok, ekstra
  // bir render kaybı da olmuyor (bkz. react.dev "You Might Not Need an Effect").
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Menüyü aç"
        aria-expanded={open}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-surface-sunken"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Menüyü kapat"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface-raised shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <Link href="/" className="block" onClick={() => setOpen(false)}>
                <span className="text-lg font-bold tracking-tight text-ink">
                  Gastro<span className="text-brand-600">Flow</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Menüyü kapat"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-sunken"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <p className="truncate px-4 pt-3 text-xs text-ink-muted">
              {tenantName}
              {branchName ? ` · ${branchName}` : ""}
            </p>

            <div className="flex-1 overflow-y-auto">
              <AppNav items={items} />
            </div>

            <div className="border-t border-line px-4 py-3">
              <p className="text-sm font-medium text-ink">{fullName}</p>
              <p className="text-xs text-ink-muted">{roleLabel}</p>
              <form action={onSignOut} className="mt-3">
                <button
                  type="submit"
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
                >
                  {signOutLabel}
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
