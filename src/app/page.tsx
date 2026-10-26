import { redirect } from "next/navigation";

import { ROLE_HOME } from "@/lib/auth/access";
import { getAppUser } from "@/lib/auth/current-user";

/** Kök adres: giriş yapmışı rolünün ekranına, yapmamışı girişe yönlendirir. */
export default async function HomePage() {
  const user = await getAppUser();
  redirect(user ? ROLE_HOME[user.role] : "/login");
}
