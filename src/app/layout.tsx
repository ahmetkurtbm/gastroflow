import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";

import { RegisterServiceWorker } from "./register-sw";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"], // latin-ext: Türkçe ğ, ş, ı, İ
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono-stack",
  subsets: ["latin"],
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
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0f0d0b",
  // POS ekranında yanlışlıkla yakınlaşmayı önlemek için, ama erişilebilirlik
  // adına kullanıcının kendi isteğiyle yakınlaşmasını engellemiyoruz.
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="tr"
      className={`${inter.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
