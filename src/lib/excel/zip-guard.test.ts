import { describe, expect, it } from "vitest";

import { buildWorkbookBuffer } from "./workbook";
import {
  MAX_UNCOMPRESSED_ENTRY_BYTES,
  MAX_UNCOMPRESSED_TOTAL_BYTES,
  assertSafeZip,
} from "./zip-guard";

/** Yalnızca merkez dizini ve EOCD içeren sahte bir zip; boyutlar beyan edilir. */
function fakeZip(sizes: number[], options: { zip64Entries?: boolean } = {}): Uint8Array {
  const records = sizes.map((size, index) => {
    const name = new TextEncoder().encode(`dosya${index}.xml`);
    const record = new Uint8Array(46 + name.length);
    const view = new DataView(record.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint32(20, 10, true);
    view.setUint32(24, options.zip64Entries ? 0xffffffff : size, true);
    view.setUint16(28, name.length, true);
    record.set(name, 46);
    return record;
  });
  const cdSize = records.reduce((sum, r) => sum + r.length, 0);
  const eocd = new Uint8Array(22);
  const view = new DataView(eocd.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, sizes.length, true);
  view.setUint16(10, sizes.length, true);
  view.setUint32(12, cdSize, true);
  view.setUint32(16, 0, true);

  const out = new Uint8Array(cdSize + 22);
  let offset = 0;
  for (const record of records) {
    out.set(record, offset);
    offset += record.length;
  }
  out.set(eocd, offset);
  return out;
}

describe("assertSafeZip", () => {
  it("geçerli küçük bir xlsx'i kabul eder", async () => {
    const xlsx = await buildWorkbookBuffer("Sayfa", [{ header: "Ad", key: "name" }], [{ name: "Çay" }]);
    const result = assertSafeZip(xlsx);
    expect(result.entries).toBeGreaterThan(0);
    expect(result.totalUncompressed).toBeLessThan(MAX_UNCOMPRESSED_TOTAL_BYTES);
  });

  it("sınırlar içindeki sahte merkez dizinini kabul eder", () => {
    expect(assertSafeZip(fakeZip([1000, 2000])).totalUncompressed).toBe(3000);
  });

  it("tek girdi sınırını aşan açılmış boyutu reddeder", () => {
    expect(() => assertSafeZip(fakeZip([MAX_UNCOMPRESSED_ENTRY_BYTES + 1]))).toThrow(/çok büyük/);
  });

  it("toplam açılmış boyut sınırını aşan zip'i reddeder", () => {
    const entry = MAX_UNCOMPRESSED_ENTRY_BYTES;
    expect(() => assertSafeZip(fakeZip([entry, entry, entry]))).toThrow(/çok büyük/);
  });

  it("zip64 beyanlı girdiyi reddeder", () => {
    expect(() => assertSafeZip(fakeZip([10], { zip64Entries: true }))).toThrow(/Zip64/);
  });

  it("bozuk ya da zip olmayan veriyi reddeder", () => {
    expect(() => assertSafeZip(new Uint8Array(0))).toThrow();
    expect(() => assertSafeZip(new TextEncoder().encode("bu bir zip değil, sadece metin"))).toThrow();
    const truncated = fakeZip([10, 20]);
    expect(() => assertSafeZip(truncated.slice(10))).toThrow();
  });
});
