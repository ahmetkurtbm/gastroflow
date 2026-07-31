import { redirect } from "next/navigation";

import { ROLE_HOME } from "@/lib/auth/access";
import { getAppUser } from "@/lib/auth/current-user";

/**
 * Kök adres bir karşılama sayfası değil, bir yönlendirici.
 *
 * Bu bir operasyon uygulaması; tanıtım sayfasına ihtiyacı yok. Giriş yapmış
 * kullanıcı doğrudan kendi ekranına, yapmamış olan girişe düşer.
 */
export default async function HomePage() {
  const user = await getAppUser();
  redirect(user ? ROLE_HOME[user.role] : "/login");
}
