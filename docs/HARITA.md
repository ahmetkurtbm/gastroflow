# GastroFlow — Sistem Haritası

Bu doküman, Faz 0-5'te inşa edilenlerin tamamının kavram haritası: hangi
ekranda ne var, hangi kod dosyasında yaşıyor, hangi veritabanı tablosuna
yazıyor, hangi fonksiyonlar çalışıyor, güvenlik nasıl sağlanıyor.

Genel plan/vizyon için [PLAN.md](./PLAN.md)'e bak — bu doküman "ne inşa
edildi", o doküman "neden ve ne inşa edilecek" sorusuna cevap veriyor.

---

## 1. Genel Mimari (30 saniyede)

```
Next.js 16 (App Router, TypeScript)
  ├─ Server Component'ler    → sayfayı ilk yüklemede veritabanından okur
  ├─ Server Action'lar       → "use server"; formlar buraya POST eder
  └─ Client Component'ler    → yalnızca etkileşim gereken yerlerde ("use client")

Supabase (Postgres + Auth + Realtime + Edge Functions)
  ├─ RLS (Row Level Security) → GERÇEK güvenlik sınırı, her tabloda
  ├─ Trigger'lar               → durum geçişi kuralları, denetim kaydı, bildirim üretimi
  └─ Edge Function             → arka plan işçisi (bildirim gönderimi)
```

**Kritik prensip:** Arayüzdeki her kontrol (buton gizleme, sayfa yönlendirme)
yalnızca KULLANICI DENEYİMİ içindir. Gerçek yetkilendirme HER ZAMAN
veritabanındaki RLS politikasında ve trigger'da yaşar. Bir rolü arayüzden
gizlemek, ona erişim vermez/almaz — bunu ayrıca RLS'te yazmak gerekir.

