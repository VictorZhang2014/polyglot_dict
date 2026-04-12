import { ConjugationPageClient } from "@/components/conjugation-page-client";

type ConjugationPageProps = {
  searchParams?: {
    q?: string;
    code?: string;
  };
};

export default function ConjugationPage({ searchParams }: ConjugationPageProps) {
  const sourceWord = searchParams?.q?.trim() ?? "";
  const sourceLanguage = searchParams?.code?.trim().toLowerCase() ?? "";

  return <ConjugationPageClient sourceWord={sourceWord} sourceLanguage={sourceLanguage} />;
}
