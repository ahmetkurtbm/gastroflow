"use client";

import { useActionState } from "react";

import type { ImportResult } from "@/lib/excel/workbook";

const initial: ImportResult = {};

/**
 * "Şablon indir → doldur → yükle" deseninin ortak UI'ı — menü ürünleri,
 * hammaddeler ve (ileride) benzer toplu içe aktarma ekranları aynı bileşeni
 * kullanıyor, yalnızca `action` ve indirme linkleri değişiyor.
 */
export function ExcelImportForm({
  action,
  templateHref,
  exportHref,
  hiddenFields,
}: {
  action: (previous: ImportResult, formData: FormData) => Promise<ImportResult>;
  /** Boş, örnek satırlı şablon — ilk kurulum için. */
  templateHref: string;
  /** Mevcut veriyi aynı formatta indirir — toplu düzenleyip geri yüklemek için. */
  exportHref: string;
  /** Tedarikçi/şube gibi, dosyanın kendisinde OLMAYAN ama eylemin ihtiyaç
   * duyduğu bağlam — ör. hangi tedarikçinin fiyat listesi olduğu. */
  hiddenFields?: Record<string, string>;
}) {
  const [state, formAction] = useActionState(action, initial);

  return (
    <div className="space-y-2 p-4">
      <div className="flex flex-wrap gap-3 text-xs">
        <a href={templateHref} className="text-brand-700 underline underline-offset-2">
          Boş şablon indir
        </a>
        <a href={exportHref} className="text-brand-700 underline underline-offset-2">
          Mevcut listeyi indir (toplu düzenlemek için)
        </a>
      </div>
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        {hiddenFields
          ? Object.entries(hiddenFields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))
          : null}
        <input
          type="file"
          name="file"
          accept=".xlsx"
          required
          className="text-xs text-ink-muted file:mr-2 file:rounded-md file:border-0 file:bg-surface-sunken file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-ink"
        />
        <button
          type="submit"
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-sunken"
        >
          Yükle
        </button>
      </form>
      {state.error ? (
        <p role="alert" className="text-xs text-danger">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-xs text-ok">
          {state.created ?? 0} yeni, {state.updated ?? 0} güncellendi.
        </p>
      ) : null}
    </div>
  );
}
