import type { Metadata } from "next";
import "@radix-ui/themes/styles.css";
import { PwaRegister } from "@/components/pwa-register";
import { AppShell } from "@/components/app-shell";
import { DEFAULT_DESCRIPTION, DEFAULT_KEYWORDS, DEFAULT_TITLE, SITE_NAME, SITE_URL } from "@/lib/seo";
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
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} - ${DEFAULT_TITLE}`,
    template: `%s | ${SITE_NAME}`
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: DEFAULT_KEYWORDS,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "education",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: `${SITE_NAME} - ${DEFAULT_TITLE}`,
    description: DEFAULT_DESCRIPTION,
    locale: "en_US"
  },
  twitter: {
    card: "summary",
    title: `${SITE_NAME} - ${DEFAULT_TITLE}`,
    description: DEFAULT_DESCRIPTION
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1
    }
  },
  referrer: "origin-when-cross-origin",
  formatDetection: {
    telephone: false,
    date: false,
    address: false,
    email: false
  },
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
