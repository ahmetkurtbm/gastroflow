import { recordCount } from "@/lib/inventory/actions";
import { addOrderLine, sendToKitchen } from "@/lib/orders/actions";

import { withStore } from "./db";
import type { QueuedMutation, SyncOutcome } from "./types";

/**
 * Sipariş ve sayım ekranlarının paylaştığı offline kuyruk. Açık bir ekranda
 * bağlantı kesildiğinde mutasyonları IndexedDB'de saklar ve mevcut Server
 * Action'ları çağırarak senkronlar. Yeni sayfaya gitmek kapsam dışıdır
 * (soğuk başlangıç için bkz. public/sw.js).
 */

async function put(mutation: QueuedMutation): Promise<void> {
  await withStore("readwrite", (store) => store.put(mutation));
}

// Aynı milisaniyedeki çağrılarda bile sırayı korumak için kesin artan zaman damgası.
let sequence = 0;
function nextTimestamp(): number {
  return Date.now() * 1000 + (sequence++ % 1000);
}

export async function enqueueAddLine(input: {
  tenantId: string;
  orderId: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  modifierIds?: readonly string[];
  modifierSummary?: string | null;
  userId: string;
}): Promise<QueuedMutation> {
  const mutation: QueuedMutation = {
    id: crypto.randomUUID(),
    kind: "add_line",
    createdAt: nextTimestamp(),
    tenantId: input.tenantId,
    orderId: input.orderId,
    menuItemId: input.menuItemId,
    menuItemName: input.menuItemName,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    modifierIds: input.modifierIds ?? [],
    modifierSummary: input.modifierSummary ?? null,
    userId: input.userId,
  };
  await put(mutation);
  return mutation;
}

export async function enqueueSendToKitchen(input: {
  tenantId: string;
  orderId: string;
}): Promise<QueuedMutation> {
  const mutation: QueuedMutation = {
    id: crypto.randomUUID(),
    kind: "send_to_kitchen",
    createdAt: nextTimestamp(),
    tenantId: input.tenantId,
    orderId: input.orderId,
  };
  await put(mutation);
  return mutation;
}

export async function enqueueRecordCountPage(input: {
  locationId: string;
  entries: readonly { itemId: string; quantity: string }[];
}): Promise<QueuedMutation> {
  const mutation: QueuedMutation = {
    id: crypto.randomUUID(),
    kind: "record_count_page",
    createdAt: nextTimestamp(),
    locationId: input.locationId,
    entries: input.entries,
  };
  await put(mutation);
  return mutation;
}

export async function listQueue(): Promise<QueuedMutation[]> {
  const all = (await withStore("readonly", (store) =>
    store.index("createdAt").getAll(),
  )) as QueuedMutation[] | undefined;
  return all ?? [];
}

async function removeFromQueue(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

/** Sunucuya hiç ulaşmamış bir mutasyonu kuyruktan siler. */
export async function cancelQueuedMutation(id: string): Promise<void> {
  await removeFromQueue(id);
}

/**
 * Kuyruğu sırayla boşaltır ve ilk hatada durur; ürün eklenmeden mutfağa
 * gönderilemez, atlanan bir ekleme de kaybolurdu.
 */
export async function drainQueue(
  onOutcome?: (outcome: SyncOutcome) => void,
): Promise<{ syncedCount: number }> {
  const pending = await listQueue();
  let syncedCount = 0;

  for (const mutation of pending) {
    const outcome = await syncOne(mutation);
    onOutcome?.(outcome);

    if (outcome.status === "failed") break;

    await removeFromQueue(mutation.id);
    syncedCount += 1;
  }

  return { syncedCount };
}

async function syncOne(mutation: QueuedMutation): Promise<SyncOutcome> {
  try {
    if (mutation.kind === "add_line") {
      const formData = new FormData();
      formData.set("orderId", mutation.orderId);
      formData.set("menuItemId", mutation.menuItemId);
      formData.set("quantity", String(mutation.quantity));
      formData.set("clientKey", mutation.id);
      for (const modifierId of mutation.modifierIds) {
        formData.append("modifierIds", modifierId);
      }

      const result = await addOrderLine({}, formData);
      if (result.error) {
        return { status: "failed", mutation, error: result.error };
      }
      return { status: "synced", mutation };
    }

    if (mutation.kind === "record_count_page") {
      const formData = new FormData();
      formData.set("locationId", mutation.locationId);
      formData.set("batchId", mutation.id);
      for (const entry of mutation.entries) {
        formData.set(`qty_${entry.itemId}`, entry.quantity);
      }

      const result = await recordCount({}, formData);
      if (result.error) {
        return { status: "failed", mutation, error: result.error };
      }
      return { status: "synced", mutation };
    }

    const formData = new FormData();
    formData.set("orderId", mutation.orderId);
    await sendToKitchen(formData);
    return { status: "synced", mutation };
  } catch (error) {
    return {
      status: "failed",
      mutation,
      error: error instanceof Error ? error.message : "Senkronizasyon hatası.",
    };
  }
}
