import ExcelJS from "exceljs";

// Kullanıcı yüklediği dosyalar ayrıştırıldığı için `xlsx` (SheetJS) yerine
// bakımı süren `exceljs` kullanılıyor; npm'deki SheetJS sürümünde düzeltilmemiş
// prototype pollution ve ReDoS açıkları var.

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5000;

/** İçe aktarma eylemlerinin ortak dönüş tipi. */
export type ImportResult = { error?: string; ok?: boolean; created?: number; updated?: number; skipped?: number };

export type ColumnDef = {
  header: string;
  key: string;
  width?: number;
};

/** Boş şablon ya da mevcut verinin dışa aktarımı için .xlsx üretir. */
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
  // ExcelJS'in Buffer tipi projedeki @types/node ile uyuşmuyor; baytlar düz
  // bir ArrayBuffer'a kopyalanıyor.
  const bytes = new Uint8Array(raw as unknown as ArrayLike<number>);
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return new Uint8Array(arrayBuffer);
}

export type ParsedRow = Record<string, string>;

/**
 * Yüklenen .xlsx dosyasının ilk sayfasını satırlara çevirir: ilk satır başlık,
 * diğerleri `{ başlık: hücre metni }`. Tamamen boş satırlar atlanır; sayı ve
 * tarih ayrıştırması çağırana bırakılır.
 */
export async function parseWorkbookRows(file: File): Promise<ParsedRow[]> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error("Dosya en fazla 2 MB olabilir.");
  }

  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = await file.arrayBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- yukarıdaki Buffer tip uyuşmazlığı
  await workbook.xlsx.load(Buffer.from(arrayBuffer) as any);

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  if (sheet.rowCount > MAX_IMPORT_ROWS + 1) {
    throw new Error(`Dosya en fazla ${MAX_IMPORT_ROWS} satır içerebilir.`);
  }

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
