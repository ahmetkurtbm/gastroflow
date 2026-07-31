import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/phase-placeholder";

export const metadata: Metadata = { title: "Satın Alma" };

export default function PurchasingPage() {
  return (
    <PhasePlaceholder
      phase="Faz 4"
      title="Tedarik ve satın alma"
      description="Stok modülünün en büyük emek kalemi tedarikçi faturasını satır satır tuşlamaktır. Burada faturayı fotoğraflayıp okutacağız — ReceiptFlow'daki OCR motorunu bu işe bağlayacağız."
      features={[
        "Tedarikçi kartları, fiyat listeleri ve teslim günleri",
        "Kritik seviyenin altına düşenlerden otomatik sipariş önerisi",
        "Sipariş onay akışı: müdür telefondan onaylar, tedarikçiye mail gider",
        "Mal kabul: sipariş edilenle gelen arasındaki farkı yakalar",
        "Fatura fotoğrafından otomatik satır çıkarma (OCR)",
        "Üçlü eşleştirme: sipariş ↔ irsaliye ↔ fatura",
        "Fiyat geçmişi ve zam uyarısı",
      ]}
    />
  );
}
