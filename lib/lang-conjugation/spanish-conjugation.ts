import type {
  VerbConjugationApiResponse,
  VerbConjugationResult,
  VerbConjugationRow,
  VerbConjugationSection,
  VerbConjugationTable
} from "@/lib/lang-conjugation/types";

export type SpanishVerbGroup = "ar" | "er" | "ir" | "irregular";

export type SpanishConjugationMood =
  | "indicative"
  | "subjunctive"
  | "conditional"
  | "imperative"
  | "participle"
  | "infinitive"
  | "gerund";

export type SpanishConjugationTense =
  | "present"
  | "preterite"
  | "imperfect"
  | "future"
  | "presentPerfect"
  | "pluperfect"
  | "futurePerfect"
  | "subjunctivePresent"
  | "subjunctiveImperfect"
  | "subjunctivePresentPerfect"
  | "subjunctivePluperfect"
  | "conditionalPresent"
  | "conditionalPerfect"
  | "imperativeAffirmative"
  | "pastParticiple"
  | "presentInfinitive"
  | "perfectInfinitive"
  | "presentGerund"
  | "perfectGerund";

export type SpanishConjugationRow = VerbConjugationRow;
export type SpanishConjugationTable = Omit<VerbConjugationTable, "id"> & { id: SpanishConjugationTense };
export type SpanishConjugationSection = Omit<VerbConjugationSection, "id" | "tables"> & {
  id: SpanishConjugationMood;
  tables: SpanishConjugationTable[];
};
export type SpanishConjugationResult = VerbConjugationResult & {
  group: SpanishVerbGroup;
  language: "es";
  sections: SpanishConjugationSection[];
};
export type SpanishConjugationApiResponse = VerbConjugationApiResponse;

type StemChangeType = "e_ie" | "e_i" | "o_ue" | "u_ue";

const PERSONAL_PRONOUNS = [
  "yo",
  "tú",
  "él / ella / usted",
  "nosotros / nosotras",
  "vosotros / vosotras",
  "ellos / ellas / ustedes"
] as const;

const IMPERATIVE_PRONOUNS = [
  "tú",
  "usted",
  "nosotros / nosotras",
  "vosotros / vosotras",
  "ustedes"
] as const;

