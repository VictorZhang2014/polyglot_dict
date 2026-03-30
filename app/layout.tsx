import type { Metadata } from "next";
import "@radix-ui/themes/styles.css";
import { PwaRegister } from "@/components/pwa-register";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const THEME_BOOTSTRAP_SCRIPT = `
(() => {
  try {
    const SETTINGS_KEY = "polyglot_dict_settings_v1";
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    let themeMode = "system";
    if (raw) {
      const parsed = JSON.parse(raw);
      const maybeMode = typeof parsed?.themeMode === "string" ? parsed.themeMode.trim().toLowerCase() : "";
      if (maybeMode === "light" || maybeMode === "dark" || maybeMode === "system") {
        themeMode = maybeMode;
      }
    }
    const prefersDark =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = themeMode === "dark" || (themeMode === "system" && prefersDark) ? "dark" : "light";
    const root = document.documentElement;
    root.classList.remove("light", "dark", "light-theme", "dark-theme");
    root.classList.add(resolved);
    root.style.colorScheme = resolved;
  } catch {
    // Ignore bootstrap failures.
  }
})();
`;

export const metadata: Metadata = {
  title: "ParlerAI - Polyglot Dictionary",
  description: "ParlerAI multilingual dictionary and translator powered by OpenAI",
  manifest: "/manifest.webmanifest",
  viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6ff" },
    { media: "(prefers-color-scheme: dark)", color: "#111113" }
  ],
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
    <html lang="en-US" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
        <PwaRegister />
      </body>
    </html>
  );
}
