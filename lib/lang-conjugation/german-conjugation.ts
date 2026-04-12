import type { VerbConjugationApiResponse, VerbConjugationResult, VerbConjugationRow } from "@/lib/lang-conjugation/types";

export type GermanVerbGroup = "regular";

export type GermanConjugationMood = "imperative" | "indicative" | "infinitive" | "participle" | "subjunctive";

export type GermanConjugationTense =
  | "futureI"
  | "futureII"
  | "imperativePresent"
  | "perfect"
  | "perfectInfinitive"
  | "pluperfect"
  | "pastParticiple"
  | "present"
  | "presentInfinitive"
  | "presentParticiple"
  | "preterite"
  | "subjunctiveI"
  | "subjunctiveIPerfect"
  | "subjunctiveII"
  | "subjunctiveIIPerfect";

export const GERMAN_CONJUGATION_MOOD_LABEL_KEYS = {
  imperative: "conjugation.de.mood.imperative",
  indicative: "conjugation.de.mood.indicative",
  infinitive: "conjugation.de.mood.infinitive",
  participle: "conjugation.de.mood.participle",
  subjunctive: "conjugation.de.mood.subjunctive"
} as const;

export const GERMAN_CONJUGATION_TENSE_LABEL_KEYS = {
  futureI: "conjugation.de.tense.futureI",
  futureII: "conjugation.de.tense.futureII",
  imperativePresent: "conjugation.de.tense.imperativePresent",
  perfect: "conjugation.de.tense.perfect",
  perfectInfinitive: "conjugation.de.tense.perfectInfinitive",
  pluperfect: "conjugation.de.tense.pluperfect",
  pastParticiple: "conjugation.de.tense.pastParticiple",
  present: "conjugation.de.tense.present",
  presentInfinitive: "conjugation.de.tense.presentInfinitive",
  presentParticiple: "conjugation.de.tense.presentParticiple",
  preterite: "conjugation.de.tense.preterite",
  subjunctiveI: "conjugation.de.tense.subjunctiveI",
  subjunctiveIPerfect: "conjugation.de.tense.subjunctiveIPerfect",
  subjunctiveII: "conjugation.de.tense.subjunctiveII",
  subjunctiveIIPerfect: "conjugation.de.tense.subjunctiveIIPerfect"
} as const;

export const GERMAN_CONJUGATION_MOOD_ORDER: GermanConjugationMood[] = [
  "indicative",
  "subjunctive",
  "imperative",
  "participle",
  "infinitive"
];

export const GERMAN_CONJUGATION_TENSE_ORDER: GermanConjugationTense[] = [
  "present",
  "preterite",
  "perfect",
  "pluperfect",
  "futureI",
  "futureII",
  "subjunctiveI",
  "subjunctiveIPerfect",
  "subjunctiveII",
  "subjunctiveIIPerfect",
  "imperativePresent",
  "presentParticiple",
  "pastParticiple",
  "presentInfinitive",
  "perfectInfinitive"
];

