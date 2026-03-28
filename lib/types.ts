export type LanguageOption = {
  code: string;
  name: string;
};

export type TranslationItem = {
  targetLanguage: string;
  directTranslation: string;
  similarWords: string[];
};

export type SourceGenderHint = {
  gender: string;
  article: string;
  word: string;
};

export type TranslationPayload = {
  sourceWord: string;
  sourceLanguage: string;
  sourcePhonetic?: string;
  correctedSourceWord?: string;
  sourcePartOfSpeech?: string;
  sourceLemma?: string;
  sourceMorphology?: string;
  sourceGenderHints?: SourceGenderHint[];
  translations: TranslationItem[];
};

export type TranslateApiResponse = {
  fromCache: boolean;
  cachedAt?: number;
  data: TranslationPayload;
};

export type TextTranslationItem = {
  targetLanguage: string;
  translatedText: string;
};

export type TextTranslationPayload = {
  sourceText: string;
  sourceLanguage: string;
  translations: TextTranslationItem[];
};

export type TranslateTextApiResponse = {
  fromCache: boolean;
  cachedAt?: number;
  data: TextTranslationPayload;
};

export type AppSettings = {
  targetLanguages: string[];
  customLanguages: LanguageOption[];
  uiLanguage: string;
};
