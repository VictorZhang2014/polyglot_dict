import type { Metadata } from "next";
import "@radix-ui/themes/styles.css";
import { PwaRegister } from "@/components/pwa-register";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "ParlerAI - Polyglot Dictionary",
  description: "ParlerAI multilingual dictionary and translator powered by OpenAI",
  manifest: "/manifest.webmanifest",
  viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
  themeColor: "#000000",
  icons: {
    icon: "/icons/icon.png",
    apple: "/icons/apple-touch-icon.png"
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ParlerAI"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-US">
      <body>
        <AppShell>{children}</AppShell>
        <PwaRegister />
      </body>
    </html>
  );
}
