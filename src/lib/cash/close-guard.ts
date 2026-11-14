/**
 * `orders` güncellemesi (`status = 'open'` koşuluyla) bu çağrıda gerçekten bir
 * satırı kapattı mı? 0 satır etkilenmişse adisyonu başka bir istek zaten
 * kapatmıştır; stok, ÖKC ve puan işlemleri tekrarlanmamalı.
 */
export function didCloseOrder(result: { error: unknown; data: { id: string }[] | null }): boolean {
  return !result.error && (result.data?.length ?? 0) > 0;
}
