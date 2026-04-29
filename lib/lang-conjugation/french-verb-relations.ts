import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type FrenchVerbRelationType = "pronominal";

export type FrenchRelatedVerbEntry = {
  infinitive: string;
  relation: FrenchVerbRelationType;
};

type FrenchVerbRelationRow = {
  infinitive: string;
  relatedInfinitive: string;
  relation: FrenchVerbRelationType;
};

const FRENCH_RELATED_VERBS_CSV_PATH = path.join(process.cwd(), "lib/lang-conjugation/fr_pronoms_reflechis_verbs.csv");

let cachedRelations: Map<string, FrenchRelatedVerbEntry[]> | null = null;

export function normalizeFrenchInfinitive(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").normalize("NFC");
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
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
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function loadFrenchVerbRelationRows(): FrenchVerbRelationRow[] {
  if (!existsSync(FRENCH_RELATED_VERBS_CSV_PATH)) {
    return [];
  }

  const lines = readFileSync(FRENCH_RELATED_VERBS_CSV_PATH, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  if (lines.length <= 1) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  const getField = (values: string[], header: string) => values[headers.indexOf(header)] ?? "";

  return lines.slice(1).flatMap((line) => {
    const values = parseCsvLine(line);
    const infinitive = normalizeFrenchInfinitive(getField(values, "infinitive"));
    const relatedInfinitive = normalizeFrenchInfinitive(getField(values, "related_infinitive"));
    const relation = getField(values, "relation") as FrenchVerbRelationType;

    if (!infinitive || !relatedInfinitive || infinitive === relatedInfinitive || relation !== "pronominal") {
      return [];
    }

    return [
      {
        infinitive,
        relatedInfinitive,
        relation
      }
    ];
  });
}

function buildFrenchVerbRelationIndex(): Map<string, FrenchRelatedVerbEntry[]> {
  if (cachedRelations) {
    return cachedRelations;
  }

  const relationMap = new Map<string, Map<string, FrenchRelatedVerbEntry>>();

  for (const row of loadFrenchVerbRelationRows()) {
    const pairs = [
      [row.infinitive, row.relatedInfinitive],
      [row.relatedInfinitive, row.infinitive]
    ] as const;

    for (const [source, target] of pairs) {
      const entryMap = relationMap.get(source) ?? new Map<string, FrenchRelatedVerbEntry>();
      entryMap.set(target, {
        infinitive: target,
        relation: row.relation
      });
      relationMap.set(source, entryMap);
    }
  }

  cachedRelations = new Map(
    [...relationMap.entries()].map(([infinitive, entries]) => [
      infinitive,
      [...entries.values()].sort((left, right) => compareFrenchInfinitives(left.infinitive, right.infinitive))
    ])
  );

  return cachedRelations;
}

function isFrenchPronominalInfinitive(value: string): boolean {
  return /^s['’]/.test(value) || /^se /.test(value);
}

function compareFrenchInfinitives(left: string, right: string): number {
  const leftIsPronominal = isFrenchPronominalInfinitive(left);
  const rightIsPronominal = isFrenchPronominalInfinitive(right);

  if (leftIsPronominal !== rightIsPronominal) {
    return leftIsPronominal ? 1 : -1;
  }

  return left.localeCompare(right, "fr");
}

export function getFrenchRelatedVerbEntries(verbInput: string): FrenchRelatedVerbEntry[] {
  const normalizedVerb = normalizeFrenchInfinitive(verbInput);
  if (!normalizedVerb) {
    return [];
  }

  return buildFrenchVerbRelationIndex().get(normalizedVerb) ?? [];
}

export function getFrenchConjugationEntryLemmas(verbInput: string): string[] {
  const normalizedVerb = normalizeFrenchInfinitive(verbInput);
  if (!normalizedVerb) {
    return [];
  }

  return [normalizedVerb, ...getFrenchRelatedVerbEntries(normalizedVerb).map((entry) => entry.infinitive)].sort(
    compareFrenchInfinitives
  );
}

export function getFrenchPronominalBaseInfinitive(verbInput: string): string | null {
  const normalizedVerb = normalizeFrenchInfinitive(verbInput);
  if (!isFrenchPronominalInfinitive(normalizedVerb)) {
    return null;
  }

  const relatedEntries = getFrenchRelatedVerbEntries(normalizedVerb);
  const baseEntry = relatedEntries.find((entry) => entry.relation === "pronominal" && !isFrenchPronominalInfinitive(entry.infinitive));

  return baseEntry?.infinitive ?? null;
}
