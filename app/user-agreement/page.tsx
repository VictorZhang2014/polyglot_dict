"use client";

import { Card, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import { useI18n } from "@/lib/use-i18n";

export default function UserAgreementPage() {
  const { t } = useI18n();

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
        <Flex direction="column" gap="3">
          <Heading size="4">1. Service scope</Heading>
          <Text size="2" color="gray">
            ParlerAI provides dictionary lookup and short text translation features for personal and lawful use.
          </Text>
          <Separator size="4" />

          <Heading size="4">2. Acceptable use</Heading>
          <Text size="2" color="gray">
            You agree not to abuse the service, bypass rate limits, attempt unauthorized access, or use the app for
            illegal content or activities.
          </Text>
          <Separator size="4" />

          <Heading size="4">3. Availability and changes</Heading>
          <Text size="2" color="gray">
            We may update, suspend, or discontinue parts of the service at any time to improve reliability, security,
            and quality.
          </Text>
          <Separator size="4" />

          <Heading size="4">4. Disclaimer</Heading>
          <Text size="2" color="gray">
            Translation and lexical results may contain errors. You should verify critical information independently.
          </Text>
        </Flex>
      </Card>
    </Flex>
  );
}
