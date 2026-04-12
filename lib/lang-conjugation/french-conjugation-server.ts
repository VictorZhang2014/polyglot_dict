import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  buildFrenchConjugation,
  type FrenchConjugationApiResponse,
  type FrenchConjugationMood,
  type FrenchConjugationResult,
  type FrenchConjugationRow,
  type FrenchConjugationTense,
  type FrenchVerbGroup
} from "@/lib/lang-conjugation/french-conjugation";

const CSV_PATH = path.join(process.cwd(), "lib/lang-conjugation/fr_irregular_conjugations.csv");

const MOOD_ORDER: FrenchConjugationMood[] = [
  "indicative",
  "subjunctive",
  "conditional",
  "imperative",
  "participle",
  "infinitive",
  "gerund"
];

const TENSE_ORDER: FrenchConjugationTense[] = [
  "present",
  "imperfect",
  "passeCompose",
  "plusQueParfait",
  "passeSimple",
  "futureSimple",
  "futurAnterieur",
  "subjunctivePresent",
  "subjunctivePast",
  "conditionalPresent",
  "conditionalPast",
  "imperativePresent",
  "presentParticiple",
  "pastParticiple",
  "presentInfinitive",
  "pastInfinitive",
  "presentGerund",
  "pastGerund"
];

type CsvRow = {
  infinitive: string;
  alias: string;
  group: FrenchVerbGroup;
  mood: FrenchConjugationMood;
  tense: FrenchConjugationTense;
  layout: "personal" | "single";
  rowOrder: number;
  label: string;
  form: string;
  noteKeys: string[];
};

type CsvTableBucket = {
  layout: "personal" | "single";
  rows: Array<{
    form: string;
    label: string;
    rowOrder: number;
  }>;
};

type CsvVerbBucket = {
  aliases: Set<string>;
  group: FrenchVerbGroup;
  infinitive: string;
  noteKeys: Set<string>;
  sections: Map<FrenchConjugationMood, Map<FrenchConjugationTense, CsvTableBucket>>;
};

let cachedCsvIndex: Map<string, FrenchConjugationResult> | null = null;

function normalizeFrenchVerbForLookup(value: string): string {
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

function parseCsvRows(csvText: string): CsvRow[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  const getField = (values: string[], name: string) => values[headers.indexOf(name)] ?? "";

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return {
      infinitive: getField(values, "infinitive"),
      alias: getField(values, "alias"),
      form: getField(values, "form"),
      group: getField(values, "group") as FrenchVerbGroup,
      label: getField(values, "label"),
      layout: getField(values, "layout") as "personal" | "single",
      mood: getField(values, "mood") as FrenchConjugationMood,
      noteKeys: getField(values, "note_keys")
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean),
      rowOrder: Number.parseInt(getField(values, "row_order"), 10) || 0,
      tense: getField(values, "tense") as FrenchConjugationTense
    };
  });
}

function buildCsvIndex(): Map<string, FrenchConjugationResult> {
  if (cachedCsvIndex) {
    return cachedCsvIndex;
  }

  const index = new Map<string, FrenchConjugationResult>();
  if (!existsSync(CSV_PATH)) {
    cachedCsvIndex = index;
    return index;
  }

  const verbBuckets = new Map<string, CsvVerbBucket>();
  const rows = parseCsvRows(readFileSync(CSV_PATH, "utf8"));

  for (const row of rows) {
    const normalizedInfinitive = normalizeFrenchVerbForLookup(row.infinitive);
    if (!normalizedInfinitive || !row.form || !row.mood || !row.tense) {
      continue;
    }

    const bucket =
      verbBuckets.get(normalizedInfinitive) ??
      {
        aliases: new Set<string>(),
        group: row.group,
        infinitive: row.infinitive,
        noteKeys: new Set<string>(),
        sections: new Map<FrenchConjugationMood, Map<FrenchConjugationTense, CsvTableBucket>>()
      };

    bucket.group = row.group;
    bucket.infinitive = row.infinitive;
    row.noteKeys.forEach((noteKey) => bucket.noteKeys.add(noteKey));

    const normalizedAlias = normalizeFrenchVerbForLookup(row.alias);
    if (normalizedAlias) {
      bucket.aliases.add(normalizedAlias);
    }

    const sectionBucket =
      bucket.sections.get(row.mood) ?? new Map<FrenchConjugationTense, CsvTableBucket>();
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
    const result: FrenchConjugationResult = {
      group: bucket.group,
      infinitive: bucket.infinitive,
      noteKeys: [...bucket.noteKeys],
      sections: MOOD_ORDER.flatMap((mood) => {
        const tables = bucket.sections.get(mood);
        if (!tables) {
          return [];
        }

        return [
          {
            id: mood,
            tables: TENSE_ORDER.flatMap((tense) => {
              const table = tables.get(tense);
              if (!table) {
                return [];
              }

              const rows: FrenchConjugationRow[] = [...table.rows]
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

  cachedCsvIndex = index;
  return index;
}

function findCsvConjugation(verbInput: string): FrenchConjugationResult | null {
  const normalizedVerb = normalizeFrenchVerbForLookup(verbInput);
  return buildCsvIndex().get(normalizedVerb) ?? null;
}

export function buildFrenchConjugationResponse(verbInput: string): FrenchConjugationApiResponse {
  const csvResult = findCsvConjugation(verbInput);
  if (csvResult) {
    return {
      result: csvResult,
      status: "ok"
    };
  }

  return buildFrenchConjugation(verbInput);
}
