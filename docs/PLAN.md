# GastroFlow — Restoran Yönetim Sistemi · Uygulama Planı

## Context

Portfolyodaki projeler (ReceiptFlow, GateHub, KidsAcademy, TestMetrix…) tek başına birer dikey çözüm.
Bu proje **nihai vitrin projesi**: gerçek bir restoranın günlük operasyonunu baştan sona çeviren,
çok kullanıcılı, rol bazlı, offline dayanıklı ve güvenlik açığı bırakmayacak şekilde tasarlanmış bir sistem.

Çözmesi gereken somut ihtiyaçlar:
- Sipariş alan kişinin **sadece** sipariş alacağı sade bir ekran; siparişlerin izlendiği ayrı bir ekran
- Satılan her ürün için **reçeteye göre hammadde düşümü**, stok açığı ve maliyet kontrolü
- Kritik seviyenin altına düşen stok için **uyarı + mail**
- **Tedarik siparişi (satın alma) oluşturma** ekranı ve onay akışı
- Patronun/müdürün **telefondan** bazı işlere müdahale edebilmesi (onay, canlı ciro, uyarılar)
- Her işlemin **log**'unun tutulması, geriye dönük izlenebilirlik

Piyasa araştırması (aşağıda) gösteriyor ki rakiplerin asıl kaybettiği yer özellik eksiği değil,
**veri girişi ve mutabakat emeği**. Bu projenin farklılaşma ekseni tam olarak orası olacak.

**Ticari hedef:** Tek bir şirketle canlıya çıkmak, sonra 5 → 10 → 15 işletmeye büyümek.
Bu, "portfolyo demosu" değil **satılabilir ürün** demek; plan buna göre kurgulandı (§0.1).

---

## 0. Varsayımlar (sorular atlandığı için en makul seçenekler alındı — değiştirilebilir)

| Karar | Seçim | Neden |
|---|---|---|
| Kapsam | **Şema multi-tenant, arayüz tek işletme** | Bkz. §0.1 — hedef tek şirketle başlayıp 5/10/15'e çıkmak |
| Stack | **Next.js 16 (App Router) + TypeScript + Supabase (Postgres/Auth/RLS/Realtime/Storage)** | "Asla güvenlik açığı olmayan" hedefi için RLS ile güvenliği **veritabanı katmanında** zorunlu kılmak en sağlam yol; Realtime mutfak/sipariş ekranları için hazır geliyor; portfolyoda zaten Supabase deneyimi var |
| Mobil | **Responsive PWA** (tek kod tabanı, kurulabilir, service worker ile offline sipariş) | İkinci kod tabanı ve store süreci olmadan telefondan müdahale + tablet POS |
| ORM/Migration | **Supabase CLI migrations (saf SQL)** + `generate_typescript_types` | RLS, trigger, view, policy'ler SQL'de yaşamalı; Prisma bunları yönetemez |
| Donanım/yasal | **Adapter arayüzü + mock** (ÖKC, e-Arşiv, paket sipariş platformları), **KDS gerçek** | Gerçek ÖKC/e-Arşiv ticari anlaşma ister; mimari hazır olur, kablo sonra takılır |
| Mail | **Resend** + Supabase pg_cron/Edge Function | Basit API, iyi teslim oranı, ücretsiz kota portfolyo için yeterli |
| Repo | Yeni bağımsız repo: `C:\Users\ahmet\OneDrive\Belgeler\GitHub\gastroflow` | Portfolyo repo'su sadece vitrin; proje kodu oraya girmemeli |

> Bu tablodaki herhangi bir satırı değiştirmek istersen söyle, plan ona göre revize edilir.

### 0.1 Büyüme stratejisi — "tek şirketle başla, 5/10/15'e çık"

Bu hedef planın en kritik kararını belirliyor. İki şeyi ayırmak gerekiyor:

