"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { Button, Card, Flex, Text } from "@radix-ui/themes";
import { useI18n } from "@/lib/use-i18n";

type ConsentState = "loading" | "pending" | "accepted" | "rejected";

const CONSENT_KEY = "parlerai_gdpr_consent_v1";
const GA_MEASUREMENT_ID = "G-9GJ9MYL2VL";

function isConsentValue(value: string | null): value is "accepted" | "rejected" {
  return value === "accepted" || value === "rejected";
}

export function GdprConsentBanner() {
  const { t } = useI18n();
  const [consent, setConsent] = useState<ConsentState>("loading");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CONSENT_KEY);
      if (isConsentValue(raw)) {
        setConsent(raw);
        return;
      }
    } catch {
      // Fallback to pending when storage is unavailable.
    }

    setConsent("pending");
  }, []);

  const handleDecision = (value: "accepted" | "rejected") => {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch {
      // Ignore storage errors and keep the session choice in memory.
    }
    setConsent(value);
  };

  return (
    <>
      {consent === "accepted" ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}');
            `}
          </Script>
        </>
      ) : null}

      {consent === "pending" ? (
        <div className="gdpr-banner-wrap" role="dialog" aria-live="polite" aria-label={t("gdpr.title")}>
          <Card className="gdpr-banner-card" size="3">
            <Flex direction="column" gap="3">
              <Text size="3" weight="bold">
                {t("gdpr.title")}
              </Text>
              <Text size="2" color="gray">
                {t("gdpr.description")}
              </Text>
              <Flex className="gdpr-legal-links" wrap="wrap" align="center" gap="2">
                <Text size="1" color="gray">
                  {t("gdpr.linksPrefix")}
                </Text>
                <Text asChild size="1">
                  <Link href="/user-agreement">{t("gdpr.userAgreement")}</Link>
                </Text>
                <Text size="1" color="gray">
                  {t("gdpr.linksAnd")}
                </Text>
                <Text asChild size="1">
                  <Link href="/privacy-policy">{t("gdpr.privacyPolicy")}</Link>
                </Text>
              </Flex>
              <Flex align="center" justify="end" gap="2">
                <Button type="button" variant="soft" color="orange" onClick={() => handleDecision("rejected")}>
                  {t("gdpr.reject")}
                </Button>
                <Button type="button" variant="soft" color="green" onClick={() => handleDecision("accepted")}>
                  {t("gdpr.accept")}
                </Button>
              </Flex>
            </Flex>
          </Card>
        </div>
      ) : null}
    </>
  );
}
