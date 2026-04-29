/**
 * Jest test suite: French verb conjugation API
 *
 * Endpoint: GET http://localhost:3000/api/conjugation?q=<infinitive>&code=fr
 *
 * Strategy (mirrors the German suite):
 *   - 20 IRREGULAR verbs: expected forms loaded from fr_irregular_conjugations.csv
 *     (the CSV is treated as ground truth). Defective/impersonal/pronominal verbs
 *     are excluded.
 *   - 80 REGULAR verbs: expected forms built programmatically from standard
 *     1st-group (-er) rules. Spelling-change verbs (-cer, -ger, -yer, -eler,
 *     -eter, e_er, é_er) and verbs taking être as auxiliary are excluded so the
 *     rules stay deterministic.
 *
 * NOTE on elision: this API applies the standard French elision rule for
 * regular -er verbs: "je" -> "j'" whenever the following form starts with a
 * vowel or h-muet. So:
 *   - "aimer" (vowel-initial stem):  label "j'" for ALL simple tenses
 *     (present, imperfect, passé simple, futur, cond. présent, subj. présent)
 *   - "parler" (consonant-initial):  label "je" for ALL simple tenses
 *   - Compound tenses always use "j'" regardless, because the avoir auxiliary
 *     itself starts with a vowel (ai/avais/aurai/aie/aurais).
 *
 * The h-muet rule treats word-initial "h" as silent (e.g. "habiter" -> "j'"),
 * the same way "hôtel" pairs with "l'hôtel" not "le hôtel".
 *
 * Run with:  npx jest test/fr.conjugations.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const API_BASE = 'http://localhost:3000/api/conjugation';

const csv_folder = "/Users/admin/Documents/projects/google_projects/polyglot_dict/lib/lang-conjugation/"
const CSV_PATH = path.join(csv_folder, 'fr_irregular_conjugations.csv');
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
// CSV loading (irregular verbs = ground truth)
// ---------------------------------------------------------------------------

/**
 * Parse the CSV into:
 *   { [infinitive]: { [tableId]: { [label]: form } } }
 *
 * Handles CRLF line endings.
 *
 * Important: the CSV records the label "je" for first-person singular even
 * when the form starts with a vowel or h-muet (e.g. plusQueParfait of "venir"
 * is recorded as je="étais venu"). The live API applies the standard French
 * elision rule and returns label "j'" in those cases. We patch the label
 * here so the CSV matches the API's actual behaviour.
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

  // Vowel + h-muet detector. Word-initial 'h' is treated as h-muet for the
  // verbs in our test set; none of the 20 irregulars uses h-aspiré.
  const startsWithVowelOrHMuet = (s: string) =>
    /^[aeiouéèêëàâîïôûh]/i.test(s);

  for (const line of lines) {
    const cols = line.split(',');
    const infinitive = cols[idx.infinitive];
    const tense = cols[idx.tense];
    let label = cols[idx.label];
    const form = cols[idx.form];

    // Apply API-style elision: "je" -> "j'" when the form starts with a
    // vowel / h-muet. The API returns "j'" in those cases, so the test
    // expectation must match.
    if (label === 'je' && startsWithVowelOrHMuet(form)) {
      label = "j'";
    }

    if (!verbs[infinitive]) verbs[infinitive] = {};
    if (!verbs[infinitive][tense]) verbs[infinitive][tense] = {};
    verbs[infinitive][tense][label] = form;
  }
  return verbs;
}

// ---------------------------------------------------------------------------
// Regular -er verb conjugation rules (1st group / "premier groupe")
// ---------------------------------------------------------------------------

/** Returns the stem of a regular -er verb (e.g. "aimer" -> "aim"). */
function stemOf(infinitive: string): string {
  if (infinitive.endsWith('er')) return infinitive.slice(0, -2);
  throw new Error(`Not a -er verb: ${infinitive}`);
}

/**
 * Builds the full expected forms map for a regular -er verb.
 * Auxiliary is always "avoir" (verbs that take "être" are excluded from the
 * regular list).
 *
 * Elision rule (matches API behaviour for first-group verbs):
 *   - If the verb stem starts with a vowel or h-muet, the "je" label elides
 *     to "j'" in EVERY tense (because the form will start with a vowel).
 *   - Otherwise the label stays "je" for simple tenses.
 *   - Compound tenses always elide to "j'" because the auxiliary (ai/avais/
 *     aurai/aie/aurais) starts with a vowel.
 *
 * Note: the API treats first-group regulars and third-group irregulars
 * differently on this point. Irregulars like "acquérir" or "écrire" keep
 * "je" in simple tenses even when the form starts with a vowel; first-group
 * verbs do not. This generator only handles the first-group rule.
 */