const PERSONAL_PRONOUNS = ["ich", "du", "er / sie / es", "wir", "ihr", "sie / Sie"] as const;
const IMPERATIVE_LABELS = ["du", "wir", "ihr"] as const;
const SIMPLE_GERMAN_VERB_PATTERN = /^[a-zäöüß-]+$/i;
const SEPARABLE_PREFIXES = [
  "zurück",
  "zusammen",
  "vorbei",
  "weiter",
  "nieder",
  "empor",
  "herab",
  "heran",
  "hinab",
  "hinaus",
  "hinweg",
  "wieder",
  "ab",
  "an",
  "auf",
  "aus",
  "bei",
  "ein",
  "fest",
  "fort",
  "her",
  "hin",
  "los",
  "mit",
  "nach",
  "vor",
  "weg",
  "zu"
] as const;
const INSEPARABLE_PREFIXES = ["be", "emp", "ent", "er", "ge", "miss", "ver", "zer"] as const;
const HABEN_PRESENT = ["habe", "hast", "hat", "haben", "habt", "haben"] as const;
const HABEN_PRETERITE = ["hatte", "hattest", "hatte", "hatten", "hattet", "hatten"] as const;
const HABEN_SUBJUNCTIVE_I = ["habe", "habest", "habe", "haben", "habet", "haben"] as const;
const HABEN_SUBJUNCTIVE_II = ["hätte", "hättest", "hätte", "hätten", "hättet", "hätten"] as const;
const SEIN_PRESENT = ["bin", "bist", "ist", "sind", "seid", "sind"] as const;
const SEIN_PRETERITE = ["war", "warst", "war", "waren", "wart", "waren"] as const;
const SEIN_SUBJUNCTIVE_I = ["sei", "seiest", "sei", "seien", "seiet", "seien"] as const;
const SEIN_SUBJUNCTIVE_II = ["wäre", "wärest", "wäre", "wären", "wäret", "wären"] as const;
const WERDEN_PRESENT = ["werde", "wirst", "wird", "werden", "werdet", "werden"] as const;

type GermanVerbParts = {
  bareInfinitive: string;
  inseparable: boolean;
  separablePrefix: string;
};

function normalizeGermanVerb(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").normalize("NFC");
}

function detectGermanVerbParts(infinitive: string): GermanVerbParts {
  const separablePrefix =
    [...SEPARABLE_PREFIXES].sort((left, right) => right.length - left.length).find((prefix) => {
      const bare = infinitive.slice(prefix.length);
      return infinitive.startsWith(prefix) && bare.length > 2 && /(?:en|n)$/.test(bare);
    }) ?? "";

  return {
    bareInfinitive: separablePrefix ? infinitive.slice(separablePrefix.length) : infinitive,
    inseparable: INSEPARABLE_PREFIXES.some((prefix) => infinitive.startsWith(prefix)),
    separablePrefix
  };
}

function getGermanStem(infinitive: string): string {
  if (infinitive.endsWith("eln") || infinitive.endsWith("ern")) {
    return infinitive.slice(0, -1);
  }

  if (infinitive.endsWith("en")) {
    return infinitive.slice(0, -2);
  }

  if (infinitive.endsWith("n")) {
    return infinitive.slice(0, -1);
  }

  return infinitive;
}

function needsEInsertion(stem: string): boolean {
  if (/[dt]$/i.test(stem)) {
    return true;
  }

  return /[^aeiouäöü](m|n)$/i.test(stem) && !/(lm|rm)$/i.test(stem);
}

function dropsDuS(stem: string): boolean {
  return /(s|ß|z|x|tz)$/i.test(stem);
}

function appendSeparablePrefix(form: string, prefix: string): string {
  return prefix ? `${form} ${prefix}` : form;
}

function withSubjectPronouns(forms: readonly string[]): VerbConjugationRow[] {
  return forms.map((form, index) => ({
    form,
    label: PERSONAL_PRONOUNS[index]
  }));
}

function withImperativeLabels(forms: readonly string[]): VerbConjugationRow[] {
  return forms.map((form, index) => ({
    form,
    label: IMPERATIVE_LABELS[index]
  }));
}

function singleRow(form: string): VerbConjugationRow[] {
  return [
    {
      form,
      label: "form",
      labelKey: "conjugation.row.form"
    }
  ];
}

function combineAuxiliary(auxiliaryForms: readonly string[], complement: string): string[] {
  return auxiliaryForms.map((auxiliary) => `${auxiliary} ${complement}`);
}

