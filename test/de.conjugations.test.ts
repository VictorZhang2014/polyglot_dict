/**
 * Jest test suite: German verb conjugation API
 *
 * Endpoint: GET http://localhost:3000/api/conjugation?q=<infinitive>&code=de
 *
 * Strategy:
 *   - 20 IRREGULAR verbs: expected forms are loaded from de_irregular_conjugations.csv
 *     (the CSV is treated as ground truth).
 *   - 80 REGULAR verbs: expected forms are built programmatically from standard
 *     German weak-verb rules. Only "plain" regular verbs are used (ending in -en,
 *     not -eln / -ern, auxiliary = haben) so the rules stay deterministic.
 *
 * For every verb the test fetches the API and asserts that every (mood, tense,
 * person) form returned matches the expected form.
 *
 * Run with:  npx jest test/de.conjugations.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const API_BASE = 'http://localhost:3000/api/conjugation';

const csv_folder = "/Users/admin/Documents/projects/google_projects/polyglot_dict/lib/lang-conjugation/"
const CSV_PATH = path.join(csv_folder, 'de_irregular_conjugations.csv');
const REQUEST_TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A flat { label -> form } map for a single conjugation table. */
type FormMap = Record<string, string>;

/** A flat { tableId -> { label -> form } } map for one verb. */
type VerbForms = Record<string, FormMap>;

interface ApiRow {
  form: string;
  label: string;
  labelKey?: string;
}

interface ApiTable {
  id: string;
  layout: string;
  rows: ApiRow[];
}

interface ApiSection {
  id: string;
  tables: ApiTable[];
}

interface ApiResult {
  group: string;
  infinitive: string;
  language: string;
  noteKeys: string[];
  sections: ApiSection[];
}

interface ApiResponse {
  status: string;
  result: ApiResult;
}

// ---------------------------------------------------------------------------
// CSV loading (irregular verbs = ground truth)
// ---------------------------------------------------------------------------

/**
 * Parse the CSV into a nested map:
 *   { [infinitive]: { [tableId]: { [label]: form } } }
 *
 * The CSV does not contain quoted fields with commas, so a simple split on ','
 * is sufficient here.
 */
