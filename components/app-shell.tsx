"use client";

import { useEffect } from "react";
import { Box, Container, Theme } from "@radix-ui/themes";
import { BottomTabbar } from "@/components/bottom-tabbar";
import { GdprConsentBanner } from "@/components/gdpr-consent-banner";
import { useI18n } from "@/lib/use-i18n";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, uiLanguage } = useI18n();

  useEffect(() => {
    const title = t("app.title");
    document.title = title;
    document.documentElement.lang = uiLanguage;

    const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitleMeta) {
      appleTitleMeta.setAttribute("content", title);
    }
  }, [t, uiLanguage]);

  return (
    <Theme accentColor="gray" grayColor="gray" radius="large" scaling="100%">
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
