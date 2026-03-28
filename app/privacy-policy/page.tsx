"use client";

import { Card, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import { useI18n } from "@/lib/use-i18n";

export default function PrivacyPolicyPage() {
  const { t } = useI18n();

  return (
    <Flex direction="column" gap="4">
      <Card size="4">
        <Flex direction="column" gap="2">
          <Heading size="7">{t("gdpr.privacyPolicy")}</Heading>
          <Text size="2" color="gray">
            {t("legal.lastUpdated")}
          </Text>
        </Flex>
      </Card>

      <Card>
        <Flex direction="column" gap="3">
          <Heading size="4">1. Data we process</Heading>
          <Text size="2" color="gray">
            We process your query text and language selections to generate dictionary and translation results.
          </Text>
          <Separator size="4" />

          <Heading size="4">2. Local storage</Heading>
          <Text size="2" color="gray">
            Query history, app settings, and GDPR consent choice are stored locally in your browser on your device.
          </Text>
          <Separator size="4" />

          <Heading size="4">3. Analytics cookies</Heading>
          <Text size="2" color="gray">
            Analytics runs only after you explicitly accept in the GDPR prompt. If you reject, analytics scripts are
            not loaded.
          </Text>
          <Separator size="4" />

          <Heading size="4">4. Contact</Heading>
          <Text size="2" color="gray">
            For privacy questions, contact us at contact@parlerai.app.
          </Text>
        </Flex>
      </Card>
    </Flex>
  );
}
