import type {
  VerbConjugationApiResponse,
  VerbConjugationResult,
  VerbConjugationRow,
  VerbConjugationSection,
  VerbConjugationTable
} from "@/lib/lang-conjugation/types";

export type FrenchVerbGroup = "first" | "second" | "third";

export type FrenchConjugationMood =
  | "indicative"
  | "subjunctive"
  | "conditional"
  | "imperative"
  | "participle"
  | "infinitive"
  | "gerund";

export type FrenchConjugationTense =
  | "present"
  | "imperfect"
  | "passeCompose"
  | "plusQueParfait"
  | "passeSimple"
  | "futureSimple"
  | "futurAnterieur"
  | "subjunctivePresent"
  | "subjunctivePast"
  | "conditionalPresent"
  | "conditionalPast"
  | "imperativePresent"
  | "presentParticiple"
  | "pastParticiple"
  | "presentInfinitive"
  | "pastInfinitive"
  | "presentGerund"
  | "pastGerund";

export type FrenchConjugationRow = VerbConjugationRow;
export type FrenchConjugationTable = Omit<VerbConjugationTable, "id"> & { id: FrenchConjugationTense };
export type FrenchConjugationSection = Omit<VerbConjugationSection, "id" | "tables"> & {
  id: FrenchConjugationMood;
  tables: FrenchConjugationTable[];
};
export type FrenchConjugationResult = VerbConjugationResult & {
  group: FrenchVerbGroup;
  language: "fr";
  sections: FrenchConjugationSection[];
};
export type FrenchConjugationApiResponse = VerbConjugationApiResponse;

export const FRENCH_CONJUGATION_GROUP_LABEL_KEYS = {
  first: "conjugation.group.first",
  second: "conjugation.group.second",
  third: "conjugation.group.third"
} as const;

export const FRENCH_CONJUGATION_MOOD_LABEL_KEYS = {
  conditional: "conjugation.mood.conditional",
  gerund: "conjugation.mood.gerund",
  imperative: "conjugation.mood.imperative",
  indicative: "conjugation.mood.indicative",
  infinitive: "conjugation.mood.infinitive",
  participle: "conjugation.mood.participle",
  subjunctive: "conjugation.mood.subjunctive"
} as const;

export const FRENCH_CONJUGATION_TENSE_LABEL_KEYS = {
  conditionalPast: "conjugation.tense.conditionalPast",
  conditionalPresent: "conjugation.tense.conditionalPresent",
  futureSimple: "conjugation.tense.futureSimple",
  futurAnterieur: "conjugation.tense.futurAnterieur",
  imperfect: "conjugation.tense.imperfect",
  imperativePresent: "conjugation.tense.imperativePresent",
  pastGerund: "conjugation.tense.pastGerund",
  pastInfinitive: "conjugation.tense.pastInfinitive",
  pastParticiple: "conjugation.tense.pastParticiple",
  passeCompose: "conjugation.tense.passeCompose",
  passeSimple: "conjugation.tense.passeSimple",
  plusQueParfait: "conjugation.tense.plusQueParfait",
  present: "conjugation.tense.present",
  presentGerund: "conjugation.tense.presentGerund",
  presentInfinitive: "conjugation.tense.presentInfinitive",
  presentParticiple: "conjugation.tense.presentParticiple",
  subjunctivePast: "conjugation.tense.subjunctivePast",
  subjunctivePresent: "conjugation.tense.subjunctivePresent"
} as const;

export const FRENCH_CONJUGATION_MOOD_ORDER: FrenchConjugationMood[] = [
  "indicative",
  "subjunctive",
  "conditional",
  "imperative",
  "participle",
  "infinitive",
  "gerund"
];

