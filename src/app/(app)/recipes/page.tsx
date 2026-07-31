import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/phase-placeholder";

export const metadata: Metadata = { title: "Reçeteler" };

export default function RecipesPage() {
  return (
    <PhasePlaceholder
      phase="Faz 1"
      title="Reçete ve maliyet"
      description="Her satılan ürünün hammadde ağacı ve gerçek maliyeti. Reçeteler versiyonlanacak: gramajı değiştirdiğinde geçmiş aylardaki maliyet raporların bozulmayacak."
      features={[
        "Reçete ağacı ve yarı mamuller (sos, hamur gibi ara ürünler)",
        "Birim dönüşüm motoru: koli → adet → gram zinciri tek yerden yönetilir",
        "Fire yüzdesi dahil gerçek birim maliyet ve food cost oranı",
        "Reçete versiyonlama: satış anındaki maliyet dondurulur",
        "Fiyat simülasyonu: 'un %20 zamlanırsa kârım ne olur?'",
      ]}
    />
  );
}
