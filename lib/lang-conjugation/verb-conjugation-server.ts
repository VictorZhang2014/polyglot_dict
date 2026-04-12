import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  buildFrenchConjugation,
  FRENCH_CONJUGATION_MOOD_ORDER,
  FRENCH_CONJUGATION_TENSE_ORDER
} from "@/lib/lang-conjugation/french-conjugation";
import {
  buildGermanConjugation,
  GERMAN_CONJUGATION_MOOD_ORDER,
  GERMAN_CONJUGATION_TENSE_ORDER
} from "@/lib/lang-conjugation/german-conjugation";
import type {
  SupportedConjugationLanguage,
  VerbConjugationApiResponse,
  VerbConjugationLayout,
  VerbConjugationResult,
  VerbConjugationRow
} from "@/lib/lang-conjugation/types";

type CsvRow = {
  alias: string;
  form: string;
  group: string;
  infinitive: string;
  label: string;
  language: SupportedConjugationLanguage;
  layout: VerbConjugationLayout;
  mood: string;
  noteKeys: string[];
  rowOrder: number;
  tense: string;
};

type CsvTableBucket = {
  layout: VerbConjugationLayout;
  rows: Array<{
    form: string;
    label: string;
    rowOrder: number;
  }>;
};

type CsvVerbBucket = {
  aliases: Set<string>;
  group: string;
  infinitive: string;
  language: SupportedConjugationLanguage;
  noteKeys: Set<string>;
  sections: Map<string, Map<string, CsvTableBucket>>;
};

type CsvLanguageConfig = {
  builder: (verbInput: string) => VerbConjugationApiResponse;
  csvPath: string;
  moodOrder: string[];
  tenseOrder: string[];
};

const CSV_CONFIG: Record<SupportedConjugationLanguage, CsvLanguageConfig> = {
  de: {
    builder: buildGermanConjugation,
    csvPath: path.join(process.cwd(), "lib/lang-conjugation/de_irregular_conjugations.csv"),
    moodOrder: GERMAN_CONJUGATION_MOOD_ORDER,
    tenseOrder: GERMAN_CONJUGATION_TENSE_ORDER
  },
  fr: {
    builder: buildFrenchConjugation,
    csvPath: path.join(process.cwd(), "lib/lang-conjugation/fr_irregular_conjugations.csv"),
    moodOrder: FRENCH_CONJUGATION_MOOD_ORDER,
    tenseOrder: FRENCH_CONJUGATION_TENSE_ORDER
  }
};

const csvCache = new Map<SupportedConjugationLanguage, Map<string, VerbConjugationResult>>();

function normalizeVerbForLookup(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").normalize("NFC");
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields.map((field) => field.trim());
}

function parseCsvRows(csvText: string, language: SupportedConjugationLanguage): CsvRow[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  const getField = (values: string[], name: string) => values[headers.indexOf(name)] ?? "";

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return {
      alias: getField(values, "alias"),
      form: getField(values, "form"),
      group: getField(values, "group"),
      infinitive: getField(values, "infinitive"),
      label: getField(values, "label"),
      language,
      layout: (getField(values, "layout") || "personal") as VerbConjugationLayout,
      mood: getField(values, "mood"),
      noteKeys: getField(values, "note_keys")
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean),
      rowOrder: Number.parseInt(getField(values, "row_order"), 10) || 0,
      tense: getField(values, "tense")
    };
  });
}

function buildCsvIndex(language: SupportedConjugationLanguage): Map<string, VerbConjugationResult> {
  const cached = csvCache.get(language);
  if (cached) {
    return cached;
  }

  const config = CSV_CONFIG[language];
  const index = new Map<string, VerbConjugationResult>();
  if (!existsSync(config.csvPath)) {
    csvCache.set(language, index);
    return index;
  }

  const verbBuckets = new Map<string, CsvVerbBucket>();
  const rows = parseCsvRows(readFileSync(config.csvPath, "utf8"), language);

  for (const row of rows) {
    const normalizedInfinitive = normalizeVerbForLookup(row.infinitive);
    if (!normalizedInfinitive || !row.form || !row.mood || !row.tense) {
      continue;
    }

    const bucket =
      verbBuckets.get(normalizedInfinitive) ??
      {
        aliases: new Set<string>(),
        group: row.group,
        infinitive: row.infinitive,
        language,
        noteKeys: new Set<string>(),
        sections: new Map<string, Map<string, CsvTableBucket>>()
      };

    bucket.group = row.group;
    bucket.infinitive = row.infinitive;
    row.noteKeys.forEach((noteKey) => bucket.noteKeys.add(noteKey));

    const normalizedAlias = normalizeVerbForLookup(row.alias);
    if (normalizedAlias) {
      bucket.aliases.add(normalizedAlias);
    }

    const sectionBucket = bucket.sections.get(row.mood) ?? new Map<string, CsvTableBucket>();
    const tableBucket =
      sectionBucket.get(row.tense) ??
      {
        layout: row.layout,
        rows: []
      };

    tableBucket.layout = row.layout;
    tableBucket.rows.push({
      form: row.form,
      label: row.label,
      rowOrder: row.rowOrder
    });

    sectionBucket.set(row.tense, tableBucket);
    bucket.sections.set(row.mood, sectionBucket);
    verbBuckets.set(normalizedInfinitive, bucket);
  }

  for (const [normalizedInfinitive, bucket] of verbBuckets.entries()) {
    const result: VerbConjugationResult = {
      group: bucket.group,
      infinitive: bucket.infinitive,
      language: bucket.language,
      noteKeys: [...bucket.noteKeys],
      sections: config.moodOrder.flatMap((mood) => {
        const tables = bucket.sections.get(mood);
        if (!tables) {
          return [];
        }

        return [
          {
            id: mood,
            tables: config.tenseOrder.flatMap((tense) => {
              const table = tables.get(tense);
              if (!table) {
                return [];
              }

              const rows: VerbConjugationRow[] = [...table.rows]
                .sort((left, right) => left.rowOrder - right.rowOrder)
                .map((row) => ({
                  form: row.form,
                  label: row.label,
                  ...(row.label === "form" ? { labelKey: "conjugation.row.form" } : {})
                }));

              return [
                {
                  id: tense,
                  layout: table.layout,
                  rows
                }
              ];
            })
          }
        ];
      })
    };

    index.set(normalizedInfinitive, result);
    bucket.aliases.forEach((alias) => index.set(alias, result));
  }

  csvCache.set(language, index);
  return index;
}

export function buildVerbConjugationResponse(
  language: SupportedConjugationLanguage,
  verbInput: string
): VerbConjugationApiResponse {
  const normalizedVerb = normalizeVerbForLookup(verbInput);
  const csvResult = buildCsvIndex(language).get(normalizedVerb);
  if (csvResult) {
    return {
      result: csvResult,
      status: "ok"
    };
  }

  return CSV_CONFIG[language].builder(verbInput);
}