| Katman | Ne zaman | Neden |
|---|---|---|
| **Şema + güvenlik: gün 1'den multi-tenant** | Faz 0 | Her tabloda `tenant_id` (+ `branch_id`), RLS bunları JWT claim'inden zorunlu kılar. Maliyeti bugün ~%5 ek iş; sonradan eklemenin maliyeti **her tabloyu, her sorguyu, her policy'yi ve tüm mevcut veriyi yeniden yazmak**. Bu satır pazarlığa açık değil. |
| **Arayüz + operasyon: önce tek işletme** | Faz 1–7 | Ekranlar "tek restoranın günü" için tasarlanır. Tenant seçici yok, merkez konsolu yok, karmaşıklık yok. İlk müşteri hiçbir SaaS kalabalığı görmez. |
| **Çok işletme özellikleri** | Faz 8 (2. müşteriden önce) | Tenant provizyon, onboarding sihirbazı, tenant bazlı marka/logo/mail gönderen, abonelik & faturalama, çapraz-tenant destek paneli, tenant bazlı yedek/dışa aktarım. |
| **Zincir (tek tenant, çok şube)** | Faz 9, talep gelince | Merkezi menü/fiyat dağıtımı, şubeler arası transfer, merkez mutfak üretimi, konsolide raporlar. Şema bunu zaten taşıyor. |

**Somut kural:** Faz 0'da yazılacak her migration `tenant_id uuid not null references tenants(id)` içerecek
ve her policy `tenant_id = auth.jwt() ->> 'tenant_id'` üzerinden çalışacak. Bir tabloyu bu kural olmadan
merge etmek yasak — CI'daki pgTAP testi bunu otomatik yakalayacak (`tenant_id`'si veya RLS policy'si
olmayan tablo varsa build kırılır).

**15 müşteriye kadar tek Supabase projesi yeter.** Ayrı DB / şema-per-tenant'a gerek yok; RLS ile satır
bazlı izolasyon bu ölçekte hem daha ucuz hem daha az hata yüzeyi. Ayrışma sinyali gelirse (bir müşteri
veri ikametgâhı veya özel yedek isterse) tenant'ı ayrı projeye taşımak, `tenant_id` filtreli dışa aktarım
olduğu için düz bir iş olur.

---

## 1. Pazar araştırması — ne yapıyorlar, nerede vakit kaybettiriyorlar

### 1.1 Referans sistemler ve yapıları

| Sistem | Konum | Mimari özet |
|---|---|---|
| **Toast** | ABD, zincir/bağımsız | Kendi Android donanımı + bulut; POS/KDS/online sipariş/bordro tek pakette, donanım kilidi yüksek |
| **Oracle MICROS Simphony** | Global zincir (kurumsal) | Merkez (EMC) → şube (property) hiyerarşisi, merkezi menü/fiyat dağıtımı, şubede lokal DB + senkron |
| **Lightspeed / TouchBistro / SpotOn / Clover** | Orta ölçek | Bulut POS + eklenti pazaryeri; stok ve muhasebe çoğunlukla 3. parti entegrasyon |
| **CrunchTime / Apicbase / MarketMan / WISK** | Zincir back-office | POS'tan satış çeker, reçeteye göre **teorik tüketim** üretir, fiziksel sayımla karşılaştırıp **varyans** çıkarır |
| **Simpra Suite** | TR, zincir | Merkezi fiyat/stok/raporlama, konsolide çok şubeli raporlar |
| **Adisyo / robotPOS / NarPOS** | TR, KOBİ→zincir | Bulut adisyon + stok + ÖKC/e-Arşiv entegrasyonu, hazır rapor setleri |

**Çıkarılan yapısal ders:** Ciddi sistemler iki ayrı katmandan oluşuyor —
(a) hızlı, offline çalışan **operasyon katmanı** (POS/KDS),
(b) yavaş ama derin **back-office katmanı** (reçete, maliyet, satın alma, varyans).
Tek monolit ekranda birleştirenler ikisinde de kötü oluyor. Biz de bu ayrımı koruyacağız.