**Kod okuma sırası (bir özelliği anlamak için):**
1. `supabase/migrations/*.sql` → veri modeli + güvenlik kuralları (gerçek kaynak)
2. `src/lib/<alan>/queries.ts` → veritabanından OKUMA (Server Component'ler kullanır)
3. `src/lib/<alan>/actions.ts` → veritabanına YAZMA ("use server" fonksiyonlar)
4. `src/app/(app)/<ekran>/page.tsx` → Server Component, queries.ts'i çağırır
5. `src/app/(app)/<ekran>/*.tsx` (diğerleri) → "use client" formlar/etkileşim, actions.ts'i çağırır

---

## 2. Roller ve Genel Erişim

Roller: `owner` (patron), `manager` (müdür), `chef` (mutfak), `waiter` (garson),
`cashier` (kasa), `storekeeper` (depo), `accountant` (muhasebe).

Tanım: `supabase/migrations/20260731000001_foundation.sql` → `app_role` enum.

Rol, JWT'ye Supabase'in **custom access token hook**'uyla yazılıyor
(`custom_access_token_hook` fonksiyonu, `20260731000004_auth_hook.sql`),
kullanıcı bunu kendisi değiştiremez. Sunucu tarafında bu değer
`current_app_role()` fonksiyonuyla okunur (`foundation.sql`).

Arayüzdeki rol→sayfa haritası (yalnızca UX, güvenlik değil):
`src/lib/auth/access.ts` → `PATH_ACCESS`, `NAV_ITEMS`, `ROLE_HOME`, `ROLE_LABEL`.

Oturumdaki kullanıcıyı okumak için: `src/lib/auth/current-user.ts` →
`requireAppUser()` (korumalı sayfalarda çağrılır, oturum yoksa `/login`'e atar).

---

## 3. Veritabanı Tabloları (migration sırasıyla)

| Migration | Tablolar | Ne için |
|---|---|---|
| `0001_foundation` | — (tip + fonksiyon) | `app_role` enum, `current_tenant_id()`, `current_branch_id()`, `current_app_role()`, `is_manager()`, `is_owner()`, `set_updated_at()` |
| `0002_tenancy` | `tenants`, `branches`, `profiles`, `memberships` | Çok kiracılı temel: hangi kullanıcı hangi işletmede hangi rolle |
| `0003_audit` | `audit_log` | Değişiklik geçmişi — **append-only**, yalnızca `audit_trigger()` (SECURITY DEFINER) yazar |
| `0004_auth_hook` | — (fonksiyon) | `custom_access_token_hook` — JWT'ye tenant/branch/role damgalar |
| `0006_catalog` | `categories`, `menu_items`, `menu_prices` | Menü kataloğu, şube bazlı tarihli fiyat |
| `0007_recipes` | `inventory_items`, `item_unit_conversions`, `recipes`, `recipe_versions`, `recipe_lines` | Hammadde, birim dönüşüm, reçete (versiyonlu) |
| `0008_orders` | `areas`, `tables`, `orders`, `order_lines`, `payments` | Salon/masa, adisyon, sipariş satırı, ödeme |
| `0010_stock` | `stock_locations`, `stock_movements`, `par_levels` + `v_stock_balance`, `v_low_stock` | **Append-only stok defteri** — bakiye hiçbir yerde ayrı saklanmıyor, `SUM(quantity)`'den türüyor |
| `0801_0001_modifiers` | `modifier_groups`, `modifiers`, `order_line_modifiers` | Ürün seçenekleri (boyut, ekstra vb.) |
| `0801_0003_line_discounts` | `line_discounts` | İkram/iskonto onay akışı |
| `0801_0004_cash_sessions` | `cash_sessions` + `payments.cash_session_id` | Vardiya/kasa oturumu, gün sonu |
| `0801_0005_waste` | — (`stock_movements.waste_reason` kolonu) | Sebep kodlu zayiat |
| `0801_0006_purchasing` | `suppliers`, `supplier_items`, `purchase_orders`, `po_lines` | Tedarik zinciri |
| `0801_0007_notifications` | `notification_rules`, `notification_outbox`, `notification_log` | Bildirim/mail motoru (outbox deseni) |

**Stok defterinin özel statüsü:** `stock_movements` tablosuna yalnızca
`INSERT` yapılabilir — `UPDATE`/`DELETE` hem yetkiden hem de
`stock_movements_no_update_delete` trigger'ından (append-only zorlaması)
engellidir. Zayiat, transfer, satış düşümü, sayım farkı, satın alma girişi
— hepsi bu TEK tabloya farklı `movement_type` ile yazılır. Anlık bakiye
`v_stock_balance` görünümünden (`SUM(quantity)`) okunur, hiçbir yerde ayrı
bir sayı olarak saklanmaz.

---

## 4. Ekran Haritası

Her ekran için: **Route → Dosyalar → Ne yapar → Okuma/Yazma → Tablolar**.

### 4.1 `/pos` — Sipariş Alma (garson)

- **Dosyalar:**
  - `src/app/(app)/pos/page.tsx` — kat planı (masa listesi + açık adisyon özeti)
  - `src/app/(app)/pos/masa/[tableId]/page.tsx` — bir masanın sipariş ekranı
  - `.../order-screen.tsx` (client) — ürün ızgarası + sepet düzeni
  - `.../cart.tsx` (client) — sepet, satır fiyatları, "Mutfağa gönder"
  - `.../modifier-picker.tsx` (client) — ürün seçenek paneli (modal)
  - `.../discount-request-form.tsx` (client) — ikram/indirim isteği paneli
  - `.../add-item-button.tsx` (client) — ürün kartı
- **Okuma:** `src/lib/orders/queries.ts` → `loadFloorPlan()`, `loadSellableMenu()`, `loadOpenOrderForTable()`
- **Yazma:** `src/lib/orders/actions.ts` → `openTable()`, `addOrderLine()`, `removeOrderLine()`, `sendToKitchen()`
  `src/lib/orders/actions.ts` → `requestLineDiscount()` (ikram/indirim isteği)
- **Yazdığı tablolar:** `orders`, `order_lines`, `order_line_modifiers`, `line_discounts`
- **Saf hesaplama:** `src/lib/orders/types.ts` → `effectiveUnitPrice()`, `lineTotal()`, `applyLineDiscount()`, `pickActiveDiscount()` (client+server ortak, sunucu bağımlılığı yok — bkz. §6)
- **Offline:** `src/lib/offline/*` (aşağıda §5)

### 4.2 `/orders` — Sipariş Takip (herkes, rol filtreli)

- **Dosyalar:** `page.tsx` (server) + `orders-board.tsx` (client, realtime)
- **Okuma:** `loadOpenOrdersTracking()` (`src/lib/orders/queries.ts`)
- **Realtime:** `orders`, `order_lines`, `line_discounts` tablolarını dinler (Supabase Realtime kanalı, client tarafında `createClient()` ile — `src/lib/supabase/client.ts`)
- **Neden var:** garson/müdür masaya gitmeden hangi adisyonun ne kadar süredir açık, hangi ürünün geciktiğini görür

### 4.3 `/kds` — Mutfak Ekranı

- **Dosyalar:** `page.tsx` + `kds-board.tsx` (client, realtime)
- **Okuma:** `loadKitchenQueue()` — yalnızca `sent`/`preparing`/`ready` durumundaki satırlar
- **Yazma:** `advanceKitchenTicket()` (`src/lib/orders/actions.ts`) — `sent→preparing→ready→served` sırasını atlatmaz (`KITCHEN_TRANSITIONS` sabiti + `.eq("status", input.from)` yarış koruması)
- **Realtime:** `order_lines` tablosunu dinler

### 4.4 `/cash` — Kasa

- **Dosyalar:**
  - `page.tsx` — açık adisyon listesi + `cash-session-panel.tsx`
  - `cash-session-panel.tsx` (client) — vardiya aç/kapat, gün sonu özeti
  - `[orderId]/page.tsx` — ödeme ekranı
  - `[orderId]/payment-form.tsx` (client) — tutar/yöntem, hızlı bölüşüm
- **Okuma:** `src/lib/cash/queries.ts` → `loadLatestCashSession()`, `loadOpenOrdersForCash()`, `loadOrderForPayment()`
- **Yazma:** `src/lib/cash/actions.ts` → `openCashSession()`, `closeCashSession()`, `recordPayment()`
- **Yazdığı tablolar:** `cash_sessions`, `payments`
- **Kritik kural:** `recordPayment()` önce o şubede **açık bir kasa oturumu var mı** kontrol eder — yoksa ödeme reddedilir ("Önce kasa oturumu (vardiya) açmalısın"). Her ödeme `payments.cash_session_id` ile o oturuma bağlanır.
- **Ödeme tamamlanınca:** `depleteOrderStock()` (`src/lib/inventory/depletion.ts`) tetiklenir → reçeteye göre otomatik stok düşümü (bkz. §4.8)

### 4.5 `/approvals` — İkram/İskonto Onayları (müdür/patron)

- **Dosyalar:** `page.tsx` + `approvals-list.tsx` (client)
- **Okuma:** `loadPendingDiscounts()` (`src/lib/orders/queries.ts`)
- **Yazma:** `decideLineDiscount()` (`src/lib/orders/actions.ts`) — `approved`/`rejected`
- **Kritik kural:** Müdür/patron **kendi isteğini** anında onaylanmış açar (RLS'te zorunlu), diğer roller `pending` açar ve buradan onay bekler.

### 4.6 `/inventory` — Stok (ana ekran + 4 alt ekran)

- **Ana ekran** (`page.tsx`): anlık bakiye tablosu + kritik stok listesi + son hareketler
  - Okuma: `src/lib/inventory/queries.ts` → `loadStockOverview()`, `loadLowStock()`, `loadRecentMovements()`
- **`/inventory/zayiat`** — sebep kodlu zayiat girişi
  - `waste-form.tsx` (client) → `recordWaste()` (`src/lib/inventory/actions.ts`) → `stock_movements` (`movement_type='waste'`, `waste_reason` dolu)
- **`/inventory/transfer`** — depolar arası transfer
  - `transfer-form.tsx` (client) → `recordTransfer()` → **tek atomik INSERT**'te iki satır yazar: `transfer_out` (kaynak, eksi) + `transfer_in` (hedef, artı), aynı `reference_id`'yi farklı `reference_type` ile paylaşır
- **`/inventory/sayim`** — körleme fiziksel sayım
  - Lokasyon seç → `count-form.tsx` (client, mevcut bakiyeyi GÖSTERMEZ) → `recordCount()` → sunucu fark hesaplar → `stock_movements` (`movement_type='count_adjustment'`)
- **`/inventory/varyans`** — teorik/fiili varyans raporu
  - `loadVarianceReport()` — ayrı bir hesap YOK: "teorik tüketim" zaten `sale_out` toplamı, "sayım farkı" zaten `count_adjustment` toplamı; rapor ikisini yan yana koyup `|%|` büyüklüğüne göre sıralıyor

### 4.7 `/purchasing` — Tedarik Zinciri (4 ekran)

- **Ana ekran:** kritik stoktan otomatik sipariş önerisi + sipariş listesi
  - Okuma: `src/lib/purchasing/queries.ts` → `loadReorderSuggestions()`, `loadPurchaseOrders()`, `loadSuppliers()`
- **`/purchasing/tedarikciler`** — tedarikçi kartları + `[supplierId]` altında fiyat listesi
  - Yazma: `src/lib/purchasing/actions.ts` → `addSupplier()`, `addSupplierItem()`
- **`/purchasing/yeni`** — yeni sipariş (tedarikçi seç → fiyat listesinden miktar gir)
  - Yazma: `createPurchaseOrder()` — her zaman `pending_approval` açılır (müdür/patron dahil — burada gerçek para taahhüdü var, ikram akışındaki gibi "kendi kendini onaylama" YOK)
- **`/purchasing/[poId]`** — sipariş detayı: onay/red/iptal + mal kabul
  - Yazma: `decidePurchaseOrder()`, `cancelPurchaseOrder()`, `receiveGoods()`
  - `receiveGoods()` → `po_lines.received_quantity` günceller + `stock_movements`'a `purchase_in` yazar
- **Durum makinesi merkezi tek yerde:** `purchase_orders_guard_transition()` trigger'ı (`0801_0006_purchasing.sql`) — hangi rolden hangi duruma geçilebileceğini DB'de zorluyor, istemci ne gönderirse göndersin atlanamaz.

### 4.8 Stok düşümü (görünür bir ekran değil, arka plan)

- **Dosya:** `src/lib/inventory/depletion.ts` → `depleteOrderStock(orderId)`
- **Ne zaman çalışır:** `recordPayment()` bir adisyonu tam ödenmiş görünce (`src/lib/cash/actions.ts` içinden çağrılır)
- **Ne yapar:** Adisyondaki her satırın DONDURULMUŞ reçete versiyonunu (`order_lines.recipe_version_id`) recursive olarak patlatır (yarı mamul → hammadde), fire yüzdesini uygular, `stock_movements`'a `sale_out` yazar
- **Idempotency:** `(reference_type='order_line', reference_id, inventory_item_id)` üçlüsü unique — aynı ödeme iki kez tetiklense bile çift düşüm imkânsız
- **`service_role` kullanır** (`createServiceRoleClient()`, `src/lib/supabase/server.ts`) — çünkü bir garson/kasiyerin doğrudan yetkisi olmayan bir yan etki

### 4.9 `/recipes` — Reçete & Maliyet

- Dosyalar: `page.tsx` (liste), `[id]/page.tsx` (detay+maliyet), `[id]/duzenle/*` (satır ekleme), `yeni/*` (yeni reçete), `malzemeler/*` (hammadde CRUD)
- Reçete motoru: `src/core/recipe.ts` (saf TS, DB'siz test edilebilir) — birim maliyet, food cost %, recursive patlatma
- Birim dönüşüm: `src/core/units.ts`
- Para: `src/core/money.ts` — `numeric(14,4)`, float YOK

### 4.10 `/settings` — Ayarlar (yalnızca patron)

- **Dosyalar:** `page.tsx` + `rule-row.tsx` (client, kural düzenleme) + `queue-panel.tsx` (client, "Kuyruğu şimdi işle")
- **Okuma:** `src/lib/notifications/queries.ts` → `loadNotificationRules()`, `loadRecentOutbox()`, `loadRecentNotificationLog()`
- **Yazma:** `src/lib/notifications/actions.ts` → `updateNotificationRule()` (kural kaydet), `processNotificationQueue()` (Edge Function'ı manuel tetikler)

### 4.11 `/audit` — Loglar (yalnızca patron)

- `audit_log` tablosunu gösterir — `audit_trigger()` tarafından otomatik dolduruluyor, ekranın kendi yazma mantığı yok

### 4.12 `/reports` — Genel Bakış (henüz temel; Faz 6'da genişleyecek)

- Şu an: işletme adı, şube/personel sayacı, rol dağılımı, oturum bilgisi
- Faz 6'da eklenecek: menü mühendisliği, saatlik yoğunluk, personel performansı, muhasebe dışa aktarımı (bkz. §7)

---

## 5. Offline Kuyruk (POS'un altındaki katman)

- **Dosyalar:** `src/lib/offline/queue.ts` (IndexedDB kuyruk), `use-offline-order.ts` (React hook), `types.ts`
- **Nasıl çalışır:** POS'ta "ürün ekle"/"mutfağa gönder" önce IndexedDB'ye yazılır (optimistic UI), bağlantı varsa hemen `addOrderLine()`/`sendToKitchen()`'a gönderilir; yoksa bağlantı gelince FIFO sırayla tekrar denenir
- **Çift kayıt imkânsız:** her mutasyon `client_key` (UUID) taşır, sunucu `(order_id, client_key)` unique kısıtına çarpınca `23505`'i "zaten yapıldı" sayar, hata döndürmez — kuyruk sonsuza dek denemeye devam etmez

---

## 6. Ortak Desenler (birden çok ekranda tekrar eden)

### 6.1 "Onay her zaman ayrı bir adım" deseni

İki farklı onay akışı var, bilinçli olarak FARKLI davranıyorlar:

| | İkram/İskonto (`line_discounts`) | Satın Alma (`purchase_orders`) |
|---|---|---|
| Müdür/patron kendi isteğini açarsa | Anında **onaylanmış** | Yine de **onay bekliyor** |
| Neden | Küçük, anlık, hizmet kalitesi kararı | Gerçek para taahhüdü — ayrı onay izi her zaman olmalı |
| Kod | `requestLineDiscount()` (`orders/actions.ts`) | `buildPurchaseOrder()` (`purchasing/actions.ts`) |

### 6.2 Durum geçişi koruması DB'de, tek yerde

Her onay/durum akışının (ikram, satın alma, kasa oturumu, mutfak bileti)
"hangi rol hangi durumdan hangi duruma geçebilir" kuralı bir
**trigger'da** yaşıyor, RLS'te DEĞİL — çünkü RLS `OLD` satırı (önceki
durumu) kolayca göremiyor. RLS yalnızca "bu role bu tabloya dokunabilir mi"
sorusuna bakıyor; trigger "bu geçiş şu an geçerli mi" sorusuna bakıyor.

Örnekler: `purchase_orders_guard_transition()`, `line_discounts_stamp_decision()`,
`cash_sessions_stamp_close()`, `po_lines_guard()`.

### 6.3 Fiyat/reçete DONDURMA deseni

Bir adisyon satırı açıldığı anda menü fiyatının, modifier fiyatının,
reçete versiyonunun **kopyasını** alır (`order_lines.unit_price`,
`order_line_modifiers.price_delta`, `order_lines.recipe_version_id`).
Sonradan menü fiyatı değişse bile dün kesilen adisyon değişmez. Aynı
mantık satın alma tarafında da var: `po_lines.unit_price`
`supplier_items.price`'tan dondurulur.

### 6.4 SECURITY DEFINER + "yazma yetkisi hiç kimseye yok" deseni

`audit_log` ve `notification_outbox`/`notification_log` tabloları — hiçbir
kullanıcı rolü bu tablolara doğrudan `INSERT` yapamaz (grant bile yok).
Tek yazan, tabloyu oluşturan migration'daki `SECURITY DEFINER` fonksiyon
(`audit_trigger()`, `enqueue_notification()`). Uygulama kodu bu satırı
yazmayı **unutamaz** çünkü zaten hiç yazmıyor — olay kendiliğinden,
veritabanı seviyesinde doğuyor.

### 6.5 Client/Server sınırı: `types.ts` ayrımı

`src/lib/orders/types.ts` bilerek `queries.ts`'den ayrı: `queries.ts`
`@/lib/supabase/server`'ı (dolayısıyla `next/headers`'ı) import ediyor,
yani yalnızca Server Component'lerden kullanılabilir. `cart.tsx` gibi bir
Client Component fiyat hesaplama fonksiyonuna ihtiyaç duyunca `types.ts`'ten
import eder — sunucu bağımlılığı client paketine hiç sızmaz.

### 6.6 Realtime abonelik deseni

`kds-board.tsx`, `orders-board.tsx` gibi client bileşenler
`src/lib/supabase/client.ts`'teki `createClient()` ile bir Supabase
Realtime kanalı açar, ilgili tabloyu (`order_lines`, `orders`,
`line_discounts`, `cash_sessions`) dinler, her olayda sunucudan taze
liste çeker (satır satır yamamak yerine — daha az hataya açık).
**Önemli:** bir tablo `supabase_realtime` publication'ına EKLİ olmadıkça
hiçbir olay gelmez (bkz. `0801_0002_orders_realtime.sql`, `0801_0004`,
`0801_0007` — her yeni realtime tablo bu publication'a eklenmek zorunda,
unutulursa panel sessizce hiç güncellenmez — bu gerçekten yaşandı, bkz.
`orders` tablosu hatası).

---

## 7. Güvenlik Modeli — Özet Liste

1. **Her tabloda RLS + FORCE ROW LEVEL SECURITY** — politika yazılmamış tabloya kimse erişemez (deny-by-default).
2. **Tenant/branch/role JWT'den** — `current_tenant_id()`, `current_branch_id()`, `current_app_role()`; istemciden gelen hiçbir parametreye güvenilmez.
3. **Branch kısıtı deseni:** çoğu yazma politikası `is_manager() OR branch_id = current_branch_id()` — müdür/patron tenant genelinde, diğer roller yalnızca kendi şubesinde.
4. **`service_role` yalnızca sunucuda, yalnızca gerçek sistem yan etkilerinde** (`createServiceRoleClient()`) — stok düşümü, bildirim worker'ı. İstemci koduna asla girmez.
5. **Tüm yazmalar Server Action üzerinden, `zod` ile doğrulanır** — `src/lib/*/actions.ts` dosyalarındaki her fonksiyonun başında bir `z.object({...}).parse(...)` var.
6. **Fiyat/reçete dondurma** (bkz. §6.3) — geçmiş kayıtlar sonradan değişmez.
7. **Append-only ledger** (`stock_movements`, `audit_log`) — `UPDATE`/`DELETE` hem yetkiden hem trigger'dan engelli.
8. **Idempotency her kritik yazımda** — `client_key` (adisyon/satır/ödeme), `(reference_type, reference_id, item)` (stok hareketi), dedup penceresi (bildirim).
9. **Durum geçişi trigger'da merkezi** (bkz. §6.2) — istemci hangi durumu göndermeye çalışırsa çalışsın atlanamaz.
10. **SECURITY DEFINER + grant yok** (bkz. §6.4) — denetim ve bildirim kayıtları uygulamadan bağımsız, unutulamaz.
11. **pgTAP negatif testleri** (`supabase/tests/*.sql`) — her yeni tablo için en az bir "başka tenant/rol bunu göremez/yazamaz" testi. 11 dosya, ~130+ ayrı iddia.

---

## 8. Hızlı Dosya İndeksi

```
supabase/
  migrations/*.sql        ← şema + RLS + trigger (gerçek kaynak)
  tests/*.sql              ← pgTAP negatif testleri
  functions/
    process-notifications/ ← bildirim worker'ı (Deno, service_role)

src/core/                  ← saf iş mantığı, DB'siz (money, units, recipe)

src/lib/
  auth/                     access.ts (rol→sayfa), current-user.ts (oturum)
  orders/                   queries.ts, actions.ts, types.ts (POS/KDS/sipariş)
  cash/                     queries.ts, actions.ts (kasa/ödeme)
  inventory/                queries.ts, actions.ts, depletion.ts (stok)
  purchasing/               queries.ts, actions.ts (tedarik)
  notifications/            queries.ts, actions.ts (bildirim)
  offline/                  queue.ts, use-offline-order.ts (çevrimdışı kuyruk)
  supabase/                 client.ts (tarayıcı), server.ts (sunucu + service_role)

src/app/(app)/<ekran>/
  page.tsx                  ← Server Component, veriyi queries.ts'ten okur
  *.tsx (diğer)              ← "use client", actions.ts'i çağıran formlar
```

---

## 9. Uçtan Uca Test Senaryoları

Aşağıdaki senaryolar bu oturumda tarayıcıda gerçekten çalıştırıldı (✅) ya
da mantıksal olarak tanımlı ama henüz manuel doğrulanmadı (◻). Her senaryo
bir **iş akışını** baştan sona test eder — tek bir ekranı değil. Format:
Ön koşul → Adımlar → Beklenen sonuç → Hangi tabloya/güvenlik kuralına
dokunuyor. Regresyon testi olarak veya yeni birine sistemi anlatırken
kullanılabilir.

### S1 — Sipariş → Modifier → Mutfak → Ödeme → Otomatik Stok Düşümü ✅

**Amaç:** POS'tan kasaya, tüm zincirin fiyat ve stok tutarlılığını doğrulamak.

1. Garson `/pos`'ta bir masa açar (`openTable()` → `orders` satırı).
2. "Margarita Pizza" seçilir; modifier grubu varsa (`Boyut: Büyük boy +25₺`)
   panel açılır, seçim yapılır → `addOrderLine()` fiyatı/adı **veritabanından
   okuyup dondurarak** `order_lines` + `order_line_modifiers`'a yazar
   (istemciden gelen fiyata güvenilmez — bkz. §6.3).
3. "Mutfağa gönder" → `sendToKitchen()` satırları `pending→sent` yapar.
4. `/kds`'de bilet **modifier adıyla birlikte** görünür (mutfak boyu bilmeli).
5. Mutfak sırayı ilerletir (`advanceKitchenTicket`) → `sent→preparing→ready→served`.
6. Kasada `recordPayment()` çağrılır; tutar tam ödenince adisyon `closed`
   olur ve `depleteOrderStock()` tetiklenir → reçete patlatılıp
   `stock_movements`'a `sale_out` yazılır.
7. `/inventory`'de ilgili hammaddelerin bakiyesi düşmüş görünür.

**Beklenen:** Her adımda gösterilen tutar birbirini tutar (modifier farkı
dahil); ödeme kapanmadan stok DÜŞMEZ; aynı ödeme ikinci kez tetiklenirse
(`23505` idempotency) stok ikinci kez düşmez.

### S2 — İkram İsteği: Garson İster, Fiyat Değişmez, Patron Onaylar ✅

1. Garson sepette bir satırda "İkram/İndirim" → %50 indirim, gerekçe girer
   → `requestLineDiscount()` satırı **`pending`** açar (`line_discounts`).
2. Sepette/`/orders`'ta o satırın tutarı **DEĞİŞMEZ** — yalnızca "onay
   bekliyor" etiketi görünür (bkz. §6.1: onay olmadan fiyat asla düşmez).
3. Patron `/approvals`'ta isteği görür (`loadPendingDiscounts()`), Onayla.
4. Aynı satırın fiyatı artık POS/`/orders`/kasada **tutarlı şekilde**
   indirimli görünür (`lineTotal()` tek bir kaynaktan hesaplanıyor).
5. Kasada ödeme alınır, toplam indirimli tutarla kapanır.

**Güvenlik kontrolü:** Garson kendi isteğini `approved` olarak açmaya
çalışsa RLS `42501` ile reddeder (`line_discounts_insert` politikası).

### S3 — Vardiya: Oturum Açmadan Ödeme Alınamaz ✅

1. Kasiyer `/cash`'e girer, açık oturum yoksa yalnızca "Kasa oturumu aç"
   formu görünür (adisyon listesi bilerek gizli).
2. Başlangıç bozukluğu girilip oturum açılır (`cash_sessions`, `status=open`).
3. Bir ödeme alınır → `recordPayment()` önce açık oturum var mı kontrol
   eder, varsa `payments.cash_session_id` o oturuma bağlanır.
4. "Günü kapat" → sayılan nakit girilir → beklenen (`opening_float` +
   nakit ödemeler) ile fark **anlık** hesaplanıp gösterilir.
5. Kapanış sonrası özet, bir sonraki oturum açılana kadar "son gün sonu
   raporu" olarak sayfa üstünde kalır.

**Güvenlik kontrolü:** Aynı şubede ikinci açık oturum açmaya çalışmak
`23505` ile reddedilir (`cash_sessions_one_open_per_branch` unique index).

### S4 — Zayiat → Bakiye Düşer → Varyans Raporunda "Açıklanmış" Görünür ✅

1. `/inventory/zayiat`'ta sebep kodlu (ör. "Bozulma") bir kayıt açılır →
   `stock_movements` (`movement_type=waste`, `waste_reason` dolu).
2. `/inventory`'de bakiye anında düşer.
3. `/inventory/varyans`'ta bu ürünün "Kayıtlı zayiat" sütunu bu miktarı
   gösterir ve "Sayım farkı" **0** kalır — çünkü kayıp zaten AÇIKLANMIŞ.

**Kıyasla:** Aynı ürün için `/inventory/sayim`'de fiziksel sayımda ekstra
bir eksiklik bulunursa (yani ledger'ın öngördüğünden daha az çıkarsa),
`count_adjustment` negatif yazılır ve varyans raporunda **AÇIKLANAMAYAN**
kayıp olarak, büyük `|%|` ile listenin başına çıkar (bu oturumda
Mozzarella'da 1,2 kg'lık bilinçli fark yaratılıp %-266 ile doğrulandı).

### S5 — Depolar Arası Transfer: Tek İşlemde İki Bacak ✅

1. `/inventory/transfer`'da "Ana Depo → Mutfak", 2 kg Mozzarella.
2. `recordTransfer()` **tek atomik INSERT**'te iki satır yazar:
   `transfer_out` (Ana Depo, -2) ve `transfer_in` (Mutfak, +2).
3. Ana Depo bakiyesi 2 kg azalır, Mutfak bakiyesi 2 kg artar — toplam
   sistemdeki miktar değişmez (ledger'ın temel iddiası: hiçbir hareket
   miktarı yaratmaz/yok etmez, yalnızca taşır).

**Neden atomik önemli:** İki ayrı INSERT olsaydı, ikincisi başarısız
olursa mal "kaybolmuş" görünürdü (kaynaktan düştü, hedefe girmedi).

### S6 — Satın Alma: Sipariş → Onay → Kısmi Mal Kabul ✅

1. `/purchasing/tedarikciler`'da tedarikçi + fiyat listesi eklenir.
2. `/purchasing/yeni`'de tedarikçi seçilip miktar girilir →
   `createPurchaseOrder()` **her zaman** `pending_approval` açar (patron
   dahil — bkz. §6.1, burada gerçek para taahhüdü var).
3. Patron `/purchasing/[poId]`'de Onayla → `purchase_orders_guard_transition()`
   trigger'ı `pending_approval→approved` geçişini yalnızca `is_manager()`
   ise kabul eder, `decided_by`/`decided_at`'ı otomatik damgalar.
4. Mal kabul formunda sipariş edilenden **az** bir miktar girilir (50 kg
   sipariş, 48 kg geldi) → `receiveGoods()` `po_lines.received_quantity`'yi
   yazar, `stock_movements`'a yalnızca **gerçekten gelen** miktarı
   (`purchase_in`, 48 kg) yazar, sipariş `received` olur.
5. `/inventory`'de bakiye tam 48 kg artmış görünür (50 değil).

**Güvenlik kontrolü:** Onaylanmış bir siparişe yeni satır eklenemez
(`po_lines_guard()` trigger'ı `status='pending_approval'` şartı arar);
onay bekleyen bir sipariş doğrudan `received`'e çekilemez.

### S7 — Bildirim: Gerçek Bir Olay, Uçtan Uca Kuyruk ✅

1. `/purchasing/yeni`'de bir sipariş oluşturulur (S6, adım 2).
2. `purchase_orders_notify_events()` trigger'ı arka planda **otomatik**
   `notification_outbox`'a `approval_pending` satırı yazar — uygulama
   kodu bunu hiç bilmez, tetiklemez (bkz. §6.4).
3. `/settings`'te "Kuyruğu şimdi işle" tıklanır → Edge Function
   (`process-notifications`) kuyruktaki satırı alır, `notification_rules`
   (ya da varsayılan roller) üzerinden alıcıyı çözer (`owner`/`manager`),
   `auth.admin.getUserById` ile e-postayı bulur.
4. `notification_log`'a "gönderilmiş gibi" kayıt düşer: doğru e-posta,
   doğru rol, Türkçe başlık/gövde ("Satın alma siparişi onay bekliyor").

**Not:** Gerçek mail gitmiyor (kullanıcı tercihiyle bilinçli mock). Şema/trigger
altyapısı tam; gerçek gönderim eklenince değişecek TEK yer Edge
Function'ın içi.

### S8 — Kritik/Negatif Stok Bildirimi (◻ manuel doğrulanmadı, pgTAP'te doğrulandı)

1. Bir `par_levels.reorder_point` tanımlı ürün için bakiye eşiğin altına
   düşecek bir hareket yazılır (satış, zayiat, sayım — fark etmez).
2. `notify_stock_thresholds()` trigger'ı otomatik `low_stock` kuyruğa
   girer (aynı ürün+lokasyon 24 saat içinde tekrar düşerse **dedup**
   sayesinde ikinci kez girmez — `notification_outbox_dedup_idx`).
3. Bakiye 0'ın altına inerse (`negative_stock`) — bu daha acil bir
   anormallik sinyali, ayrı bir olay tipiyle ayrı kuyruğa girer.

**Test durumu:** `supabase/tests/10_notifications_test.sql`'de 13 pgTAP
iddiasıyla doğrulandı (dedup dahil); tarayıcıda henüz canlı stok
düşürülerek gösterilmedi.

### S9 — Çok Kiracılı İzolasyon (her modülde pgTAP ile doğrulandı, ◻ tarayıcıda değil)

Her yeni tablo için tekrarlanan iddia: *"Tenant A'nın kullanıcısı Tenant
B'nin hiçbir satırını göremez/yazamaz."* Bu, tek tek tarayıcıda
gösterilebilecek bir şey değil (ikinci bir gerçek tenant/kullanıcı
gerektirir) — bunun yerine **her migration'ın pgTAP dosyasında** izole bir
test tenant'ı (`e0000000...`, `a0000000...` gibi sahte UUID'ler) kurulup
doğrulanıyor. 11 test dosyası, hepsinde en az bir izolasyon iddiası var.

### S10 — Realtime Kopukluğu Regresyon Senaryosu (bu oturumda gerçek bir hatanın hikâyesi)

Bu bir "test senaryosu"ndan çok, **neden bu kontrolü yapman gerektiğinin
kanıtı:** `/orders` panosu ilk yazıldığında hiç canlı güncellenmiyordu.
Kök neden: `orders` tablosu `supabase_realtime` publication'ına eklenmemişti
(yalnızca `order_lines` ekliydi, KDS onu kullandığı için fark edilmemişti).
**Regresyon testi:** yeni bir realtime panel eklerken, iki tarayıcı
sekmesinde aynı ekranı aç, birinde bir mutasyon yap, diğerinde SAYFAYI
YENİLEMEDEN güncellenip güncellenmediğini gözle doğrula — pgTAP bunu
yakalayamaz (RLS doğru olsa bile publication eksik olabilir).

---

## 10. Faz 6'ya Geçmeden Önce Bilinmesi Gerekenler

Faz 6 (Raporlar + Patron Mobil) şunlara dayanacak:
- **Zaten var olan veri:** `stock_movements` (varyans/maliyet raporu için),
  `payments`+`cash_sessions` (ciro/gün sonu için), `order_lines` (menü
  mühendisliği için — hangi ürün ne kadar satıyor, kâr marjı ne)
- **Henüz yok, Faz 6'da eklenecek:** materialized view'lar / günlük
  agregatlar (performans için — her rapor sorgusu ham tablodan
  hesaplamak yerine), `/m` mobil panel route'u, muhasebe CSV export
- **Zaten hazır altyapı:** bildirim motoru (Faz 5) — "yüksek varyans"
  gibi rapor-tetiklemeli bildirimler için `enqueue_notification()`
  doğrudan kullanılabilir, yeni bir mekanizma gerekmiyor

---

## 11. Faz 7 — Sertleştirme notları

**RLS politika hijyeni** (`supabase/migrations/20260801000008_rls_policy_hygiene.sql`):
24 tabloda tek `FOR ALL` yazma politikası, ayrı `SELECT` politikasıyla
çakışıp Supabase advisor'da "multiple permissive policies" (performans WARN)
üretiyordu. Her tablo `_insert`/`_update`/`_delete` olarak üçe bölündü —
davranış birebir korunarak (mevcut USING/WITH CHECK ifadeleri `pg_policies`'ten
alınarak). 11 pgTAP test dosyasının tamamı canlı projede yeniden çalıştırılıp
regresyon olmadığı doğrulandı.

**Yük testi** (`scripts/load-test.mjs`, `npm run load-test`): Next.js
katmanını atlayıp doğrudan PostgREST'e karşı eşzamanlı POS trafiği (N garson
× M tur: adisyon aç → ürün ekle → mutfağa gönder → öde → kapat) simüle eder.
Kendi tek kullanımlık kiracısını yaratır, sonunda siler — paylaşımlı canlı
DB'yi kirletmez (pgTAP testlerindeki bilinen sorunun aksine).

İlk çalıştırmada **gerçek bir yarış koşulu buldu**: `orders_assign_number()`
tetikleyicisi (`SELECT MAX(order_no)+1` → `INSERT`) klasik bir TOCTOU
yarışıydı — 15 garson aynı anda farklı masalarda adisyon açınca %40 oranında
`23505` (unique_violation) üretiyordu. Daha vahimi: `openTable` eylemi bu
hatayı her zaman "client_key zaten gönderilmiş" sanıp kullanıcıyı sessizce
POS ekranına yönlendiriyordu — order_no çakışmasında ise adisyon **hiç
oluşmamış** oluyordu, garson boş bir ekrana düşüyordu.

Düzeltme (`20260802000001_fix_order_number_race.sql`): numaralandırma artık
şube başına bir `pg_advisory_xact_lock` ile serileştiriliyor — transaction
sonunda otomatik serbest kalır, ek tablo/satır kilidi ya da yetki gerektirmez.
Düzeltme sonrası yük testi: 60/60 adisyon, 0 çakışma, %0 hata oranı.

**Playwright e2e** (`e2e/`, `npm run test:e2e`): pgTAP'ın kanıtladığı RLS
davranışının gerçek tarayıcıda/gerçek HTTP isteğinde de geçerli olduğunu
doğrulayan bağımsız bir katman. `global-setup.ts` her çalıştırmada iki
bağımsız tek-kullanımlık kiracı kurar (`global-teardown.ts` sonunda siler);
üç senaryo: adisyon yaşam döngüsü (masa aç→ürün ekle→mutfağa gönder→öde→kapat),
kiracı izolasyonu (bir işletme diğerinin masasını salon ekranında göremez),
ve PWA soğuk-başlangıç offline (aşağıya bak). Next dev sunucusu port 3100'de
çalışır (3000 bu makinede başka bir yerel serviste kullanılıyor).

**PWA app-shell / service worker** (`public/sw.js`, `public/manifest.webmanifest`):
"Soğuk başlangıç" offline desteğinin bir kısmını kapatıyor — bkz. AGENTS.md
"Offline kuyruk — kapsam sınırı" güncellemesi. Strateji: `_next/static/*`
(içerik-adresli, değişmez) cache-first; sayfa navigasyonları ve RSC veri
istekleri ağ-öncelikli-önbellek-yedekli (önce ağ, başarısız olursa daha önce
aynı URL'den önbelleğe yazılmış yanıt, o da yoksa `public/offline.html`).
Server Action'lar (POST) hiç dokunulmuyor — offline mutasyon dayanıklılığı
hâlâ `src/lib/offline/queue.ts`'nin işi, bu ikisi birbirini tamamlıyor:
sayfa service worker'dan, mutasyon IndexedDB kuyruğundan gelir. Kanıt:
`e2e/offline-cold-start.spec.ts` (aç → önbellekle → çevrimdışına geç →
tam sayfa yenile → hâlâ render olduğunu doğrula).
