import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/phase-placeholder";

export const metadata: Metadata = { title: "Stok" };

export default function InventoryPage() {
  return (
    <PhasePlaceholder
      phase="Faz 3"
      title="Stok yönetimi"
      description="Stok bir sayı değil, bir defter olacak: her hareket kalıcı olarak yazılır, silinmez. 'Bu ürün neden eksik?' sorusunun cevabı her zaman tek bir listede görünür."
      features={[
        "Anlık stok seviyeleri ve hareket defteri (append-only)",
        "Satış kapanınca reçeteye göre otomatik hammadde düşümü",
        "Zayiat girişi: sebep kodlu (fire, bozulma, iade, personel yemeği)",
        "Depolar arası transfer: ana depo ↔ mutfak ↔ bar",
        "Kritik seviye uyarıları ve otomatik sipariş önerisi",
        "Mobil sayım ekranı: raf sırasına göre, körleme, offline çalışır",
      ]}
    />
  );
}