### 1.2 Operatörlerin şikâyet ettiği somut vakit kayıpları
(11.389 Capterra yorumunun analizi + sektör kaynakları)

| # | Kayıp | Gerçek ifade / kanıt | Bizim karşılığımız |
|---|---|---|---|
| 1 | **Gün sonu mutabakatı** | *"Tek günü kaydetmek için 3 rapor gerekiyor."* (SpotOn, 2024). 15 dk olması gereken kapanış 1 saati buluyor | **Tek ekran gün sonu**: satış + tahsilat + kasa sayımı + fark + Z özeti, tek tıkla kapanış ve otomatik mail |
| 2 | **Tedarikçi faturasını elle girme** | Stok modülünün en büyük emek kalemi; her irsaliye satır satır tuşlanıyor | **ReceiptFlow OCR'ının yeniden kullanımı**: fatura/irsaliye fotoğrafı → satırlar otomatik → mal kabul taslağı. Bu projenin en güçlü farkı |
| 3 | **Banka/POS mutabakatsızlığı** | Negatif POS yorumlarının ~1/8'i. *"Ekstreler yatan parayla tutmuyor, asla mutabakat yapamazsın."* (Clover) | Ödeme yöntemi bazında **beklenen yatan tutar** hesabı + komisyon/valör alanı + fark raporu |
| 4 | **Paket sipariş platformlarının elle girilmesi** | *"DoorDash siparişlerini elle girip indirimle kapatıyoruz."* (TouchBistro, 2023) | Tek **sipariş kuyruğu** + kanal adaptörü (Yemeksepeti/Getir/Trendyol Go mock ile), elle giriş de aynı kuyruğa |
| 5 | **Muhasebe senkronunun bozulması** | Çift kayıt, dengesiz yevmiye, *"faturaları QuickBooks'a elle giriyoruz"* | **Deterministik dışa aktarım** (Logo/Mikro/Luca uyumlu CSV) + idempotent kayıt anahtarı |
| 6 | **Sayımın kâğıt/Excel'den sisteme aktarılması** | Sayım atlanıyor → yanlış sipariş → fire veya stok-out | **Mobil sayım ekranı**: raf sırasına göre liste, körleme sayım, offline, sayfa sayfa kaydet |
| 7 | **İnternet kesildiğinde satışın durması** | Sonradan offline eklemenin maliyeti 30–50 bin USD refactor | POS ekranı **baştan offline-first**: IndexedDB kuyruk + idempotency key, çift kayıt imkânsız |
| 8 | **Birim dönüşüm hataları** | Koli→adet→gram zinciri; sistemler bunu ürün kartına gömüyor, maliyet saçmalıyor | Merkezi **birim dönüşüm motoru**; her dönüşüm tek yerde, test edilebilir |
| 9 | **Reçete güncellemesinin geçmişi bozması** | Fiyat/gramaj değişince eski aylar da değişiyor, rapor güvenilirliği gidiyor | **Reçete versiyonlama**: satış anındaki versiyon ve fiyat dondurulur |
| 10 | **Rol ayrımının zayıf olması** | Garson maliyet raporunu görüyor, herkes indirim yapabiliyor | Rol matrisi + **RLS** + onay gerektiren aksiyonlar (ikram/iptal/fiyat) |

### 1.3 Türkiye'ye özgü zorunluluk
7524 sayılı Kanun kapsamında yeme-içme işletmelerinde **Yeni Nesil ÖKC kullanımı ve adisyon
yazılımıyla entegrasyonu zorunlu**; uyulmaması hâlinde 2026 itibarıyla 125.000 TL'ye varan
özel usulsüzlük cezaları gündemde. Belirli ciro eşiğini aşanlar için e-Arşiv fatura entegrasyonu da gerekiyor.
→ Planda gerçek entegrasyon yok, ama **`FiscalDeviceAdapter` ve `EInvoiceAdapter` arayüzleri + mock**
implementasyonları yazılacak; ticari anlaşma sağlandığında sadece adapter yazılır, çekirdek değişmez.

