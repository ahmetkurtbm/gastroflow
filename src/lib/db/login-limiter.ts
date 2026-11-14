/**
 * Giriş denemesi sınırlayıcı: e-posta başına ve IP başına sayaç. Sayaçlar
 * süreç belleğindedir, yani SUNUCU ÖRNEĞİ BAŞINADIR (çok örnekli dağıtımda
 * örnekler arasında paylaşılmaz); veritabanına taşımak ayrı bir iştir.
 * `server-only` içermez ki birim testlerle sınanabilsin.
 */

export const MAX_FAILED_LOGINS = 5;
export const MAX_FAILED_LOGINS_PER_IP = 30;
export const LOCKOUT_MS = 15 * 60 * 1000;
export const MAX_TRACKED_KEYS = 10_000;

type Entry = { count: number; until: number };

/** Anahtar başına sınırlı sayıda hak veren, belleği sınırlı sayaç. */
export class AttemptCounter {
  // Map ekleme sırasını korur; en eski anahtar ilk sıradadır.
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys: number,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  /** Bir hak tüketir; sınır doluysa `false` döner ve sayaç ilerlemez. Eşzamanlı (await yok). */
  consume(key: string, now = Date.now()): boolean {
    const entry = this.live(key, now);
    if (entry && entry.count >= this.limit) return false;
    if (!entry && this.entries.size >= this.maxKeys) this.makeRoom(now);

    this.entries.delete(key);
    this.entries.set(key, { count: (entry?.count ?? 0) + 1, until: now + this.windowMs });
    return true;
  }

  /** Tüketilen bir hakkı geri verir (doğrulama başarılı oldu). */
  refund(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    if (entry.count <= 1) this.entries.delete(key);
    else entry.count -= 1;
  }

  clear(key: string): void {
    this.entries.delete(key);
  }

  private live(key: string, now: number): Entry | undefined {
    const entry = this.entries.get(key);
    if (entry && entry.until <= now) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  // Önce süresi geçenler silinir; yine de doluysa en eski anahtar atılır.
  private makeRoom(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.until <= now) this.entries.delete(key);
    }
    while (this.entries.size >= this.maxKeys) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
}

export type LoginAttempt = {
  /** Doğrulama başarılı oldu: IP hakkı geri verilir, e-posta sayacı sıfırlanır. */
  succeed(): void;
};

export class LoginLimiter {
  private readonly byEmail = new AttemptCounter(MAX_FAILED_LOGINS, LOCKOUT_MS, MAX_TRACKED_KEYS);
  private readonly byIp = new AttemptCounter(MAX_FAILED_LOGINS_PER_IP, LOCKOUT_MS, MAX_TRACKED_KEYS);

  /**
   * Şifre doğrulamasından ÖNCE, eşzamanlı olarak çağrılır: hak peşin tüketilir,
   * böylece paralel istekler sınırı aşamaz. `null` dönerse deneme reddedilir.
   * `exempt` (demo hesapları) e-posta kilidine tabi değildir; yanlış şifre yine
   * reddedilir ama hesap kilitlenmez. `ip` yoksa IP sınırı uygulanmaz.
   */
  begin(email: string, ip: string | null, exempt: boolean, now = Date.now()): LoginAttempt | null {
    if (ip && !this.byIp.consume(ip, now)) return null;
    if (!exempt && !this.byEmail.consume(email, now)) return null;

    return {
      succeed: () => {
        if (ip) this.byIp.refund(ip);
        if (!exempt) this.byEmail.clear(email);
      },
    };
  }
}

/** İstemci IP'si: Vercel başlığı, yoksa `x-real-ip`, yoksa `x-forwarded-for`'un ilk değeri. */
export const CLIENT_IP_HEADERS = ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"] as const;

export function clientIp(headers: Headers): string | null {
  for (const name of CLIENT_IP_HEADERS) {
    const value = headers.get(name)?.split(",")[0]?.trim();
    if (value) return value;
  }
  return null;
}
