/**
 * Jest test suite: Spanish verb conjugation API
 *
 * Endpoint: GET http://localhost:3000/api/conjugation?q=<infinitive>&code=es
 *
 * Strategy (mirrors the German and French suites):
 *   - 20 IRREGULAR verbs: expected forms loaded from
 *     es_irregular_conjugations.csv (the CSV is treated as ground truth).
 *   - 80 REGULAR verbs (50 -ar, 15 -er, 15 -ir): expected forms built
 *     programmatically from standard regular-verb rules. Stem-changing verbs
 *     (e->ie, o->ue, e->i), orthographic-change endings (-car, -gar, -zar,
 *     -cer, -cir, -ger, -gir, -guir, -uir, -quir), verbs with irregular past
 *     participles (escribir, abrir, romper, etc.), and verbs with i->y in the
 *     preterite (creer, leer) are intentionally excluded.
 *
 * The API's `group` field is the infinitive's last two letters: "ar", "er",
 * or "ir" for regular verbs, and "irregular" for everything in the CSV.
 *
 * Run with:  npx jest test/es.conjugations.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const API_BASE = 'http://localhost:3000/api/conjugation';

const csv_folder = "/Users/admin/Documents/projects/google_projects/polyglot_dict/lib/lang-conjugation/"
const CSV_PATH = path.join(csv_folder, 'es_irregular_conjugations.csv');
const REQUEST_TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormMap = Record<string, string>;
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
// Person labels (used by both irregulars and the rule generator)
// ---------------------------------------------------------------------------

// Standard six-person labels for indicative / subjunctive / conditional.
const PERSONS = [
  'yo',
  'tú',
  'él / ella / usted',
  'nosotros / nosotras',
  'vosotros / vosotras',
  'ellos / ellas / ustedes',
] as const;

// Imperative uses five labels; "yo" doesn't exist (you can't command yourself),
// and the formal forms switch from "él / ella / usted" to plain "usted".
const IMPERATIVE_PERSONS = [
  'tú',
  'usted',
  'nosotros / nosotras',
  'vosotros / vosotras',
  'ustedes',
] as const;

// ---------------------------------------------------------------------------
// CSV loading (irregular verbs = ground truth)
// ---------------------------------------------------------------------------

/**
 * Parse the CSV into:
 *   { [infinitive]: { [tableId]: { [label]: form } } }
 *
 * Handles CRLF or LF line endings.
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
// Regular -ar / -er / -ir verb conjugation rules
// ---------------------------------------------------------------------------

type VerbEnding = 'ar' | 'er' | 'ir';

/** Returns ["habl", "ar"] for "hablar", ["com", "er"] for "comer", etc. */
function splitInfinitive(infinitive: string): [string, VerbEnding] {
  for (const e of ['ar', 'er', 'ir'] as const) {
    if (infinitive.endsWith(e)) return [infinitive.slice(0, -2), e];
  }
  throw new Error(`Not a regular -ar/-er/-ir verb: ${infinitive}`);
}

/** Helper to attach a list of suffixes to a base in person order. */
function makePersonal(
  base: string,
  endings: readonly [string, string, string, string, string, string]
): FormMap {
  const out: FormMap = {};
  PERSONS.forEach((p, i) => {
    out[p] = `${base}${endings[i]}`;
  });
  return out;
}

/** Same idea but for compound tenses: "<aux> <pp>" per person. */
function makeCompound(
  auxes: readonly [string, string, string, string, string, string],
  pp: string
): FormMap {
  const out: FormMap = {};
  PERSONS.forEach((p, i) => {
    out[p] = `${auxes[i]} ${pp}`;
  });
  return out;
}

function makeImperative(
  forms: readonly [string, string, string, string, string]
): FormMap {
  const out: FormMap = {};
  IMPERATIVE_PERSONS.forEach((p, i) => {
    out[p] = forms[i];
  });
  return out;
}

/**
 * Builds the full expected forms map for a fully regular -ar/-er/-ir verb.
 *
 * Compound tenses always use haber + invariable past participle (Spanish does
 * NOT mark agreement on the participle in compound tenses, unlike French).
 * Subjunctive imperfect uses the -ra form (the API's default), not the -se.
 */