---

## 2. Mimari

```
apps/web  (Next.js 16, App Router, TS, Tailwind v4)
 ├─ (pos)        Sipariş alma ekranı      → offline-first, sade, tablet
 ├─ (kds)        Mutfak/bar ekranı        → realtime, salt-okunur + durum butonu
 ├─ (manage)     Back-office              → stok, reçete, satın alma, rapor
 └─ (m)          Mobil patron/müdür       → onay, canlı ciro, uyarılar
supabase/
 ├─ migrations/  saf SQL: tablo + RLS + trigger + view
 ├─ functions/   Edge Functions: mail gönderici, OCR köprüsü, cron işleri
 └─ tests/       pgTAP: RLS negatif testleri
packages/core    domain mantığı (saf TS, DB'siz test edilebilir):
                 reçete patlatma, birim dönüşüm, maliyet, varyans, par-level
```

### 2.1 Üç kritik mimari karar

**a) Stok = append-only ledger.**
`stock_movements` tablosuna sadece INSERT yapılır; UPDATE/DELETE yetkisi DB seviyesinde geri alınır.
Düzeltme, ters kayıt (reversal) ile yapılır. Anlık stok `stock_levels` materialized view / toplam tablosundan okunur.
→ "Stok neden eksik?" sorusunun cevabı her zaman tek bir hareket listesinde. Denetlenebilirlik ücretsiz gelir.

Hareket tipleri: `purchase_in`, `sale_out`, `waste`, `transfer_in`, `transfer_out`,
`production_in`, `production_out` (yarı mamul üretimi), `count_adjustment`, `reversal`.

**b) Satıştan stok düşümü asenkron ve idempotent.**
Adisyon kapandığında satır bazında bir `stock_depletion_job` yazılır; worker reçeteyi patlatır (yarı
mamuller dâhil, recursive), fire yüzdesini uygular, ledger'a yazar. Aynı iş iki kez çalışsa bile
`(order_line_id, recipe_version_id)` unique kısıtı çift düşümü engeller.

**c) Bildirimler outbox pattern ile.**
Uygulama mail göndermez; `notification_outbox`'a satır yazar. Edge Function kuyruğu işler, retry/backoff
uygular, `notification_log`'a yazar. → Mail servisi çökse de olay kaybolmaz, çift mail gitmez.

---

## 3. Güvenlik modeli ("asla güvenlik açığı olmayan" hedefi)

Güvenlik bir faz değil, her fazın kabul kriteri. Somut kurallar:

1. **Deny-by-default RLS** — istisnasız her tabloda `ENABLE ROW LEVEL SECURITY` + `FORCE`. Policy yazılmamış tabloya kimse erişemez.
2. **Tenant/şube izolasyonu JWT'den** — `tenant_id`, `branch_id`, `role` custom access token hook ile JWT claim'ine yazılır; policy'ler client'tan gelen parametreye **asla** güvenmez.
3. **`service_role` anahtarı client'a hiç girmez** — sadece Edge Function/server ortamında. Client'ta yalnız `anon` key.
4. **Tüm yazma işlemleri Server Action / Route Handler üzerinden**, girdi `zod` ile doğrulanır; DB'ye doğrudan client yazımı sadece RLS'in izin verdiği dar yüzeyde.
5. **PIN girişi tek başına yetki vermez** — paylaşımlı tablette garson PIN'i, yalnızca **kayıtlı cihaz** (device enrollment token) üzerinde oturum açar. PIN + cihaz bağı olmadan API erişimi yok. Yönetici/patron rollerinde **2FA (TOTP)** zorunlu.
6. **Audit log DB trigger'ı ile** — uygulama katmanından atlanamaz. Hassas tablolarda `BEFORE/AFTER` trigger `audit_log`'a `actor, action, before, after, ip, device` yazar. `audit_log` append-only.
7. **Para `numeric(14,4)`**, asla float. Para birimi ve KDV oranı satırda dondurulur.
8. **Idempotency key** — ödeme, adisyon kapanışı, stok düşümü, mail. Offline senkronda çift kayıt matematiksel olarak imkânsız.
9. **Storage private** — fatura/fiş görselleri imzalı URL ile, süreli; bucket policy'si tenant bazlı.
10. **Rate limit + brute-force koruması** — PIN denemesi, login, OCR endpoint'i.
11. **Güvenlik başlıkları** — CSP, HSTS, `X-Frame-Options`, referrer policy; `next.config.ts` headers'ta merkezi.
12. **Sızıntı testi CI'da** — pgTAP ile "A tenant'ının kullanıcısı B tenant'ının siparişini okuyamaz" tipi **negatif testler**; RLS regresyonu build'i kırar.

