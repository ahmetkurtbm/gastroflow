"use client";

import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { AppNav } from "./app-nav";
import { BrandMark, BrandName } from "./brand";

/** Mobilde kenar çubuğu yerine açılır menü; masaüstüyle aynı `AppNav` kullanılır. */
export function MobileNavDrawer({
  items,
  groupLabels,
  tenantName,
  branchName,
  fullName,
  roleLabel,
  signOutLabel,
  onSignOut,
}: {
  items: readonly { href: string; label: string }[];
  groupLabels: Record<"service" | "stock" | "admin", string>;
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

  // Bağlantıya dokununca panel kapanır (render sırasında state güncellenir, effect yok).
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Menüyü aç"
        aria-expanded={open}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-200 hover:bg-white/10"
      >
        <Menu size={22} aria-hidden="true" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Ana menü">
          <button
            type="button"
            aria-label="Menüyü kapat"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-slate-950/60"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-slate-900 shadow-xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
                <BrandMark size={28} />
                <BrandName className="text-base text-white" />
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Menüyü kapat"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <p className="truncate px-4 pt-3 text-xs text-slate-400">
              {tenantName}
              {branchName ? ` · ${branchName}` : ""}
            </p>

            <div className="flex-1 overflow-y-auto">
              <AppNav items={items} groupLabels={groupLabels} />
            </div>

            <div className="border-t border-white/10 px-4 py-3">
              <p className="text-sm font-medium text-white">{fullName}</p>
              <p className="text-xs text-slate-400">{roleLabel}</p>
              <form action={onSignOut} className="mt-3">
                <button
                  type="submit"
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-3 text-sm text-slate-200 transition-colors hover:bg-white/10"
                >
                  <LogOut size={16} aria-hidden="true" />
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
