/**
 * Minimal IndexedDB yardımcıları.
 *
 * Bağımlılık eklemek yerine (idb gibi ~1kb'lık sarmalayıcılar bile yeni bir
 * tedarik zinciri yüzeyi demek) düz `indexedDB` API'sini birkaç fonksiyonla
 * Promise'e çeviriyoruz. Tek bir object store var, ihtiyaç bunun ötesine
 * geçmiyor.
 */

const DB_NAME = "gastroflow-offline";
const DB_VERSION = 1;
export const MUTATIONS_STORE = "mutations";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MUTATIONS_STORE)) {
        const store = db.createObjectStore(MUTATIONS_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | void> {
  // SSR sırasında `indexedDB` yok; çağıranlar yalnızca tarayıcıda kullanmalı,
  // ama savunmasız bırakmamak için burada da kontrol ediyoruz.
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB yalnızca tarayıcıda kullanılabilir.");
  }

  const db = await openDatabase();
  try {
    const tx = db.transaction(MUTATIONS_STORE, mode);
    const store = tx.objectStore(MUTATIONS_STORE);
    const result = fn(store);
    const value = result ? await promisifyRequest(result) : undefined;

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    return value;
  } finally {
    db.close();
  }
}
