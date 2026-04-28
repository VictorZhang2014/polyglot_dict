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
import { getGermanVerbMetadata } from "@/lib/lang-conjugation/german-verb-metadata";
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
const FRENCH_ELISION_PATTERN = /^[aeiouyhàâæéèêëîïôœùûü]/i;

const FRENCH_PREFIX_IRREGULAR_FAMILIES = [
  {
    baseInfinitive: "prendre",
    suffix: "prendre"
  }
] as const;

function normalizeVerbForLookup(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").normalize("NFC");
}

function replaceTrailingSuffix(value: string, suffix: string, replacement: string): string {
  if (!suffix || !value.endsWith(suffix)) {
    return value;
  }

  return `${value.slice(0, -suffix.length)}${replacement}`;
}

function normalizeFrenchCsvLabel(language: SupportedConjugationLanguage, layout: VerbConjugationLayout, label: string, form: string): string {
  if (language !== "fr" || layout !== "personal" || label !== "je") {
    return label;
  }

  return FRENCH_ELISION_PATTERN.test(form) ? "j'" : label;
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
                  label: normalizeFrenchCsvLabel(bucket.language, table.layout, row.label, row.form),
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

function getSingleForm(result: VerbConjugationResult, tableId: string): string {
  for (const section of result.sections) {
    const table = section.tables.find((entry) => entry.id === tableId);
    if (table?.rows[0]?.form) {
      return table.rows[0].form;
    }
  }

  return "";
}

function deriveGermanSeparableIrregularResult(
  infinitive: string,
  csvIndex: Map<string, VerbConjugationResult>
): VerbConjugationResult | null {
  const normalizedVerb = normalizeVerbForLookup(infinitive);
  const metadata = getGermanVerbMetadata(normalizedVerb);
  if (metadata.prefixBehavior !== "separable") {
    return null;
  }
  const { bareInfinitive: baseInfinitive, separablePrefix } = metadata;
  const baseResult = csvIndex.get(baseInfinitive);
  if (!baseResult || baseResult.language !== "de") {
    return null;
  }

  const basePastParticiple = getSingleForm(baseResult, "pastParticiple");
  const basePresentParticiple = getSingleForm(baseResult, "presentParticiple");
  const basePerfectInfinitive = getSingleForm(baseResult, "perfectInfinitive");
  const derivedPastParticiple = basePastParticiple ? `${separablePrefix}${basePastParticiple}` : "";
  const derivedPresentParticiple = basePresentParticiple ? `${separablePrefix}${basePresentParticiple}` : "";
  const derivedPerfectInfinitive = basePerfectInfinitive ? `${separablePrefix}${basePerfectInfinitive}` : "";

  return {
    ...baseResult,
    infinitive,
    sections: baseResult.sections.map((section) => ({
      ...section,
      tables: section.tables.map((table) => ({
        ...table,
        rows: table.rows.map((row) => {
          let form = row.form;

          switch (table.id) {
            case "present":
            case "preterite":
            case "subjunctiveI":
            case "subjunctiveII":
            case "imperativePresent":
              form = `${row.form} ${separablePrefix}`;
              break;
            case "perfect":
            case "pluperfect":
            case "subjunctiveIPerfect":
            case "subjunctiveIIPerfect":
              form = replaceTrailingSuffix(row.form, ` ${basePastParticiple}`, ` ${derivedPastParticiple}`);
              break;
            case "futureI":
              form = replaceTrailingSuffix(row.form, ` ${baseResult.infinitive}`, ` ${infinitive}`);
              break;
            case "futureII":
              form = replaceTrailingSuffix(row.form, ` ${basePerfectInfinitive}`, ` ${derivedPerfectInfinitive}`);
              break;
            case "presentParticiple":
              form = derivedPresentParticiple || row.form;
              break;
            case "pastParticiple":
              form = derivedPastParticiple || row.form;
              break;
            case "presentInfinitive":
              form = infinitive;
              break;
            case "perfectInfinitive":
              form = derivedPerfectInfinitive || row.form;
              break;
            default:
              break;
          }

          return {
            ...row,
            form
          };
        })
      }))
    }))
  };
}

function deriveFrenchPrefixedIrregularResult(
  infinitive: string,
  csvIndex: Map<string, VerbConjugationResult>
): VerbConjugationResult | null {
  for (const family of FRENCH_PREFIX_IRREGULAR_FAMILIES) {
    if (infinitive === family.baseInfinitive || !infinitive.endsWith(family.suffix)) {
      continue;
    }

    const prefix = infinitive.slice(0, -family.suffix.length);
    if (!prefix) {
      continue;
    }

    const baseResult = csvIndex.get(family.baseInfinitive);
    if (!baseResult || baseResult.language !== "fr") {
      continue;
    }

    const basePastParticiple = getSingleForm(baseResult, "pastParticiple");
    const basePresentParticiple = getSingleForm(baseResult, "presentParticiple");
    if (!basePastParticiple || !basePresentParticiple) {
      continue;
    }

    const derivedPastParticiple = `${prefix}${basePastParticiple}`;
    const derivedPresentParticiple = `${prefix}${basePresentParticiple}`;

    return {
      ...baseResult,
      infinitive,
      sections: baseResult.sections.map((section) => ({
        ...section,
        tables: section.tables.map((table) => ({
          ...table,
          rows: table.rows.map((row) => {
            let form = row.form;

            switch (table.id) {
              case "passeCompose":
              case "plusQueParfait":
              case "futurAnterieur":
              case "subjunctivePast":
              case "conditionalPast":
              case "pastInfinitive":
              case "pastGerund":
                form = replaceTrailingSuffix(row.form, basePastParticiple, derivedPastParticiple);
                break;
              case "presentParticiple":
                form = derivedPresentParticiple;
                break;
              case "pastParticiple":
                form = derivedPastParticiple;
                break;
              case "presentInfinitive":
                form = infinitive;
                break;
              case "presentGerund":
                form = replaceTrailingSuffix(row.form, basePresentParticiple, derivedPresentParticiple);
                break;
              default:
                form = `${prefix}${row.form}`;
                break;
            }

            return {
              ...row,
              form
            };
          })
        }))
      }))
    };
  }

  return null;
}

export function buildVerbConjugationResponse(
  language: SupportedConjugationLanguage,
  verbInput: string
): VerbConjugationApiResponse {
  const normalizedVerb = normalizeVerbForLookup(verbInput);
  const csvIndex = buildCsvIndex(language);
  const csvResult = csvIndex.get(normalizedVerb);
  if (csvResult) {
    return {
      result: csvResult,
      status: "ok"
    };
  }

  if (language === "fr") {
    const derivedResult = deriveFrenchPrefixedIrregularResult(normalizedVerb, csvIndex);
    if (derivedResult) {
      return {
        result: derivedResult,
        status: "ok"
      };
    }
  }

  if (language === "de") {
    const derivedResult = deriveGermanSeparableIrregularResult(normalizedVerb, csvIndex);
    if (derivedResult) {
      return {
        result: derivedResult,
        status: "ok"
      };
    }
  }

  return CSV_CONFIG[language].builder(verbInput);
}