---

## 4. Roller ve yetki matrisi

| Rol | POS | KDS | Stok | Reçete/maliyet | Satın alma | Rapor | Onay verir |
|---|---|---|---|---|---|---|---|
| `owner` (patron) | ✓ | ✓ | ✓ | ✓ | ✓ | tümü + çok şube | ✓ (limitsiz) |
| `manager` (müdür) | ✓ | ✓ | ✓ | ✓ | oluştur | şube | ✓ (limitli) |
| `chef` (mutfak) | – | ✓ | sayım + zayiat | görüntüle | talep | mutfak | – |
| `waiter` (garson) | ✓ | görüntüle | – | – | – | kendi cirosu | – |
| `cashier` (kasa) | ✓ + ödeme | – | – | – | – | vardiya | – |
| `storekeeper` (depo) | – | – | ✓ | – | ✓ mal kabul | stok | – |
| `accountant` | – | – | görüntüle | görüntüle | fatura | mali | – |

**Onay gerektiren aksiyonlar** (mobil bildirimle patrona/müdüre düşer): ikram, eşik üstü indirim,
servis edilmiş ürün iptali, stok düzeltmesi, eşik üstü satın alma siparişi, menü fiyat değişikliği.

---

## 5. Veri modeli (ana tablolar)

**Kimlik/organizasyon:** `tenants`, `branches`, `profiles`, `memberships(user,tenant,branch,role)`, `devices`, `pin_credentials`

**Katalog:** `units`, `unit_conversions`, `categories`, `menu_items`, `modifier_groups`, `modifiers`,
`menu_prices(branch_id, valid_from)` ← şube bazlı fiyat, tarihli

**Reçete:** `recipes`, `recipe_versions(valid_from, is_active)`, `recipe_lines(item/sub_recipe, qty, unit, waste_pct)`,
`sub_recipes` (sos/hamur gibi yarı mamuller — merkez mutfak senaryosu)

**Stok:** `inventory_items`, `stock_locations`, `stock_movements` (append-only ledger),
`stock_levels` (agregat), `par_levels(min, max, reorder_point)`, `stock_counts`, `stock_count_lines`,
`waste_logs(reason_code)`, `transfers`

**Satın alma:** `suppliers`, `supplier_items(kod, fiyat, min sipariş, teslim günü)`, `purchase_orders`,
`po_lines`, `goods_receipts`, `receipt_lines`, `supplier_invoices`, `invoice_lines`, `price_history`

**Servis:** `areas`, `tables`, `table_sessions`, `orders`, `order_lines`, `order_line_modifiers`,
`order_line_events`, `payments`, `discounts`, `shifts`, `cash_sessions`

**Sistem:** `audit_log`, `notification_rules`, `notification_outbox`, `notification_log`,
`approval_requests`, `sync_queue`

**Türetilmiş görünümler:** `v_theoretical_usage`, `v_actual_usage`, `v_variance`,
`v_item_profitability`, `v_daily_sales`, `v_low_stock`

---

## 6. Ekranlar

