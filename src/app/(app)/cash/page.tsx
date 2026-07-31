import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/phase-placeholder";

export const metadata: Metadata = { title: "Kasa" };

export default function CashPage() {
  return (
    <PhasePlaceholder
      phase="Faz 2"
      title="Kasa ve gün sonu"
      description="Rakip sistemlerin en çok vakit kaybettirdiği yer burası — bir operatörün ifadesiyle 'tek günü kaydetmek için 3 rapor gerekiyor'. Biz gün sonunu tek ekranda kapatacağız."
      features={[
        "Vardiya açma/kapatma ve kasa oturumu",
        "Ödeme türü kırılımı: nakit, kart, yemek kartı, açık hesap",
        "Kasa sayımı ve beklenen tutarla fark hesabı",
        "Tek tıkla gün sonu kapanışı ve otomatik özet maili",
        "Banka mutabakatı için beklenen yatan tutar (komisyon ve valör dahil)",
      ]}
    />
  );
}
