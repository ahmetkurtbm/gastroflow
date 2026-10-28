import type { Metadata, Viewport } from "next";
import { Fira_Code, Fira_Sans } from "next/font/google";
import { cookies } from "next/headers";

import { THEME_COOKIE, parseTheme } from "@/lib/theme";

import "./globals.css";

import { RegisterServiceWorker } from "./register-sw";

const sans = Fira_Sans({
  variable: "--font-fira-sans",
  subsets: ["latin", "latin-ext"], // latin-ext: Türkçe ğ, ş, ı, İ
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const mono = Fira_Code({
  variable: "--font-fira-code",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "GastroFlow",
    template: "%s · GastroFlow",
  },
  description: "Restoran yönetim sistemi: sipariş, stok, maliyet ve tedarik.",
  // Operasyon uygulaması; arama motorunda görünmesinin bir anlamı yok.
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  applicationName: "GastroFlow",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "GastroFlow", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  // POS ekranında yanlışlıkla yakınlaşmayı önlemek için, ama erişilebilirlik
  // adına kullanıcının kendi isteğiyle yakınlaşmasını engellemiyoruz.
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang="tr"
      data-theme={theme === "system" ? undefined : theme}
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
