"use client";

import { useEffect, useState } from "react";
import { Card, Flex, Heading, Text } from "@radix-ui/themes";
import { useI18n } from "@/lib/use-i18n";

const AGREEMENT_HTML_PATH = "/legal/user-agreement.html";

export default function UserAgreementPage() {
  const { t } = useI18n();
  const [content, setContent] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "error" | "loaded">("loading");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch(AGREEMENT_HTML_PATH, { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to load agreement html");
        }
        const html = await response.text();
        if (!active) {
          return;
        }
        setContent(html);
        setLoadState("loaded");
      } catch {
        if (!active) {
          return;
        }
        setLoadState("error");
      }
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <Flex direction="column" gap="4">
      <Card size="4">
        <Flex direction="column" gap="2">
          <Heading size="7">{t("gdpr.userAgreement")}</Heading>
          <Text size="2" color="gray">
            {t("legal.lastUpdated")}
          </Text>
        </Flex>
      </Card>

      <Card>
        {loadState === "error" ? (
          <Text size="2" color="gray">
            Failed to load User Agreement content.
          </Text>
        ) : null}
        {loadState === "loading" ? (
          <Text size="2" color="gray">
            Loading User Agreement...
          </Text>
        ) : null}
        {loadState === "loaded" ? (
          <article className="legal-html" dangerouslySetInnerHTML={{ __html: content }} />
        ) : null}
      </Card>
    </Flex>
  );
}
