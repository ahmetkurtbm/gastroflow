import { loadSellableCombos, type SellableCombo } from "@/lib/combos/queries";
import { loadSellableMenu } from "@/lib/orders/queries";
import type { MenuCategory } from "@/lib/orders/types";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type QrTable = {
  id: string;
  name: string;
  tenantId: string;
  branchId: string;
};

export type QrMenu = {
  table: QrTable;
  categories: MenuCategory[];
  combos: SellableCombo[];
};

/**
 * QR sipariş sayfası için masa ve menü. Oturum yoktur; kiracı ve şube
 * yalnızca token'la bulunan masadan okunur. Pasif masanın token'ı geçersizdir.
 */
export async function loadQrMenu(qrToken: string): Promise<QrMenu | null> {
  const supabase = createServiceRoleClient();

  const { data: table } = await supabase
    .from("tables")
    .select("id, name, tenant_id, branch_id, is_active")
    .eq("qr_token", qrToken)
    .maybeSingle();

  if (!table || !table.is_active) return null;

  const [categories, combos] = await Promise.all([
    loadSellableMenu(table.branch_id, { client: supabase, tenantId: table.tenant_id }),
    loadSellableCombos(table.branch_id, { client: supabase, tenantId: table.tenant_id }),
  ]);

  return {
    table: { id: table.id, name: table.name, tenantId: table.tenant_id, branchId: table.branch_id },
    categories,
    combos,
  };
}
