"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAppUser } from "@/lib/auth/current-user";
import { parseWorkbookRows, type ImportResult } from "@/lib/excel/workbook";
import { createClient } from "@/lib/supabase/server";

function fail(error: unknown): ImportResult {
  if (error instanceof z.ZodError) {
    return { error: error.issues[0]?.message ?? "Girdi geçersiz." };
  }
  if (error instanceof Error) return { error: error.message };
  return { error: "Beklenmeyen bir hata oluştu." };
}

const importSettlementRowSchema = z.object({
  date: z.iso.date("Tarih YYYY-AA-GG biçiminde olmalı"),
  platform: z.string().trim().min(1).max(60),
  amount: z.coerce.number().positive(),
});

function normalizeDateCell(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return raw;
}

/**
 * Paket platformu hakediş raporlarını Excel'den toplu içe aktarır (bkz.
 * `/api/export/hakedis-sablonu`, `loadChannelReconciliation`).
 *
 * `fiscal_receipts` importundaki AYNI gerekçe: platformun kendi dosyasını
 * ayrıştırmıyoruz (her platformun formatı farklı, hiçbiriyle API bağlantımız
 * yok) — kendi şablonumuzu (Tarih, Platform, Tutar) sağlıyoruz, kullanıcı
 * rakamları oradan taşıyor. Append-only; eşleştirme/güncelleme yok.
 */
export async function importChannelSettlements(
  _previous: ImportResult,
  formData: FormData,
): Promise<ImportResult> {
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Bir dosya seç." };
    }

    const rows = await parseWorkbookRows(file);
    if (rows.length === 0) return { error: "Dosyada satır bulunamadı." };

    const user = await requireAppUser();
    if (!user.branchId) return { error: "Şube ataması olmayan kullanıcı hakediş giremez." };
    const supabase = await createClient();

    const toInsert: {
      tenant_id: string;
      branch_id: string;
      platform: string;
      settlement_date: string;
      amount: number;
      imported_by: string;
    }[] = [];
    let skipped = 0;
    for (const row of rows) {
      const parsed = importSettlementRowSchema.safeParse({
        date: normalizeDateCell(row["Tarih"] ?? ""),
        platform: row["Platform"],
        amount: row["Tutar (₺)"],
      });
      if (!parsed.success) {
        skipped++;
        continue;
      }
      toInsert.push({
        tenant_id: user.tenantId,
        branch_id: user.branchId,
        platform: parsed.data.platform,
        settlement_date: parsed.data.date,
        amount: parsed.data.amount,
        imported_by: user.userId,
      });
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from("channel_settlements").insert(toInsert);
      if (error) return { error: error.message };
    }

    revalidatePath("/reports/hakedis-mutabakati");
    return { ok: true, created: toInsert.length, skipped };
  } catch (error) {
    return fail(error);
  }
}