function loadIrregularsFromCsv(csvPath: string): Record<string, VerbForms> {
  const text = fs.readFileSync(csvPath, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headerLine = lines.shift();
  if (!headerLine) throw new Error(`CSV is empty: ${csvPath}`);
  const header = headerLine.split(',');

  const idx: Record<string, number> = Object.fromEntries(
    header.map((h, i) => [h, i])
  );
  const verbs: Record<string, VerbForms> = {};

  for (const line of lines) {
    const cols = line.split(',');
    const infinitive = cols[idx.infinitive];
    const tense = cols[idx.tense];
    const label = cols[idx.label];
    const form = cols[idx.form];

    if (!verbs[infinitive]) verbs[infinitive] = {};
    if (!verbs[infinitive][tense]) verbs[infinitive][tense] = {};
    verbs[infinitive][tense][label] = form;
  }
  return verbs;
}

// ---------------------------------------------------------------------------
// Regular weak-verb conjugation rules
// ---------------------------------------------------------------------------

/**
 * Returns the stem of a regular -en verb (e.g. "machen" -> "mach").
 * Verbs ending in -eln / -ern are NOT supported here on purpose; the regular
 * verb list below excludes them.
 */
function stemOf(infinitive: string): string {
  if (infinitive.endsWith('en')) return infinitive.slice(0, -2);
  // Fallback: shouldn't happen with our curated list
  return infinitive.replace(/n$/, '');
}

/**
 * German weak verbs whose stem ends in t, d, -chn, or consonant + m/n
 * (excluding stems like lern-, wohn-, and lehn-) take an epenthetic -e-
 * before some endings:
 *   present:   du <stem>est, er <stem>et, ihr <stem>et
 *   preterite: <stem>ete, <stem>etest, <stem>ete, <stem>eten, <stem>etet, <stem>eten
 *   past part: ge<stem>et
 */
function needsEpentheticE(stem: string): boolean {
  if (/[td]$/.test(stem)) return true;
  if (/(?:chn|[^aeiouäöülrh](?:m|n))$/.test(stem)) return true;
  return false;
}

/**
 * Build the past participle for a regular weak verb.
 * Defaults to ge<stem>(e)t. Inseparable-prefix verbs (be-, ge-, er-, ver-, zer-,
 * ent-, emp-, miss-) and verbs ending in -ieren do NOT take the ge- prefix.
 */
function pastParticipleOf(infinitive: string): string {
  const stem = stemOf(infinitive);
  const e = needsEpentheticE(stem) ? 'e' : '';
  const inseparablePrefixes = ['be', 'ge', 'er', 'ver', 'zer', 'ent', 'emp', 'miss'];
  const hasInseparablePrefix = inseparablePrefixes.some((p) => infinitive.startsWith(p));
  const isIeren = infinitive.endsWith('ieren');
  const prefix = hasInseparablePrefix || isIeren ? '' : 'ge';
  return `${prefix}${stem}${e}t`;
}

/**
 * Builds the full expected forms map for a regular verb. The structure mirrors
 * what loadIrregularsFromCsv produces, so both code paths can share the same
 * assertion logic.
 */
function buildRegularExpected(infinitive: string): VerbForms {
  const stem = stemOf(infinitive);
  const e = needsEpentheticE(stem) ? 'e' : '';
  const pp = pastParticipleOf(infinitive);
  const duEnding = /[sßxz]$/.test(stem) ? 't' : `${e}st`;

  // Present indicative
  const present: FormMap = {
    'ich': `${stem}e`,
    'du': `${stem}${duEnding}`,
    'er / sie / es': `${stem}${e}t`,
    'wir': `${stem}en`,
    'ihr': `${stem}${e}t`,
    'sie / Sie': `${stem}en`,
  };

  // Preterite indicative (weak: -te endings, with epenthetic e for t/d stems)
  const pret = needsEpentheticE(stem) ? `${stem}ete` : `${stem}te`;
  const preterite: FormMap = {
    'ich': pret,
    'du': `${pret}st`,
    'er / sie / es': pret,
    'wir': `${pret.slice(0, -1)}en`,        // -te -> -ten
    'ihr': `${pret}t`,
    'sie / Sie': `${pret.slice(0, -1)}en`,
  };

  // Compound tenses with auxiliary haben
  const perfect: FormMap = {
    'ich': `habe ${pp}`,
    'du': `hast ${pp}`,
    'er / sie / es': `hat ${pp}`,
    'wir': `haben ${pp}`,
    'ihr': `habt ${pp}`,
    'sie / Sie': `haben ${pp}`,
  };

  const pluperfect: FormMap = {
    'ich': `hatte ${pp}`,
    'du': `hattest ${pp}`,
    'er / sie / es': `hatte ${pp}`,
    'wir': `hatten ${pp}`,
    'ihr': `hattet ${pp}`,
    'sie / Sie': `hatten ${pp}`,
  };

  const futureI: FormMap = {
    'ich': `werde ${infinitive}`,
    'du': `wirst ${infinitive}`,
    'er / sie / es': `wird ${infinitive}`,
    'wir': `werden ${infinitive}`,
    'ihr': `werdet ${infinitive}`,
    'sie / Sie': `werden ${infinitive}`,
  };

  const futureII: FormMap = {
    'ich': `werde ${pp} haben`,
    'du': `wirst ${pp} haben`,
    'er / sie / es': `wird ${pp} haben`,
    'wir': `werden ${pp} haben`,
    'ihr': `werdet ${pp} haben`,
    'sie / Sie': `werden ${pp} haben`,
  };

  // Subjunctive I (present): stem + e/est/e/en/et/en
  const subjunctiveI: FormMap = {
    'ich': `${stem}e`,
    'du': `${stem}est`,
    'er / sie / es': `${stem}e`,
    'wir': `${stem}en`,
    'ihr': `${stem}et`,
    'sie / Sie': `${stem}en`,
  };

  const subjunctiveIPerfect: FormMap = {
    'ich': `habe ${pp}`,
    'du': `habest ${pp}`,
    'er / sie / es': `habe ${pp}`,
    'wir': `haben ${pp}`,
    'ihr': `habet ${pp}`,
    'sie / Sie': `haben ${pp}`,
  };

  // Subjunctive II for weak verbs is identical to the preterite indicative
  const subjunctiveII: FormMap = { ...preterite };

  const subjunctiveIIPerfect: FormMap = {
    'ich': `hätte ${pp}`,
    'du': `hättest ${pp}`,
    'er / sie / es': `hätte ${pp}`,
    'wir': `hätten ${pp}`,
    'ihr': `hättet ${pp}`,
    'sie / Sie': `hätten ${pp}`,
  };

  // Imperative
  const imperativePresent: FormMap = {
    'du': `${stem}${e}`,           // common modern form: stem (+ e if needed)
    'wir': `${stem}en`,
    'ihr': `${stem}${e}t`,
  };

  // Participles & infinitives (single-row tables, label = "form")
  const presentParticiple: FormMap = { 'form': `${infinitive}d` };
  const pastParticiple:    FormMap = { 'form': pp };
  const presentInfinitive: FormMap = { 'form': infinitive };
  const perfectInfinitive: FormMap = { 'form': `${pp} haben` };

  return {
    present,
    preterite,
    perfect,
    pluperfect,
    futureI,
    futureII,
    subjunctiveI,
    subjunctiveIPerfect,
    subjunctiveII,
    subjunctiveIIPerfect,
    imperativePresent,
    presentParticiple,
    pastParticiple,
    presentInfinitive,
    perfectInfinitive,
  };
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function fetchConjugation(infinitive: string): Promise<ApiResult> {
  const url = `${API_BASE}?q=${encodeURIComponent(infinitive)}&code=de`;
  const res = await fetch(url);
  expect(res.ok).toBe(true);
  const json = (await res.json()) as ApiResponse;
  expect(json.status).toBe('ok');
  expect(json.result).toBeDefined();
  expect(json.result.infinitive).toBe(infinitive);
  return json.result;
}

/**
 * Flatten the API response into the same { [tableId]: { [label]: form } } shape
 * that the expected-forms maps use.
 */
function flattenApiResult(result: ApiResult): VerbForms {
  const out: VerbForms = {};
  for (const section of result.sections) {
    for (const table of section.tables) {
      out[table.id] = {};
      for (const row of table.rows) {
        out[table.id][row.label] = row.form;
      }
    }
  }
  return out;
}

/**
 * Compare expected vs. actual flattened maps for a verb, asserting on every
 * single form so that mismatches give clear, granular failure messages.
 */
function assertConjugationMatches(
  infinitive: string,
  expected: VerbForms,
  actual: VerbForms
): void {
  for (const tableId of Object.keys(expected)) {
    expect(actual[tableId]).toBeDefined();
    for (const label of Object.keys(expected[tableId])) {
      const expectedForm = expected[tableId][label];
      const actualForm = actual[tableId]?.[label];
      try {
        expect(actualForm).toBe(expectedForm);
      } catch {
        throw new Error(
          `Mismatch for "${infinitive}" [${tableId} / ${label}]: ` +
          `expected "${expectedForm}", got "${actualForm}"`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Test data: 20 irregular verbs and 80 regular verbs
// ---------------------------------------------------------------------------

const IRREGULAR_VERBS: string[] = [
  'sein', 'haben', 'werden', 'gehen', 'kommen',
  'geben', 'nehmen', 'sehen', 'lesen', 'sprechen',
  'fahren', 'tragen', 'laufen', 'schlafen', 'halten',
  'finden', 'helfen', 'bleiben', 'schreiben', 'gefallen',
];

// 80 regular weak verbs, all using "haben" as auxiliary, all ending in plain -en
// (no -eln / -ern verbs, since their conjugation rules differ).
// A handful (arbeiten, antworten, öffnen, atmen, baden, reden, warten, kosten,
// retten, mieten, testen, meinen, beobachten, beachten, bedeuten, töten) have
// stems requiring the epenthetic -e-, which exercises that branch of the rule
// generator. Verbs taking sein as auxiliary (reisen, landen, passieren, etc.)
// and any verb with strong-verb forms (verlieren, verbinden, verwenden, etc.)
// are intentionally excluded.
const REGULAR_VERBS: string[] = [
  'machen', 'kaufen', 'spielen', 'lernen', 'lieben',
  'leben', 'wohnen', 'kochen', 'fragen', 'sagen',
  'hören', 'brauchen', 'suchen', 'hassen', 'lachen',
  'glauben', 'zeigen', 'zahlen', 'stellen', 'holen',
  'führen', 'bauen', 'üben', 'planen', 'hoffen',
  'tanzen', 'putzen', 'jagen', 'malen', 'rauchen',
  'schmecken', 'prüfen', 'wünschen', 'fühlen', 'klopfen',
  'kämpfen', 'töten', 'reichen', 'erreichen', 'erklären',
  'verkaufen', 'bezahlen', 'besuchen', 'bestellen', 'benutzen',
  'erzählen', 'verdienen', 'versuchen', 'verstecken', 'gehören',
  'bedeuten', 'beachten', 'studieren', 'probieren', 'reparieren',
  'fotografieren', 'organisieren', 'telefonieren', 'diskutieren', 'reservieren',
  'funktionieren', 'betonen', 'arbeiten', 'antworten', 'warten',
  'kosten', 'retten', 'mieten', 'testen', 'baden',
  'reden', 'öffnen', 'atmen', 'meinen', 'drehen',
  'erleben', 'erlauben', 'entdecken', 'beobachten', 'kleben',
];

// Sanity guard: keep the arrays exactly the right length and unique
(() => {
  if (REGULAR_VERBS.length !== 80) {
    throw new Error(`REGULAR_VERBS must have 80 entries, got ${REGULAR_VERBS.length}`);
  }
  if (new Set(REGULAR_VERBS).size !== REGULAR_VERBS.length) {
    throw new Error('REGULAR_VERBS contains duplicates');
  }
  if (IRREGULAR_VERBS.length !== 20) {
    throw new Error(`IRREGULAR_VERBS must have 20 entries, got ${IRREGULAR_VERBS.length}`);
  }
  if (new Set(IRREGULAR_VERBS).size !== IRREGULAR_VERBS.length) {
    throw new Error('IRREGULAR_VERBS contains duplicates');
  }
})();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('German verb conjugation API', () => {
  let irregulars: Record<string, VerbForms>;

  beforeAll(() => {
    irregulars = loadIrregularsFromCsv(CSV_PATH);
    for (const v of IRREGULAR_VERBS) {
      if (!irregulars[v]) {
        throw new Error(`Irregular verb "${v}" not found in CSV`);
      }
    }
  });

  describe('irregular verbs (CSV is ground truth)', () => {
    test.each(IRREGULAR_VERBS)('conjugates "%s" correctly', async (verb) => {
      const result = await fetchConjugation(verb);
      const actual = flattenApiResult(result);
      const expected = irregulars[verb];
      assertConjugationMatches(verb, expected, actual);
      expect(result.group).toBe('irregular');
    }, REQUEST_TIMEOUT_MS);
  });

  describe('regular verbs (rule-based expectations)', () => {
    test.each(REGULAR_VERBS)('conjugates "%s" correctly', async (verb) => {
      const result = await fetchConjugation(verb);
      const actual = flattenApiResult(result);
      const expected = buildRegularExpected(verb);
      assertConjugationMatches(verb, expected, actual);
      expect(result.group).toBe('regular');
    }, REQUEST_TIMEOUT_MS);
  });
});



/* 2026-04-28

Test Suites: 1 passed, 1 total
Tests:       100 passed, 100 total
Snapshots:   0 total
Time:        1.251 s, estimated 2 s
Ran all test suites matching test/de.conjugations.test.ts.

*/