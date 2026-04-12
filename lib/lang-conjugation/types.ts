export type SupportedConjugationLanguage = "de" | "fr";

export type VerbConjugationLayout = "personal" | "single";

export type VerbConjugationRow = {
  form: string;
  label: string;
  labelKey?: string;
};

export type VerbConjugationTable = {
  id: string;
  layout: VerbConjugationLayout;
  rows: VerbConjugationRow[];
};

export type VerbConjugationSection = {
  id: string;
  tables: VerbConjugationTable[];
};

export type VerbConjugationResult = {
  group: string;
  infinitive: string;
  language: SupportedConjugationLanguage;
  noteKeys: string[];
  sections: VerbConjugationSection[];
};

export type VerbConjugationApiResponse =
  | {
      result: VerbConjugationResult;
      status: "ok";
    }
  | {
      normalizedVerb: string;
      reason: "invalid" | "irregular" | "not_found" | "pronominal" | "spelling";
      status: "pending_backend";
    };