function buildGermanPresentForms(infinitive: string, parts: GermanVerbParts): string[] {
  const stem = getGermanStem(parts.bareInfinitive);
  const epenthetic = needsEInsertion(stem);
  const duEnding = dropsDuS(stem) ? "t" : epenthetic ? "est" : "st";
  const erEnding = epenthetic ? "et" : "t";
  const ihrEnding = epenthetic ? "et" : "t";

  return [
    appendSeparablePrefix(`${stem}e`, parts.separablePrefix),
    appendSeparablePrefix(`${stem}${duEnding}`, parts.separablePrefix),
    appendSeparablePrefix(`${stem}${erEnding}`, parts.separablePrefix),
    appendSeparablePrefix(parts.bareInfinitive, parts.separablePrefix),
    appendSeparablePrefix(`${stem}${ihrEnding}`, parts.separablePrefix),
    appendSeparablePrefix(parts.bareInfinitive, parts.separablePrefix)
  ];
}

function buildGermanPreteriteForms(parts: GermanVerbParts): string[] {
  const stem = getGermanStem(parts.bareInfinitive);
  const preteriteStem = needsEInsertion(stem) ? `${stem}ete` : `${stem}te`;
  const pluralStem = needsEInsertion(stem) ? `${stem}ete` : `${stem}te`;

  return [
    appendSeparablePrefix(preteriteStem, parts.separablePrefix),
    appendSeparablePrefix(`${preteriteStem}st`, parts.separablePrefix),
    appendSeparablePrefix(preteriteStem, parts.separablePrefix),
    appendSeparablePrefix(`${pluralStem}n`, parts.separablePrefix),
    appendSeparablePrefix(`${pluralStem}t`, parts.separablePrefix),
    appendSeparablePrefix(`${pluralStem}n`, parts.separablePrefix)
  ];
}

function buildGermanSubjunctiveIForms(parts: GermanVerbParts): string[] {
  const stem = getGermanStem(parts.bareInfinitive);
  const epenthetic = needsEInsertion(stem);
  const duEnding = epenthetic ? "est" : "est";
  const ihrEnding = epenthetic ? "et" : "et";

  return [
    appendSeparablePrefix(`${stem}e`, parts.separablePrefix),
    appendSeparablePrefix(`${stem}${duEnding}`, parts.separablePrefix),
    appendSeparablePrefix(`${stem}e`, parts.separablePrefix),
    appendSeparablePrefix(`${stem}en`, parts.separablePrefix),
    appendSeparablePrefix(`${stem}${ihrEnding}`, parts.separablePrefix),
    appendSeparablePrefix(`${stem}en`, parts.separablePrefix)
  ];
}

function buildGermanDuImperative(parts: GermanVerbParts): string {
  const stem = getGermanStem(parts.bareInfinitive);
  const duBase = needsEInsertion(stem) ? `${stem}e` : stem;
  return appendSeparablePrefix(duBase, parts.separablePrefix);
}

function buildGermanImperativeForms(infinitive: string, presentForms: readonly string[], parts: GermanVerbParts): string[] {
  return [
    buildGermanDuImperative(parts),
    presentForms[3],
    presentForms[4]
  ];
}

function buildGermanPastParticiple(parts: GermanVerbParts): string {
  const stem = getGermanStem(parts.bareInfinitive);
  const participleSuffix = needsEInsertion(stem) ? "et" : "t";

  if (parts.bareInfinitive.endsWith("ieren")) {
    return `${stem}t`;
  }

  if (parts.separablePrefix) {
    return `${parts.separablePrefix}ge${stem}${participleSuffix}`;
  }

  if (parts.inseparable) {
    return `${stem}${participleSuffix}`;
  }

  return `ge${stem}${participleSuffix}`;
}

function resolveGermanAuxiliary(infinitive: string): "haben" | "sein" {
  return infinitive === "bleiben" ? "sein" : "haben";
}