| Ekran | Rol | Kritik detay |
|---|---|---|
| **Sipariş alma** (`/pos`) | garson | Salon → masa → ürün ızgarası → sepet → mutfağa gönder. Tek amaçlı, dikkat dağıtan hiçbir şey yok. Offline çalışır. Kişi sayısı, not, modifier, hesap bölme |
| **Sipariş takip** (`/orders`) | herkes (rol filtreli) | Açık adisyonlar, masa süreleri, gecikmiş ürünler, durum değişimleri. Realtime |
| **Mutfak ekranı** (`/kds`) | mutfak/bar | İstasyon bazlı kuyruk, hazırlanıyor/hazır, süre sayacı, renkli gecikme uyarısı |
| **Kasa/gün sonu** (`/cash`) | kasa/müdür | Vardiya aç/kapat, kasa sayımı, ödeme türü kırılımı, fark, **tek tık kapanış + mail** |
| **Stok** (`/inventory`) | depo/müdür | Anlık seviye, hareket defteri, zayiat girişi, transfer, kritik seviye listesi |
| **Sayım** (`/inventory/count`) | depo/mutfak | Mobil, raf sırasına göre, körleme, offline, kısmi kaydet |
| **Reçete & maliyet** (`/recipes`) | müdür/patron | Reçete ağacı, birim maliyet, hedef food cost %, fiyat simülasyonu ("un %20 zamlanırsa ne olur") |
| **Satın alma** (`/purchasing`) | depo/müdür | Par-level altı otomatik öneri → PO taslağı → onay → tedarikçiye mail → mal kabul → 3'lü eşleştirme (PO↔irsaliye↔fatura) |
| **Fatura okuma** (`/purchasing/scan`) | depo | Fotoğraf/PDF yükle → OCR → satır eşleştirme → mal kabul taslağı |
| **Raporlar** (`/reports`) | müdür/patron | Teorik vs fiili varyans, menü mühendisliği (yıldız/at/bilmece/köpek), saatlik yoğunluk, personel, zayiat |
| **Loglar** (`/audit`) | patron | Kim, ne zaman, neyi, öncesi/sonrası. Filtrelenebilir, dışa aktarılabilir |
| **Patron mobil** (`/m`) | patron/müdür | Canlı ciro, bekleyen onaylar, kritik stok, gün sonu özeti — telefon için tasarlanmış |
| **Ayarlar** (`/settings`) | patron | Kullanıcı/rol, şube, bildirim kuralları, eşikler, mail alıcıları, entegrasyonlar |

---

## 7. Bildirim & mail motoru