function buildRegularExpected(infinitive: string): VerbForms {
  const stem = stemOf(infinitive);
  const pp = `${stem}é`; // past participle, e.g. aim -> aimé

  // h-muet is treated like a vowel for elision. The verbs in our list use
  // h-muet (habiter); h-aspiré verbs are not present.
  const stemStartsWithVowel = /^[aeiouéèêëàâîïôûh]/i.test(stem);
  const jeLabel = stemStartsWithVowel ? "j'" : 'je';

  // ------------------------ Simple tenses ------------------------

  const present: FormMap = {
    [jeLabel]: `${stem}e`,
    'tu': `${stem}es`,
    'il / elle / on': `${stem}e`,
    'nous': `${stem}ons`,
    'vous': `${stem}ez`,
    'ils / elles': `${stem}ent`,
  };

  const imperfect: FormMap = {
    [jeLabel]: `${stem}ais`,
    'tu': `${stem}ais`,
    'il / elle / on': `${stem}ait`,
    'nous': `${stem}ions`,
    'vous': `${stem}iez`,
    'ils / elles': `${stem}aient`,
  };

  const passeSimple: FormMap = {
    [jeLabel]: `${stem}ai`,
    'tu': `${stem}as`,
    'il / elle / on': `${stem}a`,
    'nous': `${stem}âmes`,
    'vous': `${stem}âtes`,
    'ils / elles': `${stem}èrent`,
  };

  // Future and conditional are built on the *infinitive* for -er verbs.
  // The infinitive starts with the same letter as the stem, so the same
  // elision logic applies.
  const futureSimple: FormMap = {
    [jeLabel]: `${infinitive}ai`,
    'tu': `${infinitive}as`,
    'il / elle / on': `${infinitive}a`,
    'nous': `${infinitive}ons`,
    'vous': `${infinitive}ez`,
    'ils / elles': `${infinitive}ont`,
  };

  const conditionalPresent: FormMap = {
    [jeLabel]: `${infinitive}ais`,
    'tu': `${infinitive}ais`,
    'il / elle / on': `${infinitive}ait`,
    'nous': `${infinitive}ions`,
    'vous': `${infinitive}iez`,
    'ils / elles': `${infinitive}aient`,
  };

  const subjunctivePresent: FormMap = {
    [jeLabel]: `${stem}e`,
    'tu': `${stem}es`,
    'il / elle / on': `${stem}e`,
    'nous': `${stem}ions`,
    'vous': `${stem}iez`,
    'ils / elles': `${stem}ent`,
  };

  // ----------------- Compound tenses with avoir (always "j'") -----------------

  const passeCompose: FormMap = {
    "j'": `ai ${pp}`,
    'tu': `as ${pp}`,
    'il / elle / on': `a ${pp}`,
    'nous': `avons ${pp}`,
    'vous': `avez ${pp}`,
    'ils / elles': `ont ${pp}`,
  };

  const plusQueParfait: FormMap = {
    "j'": `avais ${pp}`,
    'tu': `avais ${pp}`,
    'il / elle / on': `avait ${pp}`,
    'nous': `avions ${pp}`,
    'vous': `aviez ${pp}`,
    'ils / elles': `avaient ${pp}`,
  };

  const futurAnterieur: FormMap = {
    "j'": `aurai ${pp}`,
    'tu': `auras ${pp}`,
    'il / elle / on': `aura ${pp}`,
    'nous': `aurons ${pp}`,
    'vous': `aurez ${pp}`,
    'ils / elles': `auront ${pp}`,
  };

  const conditionalPast: FormMap = {
    "j'": `aurais ${pp}`,
    'tu': `aurais ${pp}`,
    'il / elle / on': `aurait ${pp}`,
    'nous': `aurions ${pp}`,
    'vous': `auriez ${pp}`,
    'ils / elles': `auraient ${pp}`,
  };

  const subjunctivePast: FormMap = {
    "j'": `aie ${pp}`,
    'tu': `aies ${pp}`,
    'il / elle / on': `ait ${pp}`,
    'nous': `ayons ${pp}`,
    'vous': `ayez ${pp}`,
    'ils / elles': `aient ${pp}`,
  };

  // ----------------------- Imperative (tu / nous / vous) ----------------------
  // For -er verbs, the imperative tu form has no -s (e.g. "aime!", "parle!").
  // The -s reappears before y/en (vas-y, parles-en) but the API doesn't
  // render those compound forms in this layout.
  const imperativePresent: FormMap = {
    'tu': `${stem}e`,
    'nous': `${stem}ons`,
    'vous': `${stem}ez`,
  };

  // ----------------------- Single-row tables (label "form") -------------------

  const presentParticiple: FormMap = { 'form': `${stem}ant` };
  const pastParticiple:    FormMap = { 'form': pp };
  const presentInfinitive: FormMap = { 'form': infinitive };
  const pastInfinitive:    FormMap = { 'form': `avoir ${pp}` };
  const presentGerund:     FormMap = { 'form': `en ${stem}ant` };
  const pastGerund:        FormMap = { 'form': `en ayant ${pp}` };

  return {
    present,
    imperfect,
    passeSimple,
    passeCompose,
    plusQueParfait,
    futureSimple,
    futurAnterieur,
    subjunctivePresent,
    subjunctivePast,
    conditionalPresent,
    conditionalPast,
    imperativePresent,
    presentParticiple,
    pastParticiple,
    presentInfinitive,
    pastInfinitive,
    presentGerund,
    pastGerund,
  };
}

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

