export type GuardrailPartOfSpeech =
  | "noun"
  | "verb"
  | "adjective"
  | "adverb"
  | "pronoun"
  | "preposition"
  | "conjunction"
  | "interjection"
  | "numeral"
  | "particle"
  | "determiner"
  | "unknown";

export type LanguageWordGuardrail = {
  partOfSpeech: GuardrailPartOfSpeech;
  lemma?: string;
  morphology?: string;
};

type GuardrailMap = Record<string, Record<string, LanguageWordGuardrail>>;

const WORD_GUARDRAILS: GuardrailMap = {
  de: {
    der: { partOfSpeech: "determiner", lemma: "der", morphology: "定冠词" },
    die: { partOfSpeech: "determiner", lemma: "der", morphology: "定冠词" },
    das: { partOfSpeech: "determiner", lemma: "der", morphology: "定冠词" },
    den: { partOfSpeech: "determiner", lemma: "der", morphology: "定冠词" },
    dem: { partOfSpeech: "determiner", lemma: "der", morphology: "定冠词" },
    des: { partOfSpeech: "determiner", lemma: "der", morphology: "定冠词" },
    ein: { partOfSpeech: "determiner", lemma: "ein", morphology: "不定冠词" },
    eine: { partOfSpeech: "determiner", lemma: "ein", morphology: "不定冠词" },
    einen: { partOfSpeech: "determiner", lemma: "ein", morphology: "不定冠词" },
    einem: { partOfSpeech: "determiner", lemma: "ein", morphology: "不定冠词" },
    einer: { partOfSpeech: "determiner", lemma: "ein", morphology: "不定冠词" },
    eines: { partOfSpeech: "determiner", lemma: "ein", morphology: "不定冠词" }
  },
  fr: {
    le: { partOfSpeech: "determiner" },
    la: { partOfSpeech: "determiner" },
    les: { partOfSpeech: "determiner" },
    un: { partOfSpeech: "determiner" },
    une: { partOfSpeech: "determiner" },
    des: { partOfSpeech: "determiner" },
    du: { partOfSpeech: "determiner" },
    "l'": { partOfSpeech: "determiner" }
  },
  es: {
    el: { partOfSpeech: "determiner" },
    la: { partOfSpeech: "determiner" },
    los: { partOfSpeech: "determiner" },
    las: { partOfSpeech: "determiner" },
    un: { partOfSpeech: "determiner" },
    una: { partOfSpeech: "determiner" },
    unos: { partOfSpeech: "determiner" },
    unas: { partOfSpeech: "determiner" }
  },
  it: {
    il: { partOfSpeech: "determiner" },
    lo: { partOfSpeech: "determiner" },
    la: { partOfSpeech: "determiner" },
    i: { partOfSpeech: "determiner" },
    gli: { partOfSpeech: "determiner" },
    le: { partOfSpeech: "determiner" },
    un: { partOfSpeech: "determiner" },
    uno: { partOfSpeech: "determiner" },
    una: { partOfSpeech: "determiner" }
  },
  pt: {
    o: { partOfSpeech: "determiner" },
    a: { partOfSpeech: "determiner" },
    os: { partOfSpeech: "determiner" },
    as: { partOfSpeech: "determiner" },
    um: { partOfSpeech: "determiner" },
    uma: { partOfSpeech: "determiner" },
    uns: { partOfSpeech: "determiner" },
    umas: { partOfSpeech: "determiner" }
  },
  en: {
    the: { partOfSpeech: "determiner" },
    a: { partOfSpeech: "determiner" },
    an: { partOfSpeech: "determiner" }
  }
};

function normalizeCode(code: string): string {
  return code.trim().toLowerCase();
}

function normalizeWord(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ");
}

export function getLanguageWordGuardrail(languageCode: string, word: string): LanguageWordGuardrail | null {
  const code = normalizeCode(languageCode);
  const normalizedWord = normalizeWord(word);
  const map = WORD_GUARDRAILS[code];
  if (!map) {
    return null;
  }

  return map[normalizedWord] ?? null;
}