**Olay tipleri → varsayılan alıcılar** (hepsi `notification_rules`'tan yönetilebilir):

| Olay | Tetikleyici | Kime |
|---|---|---|
| Kritik stok | seviye ≤ reorder_point | depo + müdür |
| Negatif stok | ledger < 0 | müdür + patron (anormallik sinyali) |
| Yüksek varyans | teorik-fiili farkı > %eşik | patron |
| Onay bekliyor | ikram/iskonto/PO/fiyat değişikliği | müdür/patron (mobil) |
| Kasa açığı | sayım farkı > eşik | patron |
| Gün sonu özeti | vardiya kapanışı | patron + muhasebe |
| Haftalık maliyet raporu | pazartesi 08:00 (cron) | patron |
| Tedarikçi siparişi | PO onaylandı | tedarikçi + depo |
| Teslimat gecikti | beklenen tarih geçti | depo |
| Fiyat artışı | tedarikçi fiyatı > %X arttı | müdür |

Mekanizma: **outbox → Edge Function worker → Resend**. Şablonlar React Email ile, tenant logosuyla.
Dijest desteği (aynı olay tekrarlıyorsa tek özet mail) — spam'e boğmamak için önemli.

---

## 8. Yol haritası (adım adım)

Her faz **çalışan ve gösterilebilir** bir dilim bırakır. Faz sonunda: migration + RLS testi + e2e senaryo + demo seed verisi.

### Faz 0 — Temel (iskelet, güvenlik omurgası)
Repo kurulumu, Next.js 16 + TS + Tailwind v4, Supabase projesi ve local CLI, `tenants/branches/profiles/memberships`,
JWT custom claims hook, **RLS deseni + pgTAP negatif test altyapısı**, `audit_log` trigger'ı, app shell/layout, rol bazlı yönlendirme.
*Bu fazı atlamak, sonraki her fazı geri dönüp yeniden yazmak demek.*

### Faz 1 — Katalog, reçete, maliyet
Birimler + dönüşüm motoru (`packages/core`, saf TS, unit test'li), kategoriler, menü ürünleri, modifier'lar,
hammadde kartları, reçete + yarı mamul (recursive patlatma), reçete versiyonlama, teorik birim maliyet ve food cost % hesabı.

### Faz 2 — Sipariş & servis (POS + KDS)
Kat planı ve masalar, adisyon açma/ürün ekleme/mutfağa gönderme, KDS realtime akışı, ödeme + hesap bölme,
ikram/iskonto onay akışı, vardiya ve kasa oturumu, **offline-first kuyruk + idempotent senkron**, gün sonu tek ekran.

### Faz 3 — Stok motoru
Ledger tabloları ve yetki kısıtları, adisyon kapanışında reçeteye göre otomatik düşüm (job + idempotency),
zayiat girişi (sebep kodlu), depolar arası transfer (ana depo ↔ mutfak ↔ bar), sayım ekranı,
**teorik vs fiili varyans raporu**, par-level uyarıları. *(Şubeler arası transfer aynı tabloyu kullanır, Faz 9'da açılır.)*

### Faz 4 — Tedarik zinciri
Tedarikçi ve fiyat listeleri, par-level altına düşenlerden **otomatik PO önerisi**, PO onay akışı (mobil),
tedarikçiye mail, mal kabul (sipariş↔gelen farkı), fatura eşleştirme (3-way match),
**ReceiptFlow OCR köprüsü ile faturadan otomatik satır çıkarma**, fiyat geçmişi ve zam uyarısı.

### Faz 5 — Bildirim & mail motoru
Outbox + worker + retry, kural motoru ve ayar ekranı, React Email şablonları, cron ile periyodik özetler, dijest.

### Faz 6 — Raporlar & patron mobil paneli
Materialized view'lar ve günlük agregatlar, dashboard, varyans, menü mühendisliği, saatlik ısı haritası,
personel performansı, `/m` mobil panel (canlı ciro, onaylar, uyarılar), muhasebe dışa aktarımı (Logo/Mikro/Luca CSV).

### Faz 7 — Sertleştirme & entegrasyon adaptörleri
Güvenlik denetim listesi, RLS test kapsamı, yük testi (yoğun servis simülasyonu), Playwright e2e,
PWA offline senaryoları, `FiscalDeviceAdapter` / `EInvoiceAdapter` / `DeliveryChannelAdapter` arayüzleri + mock'lar,
çok dilli arayüz (TR/EN), portfolyo proje kartının eklenmesi.

**→ Burası "1. müşteri canlıya çıkabilir" çizgisi.** Faz 0–7 tek işletmeyi tam çeviriyor.

### Faz 8 — Çok işletme (2. müşteriden önce)
Tenant provizyon akışı ve onboarding sihirbazı (menü/hammadde şablonundan hızlı kurulum),
tenant bazlı marka (logo, renk, mail gönderen adı), abonelik & faturalama, plan/limit yönetimi,
çapraz-tenant destek paneli (impersonation **audit log'lu ve süreli**), tenant bazlı yedek ve dışa aktarım,
kullanım metrikleri. *Şema Faz 0'da hazır olduğu için bu faz büyük ölçüde arayüz ve süreç işi.*

### Faz 9 — Zincir özellikleri (tek tenant, çok şube — talep gelince)
Merkezi menü/fiyat dağıtımı ve şube bazlı istisnalar, şubeler arası stok transferi (onaylı),
merkez mutfak üretimi ve şubeye sevk, konsolide çok şube raporları, şube kıyaslama.

---

## 9. Doğrulama

**Faz başına zorunlu kontroller:**
- `supabase test db` — pgTAP: her yeni tablo için en az bir **cross-tenant erişim reddi** testi
- `npm run test` — `packages/core` birim testleri (birim dönüşümü, reçete patlatma, maliyet, varyans matematiği)
- `npx tsc --noEmit` + `npm run lint`

**Uçtan uca kabul senaryosu (Faz 3 sonunda tam çalışmalı):**
1. Seed: 1 tenant + 1 şube (izolasyon testleri için ikinci bir sahte tenant), "Margarita Pizza" ürünü,
   reçetesi (hamur yarı mamulü + 150 g mozzarella + 80 g sos)
2. Garson tablette adisyon açar, 3 adet Margarita gönderir → KDS'de anında görünür
3. Kasa adisyonu kapatır → ledger'a `sale_out` hareketleri düşer, mozzarella 450 g azalır
4. Mozzarella `reorder_point`'in altına iner → `notification_outbox`'a kayıt → mail düşer
5. Satın alma ekranı otomatik PO önerir → müdür **telefondan** onaylar → tedarikçiye mail gider
6. Mal kabul yapılır → `purchase_in` hareketi → stok toparlanır
7. Fiziksel sayım girilir → varyans raporunda fark ve nedeni görünür
8. `/audit` ekranında bu zincirin her adımı, aktörüyle birlikte listelenir

**Güvenlik doğrulaması:**
- Tenant A'nın kullanıcısı, Tenant B'nin **hiçbir** satırını (sipariş, maliyet, personel, log) okuyamaz/yazamaz — her tablo için ayrı test
- `tenant_id` kolonu veya RLS policy'si olmayan tablo varsa CI build'i kırılır
- `service_role` anahtarının client bundle'ında geçmediği build çıktısında aranır
- PIN brute-force rate limit'i ve cihaz bağı olmadan API erişiminin reddi test edilir

---

## 10. Kaynaklar

- [Restaurant Software Pain Points 2026 — 11.389 Capterra yorumunun analizi](https://www.deliverguard.io/research/restaurant-software-pain-points-2026)
- [Actual vs. Theoretical Food Cost Variance — CrunchTime](https://www.crunchtime.com/blog/blog/explaining-actual-vs-theoretical-food-cost-variance)
- [How to Calculate (and Control) Restaurant Food Cost Variance — Toast](https://pos.toasttab.com/blog/on-the-line/food-cost-variance)
- [Restaurant Inventory Management Guide — NetSuite](https://www.netsuite.com/portal/resource/articles/inventory-management/restaurant-inventory-management.shtml)
- [Restaurant Inventory Management Software — Apicbase](https://get.apicbase.com/restaurant-inventory-management-software/)
- [Why Offline-First Architecture Is No Longer Optional for POS Systems](https://medium.com/@alabeau/why-offline-first-architecture-is-no-longer-optional-for-pos-systems-15fd6edc133b)
- [Restaurant POS Systems for Multi-Location Operations](https://cloudrestaurantmanager.com/restaurant-pos-systems-for-multi-location-operations/)
- [Adisyo — Restoran Otomasyon Sistemi](https://adisyo.com/restoran-otomasyon-sistemi)
- [Simpra Suite — Adisyon programı ile restoran kârlılığı](https://simprasuite.com.tr/blog/adisyon-programi-ile-restoran-karliligi/)
- [robotPOS — Restoranda Yazarkasa (ÖKC) Entegrasyonu: 2026 Mevzuat Rehberi](https://www.robotpos.com/blog_new/restoranda-yazarkasa-okc-entegrasyonu-2026-mevzuat-rehberi)
- [GİB — Yeni Nesil Ödeme Kaydedici Cihaz SSS](https://ynokc.gib.gov.tr/Home/SSS)
