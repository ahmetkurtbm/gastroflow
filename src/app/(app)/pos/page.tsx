import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/phase-placeholder";

export const metadata: Metadata = { title: "Sipariş Al" };

export default function PosPage() {
  return (
    <PhasePlaceholder
      phase="Faz 2"
      title="Sipariş alma ekranı"
      description="Garsonun tek amaçlı ekranı: salon, masa, ürün, sepet, mutfağa gönder. Dikkat dağıtan hiçbir şey olmayacak ve internet kesildiğinde de çalışacak."
      features={[
        "Salon planı ve masa seçimi, masa doluluk süreleri",
        "Kategori bazlı ürün ızgarası ve hızlı arama",
        "Modifier'lar (acılı, ekstra peynir), porsiyon ve sipariş notu",
        "Offline-first: internet kesildiğinde sipariş alınmaya devam eder, bağlantı gelince çift kayıt olmadan senkronlanır",
        "Hesap bölme, ikram ve iskonto (eşik üstü onay ister)",
      ]}
    />
  );
}
