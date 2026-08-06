import ExcelJS from "exceljs";

/**
 * Excel şablon/dışa aktarım ortak katmanı.
 *
 * `xlsx` (SheetJS) paketi DEĞİL — npm'de yayınlanan sürümde düzeltilmemiş
 * bir prototype pollution ve ReDoS açığı var (GHSA-4r6h-8v6p-xvw6,
 * GHSA-5pgg-2g8v-p4x9). Bu kod KULLANICI YÜKLEDİĞİ dosyaları ayrıştırıyor —
 * yani doğrudan saldırı yüzeyi. `exceljs` aktif bakımlı, eşdeğer bir bilinen
 * açığı yok.
 *
 * Üç ekran (menü, hammadde, fiş) aynı üç adımlı deseni kullanıyor: şablon
 * indir → Excel'de doldur/düzenle → geri yükle. Bu dosya o deseni tek
 * yerde uyguluyor, her ekran yalnızca sütun tanımını ve satır eşleme
 * mantığını sağlıyor.
 */

/** İçe aktarma eylemlerinin ortak dönüş şekli — üç ekran da aynı tipi kullanır. */
export type ImportResult = { error?: string; ok?: boolean; created?: number; updated?: number; skipped?: number };

export type ColumnDef = {
  header: string;
  key: string;
  width?: number;
};

/** Şablon/dışa aktarım dosyası üretir — hem "boş şablon indir" hem "mevcut veriyi dışa aktar" aynı fonksiyon. */
export async function buildWorkbookBuffer(
  sheetName: string,
  columns: ColumnDef[],
  rows: Record<string, string | number>[],
): Promise<Uint8Array<ArrayBuffer>> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 20 }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  const raw = await workbook.xlsx.writeBuffer();
  // `writeBuffer()`'ın dönüş tipi (ExcelJS'in kendi Buffer sürümü) bu
  // projedeki `@types/node` ile jenerik parametre uyuşmazlığı yaşıyor
  // (`Buffer<ArrayBuffer>` vs `Buffer`, muhtemelen node_modules'te iki farklı
  // @types/node kopyası) — çalışma zamanında ikisi de aynı gerçek bayt
  // dizisi. Belirsiz `ArrayBufferLike` (SharedArrayBuffer olabilir) yerine
  // KESİN bir `ArrayBuffer`'a bayt kopyalayıp `BlobPart` uyumlu, temiz bir
  // `Uint8Array<ArrayBuffer>` döndürüyoruz.
  const bytes = new Uint8Array(raw as unknown as ArrayLike<number>);
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return new Uint8Array(arrayBuffer);
}

export type ParsedRow = Record<string, string>;

/**
 * Yüklenen bir .xlsx dosyasını satır satır okur — ilk satır başlık, sonraki
 * her satır `{ başlık: hücre metni }` şeklinde döner. Sayı/tarih ayrıştırma
 * ÇAĞIRANA bırakılıyor (her ekranın kendi zod şeması var) — burası yalnızca
 * "dosyayı satırlara çevir".
 *
 * Baştan sona TAMAMEN boş bir satır atlanır — Excel'de kullanıcı genelde
 * dosyanın sonuna birkaç boş satır bırakır, bunları "geçersiz veri" diye
 * reddetmek can sıkıcı olurdu.
 */
export async function parseWorkbookRows(file: File): Promise<ParsedRow[]> {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = await file.arrayBuffer();
  // `as any`: bkz. `buildWorkbookBuffer`'daki aynı Buffer jenerik
  // uyuşmazlığı notu — yalnızca tip seviyesinde, çalışma zamanında sorun yok.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(Buffer.from(arrayBuffer) as any);

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows: ParsedRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const parsed: ParsedRow = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (!header) return;
      const value = cell.value;
      const text = value === null || value === undefined ? "" : String(value).trim();
      if (text !== "") hasValue = true;
      parsed[header] = text;
    });
    if (hasValue) rows.push(parsed);
  }
  return rows;
}
