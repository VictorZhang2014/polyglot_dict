import { ConjugationPageClient } from "@/components/conjugation-page-client";
import { getFrenchConjugationEntryLemmas } from "@/lib/lang-conjugation/french-verb-relations";
import { buildVerbConjugationResponse } from "@/lib/lang-conjugation/verb-conjugation-server";

type ConjugationPageProps = {
  searchParams?: {
    q?: string;
    code?: string;
  };
};

export default function ConjugationPage({ searchParams }: ConjugationPageProps) {
  const sourceWord = searchParams?.q?.trim() ?? "";
  const sourceLanguage = searchParams?.code?.trim().toLowerCase() ?? "";
  const relatedEntries =
    sourceLanguage === "fr"
      ? getFrenchConjugationEntryLemmas(sourceWord).filter(
          (entry) => buildVerbConjugationResponse("fr", entry).status === "ok"
        )
      : [];

  return (
    <ConjugationPageClient
      relatedEntries={relatedEntries}
      sourceWord={sourceWord}
      sourceLanguage={sourceLanguage}
    />
  );
}
