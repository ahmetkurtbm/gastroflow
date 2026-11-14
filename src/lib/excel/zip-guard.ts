/**
 * Zip bombasına karşı: `xlsx` açılmadan önce zip merkez dizini (EOCD + central
 * directory kayıtları) ayrıştırılır ve beyan edilen açılmış boyutlar sınırlanır.
 * Bağımlılık yok; yalnızca küçük bir okuyucu. Zip64, çok diskli ve bozuk
 * yapılar reddedilir.
 */

export const MAX_UNCOMPRESSED_TOTAL_BYTES = 50 * 1024 * 1024;
export const MAX_UNCOMPRESSED_ENTRY_BYTES = 25 * 1024 * 1024;
const MAX_ENTRIES = 10_000;

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_MIN_SIZE = 22;
const CENTRAL_MIN_SIZE = 46;
const MAX_COMMENT = 0xffff;

const INVALID = "Dosya geçerli bir .xlsx değil.";

/** Zip merkez dizinine göre toplam açılmış boyut; yapı bozuk ya da sınır aşılmışsa `Error` fırlatır. */
export function assertSafeZip(bytes: Uint8Array): { entries: number; totalUncompressed: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // EOCD, dosyanın sonunda (yorum alanı kadar geriye kayabilir).
  let eocd = -1;
  const lowest = Math.max(0, bytes.byteLength - EOCD_MIN_SIZE - MAX_COMMENT);
  for (let i = bytes.byteLength - EOCD_MIN_SIZE; i >= lowest; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(INVALID);

  // Yorum uzunluğu dosyanın sonuyla tutarlı olmalı.
  if (eocd + EOCD_MIN_SIZE + view.getUint16(eocd + 20, true) !== bytes.byteLength) throw new Error(INVALID);
  if (eocd >= 20 && view.getUint32(eocd - 20, true) === ZIP64_LOCATOR_SIGNATURE) {
    throw new Error("Zip64 biçimindeki dosyalar kabul edilmez.");
  }

  const disk = view.getUint16(eocd + 4, true);
  const cdDisk = view.getUint16(eocd + 6, true);
  const entriesOnDisk = view.getUint16(eocd + 8, true);
  const totalEntries = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);

  if (disk !== 0 || cdDisk !== 0 || entriesOnDisk !== totalEntries) throw new Error(INVALID);
  if (totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new Error("Zip64 biçimindeki dosyalar kabul edilmez.");
  }
  if (totalEntries === 0 || totalEntries > MAX_ENTRIES) throw new Error(INVALID);
  if (cdOffset + cdSize !== eocd) throw new Error(INVALID);

  let offset = cdOffset;
  let total = 0;
  for (let index = 0; index < totalEntries; index++) {
    if (offset + CENTRAL_MIN_SIZE > eocd || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) throw new Error(INVALID);

    const uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if (uncompressed === 0xffffffff || view.getUint32(offset + 20, true) === 0xffffffff) {
      throw new Error("Zip64 biçimindeki dosyalar kabul edilmez.");
    }
    if (uncompressed > MAX_UNCOMPRESSED_ENTRY_BYTES) throw new Error("Dosya içeriği çok büyük.");

    total += uncompressed;
    if (total > MAX_UNCOMPRESSED_TOTAL_BYTES) throw new Error("Dosya içeriği çok büyük.");

    offset += CENTRAL_MIN_SIZE + nameLength + extraLength + commentLength;
  }
  if (offset !== eocd) throw new Error(INVALID);

  return { entries: totalEntries, totalUncompressed: total };
}
