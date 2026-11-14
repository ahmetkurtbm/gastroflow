/**
 * Demo modunda dosyalar süreç belleğindeki PGlite'ta durur; herkese açık
 * dağıtımda sınırsız yükleme belleği tüketirdi. Toplam nesne sayısı ve boyutu
 * sınırlanır. `server-only` içermez; birim testle sınanır.
 */

export const DEMO_MAX_OBJECTS = 200;
export const DEMO_MAX_BYTES = 100 * 1024 * 1024;

export type StorageUsage = { count: number; bytes: number };

/**
 * Yeni yükleme sınırı aşıyorsa Türkçe hata mesajı, aşmıyorsa `null` döner.
 * `replacedBytes`: aynı yolu ezen (upsert) yüklemede eski nesnenin boyutu;
 * yeni bir nesne eklenmiyorsa `null`.
 */
export function demoQuotaError(usage: StorageUsage, incomingBytes: number, replacedBytes: number | null): string | null {
  const nextCount = usage.count + (replacedBytes === null ? 1 : 0);
  const nextBytes = usage.bytes - (replacedBytes ?? 0) + incomingBytes;
  if (nextCount > DEMO_MAX_OBJECTS) {
    return `Demo depolama sınırına ulaşıldı (en fazla ${DEMO_MAX_OBJECTS} dosya). Demo verisi periyodik olarak sıfırlanır.`;
  }
  if (nextBytes > DEMO_MAX_BYTES) {
    return `Demo depolama sınırına ulaşıldı (en fazla ${DEMO_MAX_BYTES / (1024 * 1024)} MB). Demo verisi periyodik olarak sıfırlanır.`;
  }
  return null;
}
