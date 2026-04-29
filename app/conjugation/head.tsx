import { resolveCanonical, SITE_NAME } from "@/lib/seo";

const TITLE = `Verb Conjugation | ${SITE_NAME}`;
const DESCRIPTION = "View full German, French, and Spanish verb conjugation tables generated from built-in rules and irregular data.";

export default function Head() {
  return (
    <>
      <title>{TITLE}</title>
      <meta name="description" content={DESCRIPTION} />
      <link rel="canonical" href={resolveCanonical("/conjugation")} />
      <meta name="robots" content="noindex, nofollow" />
      <meta property="og:title" content={TITLE} />
      <meta property="og:description" content={DESCRIPTION} />
      <meta property="og:url" content={resolveCanonical("/conjugation")} />
      <meta name="twitter:title" content={TITLE} />
      <meta name="twitter:description" content={DESCRIPTION} />
    </>
  );
}
