"use client";

import { Card, Flex, Heading, Text } from "@radix-ui/themes";
import type { I18nKey } from "@/lib/i18n";
import {
  FRENCH_CONJUGATION_MOOD_LABEL_KEYS,
  FRENCH_CONJUGATION_TENSE_LABEL_KEYS,
  type FrenchConjugationResult
} from "@/lib/lang-conjugation/french-conjugation";
import { useI18n } from "@/lib/use-i18n";

type FrenchConjugationPanelProps = {
  result: FrenchConjugationResult;
};

export function FrenchConjugationPanel({ result }: FrenchConjugationPanelProps) {
  const { t } = useI18n();
  const tenseBlocks = result.sections.flatMap((section) =>
    section.tables.map((table) => ({
      moodId: section.id,
      table
    }))
  );

  return (
    <Flex direction="column" gap="4">
      <div className="conjugation-grid conjugation-grid-two-columns">
        {tenseBlocks.map(({ moodId, table }) => (
          <Card size="4" key={table.id} className="conjugation-tense-card">
            <Flex direction="column" gap="3">
              <div>
                <Text as="p" size="1" className="conjugation-mood-label">
                  {t(FRENCH_CONJUGATION_MOOD_LABEL_KEYS[moodId] as I18nKey)}
                </Text>
                <Heading size="4">{t(FRENCH_CONJUGATION_TENSE_LABEL_KEYS[table.id] as I18nKey)}</Heading>
              </div>

              <div className="conjugation-table-shell">
                <table className="conjugation-table">
                  <tbody>
                    {table.rows.map((row) => (
                      <tr key={`${table.id}:${row.label}:${row.form}`}>
                        <td>
                          {table.layout === "personal"
                            ? `${row.label}${row.label.endsWith("'") ? "" : " "}${row.form}`
                            : row.labelKey
                              ? `${t(row.labelKey as I18nKey)} ${row.form}`.trim()
                              : row.form}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Flex>
          </Card>
        ))}
      </div>

      {result.noteKeys.length > 0 ? (
        <Flex direction="column" gap="1">
          {result.noteKeys.map((noteKey) => (
            <Text key={noteKey} size="2" className="conjugation-note">
              {t(noteKey as I18nKey)}
            </Text>
          ))}
        </Flex>
      ) : null}
    </Flex>
  );
}
