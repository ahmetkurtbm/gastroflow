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

const importReceiptRowSchema = z.object({
  date: z.iso.date("Tarih YYYY-AA-GG biçiminde olmalı"),
  receiptNo: z.string().trim().max(40).optional(),
  amount: z.coerce.number().positive(),
});

/** Excel hücresindeki tarihi "YYYY-MM-DD"ye çevirir — hem metin hem Excel'in kendi tarih nesnesi gelebilir. */
function normalizeDateCell(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return raw;
}

/**
 * Yazarkasa fişlerini Excel'den toplu içe aktarır (bkz. `/api/export/fis-sablonu`,
 * `loadReconciliation`).
 *
 * Diğer içe aktarmaların aksine burada "eşleşirse güncelle" YOK — her satır
 * yeni bir fiş kaydı. Aynı dosyayı yanlışlıkla iki kez yüklemeye karşı tek
 * koruma: aynı (tarih, fiş no, tutar) üçlüsü zaten varsa o satır atlanır
 * (fiş no boşsa bu kontrol devre dışı — ayırt edici bir alan yok).
 */
export async function importFiscalReceipts(
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
    if (!user.branchId) return { error: "Şube ataması olmayan kullanıcı fiş giremez." };
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("fiscal_receipts")
      .select("receipt_date, receipt_no, amount");
    const existingKeys = new Set(
      (existing ?? [])
        .filter((r) => r.receipt_no)
        .map((r) => `${r.receipt_date}|${r.receipt_no}|${Number(r.amount)}`),
    );

    const toInsert: { tenant_id: string; branch_id: string; receipt_date: string; receipt_no: string | null; amount: number; imported_by: string }[] = [];
    let skipped = 0;
    for (const row of rows) {
      const parsed = importReceiptRowSchema.safeParse({
        date: normalizeDateCell(row["Tarih"] ?? ""),
        receiptNo: row["Fiş No"] || undefined,
        amount: row["Tutar (₺)"],
      });
      if (!parsed.success) {
        skipped++;
        continue;
      }
      const key = parsed.data.receiptNo
        ? `${parsed.data.date}|${parsed.data.receiptNo}|${parsed.data.amount}`
        : null;
      if (key && existingKeys.has(key)) {
        skipped++;
        continue;
      }
      if (key) existingKeys.add(key);
      toInsert.push({
        tenant_id: user.tenantId,
        branch_id: user.branchId,
        receipt_date: parsed.data.date,
        receipt_no: parsed.data.receiptNo ?? null,
        amount: parsed.data.amount,
        imported_by: user.userId,
      });
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from("fiscal_receipts").insert(toInsert);
      if (error) return { error: error.message };
    }

    revalidatePath("/reports/fis-mutabakati");
    return { ok: true, created: toInsert.length, skipped };
  } catch (error) {
    return fail(error);
  }
}
