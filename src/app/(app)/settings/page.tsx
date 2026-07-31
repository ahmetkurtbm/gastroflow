import type { Metadata } from "next";

import { PhasePlaceholder } from "@/components/phase-placeholder";

export const metadata: Metadata = { title: "Ayarlar" };

export default function SettingsPage() {
  return (
    <PhasePlaceholder
      phase="Faz 5"
      title="Ayarlar"
      description="İşletme, personel ve bildirim kurallarının yönetildiği ekran. Yalnızca patron erişebilir."
      features={[
        "Personel ekleme, rol atama ve şube ataması",
        "Şube bilgileri, para birimi, saat dilimi",
        "Bildirim kuralları: hangi olayda kime mail gidecek",
        "Eşik değerleri: kritik stok, kasa açığı, iskonto onay limiti",
        "Entegrasyonlar: ÖKC, e-Arşiv, paket sipariş platformları",
      ]}
    />
  );
}
