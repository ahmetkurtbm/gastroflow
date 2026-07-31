import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/phase-placeholder";

export const metadata: Metadata = { title: "Mutfak" };

export default function KdsPage() {
  return (
    <PhasePlaceholder
      phase="Faz 2"
      title="Mutfak ekranı (KDS)"
      description="Yazıcı fişi yerine ekran. İstasyon bazlı sipariş kuyruğu, süre sayacı ve tek dokunuşla durum değiştirme."
      features={[
        "İstasyon bazlı kuyruk: sıcak mutfak, soğuk mutfak, bar ayrı ayrı",
        "Her sipariş için geçen süre sayacı ve eşik aşılınca renk uyarısı",
        "Tek dokunuşla 'hazırlanıyor' ve 'hazır' işaretleme",
        "Realtime: yeni sipariş yenileme gerekmeden düşer",
      ]}
    />
  );
}
