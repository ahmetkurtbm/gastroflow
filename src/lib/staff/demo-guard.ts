import { DEMO_ACCOUNTS } from "@/lib/auth/demo-accounts";

export const DEMO_SEED_ACCOUNT_MESSAGE =
  "Demo hesaplarının üyeliği değiştirilemez; herkese açık demoda bu hesaplar ortak kullanılır.";

const DEMO_EMAILS = new Set(DEMO_ACCOUNTS.map((account) => account.email));

/** Demo modunda tohum hesabın üyeliği pasife alınamaz ya da rolü değiştirilemez. */
export function isProtectedDemoAccount(email: string | null | undefined, demoMode: boolean): boolean {
  return demoMode && !!email && DEMO_EMAILS.has(email.trim().toLowerCase());
}
