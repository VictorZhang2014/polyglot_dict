export const VERB_CONJUGATION_SUPPORTED_SOURCE_LANGUAGES = ["fr"] as const;

export function supportsVerbConjugationLanguage(code: string): boolean {
  return VERB_CONJUGATION_SUPPORTED_SOURCE_LANGUAGES.includes(code.trim().toLowerCase() as never);
}
