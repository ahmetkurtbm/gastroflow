/**
 * Offline kuyruk davranış testleri.
 *
 * Gerçek bir tarayıcıda ağ bağlantısını kesip test etmek bu ortamda mümkün
 * değil (kullanılan araç setinde ağ kısıtlama kontrolü yok). Bu yüzden asıl
 * garantiyi — "senkronizasyon başarısız olursa mutasyon kuyrukta kalır,
 * başarılı olursa bir daha denenmez, sıra korunur" — burada, gerçek IndexedDB
 * davranışını taklit eden `fake-indexeddb` ile kanıtlıyoruz. Tarayıcıdaki
 * online yol ayrıca uçtan uca doğrulandı (bkz. commit mesajı).
 */
import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/orders/actions", () => ({
  addOrderLine: vi.fn(),
  sendToKitchen: vi.fn(),
}));

const { addOrderLine, sendToKitchen } = await import("@/lib/orders/actions");
const { enqueueAddLine, enqueueSendToKitchen, listQueue, cancelQueuedMutation, drainQueue } =
  await import("./queue");

const BASE = { tenantId: "t1", orderId: "o1", userId: "u1" };

beforeEach(async () => {
  vi.clearAllMocks();
  // Her testten önce kuyruğu boşalt — testler arasında IndexedDB kalıcı.
  const leftover = await listQueue();
  for (const m of leftover) await cancelQueuedMutation(m.id);
});

describe("enqueue + listQueue", () => {
  it("eklenen mutasyon sırayla listelenir", async () => {
    const first = await enqueueAddLine({
      ...BASE,
      menuItemId: "m1",
      menuItemName: "Kola",
      quantity: 1,
      unitPrice: 30,
    });
    const second = await enqueueSendToKitchen(BASE);

    const queue = await listQueue();
    expect(queue.map((m) => m.id)).toEqual([first.id, second.id]);
  });

  it("iptal edilen mutasyon listeden düşer ve senkronize edilmeye çalışılmaz", async () => {
    const mutation = await enqueueAddLine({
      ...BASE,
      menuItemId: "m1",
      menuItemName: "Kola",
      quantity: 1,
      unitPrice: 30,
    });
    await cancelQueuedMutation(mutation.id);

    expect(await listQueue()).toHaveLength(0);

    await drainQueue();
    expect(addOrderLine).not.toHaveBeenCalled();
  });
});

describe("drainQueue — bağlantı kesikken", () => {
  it("senkron başarısız olursa mutasyon kuyrukta kalır", async () => {
    vi.mocked(addOrderLine).mockResolvedValue({ error: "Ağ hatası." });

    await enqueueAddLine({
      ...BASE,
      menuItemId: "m1",
      menuItemName: "Kola",
      quantity: 1,
      unitPrice: 30,
    });

    const { syncedCount } = await drainQueue();

    expect(syncedCount).toBe(0);
    expect(await listQueue()).toHaveLength(1);
  });

  it("bağlantı geri gelince kalan mutasyon otomatik senkronlanır", async () => {
    vi.mocked(addOrderLine).mockResolvedValueOnce({ error: "Ağ hatası." });

    await enqueueAddLine({
      ...BASE,
      menuItemId: "m1",
      menuItemName: "Kola",
      quantity: 1,
      unitPrice: 30,
    });

    await drainQueue(); // Başarısız — offline simülasyonu.
    expect(await listQueue()).toHaveLength(1);

    vi.mocked(addOrderLine).mockResolvedValue({ ok: true }); // "Bağlantı geldi."
    const { syncedCount } = await drainQueue();

    expect(syncedCount).toBe(1);
    expect(await listQueue()).toHaveLength(0);
  });
});

describe("drainQueue — sıra korunur", () => {
  it("bir ürün eklemesi başarısız olursa ondan sonraki 'mutfağa gönder' denenmez", async () => {
    // Bu, offline kuyruğun en kritik garantisi: ürünü eklemeden mutfağa
    // gönderme isteği çalıştırılamaz. Aksi hâlde henüz var olmayan bir
    // satırı "gönderilmiş" saymaya çalışırdık.
    vi.mocked(addOrderLine).mockResolvedValue({ error: "Ağ hatası." });

    await enqueueAddLine({
      ...BASE,
      menuItemId: "m1",
      menuItemName: "Kola",
      quantity: 1,
      unitPrice: 30,
    });
    await enqueueSendToKitchen(BASE);

    await drainQueue();

    expect(sendToKitchen).not.toHaveBeenCalled();
    expect(await listQueue()).toHaveLength(2);
  });

  it("ilk mutasyon başarılı olunca sıradaki işlenir", async () => {
    vi.mocked(addOrderLine).mockResolvedValue({ ok: true });
    vi.mocked(sendToKitchen).mockResolvedValue(undefined);

    await enqueueAddLine({
      ...BASE,
      menuItemId: "m1",
      menuItemName: "Kola",
      quantity: 1,
      unitPrice: 30,
    });
    await enqueueSendToKitchen(BASE);

    const { syncedCount } = await drainQueue();

    expect(syncedCount).toBe(2);
    expect(addOrderLine).toHaveBeenCalledTimes(1);
    expect(sendToKitchen).toHaveBeenCalledTimes(1);
    expect(await listQueue()).toHaveLength(0);
  });
});

describe("idempotency anahtarı", () => {
  it("her mutasyonun client_key'i (id) sunucuya iletiliyor", async () => {
    vi.mocked(addOrderLine).mockResolvedValue({ ok: true });

    const mutation = await enqueueAddLine({
      ...BASE,
      menuItemId: "m1",
      menuItemName: "Kola",
      quantity: 2,
      unitPrice: 30,
    });
    await drainQueue();

    const [, formData] = vi.mocked(addOrderLine).mock.calls[0]!;
    expect(formData.get("clientKey")).toBe(mutation.id);
    expect(formData.get("orderId")).toBe(BASE.orderId);
    expect(formData.get("menuItemId")).toBe("m1");
    expect(formData.get("quantity")).toBe("2");
  });
});
