import { BarChart3, ChefHat, Package, QrCode } from "lucide-react";
import type { Metadata } from "next";

import { BrandMark, BrandName } from "@/components/brand";
import { signInAsDemo, signOut } from "@/lib/auth/actions";
import { DEMO_ACCOUNTS } from "@/lib/auth/demo-accounts";
import { getAppUser, getAuthUserId } from "@/lib/auth/current-user";
import { isDemoMode } from "@/lib/db/mode";
import { LanguageSwitcher } from "@/lib/i18n/language-switcher";
import { getServerDictionary } from "@/lib/i18n/server";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Giriş" };

export default async function LoginPage() {
  // Oturumu açık ama üyeliği olmayan kullanıcı buraya düşer: proxy onu korumalı
  // sayfalara sokmaz, giriş sayfasından da çıkaramaz. Bu ekran olmasaydı
  // kullanıcı hiçbir açıklama görmeden giriş formuna bakıp dururdu.
  const [appUser, authUserId, { locale, dict }] = await Promise.all([
    getAppUser(),
    getAuthUserId(),
    getServerDictionary(),
  ]);
  const signedInWithoutMembership = authUserId !== null && appUser === null;

  const features = [
    { icon: QrCode, text: dict.login.panelFeatures[0] },
    { icon: ChefHat, text: dict.login.panelFeatures[1] },
    { icon: Package, text: dict.login.panelFeatures[2] },
    { icon: BarChart3, text: dict.login.panelFeatures[3] },
  ];

  return (
    <main className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:40px_40px]"
        />
        <div className="relative flex items-center gap-3">
          <BrandMark size={36} />
          <BrandName className="text-xl" />
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">{dict.login.panelTitle}</h2>
          <ul className="mt-8 space-y-4">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-slate-300">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-brand-400">
                  <Icon size={18} aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-slate-400">{dict.login.title}</p>
      </section>

      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-2.5 lg:invisible">
              <BrandMark size={30} />
              <BrandName className="text-lg text-ink" />
            </div>
            <LanguageSwitcher locale={locale} />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-ink">{dict.login.submit}</h1>
          <p className="mb-6 mt-1 text-sm text-ink-muted">{dict.login.title}</p>

          <div className="rounded-xl border border-line bg-surface-raised p-6 shadow-sm sm:p-7">
            {signedInWithoutMembership ? (
              <div className="space-y-4 text-center">
                <h2 className="text-base font-semibold text-ink">
                  Hesabınız henüz bir işletmeye bağlanmamış
                </h2>
                <p className="text-sm leading-relaxed text-ink-muted">
                  Girişiniz başarılı, ancak size henüz bir işletme ve rol
                  tanımlanmadı. İşletme yöneticinizin sizi eklemesi gerekiyor.
                </p>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="w-full rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-surface-sunken"
                  >
                    {dict.shell.signOut}
                  </button>
                </form>
              </div>
            ) : (
              <LoginForm dict={dict.login} />
            )}
          </div>

          {isDemoMode() && !signedInWithoutMembership ? (
            <div className="mt-6 rounded-xl border border-line bg-surface-raised p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-ink">{dict.login.demoTitle}</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">{dict.login.demoHint}</p>
              <form action={signInAsDemo} className="mt-3 grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.role}
                    type="submit"
                    name="role"
                    value={account.role}
                    className="min-h-11 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors duration-150 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-white/5"
                  >
                    {dict.role[account.role]}
                  </button>
                ))}
              </form>
            </div>
          ) : (
            <p className="mt-6 text-center text-xs text-ink-muted">{dict.login.noAccount}</p>
          )}
        </div>
      </div>
    </main>
  );
}
