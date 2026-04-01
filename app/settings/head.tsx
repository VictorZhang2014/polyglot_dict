import { resolveCanonical, SITE_NAME } from "@/lib/seo";

const TITLE = `Settings | ${SITE_NAME}`;
const DESCRIPTION = "Manage interface language, theme, and translation preferences for ParlerAI.";

export default function Head() {
  return (
    <>
      <title>{TITLE}</title>
      <meta name="description" content={DESCRIPTION} />
      <link rel="canonical" href={resolveCanonical("/settings")} />
      <meta name="robots" content="noindex, nofollow" />
      <meta property="og:title" content={TITLE} />
      <meta property="og:description" content={DESCRIPTION} />
      <meta property="og:url" content={resolveCanonical("/settings")} />
      <meta name="twitter:title" content={TITLE} />
      <meta name="twitter:description" content={DESCRIPTION} />
    </>
  );
}