function buildRegularExpected(infinitive: string): VerbForms {
  const [stem, ending] = splitInfinitive(infinitive);

  // Past participle and gerund
  const pp = ending === 'ar' ? `${stem}ado` : `${stem}ido`;
  const gerund = ending === 'ar' ? `${stem}ando` : `${stem}iendo`;

  // ---- Simple tenses ----

  // Present indicative
  const present =
    ending === 'ar'
      ? makePersonal(stem, ['o', 'as', 'a', 'amos', 'áis', 'an'])
      : ending === 'er'
      ? makePersonal(stem, ['o', 'es', 'e', 'emos', 'éis', 'en'])
      : makePersonal(stem, ['o', 'es', 'e', 'imos', 'ís', 'en']);

  // Imperfect indicative
  const imperfect =
    ending === 'ar'
      ? makePersonal(stem, ['aba', 'abas', 'aba', 'ábamos', 'abais', 'aban'])
      : makePersonal(stem, ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían']);

  // Preterite indicative
  const preterite =
    ending === 'ar'
      ? makePersonal(stem, ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'])
      : makePersonal(stem, ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron']);

  // Future indicative — built on the *infinitive* for all three groups
  const future = makePersonal(infinitive, [
    'é', 'ás', 'á', 'emos', 'éis', 'án',
  ]);

  // Conditional present — also built on the infinitive
  const conditionalPresent = makePersonal(infinitive, [
    'ía', 'ías', 'ía', 'íamos', 'íais', 'ían',
  ]);

  // Subjunctive present: -ar verbs flip to -e endings, -er/-ir flip to -a
  const subjunctivePresent =
    ending === 'ar'
      ? makePersonal(stem, ['e', 'es', 'e', 'emos', 'éis', 'en'])
      : makePersonal(stem, ['a', 'as', 'a', 'amos', 'áis', 'an']);

  // Subjunctive imperfect (-ra form). -er and -ir share the same endings.
  const subjunctiveImperfect =
    ending === 'ar'
      ? makePersonal(stem, [
          'ara', 'aras', 'ara', 'áramos', 'arais', 'aran',
        ])
      : makePersonal(stem, [
          'iera', 'ieras', 'iera', 'iéramos', 'ierais', 'ieran',
        ]);

  // ---- Compound tenses (auxiliary haber + invariable past participle) ----

  const presentPerfect = makeCompound(
    ['he', 'has', 'ha', 'hemos', 'habéis', 'han'],
    pp
  );
  const pluperfect = makeCompound(
    ['había', 'habías', 'había', 'habíamos', 'habíais', 'habían'],
    pp
  );
  const futurePerfect = makeCompound(
    ['habré', 'habrás', 'habrá', 'habremos', 'habréis', 'habrán'],
    pp
  );
  const conditionalPerfect = makeCompound(
    ['habría', 'habrías', 'habría', 'habríamos', 'habríais', 'habrían'],
    pp
  );
  const subjunctivePresentPerfect = makeCompound(
    ['haya', 'hayas', 'haya', 'hayamos', 'hayáis', 'hayan'],
    pp
  );
  const subjunctivePluperfect = makeCompound(
    [
      'hubiera',
      'hubieras',
      'hubiera',
      'hubiéramos',
      'hubierais',
      'hubieran',
    ],
    pp
  );

  // ---- Imperative (affirmative) ----
  // tú      = present-indicative 3rd singular  (habla / come / vive)
  // usted   = present-subjunctive 3rd singular (hable / coma / viva)
  // nos.    = present-subjunctive nosotros    (hablemos / comamos / vivamos)
  // vos.    = stem + -ad/-ed/-id (drop the "r" of the infinitive)
  // ustedes = present-subjunctive ellos       (hablen / coman / vivan)
  const imperativeAffirmative = (() => {
    if (ending === 'ar') {
      return makeImperative([
        `${stem}a`,
        `${stem}e`,
        `${stem}emos`,
        `${stem}ad`,
        `${stem}en`,
      ]);
    } else if (ending === 'er') {
      return makeImperative([
        `${stem}e`,
        `${stem}a`,
        `${stem}amos`,
        `${stem}ed`,
        `${stem}an`,
      ]);
    } else {
      return makeImperative([
        `${stem}e`,
        `${stem}a`,
        `${stem}amos`,
        `${stem}id`,
        `${stem}an`,
      ]);
    }
  })();

  // ---- Single-row tables (label "form") ----

  const pastParticiple:    FormMap = { 'form': pp };
  const presentInfinitive: FormMap = { 'form': infinitive };
  const perfectInfinitive: FormMap = { 'form': `haber ${pp}` };
  const presentGerund:     FormMap = { 'form': gerund };
  const perfectGerund:     FormMap = { 'form': `habiendo ${pp}` };

  return {
    present,
    preterite,
    imperfect,
    future,
    presentPerfect,
    pluperfect,
    futurePerfect,
    subjunctivePresent,
    subjunctiveImperfect,
    subjunctivePresentPerfect,
    subjunctivePluperfect,
    conditionalPresent,
    conditionalPerfect,
    imperativeAffirmative,
    pastParticiple,
    presentInfinitive,
    perfectInfinitive,
    presentGerund,
    perfectGerund,
  };
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function fetchConjugation(infinitive: string): Promise<ApiResult> {
  const url = `${API_BASE}?q=${encodeURIComponent(infinitive)}&code=es`;
  const res = await fetch(url);
  expect(res.ok).toBe(true);
  const json = (await res.json()) as ApiResponse;
  expect(json.status).toBe('ok');
  expect(json.result).toBeDefined();
  expect(json.result.infinitive).toBe(infinitive);
  return json.result;
}

/** Flatten the API response into { [tableId]: { [label]: form } }. */
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

/** Compare expected vs actual maps with granular per-form failure messages. */
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

// 20 irregular verbs: a representative spread across the CSV's main patterns
// (highly irregular: ser/haber/ir/dar; e->ie: cerrar/pensar/querer/empezar;
// o->ue: contar/dormir/poder/volver; e->i: pedir/servir/seguir; -uir: huir;
// strong preterites: tener/venir/decir; key irregulars: hacer/saber/ver).
const IRREGULAR_VERBS: string[] = [
  'ser', 'estar', 'haber', 'tener', 'hacer',
  'ir', 'ver', 'dar', 'decir', 'poder',
  'querer', 'saber', 'venir', 'poner', 'salir',
  'pensar', 'volver', 'pedir', 'dormir', 'huir',
];

// 80 regular verbs: 50 -ar, 15 -er, 15 -ir.
// All filters applied (no stem-change, no orthographic-change endings, no
// irregular past participles, no i->y preterite).
const REGULAR_VERBS: string[] = [
  // ---- 50 regular -ar verbs ----
  'hablar', 'caminar', 'bailar', 'cantar', 'estudiar',
  'trabajar', 'comprar', 'mirar', 'escuchar', 'preguntar',
  'contestar', 'amar', 'ayudar', 'desear', 'enseñar',
  'esperar', 'gastar', 'lavar', 'limpiar', 'llamar',
  'llevar', 'mandar', 'necesitar', 'olvidar', 'pasar',
  'preparar', 'presentar', 'quitar', 'regalar', 'saludar',
  'tomar', 'usar', 'visitar', 'viajar', 'cocinar',
  'cuidar', 'dejar', 'descansar', 'firmar', 'guardar',
  'invitar', 'mejorar', 'nadar', 'ocupar', 'parar',
  'regresar', 'reservar', 'respetar', 'separar', 'terminar',

  // ---- 15 regular -er verbs ----
  // (excluding creer/leer due to i->y in preterite, and -cer/-ger verbs)
  'comer', 'beber', 'aprender', 'comprender', 'correr',
  'deber', 'meter', 'prometer', 'temer', 'vender',
  'barrer', 'depender', 'sorprender', 'esconder', 'responder',

  // ---- 15 regular -ir verbs ----
  // (excluding stem-change, -uir/-guir/-cir/-gir endings, and verbs with
  // irregular past participles like escribir/abrir/cubrir)
  'vivir', 'recibir', 'subir', 'partir', 'permitir',
  'decidir', 'discutir', 'admitir', 'asistir', 'añadir',
  'confundir', 'cumplir', 'compartir', 'existir', 'insistir',
];

// Sanity guards — caught typos in the German/French versions; keep them.
(() => {
  if (IRREGULAR_VERBS.length !== 20) {
    throw new Error(`IRREGULAR_VERBS must have 20 entries, got ${IRREGULAR_VERBS.length}`);
  }
  if (new Set(IRREGULAR_VERBS).size !== IRREGULAR_VERBS.length) {
    throw new Error('IRREGULAR_VERBS contains duplicates');
  }
  if (REGULAR_VERBS.length !== 80) {
    throw new Error(`REGULAR_VERBS must have 80 entries, got ${REGULAR_VERBS.length}`);
  }
  if (new Set(REGULAR_VERBS).size !== REGULAR_VERBS.length) {
    throw new Error('REGULAR_VERBS contains duplicates');
  }
})();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Spanish verb conjugation API', () => {
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
      // The API's group label equals the infinitive's last two letters
      // for regular verbs: "ar", "er", or "ir".
      expect(result.group).toBe(verb.slice(-2));
    }, REQUEST_TIMEOUT_MS);
  });
});

/* 2026-04-29
Test Suites: 1 passed, 1 total
Tests:       100 passed, 100 total
Snapshots:   0 total
Time:        1.248 s
Ran all test suites matching test/es.conjugations.test.ts.
*/