const SIMPLE_SPANISH_VERB_PATTERN = /^[a-záéíóúüñ'-]+$/i;

const PRESENT_HABER = ["he", "has", "ha", "hemos", "habéis", "han"] as const;
const IMPERFECT_HABER = ["había", "habías", "había", "habíamos", "habíais", "habían"] as const;
const FUTURE_HABER = ["habré", "habrás", "habrá", "habremos", "habréis", "habrán"] as const;
const CONDITIONAL_HABER = ["habría", "habrías", "habría", "habríamos", "habríais", "habrían"] as const;
const PRESENT_SUBJUNCTIVE_HABER = ["haya", "hayas", "haya", "hayamos", "hayáis", "hayan"] as const;
const IMPERFECT_SUBJUNCTIVE_HABER = ["hubiera", "hubieras", "hubiera", "hubiéramos", "hubierais", "hubieran"] as const;

const ACUTE_VOWELS: Record<string, string> = {
  a: "á",
  e: "é",
  i: "í",
  o: "ó",
  u: "ú"
};

export const SPANISH_CONJUGATION_MOOD_LABEL_KEYS = {
  conditional: "conjugation.es.mood.conditional",
  gerund: "conjugation.es.mood.gerund",
  imperative: "conjugation.es.mood.imperative",
  indicative: "conjugation.es.mood.indicative",
  infinitive: "conjugation.es.mood.infinitive",
  participle: "conjugation.es.mood.participle",
  subjunctive: "conjugation.es.mood.subjunctive"
} as const;

export const SPANISH_CONJUGATION_TENSE_LABEL_KEYS = {
  conditionalPerfect: "conjugation.es.tense.conditionalPerfect",
  conditionalPresent: "conjugation.es.tense.conditionalPresent",
  future: "conjugation.es.tense.future",
  futurePerfect: "conjugation.es.tense.futurePerfect",
  imperfect: "conjugation.es.tense.imperfect",
  imperativeAffirmative: "conjugation.es.tense.imperativeAffirmative",
  pastParticiple: "conjugation.es.tense.pastParticiple",
  perfectGerund: "conjugation.es.tense.perfectGerund",
  perfectInfinitive: "conjugation.es.tense.perfectInfinitive",
  pluperfect: "conjugation.es.tense.pluperfect",
  preterite: "conjugation.es.tense.preterite",
  present: "conjugation.es.tense.present",
  presentGerund: "conjugation.es.tense.presentGerund",
  presentInfinitive: "conjugation.es.tense.presentInfinitive",
  presentPerfect: "conjugation.es.tense.presentPerfect",
  subjunctiveImperfect: "conjugation.es.tense.subjunctiveImperfect",
  subjunctivePluperfect: "conjugation.es.tense.subjunctivePluperfect",
  subjunctivePresent: "conjugation.es.tense.subjunctivePresent",
  subjunctivePresentPerfect: "conjugation.es.tense.subjunctivePresentPerfect"
} as const;

export const SPANISH_CONJUGATION_MOOD_ORDER: SpanishConjugationMood[] = [
  "indicative",
  "subjunctive",
  "conditional",
  "imperative",
  "participle",
  "infinitive",
  "gerund"
];

export const SPANISH_CONJUGATION_TENSE_ORDER: SpanishConjugationTense[] = [
  "present",
  "preterite",
  "imperfect",
  "future",
  "presentPerfect",
  "pluperfect",
  "futurePerfect",
  "subjunctivePresent",
  "subjunctiveImperfect",
  "subjunctivePresentPerfect",
  "subjunctivePluperfect",
  "conditionalPresent",
  "conditionalPerfect",
  "imperativeAffirmative",
  "pastParticiple",
  "presentInfinitive",
  "perfectInfinitive",
  "presentGerund",
  "perfectGerund"
];

const STEM_CHANGES: Record<string, StemChangeType> = {
  cerrar: "e_ie",
  comenzar: "e_ie",
  defender: "e_ie",
  empezar: "e_ie",
  entender: "e_ie",
  perder: "e_ie",
  pensar: "e_ie",
  preferir: "e_ie",
  querer: "e_ie",
  recomendar: "e_ie",
  sentir: "e_ie",
  venir: "e_ie",
  volver: "o_ue",
  contar: "o_ue",
  costar: "o_ue",
  demostrar: "o_ue",
  dormir: "o_ue",
  encontrar: "o_ue",
  llover: "o_ue",
  morir: "o_ue",
  mostrar: "o_ue",
  poder: "o_ue",
  recordar: "o_ue",
  resolver: "o_ue",
  jugar: "u_ue",
  conseguir: "e_i",
  corregir: "e_i",
  despedir: "e_i",
  decir: "e_i",
  impedir: "e_i",
  medir: "e_i",
  pedir: "e_i",
  perseguir: "e_i",
  repetir: "e_i",
  reír: "e_i",
  seguir: "e_i",
  servir: "e_i",
  sonreír: "e_i",
  vestir: "e_i"
};

const PRESENT_OVERRIDES: Partial<Record<string, string[]>> = {
  caer: ["caigo", "caes", "cae", "caemos", "caéis", "caen"],
  caber: ["quepo", "cabes", "cabe", "cabemos", "cabéis", "caben"],
  dar: ["doy", "das", "da", "damos", "dais", "dan"],
  estar: ["estoy", "estás", "está", "estamos", "estáis", "están"],
  haber: ["he", "has", "ha", "hemos", "habéis", "han"],
  hacer: ["hago", "haces", "hace", "hacemos", "hacéis", "hacen"],
  ir: ["voy", "vas", "va", "vamos", "vais", "van"],
  decir: ["digo", "dices", "dice", "decimos", "decís", "dicen"],
  oír: ["oigo", "oyes", "oye", "oímos", "oís", "oyen"],
  poner: ["pongo", "pones", "pone", "ponemos", "ponéis", "ponen"],
  saber: ["sé", "sabes", "sabe", "sabemos", "sabéis", "saben"],
  salir: ["salgo", "sales", "sale", "salimos", "salís", "salen"],
  ser: ["soy", "eres", "es", "somos", "sois", "son"],
  tener: ["tengo", "tienes", "tiene", "tenemos", "tenéis", "tienen"],
  traer: ["traigo", "traes", "trae", "traemos", "traéis", "traen"],
  valer: ["valgo", "vales", "vale", "valemos", "valéis", "valen"],
  venir: ["vengo", "vienes", "viene", "venimos", "venís", "vienen"],
  ver: ["veo", "ves", "ve", "vemos", "veis", "ven"]
};

const PRESENT_SUBJUNCTIVE_OVERRIDES: Partial<Record<string, string[]>> = {
  dar: ["dé", "des", "dé", "demos", "deis", "den"],
  estar: ["esté", "estés", "esté", "estemos", "estéis", "estén"],
  haber: ["haya", "hayas", "haya", "hayamos", "hayáis", "hayan"],
  ir: ["vaya", "vayas", "vaya", "vayamos", "vayáis", "vayan"],
  saber: ["sepa", "sepas", "sepa", "sepamos", "sepáis", "sepan"],
  ser: ["sea", "seas", "sea", "seamos", "seáis", "sean"]
};

const IMPERFECT_OVERRIDES: Partial<Record<string, string[]>> = {
  ir: ["iba", "ibas", "iba", "íbamos", "ibais", "iban"],
  ser: ["era", "eras", "era", "éramos", "erais", "eran"],
  ver: ["veía", "veías", "veía", "veíamos", "veíais", "veían"]
};

const PRETERITE_OVERRIDES: Partial<Record<string, string[]>> = {
  dar: ["di", "diste", "dio", "dimos", "disteis", "dieron"],
  ir: ["fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron"],
  ser: ["fui", "fuiste", "fue", "fuimos", "fuisteis", "fueron"],
  ver: ["vi", "viste", "vio", "vimos", "visteis", "vieron"]
};

const PRETERITE_STEM_OVERRIDES: Partial<Record<string, string>> = {
  andar: "anduv",
  caber: "cup",
  conducir: "conduj",
  dar: "di",
  decir: "dij",
  estar: "estuv",
  haber: "hub",
  hacer: "hic",
  poner: "pus",
  poder: "pud",
  querer: "quis",
  saber: "sup",
  tener: "tuv",
  traer: "traj",
  traducir: "traduj",
  venir: "vin"
};

const FUTURE_STEM_OVERRIDES: Partial<Record<string, string>> = {
  caber: "cabr",
  decir: "dir",
  haber: "habr",
  hacer: "har",
  poder: "podr",
  poner: "pondr",
  querer: "querr",
  saber: "sabr",
  salir: "saldr",
  tener: "tendr",
  valer: "valdr",
  venir: "vendr"
};

const PAST_PARTICIPLE_OVERRIDES: Partial<Record<string, string>> = {
  abrir: "abierto",
  cubrir: "cubierto",
  decir: "dicho",
  escribir: "escrito",
  hacer: "hecho",
  morir: "muerto",
  poner: "puesto",
  resolver: "resuelto",
  romper: "roto",
  ver: "visto",
  volver: "vuelto"
};

const GERUND_OVERRIDES: Partial<Record<string, string>> = {
  decir: "diciendo",
  dormir: "durmiendo",
  ir: "yendo",
  leer: "leyendo",
  morir: "muriendo",
  oír: "oyendo",
  pedir: "pidiendo",
  poder: "pudiendo",
  reír: "riendo",
  seguir: "siguiendo",
  sonreír: "sonriendo",
  traer: "trayendo",
  venir: "viniendo",
  vestir: "vistiendo"
};

const IMPERATIVE_TU_OVERRIDES: Partial<Record<string, string>> = {
  decir: "di",
  hacer: "haz",
  ir: "ve",
  poner: "pon",
  salir: "sal",
  ser: "sé",
  tener: "ten",
  venir: "ven"
};

const NON_EXISTENT_IMPERATIVE_VERBS = new Set(["haber"]);
const UIR_VERB_PATTERN = /uir$/;
const GUIR_VERB_PATTERN = /guir$/;
const ZCO_VERBS = new Set([
  "agradecer",
  "aparecer",
  "conducir",
  "conocer",
  "crecer",
  "desaparecer",
  "establecer",
  "merecer",
  "nacer",
  "obedecer",
  "ofrecer",
  "parecer",
  "pertenecer",
  "producir",
  "reconocer",
  "traducir"
]);
const GER_GIR_PATTERN = /g[ei]r$/;
const PRETERITE_Y_PATTERN = /(?:aer|eer|oír|oer|uir)$/;

function normalizeSpanishVerb(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").normalize("NFC");
}

function normalizeSpanishAlias(verb: string): string {
  switch (verb) {
    case "oir":
      return "oír";
    case "reir":
      return "reír";
    case "sonreir":
      return "sonreír";
    default:
      return verb;
  }
}

function getSpanishVerbGroup(verb: string): Exclude<SpanishVerbGroup, "irregular"> | null {
  if (/(?:a)r$/.test(verb) && verb.length > 1) {
    return "ar";
  }

  if (/(?:e)r$/.test(verb) && verb.length > 1) {
    return "er";
  }

  if (/(?:i|í)r$/.test(verb) && verb.length > 1) {
    return "ir";
  }

  return null;
}

function getStem(verb: string): string {
  return verb.slice(0, -2);
}

function withSubjectPronouns(forms: readonly string[]): SpanishConjugationRow[] {
  return forms.map((form, index) => ({
    form,
    label: PERSONAL_PRONOUNS[index]
  }));
}

function withImperativeLabels(forms: readonly string[]): SpanishConjugationRow[] {
  return forms.map((form, index) => ({
    form,
    label: IMPERATIVE_PRONOUNS[index]
  }));
}

function singleRow(form: string): SpanishConjugationRow[] {
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

function accentLastVowel(value: string): string {
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const char = value[index].toLowerCase();
    const accented = ACUTE_VOWELS[char];
    if (accented) {
      return `${value.slice(0, index)}${accented}${value.slice(index + 1)}`;
    }
  }

  return value;
}

function applyStemChange(stem: string, type: StemChangeType): string {
  if (type === "u_ue") {
    const match = stem.match(/u(?!.*u)/);
    if (!match || match.index === undefined) {
      return stem;
    }

    return `${stem.slice(0, match.index)}ue${stem.slice(match.index + 1)}`;
  }

  const target = type === "o_ue" ? "o" : "e";
  const replacement = type === "o_ue" ? "ue" : type === "e_ie" ? "ie" : "i";
  const match = stem.match(new RegExp(`${target}(?!.*${target})`));
  if (!match || match.index === undefined) {
    return stem;
  }

  return `${stem.slice(0, match.index)}${replacement}${stem.slice(match.index + 1)}`;
}

function applyReducedStemChange(stem: string, type: StemChangeType): string {
  if (type === "o_ue") {
    const match = stem.match(/o(?!.*o)/);
    if (!match || match.index === undefined) {
      return stem;
    }

    return `${stem.slice(0, match.index)}u${stem.slice(match.index + 1)}`;
  }

  if (type === "e_ie" || type === "e_i") {
    const match = stem.match(/e(?!.*e)/);
    if (!match || match.index === undefined) {
      return stem;
    }

    return `${stem.slice(0, match.index)}i${stem.slice(match.index + 1)}`;
  }

  return stem;
}

function combineStemAndEnding(stem: string, ending: string): string {
  if (/^[eé]/.test(ending)) {
    if (stem.endsWith("c")) {
      return `${stem.slice(0, -1)}qu${ending}`;
    }

    if (stem.endsWith("g")) {
      return `${stem}u${ending}`;
    }

    if (stem.endsWith("z")) {
      return `${stem.slice(0, -1)}c${ending}`;
    }
  }

  return `${stem}${ending}`;
}

function buildSubjunctiveBaseStem(verb: string): string {
  const stem = getStem(verb);
  const stemChange = STEM_CHANGES[verb];
  const presentOverride = PRESENT_OVERRIDES[verb];

  if (presentOverride && !PRESENT_SUBJUNCTIVE_OVERRIDES[verb]) {
    return presentOverride[0].endsWith("o") ? presentOverride[0].slice(0, -1) : presentOverride[0];
  }

  if (UIR_VERB_PATTERN.test(verb) && !GUIR_VERB_PATTERN.test(verb)) {
    return `${stem}y`;
  }

  if (GUIR_VERB_PATTERN.test(verb)) {
    const reducedStem = stem.slice(0, -1);
    return stemChange ? applyReducedStemChange(reducedStem, stemChange) : reducedStem;
  }

  if (ZCO_VERBS.has(verb)) {
    return `${stem.slice(0, -1)}zc`;
  }

  if (GER_GIR_PATTERN.test(verb)) {
    return `${stem.slice(0, -1)}j`;
  }

  return stem;
}

function buildPresentForms(verb: string, group: Exclude<SpanishVerbGroup, "irregular">): string[] {
  const override = PRESENT_OVERRIDES[verb];
  if (override) {
    return override;
  }

  const stem = getStem(verb);
  const endings =
    group === "ar"
      ? ["o", "as", "a", "amos", "áis", "an"]
      : group === "er"
        ? ["o", "es", "e", "emos", "éis", "en"]
        : ["o", "es", "e", "imos", "ís", "en"];

  if (UIR_VERB_PATTERN.test(verb) && !GUIR_VERB_PATTERN.test(verb)) {
    return [
      `${stem}yo`,
      `${stem}yes`,
      `${stem}ye`,
      `${stem}imos`,
      `${stem}ís`,
      `${stem}yen`
    ];
  }

  if (GUIR_VERB_PATTERN.test(verb)) {
    const baseStem = stem.slice(0, -1);
    const changedStem = STEM_CHANGES[verb] ? applyStemChange(baseStem, STEM_CHANGES[verb]) : baseStem;
    return [
      `${changedStem}o`,
      `${changedStem}${endings[1]}`,
      `${changedStem}${endings[2]}`,
      `${baseStem}${endings[3]}`,
      `${baseStem}${endings[4]}`,
      `${changedStem}${endings[5]}`
    ];
  }

  if (ZCO_VERBS.has(verb)) {
    return [
      `${stem.slice(0, -1)}zco`,
      `${stem}${endings[1]}`,
      `${stem}${endings[2]}`,
      `${stem}${endings[3]}`,
      `${stem}${endings[4]}`,
      `${stem}${endings[5]}`
    ];
  }

  if (GER_GIR_PATTERN.test(verb)) {
    return [
      `${stem.slice(0, -1)}jo`,
      `${stem}${endings[1]}`,
      `${stem}${endings[2]}`,
      `${stem}${endings[3]}`,
      `${stem}${endings[4]}`,
      `${stem}${endings[5]}`
    ];
  }

  const stemChange = STEM_CHANGES[verb];
  if (!stemChange) {
    return endings.map((ending) => `${stem}${ending}`);
  }

  const changedStem = applyStemChange(stem, stemChange);
  return [
    `${changedStem}${endings[0]}`,
    `${changedStem}${endings[1]}`,
    `${changedStem}${endings[2]}`,
    `${stem}${endings[3]}`,
    `${stem}${endings[4]}`,
    `${changedStem}${endings[5]}`
  ];
}

function buildImperfectForms(verb: string, group: Exclude<SpanishVerbGroup, "irregular">): string[] {
  const override = IMPERFECT_OVERRIDES[verb];
  if (override) {
    return override;
  }

  const stem = getStem(verb);
  const endings =
    group === "ar"
      ? ["aba", "abas", "aba", "ábamos", "abais", "aban"]
      : ["ía", "ías", "ía", "íamos", "íais", "ían"];

  return endings.map((ending) => `${stem}${ending}`);
}

function buildPreteriteForms(verb: string, group: Exclude<SpanishVerbGroup, "irregular">): string[] {
  const override = PRETERITE_OVERRIDES[verb];
  if (override) {
    return override;
  }

  const irregularStem = PRETERITE_STEM_OVERRIDES[verb];
  if (irregularStem) {
    const isJStem = irregularStem.endsWith("j");
    const thirdSingular = verb === "hacer" ? "hizo" : `${irregularStem}o`;
    return [
      `${irregularStem}e`,
      `${irregularStem}iste`,
      thirdSingular,
      `${irregularStem}imos`,
      `${irregularStem}isteis`,
      `${irregularStem}${isJStem ? "eron" : "ieron"}`
    ];
  }

  const stem = getStem(verb);
  const stemChange = STEM_CHANGES[verb];

  if (group === "ar") {
    const yoStem =
      verb.endsWith("car") ? `${stem.slice(0, -1)}qu` : verb.endsWith("gar") ? `${stem}u` : verb.endsWith("zar") ? `${stem.slice(0, -1)}c` : stem;

    return [
      `${yoStem}é`,
      `${stem}aste`,
      `${stem}ó`,
      `${stem}amos`,
      `${stem}asteis`,
      `${stem}aron`
    ];
  }

  const usesYForms = PRETERITE_Y_PATTERN.test(verb);
  const thirdPersonStem =
    group === "ir" && stemChange ? applyReducedStemChange(stem, stemChange) : stem;

  return [
    `${stem}í`,
    `${stem}iste`,
    `${thirdPersonStem}${usesYForms ? "yó" : "ió"}`,
    `${stem}imos`,
    `${stem}isteis`,
    `${thirdPersonStem}${usesYForms ? "yeron" : "ieron"}`
  ];
}

function buildFutureForms(verb: string): string[] {
  const stem = FUTURE_STEM_OVERRIDES[verb] ?? verb;
  return ["é", "ás", "á", "emos", "éis", "án"].map((ending) => `${stem}${ending}`);
}

function buildConditionalForms(verb: string): string[] {
  const stem = FUTURE_STEM_OVERRIDES[verb] ?? verb;
  return ["ía", "ías", "ía", "íamos", "íais", "ían"].map((ending) => `${stem}${ending}`);
}

function buildPresentSubjunctiveForms(verb: string, group: Exclude<SpanishVerbGroup, "irregular">): string[] {
  const override = PRESENT_SUBJUNCTIVE_OVERRIDES[verb];
  if (override) {
    return override;
  }

  const stemChange = STEM_CHANGES[verb];
  const baseStem = buildSubjunctiveBaseStem(verb);
  const nonNosStem = stemChange ? applyStemChange(baseStem, stemChange) : baseStem;
  const nosVosStem =
    !stemChange
      ? baseStem
      : group === "ir"
        ? applyReducedStemChange(baseStem, stemChange)
        : baseStem;

  const endings =
    group === "ar"
      ? ["e", "es", "e", "emos", "éis", "en"]
      : ["a", "as", "a", "amos", "áis", "an"];

  return [
    combineStemAndEnding(nonNosStem, endings[0]),
    combineStemAndEnding(nonNosStem, endings[1]),
    combineStemAndEnding(nonNosStem, endings[2]),
    combineStemAndEnding(nosVosStem, endings[3]),
    combineStemAndEnding(nosVosStem, endings[4]),
    combineStemAndEnding(nonNosStem, endings[5])
  ];
}

function buildSubjunctiveImperfectForms(preteriteForms: readonly string[]): string[] {
  const thirdPlural = preteriteForms[5];
  const stem = thirdPlural.endsWith("ron") ? thirdPlural.slice(0, -3) : thirdPlural;
  const nosotrosStem = accentLastVowel(stem);
  return [
    `${stem}ra`,
    `${stem}ras`,
    `${stem}ra`,
    `${nosotrosStem}ramos`,
    `${stem}rais`,
    `${stem}ran`
  ];
}

function buildPastParticiple(verb: string, group: Exclude<SpanishVerbGroup, "irregular">): string {
  const override = PAST_PARTICIPLE_OVERRIDES[verb];
  if (override) {
    return override;
  }

  const stem = getStem(verb);
  if (group === "ar") {
    return `${stem}ado`;
  }

  if (/[aeoáéó]$/.test(stem) && !UIR_VERB_PATTERN.test(verb)) {
    return `${stem}ído`;
  }

  return `${stem}ido`;
}

function buildPresentGerund(verb: string, group: Exclude<SpanishVerbGroup, "irregular">): string {
  const override = GERUND_OVERRIDES[verb];
  if (override) {
    return override;
  }

  const stem = getStem(verb);
  const stemChange = STEM_CHANGES[verb];

  if (group === "ar") {
    return `${stem}ando`;
  }

  if (PRETERITE_Y_PATTERN.test(verb)) {
    return `${stem}yendo`;
  }

  if (group === "ir" && stemChange) {
    return `${applyReducedStemChange(stem, stemChange)}iendo`;
  }

  return `${stem}iendo`;
}

function buildImperativeAffirmativeForms(
  verb: string,
  presentForms: readonly string[],
  presentSubjunctiveForms: readonly string[]
): string[] {
  if (NON_EXISTENT_IMPERATIVE_VERBS.has(verb)) {
    return ["—", "—", "—", "—", "—"];
  }

  return [
    IMPERATIVE_TU_OVERRIDES[verb] ?? presentForms[2],
    presentSubjunctiveForms[2],
    presentSubjunctiveForms[3],
    `${verb.slice(0, -1)}d`,
    presentSubjunctiveForms[5]
  ];
}

export function buildSpanishConjugation(verbInput: string): SpanishConjugationApiResponse {
  const normalizedInput = normalizeSpanishVerb(verbInput);
  const verb = normalizeSpanishAlias(normalizedInput);

  if (verb.endsWith("se")) {
    return {
      normalizedVerb: verb,
      reason: "pronominal",
      status: "pending_backend"
    };
  }

  if (!verb || !SIMPLE_SPANISH_VERB_PATTERN.test(verb) || verb.includes(" ")) {
    return {
      normalizedVerb: verb,
      reason: "invalid",
      status: "pending_backend"
    };
  }

  const group = getSpanishVerbGroup(verb);
  if (!group) {
    return {
      normalizedVerb: verb,
      reason: "invalid",
      status: "pending_backend"
    };
  }

  const presentForms = buildPresentForms(verb, group);
  const imperfectForms = buildImperfectForms(verb, group);
  const preteriteForms = buildPreteriteForms(verb, group);
  const futureForms = buildFutureForms(verb);
  const conditionalForms = buildConditionalForms(verb);
  const presentSubjunctiveForms = buildPresentSubjunctiveForms(verb, group);
  const subjunctiveImperfectForms = buildSubjunctiveImperfectForms(preteriteForms);
  const pastParticiple = buildPastParticiple(verb, group);
  const presentGerund = buildPresentGerund(verb, group);
  const imperativeAffirmativeForms = buildImperativeAffirmativeForms(verb, presentForms, presentSubjunctiveForms);

  return {
    result: {
      group:
        PRESENT_OVERRIDES[verb] ||
        PRESENT_SUBJUNCTIVE_OVERRIDES[verb] ||
        PRETERITE_OVERRIDES[verb] ||
        PRETERITE_STEM_OVERRIDES[verb] ||
        FUTURE_STEM_OVERRIDES[verb] ||
        PAST_PARTICIPLE_OVERRIDES[verb] ||
        GERUND_OVERRIDES[verb] ||
        IMPERATIVE_TU_OVERRIDES[verb] ||
        STEM_CHANGES[verb]
          ? "irregular"
          : group,
      infinitive: verb,
      language: "es",
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
              id: "imperfect",
              layout: "personal",
              rows: withSubjectPronouns(imperfectForms)
            },
            {
              id: "future",
              layout: "personal",
              rows: withSubjectPronouns(futureForms)
            },
            {
              id: "presentPerfect",
              layout: "personal",
              rows: withSubjectPronouns(combineAuxiliary(PRESENT_HABER, pastParticiple))
            },
            {
              id: "pluperfect",
              layout: "personal",
              rows: withSubjectPronouns(combineAuxiliary(IMPERFECT_HABER, pastParticiple))
            },
            {
              id: "futurePerfect",
              layout: "personal",
              rows: withSubjectPronouns(combineAuxiliary(FUTURE_HABER, pastParticiple))
            }
          ]
        },
        {
          id: "subjunctive",
          tables: [
            {
              id: "subjunctivePresent",
              layout: "personal",
              rows: withSubjectPronouns(presentSubjunctiveForms)
            },
            {
              id: "subjunctiveImperfect",
              layout: "personal",
              rows: withSubjectPronouns(subjunctiveImperfectForms)
            },
            {
              id: "subjunctivePresentPerfect",
              layout: "personal",
              rows: withSubjectPronouns(combineAuxiliary(PRESENT_SUBJUNCTIVE_HABER, pastParticiple))
            },
            {
              id: "subjunctivePluperfect",
              layout: "personal",
              rows: withSubjectPronouns(combineAuxiliary(IMPERFECT_SUBJUNCTIVE_HABER, pastParticiple))
            }
          ]
        },
        {
          id: "conditional",
          tables: [
            {
              id: "conditionalPresent",
              layout: "personal",
              rows: withSubjectPronouns(conditionalForms)
            },
            {
              id: "conditionalPerfect",
              layout: "personal",
              rows: withSubjectPronouns(combineAuxiliary(CONDITIONAL_HABER, pastParticiple))
            }
          ]
        },
        {
          id: "imperative",
          tables: [
            {
              id: "imperativeAffirmative",
              layout: "personal",
              rows: withImperativeLabels(imperativeAffirmativeForms)
            }
          ]
        },
        {
          id: "participle",
          tables: [
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
              rows: singleRow(`haber ${pastParticiple}`)
            }
          ]
        },
        {
          id: "gerund",
          tables: [
            {
              id: "presentGerund",
              layout: "single",
              rows: singleRow(presentGerund)
            },
            {
              id: "perfectGerund",
              layout: "single",
              rows: singleRow(`habiendo ${pastParticiple}`)
            }
          ]
        }
      ]
    },
    status: "ok"
  };
}
