import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/phase-placeholder";

export const metadata: Metadata = { title: "Siparişler" };

export default function OrdersPage() {
  return (
    <PhasePlaceholder
      phase="Faz 2"
      title="Sipariş takip ekranı"
      description="Açık adisyonların ve sipariş durumlarının tek yerden izlendiği ekran. Realtime çalışacak: mutfak bir ürünü hazır işaretlediğinde burada anında görünecek."
      features={[
        "Açık adisyonlar, masa süreleri ve toplam tutarlar",
        "Gecikmiş ürünlerin renkli uyarısı",
        "Ürün bazlı durum akışı: gönderildi → hazırlanıyor → hazır → servis edildi",
        "Rol bazlı görünüm: garson kendi masalarını, müdür hepsini görür",
      ]}
    />
  );
}
