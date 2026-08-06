import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import QRCode from "qrcode";

import { regenerateTableQrToken } from "@/lib/floor/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Masa QR Kodu" };

/**
 * Bir masanın QR sipariş kodunu büyük gösterip yazdırmaya hazırlar.
 *
 * `x-forwarded-host`'u tercih ediyoruz: uygulama bir ters proxy'nin (Vercel,
 * nginx) arkasındaysa `host` başlığı iç ağdaki adresi taşıyabilir — müşteri
 * telefonundan taranacak URL'in DIŞARIDAN erişilebilir adres olması gerekiyor.
 */
export default async function TableQrPage({
  params,
}: {
  params: Promise<{ tableId: string }>;
}) {
  const { tableId } = await params;
  const supabase = await createClient();

  const { data: table } = await supabase
    .from("tables")
    .select("id, name, qr_token")
    .eq("id", tableId)
    .maybeSingle();

  if (!table) notFound();

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const orderUrl = `${protocol}://${host}/siparis/masa/${table.qr_token}`;

  const qrDataUrl = await QRCode.toDataURL(orderUrl, { width: 320, margin: 1 });

  return (
    <div className="mx-auto max-w-sm print:max-w-full">
      <Link href="/settings/salon" className="text-sm text-ink-muted hover:text-ink print:hidden">
        ← Salon ve Masalar
      </Link>

      <div className="mt-4 rounded-xl border border-line bg-surface-raised p-6 text-center print:border-none print:shadow-none">
        <h1 className="text-lg font-semibold text-ink">{table.name}</h1>
        <p className="mt-1 text-sm text-ink-muted print:hidden">
          Bu kodu masaya yazdırıp yapıştırın — müşteri telefonuyla okutunca menüyü görüp sipariş verebilir.
        </p>

        {/* eslint-disable-next-line @next/next/no-img-element -- veri URI'si, next/image optimizasyonu gereksiz */}
        <img src={qrDataUrl} alt={`${table.name} QR sipariş kodu`} className="mx-auto mt-4" width={320} height={320} />

        <p className="mt-3 break-all text-xs text-ink-muted print:hidden">{orderUrl}</p>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 print:hidden">
        <form action={regenerateTableQrToken}>
          <input type="hidden" name="id" value={table.id} />
          <button
            type="submit"
            className="text-xs text-danger hover:underline"
            title="Eski kod anında geçersiz olur — yalnızca kod sızmışsa kullanın"
          >
            Kodu yenile (eskisi geçersiz olur)
          </button>
        </form>
      </div>
    </div>
  );
}
