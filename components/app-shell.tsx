"use client";

import { useEffect, useState } from "react";
import { Box, Container, Theme } from "@radix-ui/themes";
import { BottomTabbar } from "@/components/bottom-tabbar";
import { GdprConsentBanner } from "@/components/gdpr-consent-banner";
import { useI18n } from "@/lib/use-i18n";
import { DEFAULT_SETTINGS, readSettings, SETTINGS_CHANGED_EVENT } from "@/lib/settings-storage";
import { ThemeMode } from "@/lib/types";

function normalizeThemeMode(value: unknown): ThemeMode {
  if (value === "dark" || value === "light" || value === "system") {
    return value;
  }
  return DEFAULT_SETTINGS.themeMode;
}

function resolveThemeAppearance(mode: ThemeMode): "light" | "dark" {
  if (mode === "dark") {
    return "dark";
  }
  if (mode === "light") {
    return "light";
  }
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function applyDocumentTheme(mode: ThemeMode) {
  if (typeof document === "undefined") {
    return;
  }

  const resolved = resolveThemeAppearance(mode);
  const root = document.documentElement;
  root.classList.remove("light", "dark", "light-theme", "dark-theme");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, uiLanguage } = useI18n();
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_SETTINGS.themeMode;
    }
    return normalizeThemeMode(readSettings().themeMode);
  });

  useEffect(() => {
    const title = t("app.title");
    document.title = title;
    document.documentElement.lang = uiLanguage;

    const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitleMeta) {
      appleTitleMeta.setAttribute("content", title);
    }
  }, [t, uiLanguage]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncThemeMode = () => {
      setThemeMode(normalizeThemeMode(readSettings().themeMode));
    };

    syncThemeMode();
    window.addEventListener(SETTINGS_CHANGED_EVENT, syncThemeMode);
    window.addEventListener("storage", syncThemeMode);

    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, syncThemeMode);
      window.removeEventListener("storage", syncThemeMode);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    applyDocumentTheme(themeMode);

    if (themeMode !== "system") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => applyDocumentTheme("system");

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleSystemThemeChange);
    } else if (typeof media.addListener === "function") {
      media.addListener(handleSystemThemeChange);
    }

    return () => {
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", handleSystemThemeChange);
      } else if (typeof media.removeListener === "function") {
        media.removeListener(handleSystemThemeChange);
      }
    };
  }, [themeMode]);

  return (
    <Theme accentColor="gray" grayColor="gray" radius="large" scaling="100%" appearance="inherit">
      <div className="radix-app-bg">
        <Container size="3">
          <Box className="radix-page-shell">
            <Box pt={{ initial: "4", md: "6" }} pb={{ initial: "8", md: "9" }}>
              {children}
            </Box>
          </Box>
        </Container>
        <GdprConsentBanner />
        <BottomTabbar />
      </div>
    </Theme>
  );
}
