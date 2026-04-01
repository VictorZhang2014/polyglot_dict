import { resolveCanonical, SITE_NAME } from "@/lib/seo";

const TITLE = `Text Translator | ${SITE_NAME}`;
const DESCRIPTION =
  "Translate full sentences and short text across multiple languages with AI-powered translation, speech playback, and voice transcription.";

export default function Head() {
  return (
    <>
      <title>{TITLE}</title>
      <meta name="description" content={DESCRIPTION} />
      <meta
        name="keywords"
        content="text translator, AI translation, multilingual translation, voice transcription, speech playback"
      />
      <link rel="canonical" href={resolveCanonical("/translate")} />
      <meta property="og:title" content={TITLE} />
      <meta property="og:description" content={DESCRIPTION} />
      <meta property="og:url" content={resolveCanonical("/translate")} />
      <meta name="twitter:title" content={TITLE} />
      <meta name="twitter:description" content={DESCRIPTION} />
    </>
  );
}