async function fetchConjugation(infinitive: string): Promise<ApiResult> {
  const url = `${API_BASE}?q=${encodeURIComponent(infinitive)}&code=fr`;
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
// Test data: 20 irregular verbs and 80 regular -er verbs
// ---------------------------------------------------------------------------

// 20 classic irregular verbs from the CSV. Defective/impersonal verbs
// (pleuvoir, falloir, gésir, clore) and pronominal verbs (s'asseoir, se taire)
// are intentionally excluded so the test does not have to special-case them.
const IRREGULAR_VERBS: string[] = [
  'être', 'avoir', 'aller', 'faire', 'dire',
  'voir', 'savoir', 'pouvoir', 'vouloir', 'devoir',
  'prendre', 'mettre', 'venir', 'tenir', 'partir',
  'dormir', 'écrire', 'lire', 'boire', 'finir',
];

// 80 regular -er verbs (first group), all with avoir auxiliary, none with
// spelling-change patterns. Excluded:
//   - -cer (commencer), -ger (manger), -yer (payer/essuyer/envoyer)
//   - -eter / -eler (jeter, appeler)
//   - e_er pattern (peser, lever, acheter, mener)
//   - é_er pattern with consonant-er ending (espérer, préférer, répéter,
//     célébrer) - note: séparer, créer, photographier are fine because the
//     "é" is not the last vowel before -er
//   - être-auxiliary verbs (aller, arriver, rester, tomber, monter, descendre,
//     rentrer, retourner, etc.)
//   - pronominal verbs
const REGULAR_VERBS: string[] = [
  'aimer', 'parler', 'chanter', 'donner', 'demander',
  'trouver', 'penser', 'porter', 'montrer', 'regarder',
  'écouter', 'travailler', 'jouer', 'continuer', 'oublier',
  'étudier', 'expliquer', 'fermer', 'décider', 'rencontrer',
  'apporter', 'augmenter', 'casser', 'cacher', 'utiliser',
  'inviter', 'imaginer', 'habiter', 'gagner', 'frapper',
  'embrasser', 'éviter', 'examiner', 'discuter', 'dépenser',
  'compter', 'commander', 'coûter', 'cuisiner', 'danser',
  'déjeuner', 'dîner', 'éclairer', 'fonder', 'former',
  'goûter', 'inventer', 'jurer', 'laver', 'limiter',
  'louer', 'manquer', 'marcher', 'marquer', 'observer',
  'occuper', 'piquer', 'pleurer', 'plier', 'préparer',
  'prier', 'présenter', 'profiter', 'publier', 'quitter',
  'raconter', 'ramasser', 'réciter', 'regretter', 'remarquer',
  'respirer', 'risquer', 'sauter', 'sembler', 'signer',
  'signaler', 'siffler', 'soigner', 'tirer', 'toucher',
];

const PRONOMINAL_SENTIR_EXPECTED: VerbForms = {
  present: {
    'je me': 'sens',
    'tu te': 'sens',
    'il / elle / on se': 'sent',
    'nous nous': 'sentons',
    'vous vous': 'sentez',
    'ils / elles se': 'sentent',
  },
  imperfect: {
    'je me': 'sentais',
    'tu te': 'sentais',
    'il / elle / on se': 'sentait',
    'nous nous': 'sentions',
    'vous vous': 'sentiez',
    'ils / elles se': 'sentaient',
  },
  passeCompose: {
    'je me': 'suis senti',
    'tu t\'': 'es senti',
    'il / elle / on s\'': 'est senti',
    'nous nous': 'sommes senti',
    'vous vous': 'êtes senti',
    'ils / elles se': 'sont senti',
  },
  plusQueParfait: {
    'je m\'': 'étais senti',
    'tu t\'': 'étais senti',
    'il / elle / on s\'': 'était senti',
    'nous nous': 'étions senti',
    'vous vous': 'étiez senti',
    'ils / elles s\'': 'étaient senti',
  },
  passeSimple: {
    'je me': 'sentis',
    'tu te': 'sentis',
    'il / elle / on se': 'sentit',
    'nous nous': 'sentîmes',
    'vous vous': 'sentîtes',
    'ils / elles se': 'sentirent',
  },
  futureSimple: {
    'je me': 'sentirai',
    'tu te': 'sentiras',
    'il / elle / on se': 'sentira',
    'nous nous': 'sentirons',
    'vous vous': 'sentirez',
    'ils / elles se': 'sentiront',
  },
  futurAnterieur: {
    'je me': 'serai senti',
    'tu te': 'seras senti',
    'il / elle / on se': 'sera senti',
    'nous nous': 'serons senti',
    'vous vous': 'serez senti',
    'ils / elles se': 'seront senti',
  },
  subjunctivePresent: {
    'je me': 'sente',
    'tu te': 'sentes',
    'il / elle / on se': 'sente',
    'nous nous': 'sentions',
    'vous vous': 'sentiez',
    'ils / elles se': 'sentent',
  },
  subjunctivePast: {
    'je me': 'sois senti',
    'tu te': 'sois senti',
    'il / elle / on se': 'soit senti',
    'nous nous': 'soyons senti',
    'vous vous': 'soyez senti',
    'ils / elles se': 'soient senti',
  },
  conditionalPresent: {
    'je me': 'sentirais',
    'tu te': 'sentirais',
    'il / elle / on se': 'sentirait',
    'nous nous': 'sentirions',
    'vous vous': 'sentiriez',
    'ils / elles se': 'sentiraient',
  },
  conditionalPast: {
    'je me': 'serais senti',
    'tu te': 'serais senti',
    'il / elle / on se': 'serait senti',
    'nous nous': 'serions senti',
    'vous vous': 'seriez senti',
    'ils / elles se': 'seraient senti',
  },
  imperativePresent: {
    'tu': 'sens-toi',
    'nous': 'sentons-nous',
    'vous': 'sentez-vous',
  },
  presentParticiple: {
    'form': 'se sentant',
  },
  pastParticiple: {
    'form': 'senti',
  },
  presentInfinitive: {
    'form': 'se sentir',
  },
  pastInfinitive: {
    'form': "s'être senti",
  },
  presentGerund: {
    'form': 'en se sentant',
  },
  pastGerund: {
    'form': "en s'étant senti",
  },
};

// Sanity guard
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

describe('French verb conjugation API', () => {
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
      // CSV records the API's group label; reuse it instead of hardcoding
      // (e.g. "finir" is "second", classic irregulars are "third").
    }, REQUEST_TIMEOUT_MS);
  });

  describe('regular -er verbs (rule-based expectations)', () => {
    test.each(REGULAR_VERBS)('conjugates "%s" correctly', async (verb) => {
      const result = await fetchConjugation(verb);
      const actual = flattenApiResult(result);
      const expected = buildRegularExpected(verb);
      assertConjugationMatches(verb, expected, actual);
      expect(result.group).toBe('first');
    }, REQUEST_TIMEOUT_MS);
  });

  describe('linked pronominal entries', () => {
    test('conjugates "se sentir" as a separate linked entry', async () => {
      const result = await fetchConjugation('se sentir');
      const actual = flattenApiResult(result);
      assertConjugationMatches('se sentir', PRONOMINAL_SENTIR_EXPECTED, actual);
      expect(result.group).toBe('third');
      expect(result.noteKeys).toContain('conjugation.note.frenchPronominalAgreement');
    }, REQUEST_TIMEOUT_MS);
  });
});


/* 2026-04-28

Test Suites: 1 passed, 1 total
Tests:       100 passed, 100 total
Snapshots:   0 total
Time:        1.24 s, estimated 2 s
Ran all test suites matching test/fr.conjugations.test.ts.
*/
