import type { Metadata } from "next";

import { signOut } from "@/lib/auth/actions";
import { getAppUser, getAuthUserId } from "@/lib/auth/current-user";
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

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-3 flex justify-end">
          <LanguageSwitcher locale={locale} />
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Gastro<span className="text-brand-600">Flow</span>
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">{dict.login.title}</p>
        </div>

        <div className="rounded-xl border border-line bg-surface-raised p-6 shadow-sm">
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

        <p className="mt-6 text-center text-xs text-ink-muted">{dict.login.noAccount}</p>
      </div>
    </main>
  );
}