function getAuxiliaryForms(auxiliary: "haben" | "sein", tense: "present" | "preterite" | "subjunctiveI" | "subjunctiveII") {
  if (auxiliary === "sein") {
    if (tense === "present") {
      return SEIN_PRESENT;
    }
    if (tense === "preterite") {
      return SEIN_PRETERITE;
    }
    if (tense === "subjunctiveI") {
      return SEIN_SUBJUNCTIVE_I;
    }
    return SEIN_SUBJUNCTIVE_II;
  }

  if (tense === "present") {
    return HABEN_PRESENT;
  }
  if (tense === "preterite") {
    return HABEN_PRETERITE;
  }
  if (tense === "subjunctiveI") {
    return HABEN_SUBJUNCTIVE_I;
  }
  return HABEN_SUBJUNCTIVE_II;
}

export function buildGermanConjugation(verbInput: string): VerbConjugationApiResponse {
  const verb = normalizeGermanVerb(verbInput);

  if (/^sich\s+/i.test(verb)) {
    return {
      normalizedVerb: verb,
      reason: "pronominal",
      status: "pending_backend"
    };
  }

  if (!verb || !SIMPLE_GERMAN_VERB_PATTERN.test(verb) || verb.includes(" ") || !/(?:en|n)$/.test(verb)) {
    return {
      normalizedVerb: verb,
      reason: "invalid",
      status: "pending_backend"
    };
  }

  const parts = detectGermanVerbParts(verb);
  const presentForms = buildGermanPresentForms(verb, parts);
  const preteriteForms = buildGermanPreteriteForms(parts);
  const subjunctiveIForms = buildGermanSubjunctiveIForms(parts);
  const subjunctiveIIForms = preteriteForms;
  const imperativeForms = buildGermanImperativeForms(verb, presentForms, parts);
  const pastParticiple = buildGermanPastParticiple(parts);
  const presentParticiple = `${verb}d`;
  const auxiliary = resolveGermanAuxiliary(verb);
  const perfectComplement = `${pastParticiple} ${auxiliary}`;

  const result: VerbConjugationResult = {
    group: "regular",
    infinitive: verb,
    language: "de",
    noteKeys: [],
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
            id: "preterite",
            layout: "personal",
            rows: withSubjectPronouns(preteriteForms)
          },
          {
            id: "perfect",
            layout: "personal",
            rows: withSubjectPronouns(combineAuxiliary(getAuxiliaryForms(auxiliary, "present"), pastParticiple))
          },
          {
            id: "pluperfect",
            layout: "personal",
            rows: withSubjectPronouns(combineAuxiliary(getAuxiliaryForms(auxiliary, "preterite"), pastParticiple))
          },
          {
            id: "futureI",
            layout: "personal",
            rows: withSubjectPronouns(combineAuxiliary(WERDEN_PRESENT, verb))
          },
          {
            id: "futureII",
            layout: "personal",
            rows: withSubjectPronouns(combineAuxiliary(WERDEN_PRESENT, perfectComplement))
          }
        ]
      },
      {
        id: "subjunctive",
        tables: [
          {
            id: "subjunctiveI",
            layout: "personal",
            rows: withSubjectPronouns(subjunctiveIForms)
          },
          {
            id: "subjunctiveIPerfect",
            layout: "personal",
            rows: withSubjectPronouns(combineAuxiliary(getAuxiliaryForms(auxiliary, "subjunctiveI"), pastParticiple))
          },
          {
            id: "subjunctiveII",
            layout: "personal",
            rows: withSubjectPronouns(subjunctiveIIForms)
          },
          {
            id: "subjunctiveIIPerfect",
            layout: "personal",
            rows: withSubjectPronouns(combineAuxiliary(getAuxiliaryForms(auxiliary, "subjunctiveII"), pastParticiple))
          }
        ]
      },
      {
        id: "imperative",
        tables: [
          {
            id: "imperativePresent",
            layout: "personal",
            rows: withImperativeLabels(imperativeForms)
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
            id: "perfectInfinitive",
            layout: "single",
            rows: singleRow(perfectComplement)
          }
        ]
      }
    ]
  };

  return {
    result,
    status: "ok"
  };
}
