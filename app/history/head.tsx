import { resolveCanonical, SITE_NAME } from "@/lib/seo";

const TITLE = `Query History | ${SITE_NAME}`;
const DESCRIPTION = "Review recent dictionary lookups and reopen previous word search results.";

export default function Head() {
  return (
    <>
      <title>{TITLE}</title>
      <meta name="description" content={DESCRIPTION} />
      <link rel="canonical" href={resolveCanonical("/history")} />
      <meta name="robots" content="noindex, nofollow" />
      <meta property="og:title" content={TITLE} />
      <meta property="og:description" content={DESCRIPTION} />
      <meta property="og:url" content={resolveCanonical("/history")} />
      <meta name="twitter:title" content={TITLE} />
      <meta name="twitter:description" content={DESCRIPTION} />
    </>
  );
}
