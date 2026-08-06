import { createClient } from "@/lib/supabase/server";

export type OrderCustomer = {
  id: string;
  phone: string;
  name: string | null;
  pointsBalance: number;
};

/** Ödeme ekranında adisyona bağlı müşteriyi (varsa) puan bakiyesiyle gösterir. */
export async function loadCustomerForOrder(orderId: string): Promise<OrderCustomer | null> {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("customer_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order?.customer_id) return null;

  const [{ data: customer }, { data: balanceRow }] = await Promise.all([
    supabase.from("customers").select("id, phone, name").eq("id", order.customer_id).maybeSingle(),
    supabase.from("v_customer_points").select("balance").eq("customer_id", order.customer_id).maybeSingle(),
  ]);

  if (!customer) return null;

  return {
    id: customer.id,
    phone: customer.phone,
    name: customer.name,
    pointsBalance: balanceRow?.balance ?? 0,
  };
}