export const FRENCH_CONJUGATION_TENSE_ORDER: FrenchConjugationTense[] = [
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

const PERSONAL_PRONOUNS = ["je", "tu", "il / elle / on", "nous", "vous", "ils / elles"] as const;
const IMPERATIVE_PRONOUNS = ["tu", "nous", "vous"] as const;
const ELISION_PATTERN = /^[aeiouyhàâæéèêëîïôœùûü]/i;
const SIMPLE_FRENCH_VERB_PATTERN = /^[a-zàâçéèêëîïôûùüÿæœ'-]+$/i;
const FIRST_GROUP_ACCENT_SHIFT_PATTERN = /[eé][^aeiouy]*$/i;
const FIRST_GROUP_SINGLE_CONSONANT_ACCENT_SHIFT_PATTERN = /[eé][^aeiouy]er$/i;
const FIRST_GROUP_NASAL_ACCENT_BLOCK_PATTERN = /[eé][nm][^aeiouynm]er$/i;

const AVOIR_FORMS = {
  conditionalPresent: ["aurais", "aurais", "aurait", "aurions", "auriez", "auraient"],
  futureSimple: ["aurai", "auras", "aura", "aurons", "aurez", "auront"],
  imperfect: ["avais", "avais", "avait", "avions", "aviez", "avaient"],
  present: ["ai", "as", "a", "avons", "avez", "ont"],
  subjunctivePresent: ["aie", "aies", "ait", "ayons", "ayez", "aient"]
} as const;

function normalizeFrenchVerb(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").normalize("NFC");
}

function shouldUseElision(form: string): boolean {
  return ELISION_PATTERN.test(form);
}

function withSubjectPronouns(forms: readonly string[]): FrenchConjugationRow[] {
  return forms.map((form, index) => ({
    form,
    label: index === 0 && shouldUseElision(form) ? "j'" : PERSONAL_PRONOUNS[index]
  }));
}

function withImperativeLabels(forms: readonly string[]): FrenchConjugationRow[] {
  return forms.map((form, index) => ({
    form,
    label: IMPERATIVE_PRONOUNS[index]
  }));
}

function singleRow(form: string): FrenchConjugationRow[] {
  return [
    {
      form,
      label: "form",
      labelKey: "conjugation.row.form"
    }
  ];
}

function combineAuxiliary(auxiliaryForms: readonly string[], pastParticiple: string): string[] {
  return auxiliaryForms.map((auxiliary) => `${auxiliary} ${pastParticiple}`);
}

function applyGraveAccentToLastStemVowel(stem: string): string {
  return stem.replace(FIRST_GROUP_ACCENT_SHIFT_PATTERN, (match) =>
    match.replace(/[eé](?=[^aeiouy]*$)/i, "è")
  );
}

function shouldApplyFirstGroupAccentShift(verb: string): boolean {
  if (verb.endsWith("eler") || verb.endsWith("eter")) {
    return true;
  }

  if (!FIRST_GROUP_SINGLE_CONSONANT_ACCENT_SHIFT_PATTERN.test(verb)) {
    return false;
  }

  // Avoid over-applying the grave accent to nasal stems like "dépenser"
  // or "inventer", which keep "e/é" in stressed forms, while limiting
  // the shift to the classic e/é + single-consonant + er families.
  return !FIRST_GROUP_NASAL_ACCENT_BLOCK_PATTERN.test(verb);
}

function normalizeFirstGroupFutureStem(verb: string): string {
  if (verb.endsWith("yer")) {
    return `${verb.slice(0, -3)}ier`;
  }

  if (shouldApplyFirstGroupAccentShift(verb)) {
    return `${applyGraveAccentToLastStemVowel(verb.slice(0, -2))}er`;
  }

  return verb;
}

function buildOrthographicStem(stem: string, ending: string): string {
  if (stem.endsWith("c") && /^[aâoôu]/i.test(ending)) {
    return `${stem.slice(0, -1)}ç`;
  }

  if (stem.endsWith("g") && /^[aâoôu]/i.test(ending)) {
    return `${stem}e`;
  }

  return stem;
}

function buildFirstGroupPresentForms(verb: string): string[] {
  const baseStem = verb.slice(0, -2);
  const stressedStem =
    verb.endsWith("yer")
      ? `${baseStem.slice(0, -1)}i`
      : normalizeFirstGroupFutureStem(verb).slice(0, -2);

  return [
    `${stressedStem}e`,
    `${stressedStem}es`,
    `${stressedStem}e`,
    `${buildOrthographicStem(baseStem, "ons")}ons`,
    `${baseStem}ez`,
    `${stressedStem}ent`
  ];
}

function buildFirstGroupImperfectStem(verb: string): string {
  return buildFirstGroupPresentForms(verb)[3].slice(0, -3);
}

function buildFirstGroupPasseSimpleForms(baseStem: string): string[] {
  const endings = ["ai", "as", "a", "âmes", "âtes", "èrent"];
  return endings.map((ending) => `${buildOrthographicStem(baseStem, ending)}${ending}`);
}

function buildFirstGroupSubjunctivePresentForms(verb: string): string[] {
  const baseStem = verb.slice(0, -2);
  const stressedStem =
    verb.endsWith("yer")
      ? `${baseStem.slice(0, -1)}i`
      : normalizeFirstGroupFutureStem(verb).slice(0, -2);
  const imperfectStem = buildFirstGroupImperfectStem(verb);

  return [
    `${stressedStem}e`,
    `${stressedStem}es`,
    `${stressedStem}e`,
    `${imperfectStem}ions`,
    `${imperfectStem}iez`,
    `${stressedStem}ent`
  ];
}

function buildFirstGroupImperativeForms(verb: string): string[] {
  const presentForms = buildFirstGroupPresentForms(verb);
  return [presentForms[0], presentForms[3], presentForms[4]];
}

function getFrenchVerbGroup(verb: string): FrenchVerbGroup | null {
  if (verb.endsWith("er") && verb.length > 2) {
    return "first";
  }

  if (verb.endsWith("ir") && verb.length > 2) {
    return "second";
  }

  if (verb.endsWith("re") && verb.length > 2) {
    return "third";
  }

  return null;
}

export function buildFrenchConjugation(verbInput: string): FrenchConjugationApiResponse {
  const verb = normalizeFrenchVerb(verbInput);

  if (/^s['’]/.test(verb) || /^se[- ]/.test(verb)) {
    return {
      normalizedVerb: verb,
      reason: "pronominal",
      status: "pending_backend"
    };
  }

  if (!verb || !SIMPLE_FRENCH_VERB_PATTERN.test(verb) || verb.includes(" ")) {
    return {
      normalizedVerb: verb,
      reason: "invalid",
      status: "pending_backend"
    };
  }

  const group = getFrenchVerbGroup(verb);
  if (!group) {
    return {
      normalizedVerb: verb,
      reason: "irregular",
      status: "pending_backend"
    };
  }

  const infinitiveStem = verb.slice(0, -2);
  const presentForms =
    group === "first"
      ? buildFirstGroupPresentForms(verb)
      : group === "second"
        ? [
            `${infinitiveStem}is`,
            `${infinitiveStem}is`,
            `${infinitiveStem}it`,
            `${infinitiveStem}issons`,
            `${infinitiveStem}issez`,
            `${infinitiveStem}issent`
          ]
        : [
            `${infinitiveStem}s`,
            `${infinitiveStem}s`,
            infinitiveStem,
            `${infinitiveStem}ons`,
            `${infinitiveStem}ez`,
            `${infinitiveStem}ent`
          ];

  const imperfectStem =
    group === "first"
      ? buildFirstGroupImperfectStem(verb)
      : group === "second"
      ? `${infinitiveStem}iss`
      : infinitiveStem;

  const imperfectForms = [
    `${imperfectStem}ais`,
    `${imperfectStem}ais`,
    `${imperfectStem}ait`,
    `${imperfectStem}ions`,
    `${imperfectStem}iez`,
    `${imperfectStem}aient`
  ];

  const passeSimpleForms =
    group === "first"
      ? buildFirstGroupPasseSimpleForms(infinitiveStem)
      : [
          `${infinitiveStem}is`,
          `${infinitiveStem}is`,
          `${infinitiveStem}it`,
          `${infinitiveStem}îmes`,
          `${infinitiveStem}îtes`,
          `${infinitiveStem}irent`
        ];

  const futureStem =
    group === "first" ? normalizeFirstGroupFutureStem(verb) : group === "third" ? verb.slice(0, -1) : verb;
  const futureSimpleForms = [
    `${futureStem}ai`,
    `${futureStem}as`,
    `${futureStem}a`,
    `${futureStem}ons`,
    `${futureStem}ez`,
    `${futureStem}ont`
  ];

  const conditionalPresentForms = [
    `${futureStem}ais`,
    `${futureStem}ais`,
    `${futureStem}ait`,
    `${futureStem}ions`,
    `${futureStem}iez`,
    `${futureStem}aient`
  ];

  const subjunctiveStem = group === "second" ? `${infinitiveStem}iss` : infinitiveStem;
  const subjunctivePresentForms = [
    ...(group === "first"
      ? buildFirstGroupSubjunctivePresentForms(verb)
      : [
          `${subjunctiveStem}e`,
          `${subjunctiveStem}es`,
          `${subjunctiveStem}e`,
          `${subjunctiveStem}ions`,
          `${subjunctiveStem}iez`,
          `${subjunctiveStem}ent`
        ])
  ];

  const imperativePresentForms =
    group === "first"
      ? buildFirstGroupImperativeForms(verb)
      : group === "second"
        ? [`${infinitiveStem}is`, `${infinitiveStem}issons`, `${infinitiveStem}issez`]
        : [`${infinitiveStem}s`, `${infinitiveStem}ons`, `${infinitiveStem}ez`];

  const pastParticiple =
    group === "first" ? `${infinitiveStem}é` : group === "second" ? `${infinitiveStem}i` : `${infinitiveStem}u`;
  const presentParticiple =
    group === "first" ? `${imperfectStem}ant` : group === "second" ? `${infinitiveStem}issant` : `${infinitiveStem}ant`;

  const noteKeys: string[] = [];
  if (group === "second") {
    noteKeys.push("conjugation.note.secondGroupAssumption");
  }
  if (group === "third") {
    noteKeys.push("conjugation.note.thirdGroupScope");
  }

  return {
    result: {
      group,
      infinitive: verb,
      language: "fr",
      noteKeys,
      sections: [
        {
          id: "indicative",
          tables: [
            {
              id: "present",
              layout: "personal",
              rows: withSubjectPronouns(presentForms)
            },
            {
              id: "imperfect",
              layout: "personal",
              rows: withSubjectPronouns(imperfectForms)
            },
            {
              id: "passeCompose",
              layout: "personal",
              rows: withSubjectPronouns(combineAuxiliary(AVOIR_FORMS.present, pastParticiple))
            },
            {
              id: "plusQueParfait",
              layout: "personal",
              rows: withSubjectPronouns(combineAuxiliary(AVOIR_FORMS.imperfect, pastParticiple))
            },
            {
              id: "passeSimple",
              layout: "personal",
              rows: withSubjectPronouns(passeSimpleForms)
            },
            {
              id: "futureSimple",
              layout: "personal",
              rows: withSubjectPronouns(futureSimpleForms)
            },
            {
              id: "futurAnterieur",
              layout: "personal",
              rows: withSubjectPronouns(combineAuxiliary(AVOIR_FORMS.futureSimple, pastParticiple))
            }
          ]
        },
        {
          id: "subjunctive",
          tables: [
            {
              id: "subjunctivePresent",
              layout: "personal",
              rows: withSubjectPronouns(subjunctivePresentForms)
            },
            {
              id: "subjunctivePast",
              layout: "personal",
              rows: withSubjectPronouns(combineAuxiliary(AVOIR_FORMS.subjunctivePresent, pastParticiple))
            }
          ]
        },
        {
          id: "conditional",
          tables: [
            {
              id: "conditionalPresent",
              layout: "personal",
              rows: withSubjectPronouns(conditionalPresentForms)
            },
            {
              id: "conditionalPast",
              layout: "personal",
              rows: withSubjectPronouns(combineAuxiliary(AVOIR_FORMS.conditionalPresent, pastParticiple))
            }
          ]
        },
        {
          id: "imperative",
          tables: [
            {
              id: "imperativePresent",
              layout: "personal",
              rows: withImperativeLabels(imperativePresentForms)
            }
          ]
        },
        {
          id: "participle",
          tables: [
            {
              id: "presentParticiple",
              layout: "single",
              rows: singleRow(presentParticiple)
            },
            {
              id: "pastParticiple",
              layout: "single",
              rows: singleRow(pastParticiple)
            }
          ]
        },
        {
          id: "infinitive",
          tables: [
            {
              id: "presentInfinitive",
              layout: "single",
              rows: singleRow(verb)
            },
            {
              id: "pastInfinitive",
              layout: "single",
              rows: singleRow(`avoir ${pastParticiple}`)
            }
          ]
        },
        {
          id: "gerund",
          tables: [
            {
              id: "presentGerund",
              layout: "single",
              rows: singleRow(`en ${presentParticiple}`)
            },
            {
              id: "pastGerund",
              layout: "single",
              rows: singleRow(`en ayant ${pastParticiple}`)
            }
          ]
        }
      ]
    },
    status: "ok"
  };
}
