import { resolveCanonical, SITE_NAME } from "@/lib/seo";

const TITLE = `Privacy Policy | ${SITE_NAME}`;
const DESCRIPTION = "Read the ParlerAI privacy policy, including data handling, retention, and user rights information.";

export default function Head() {
  return (
    <>
      <title>{TITLE}</title>
      <meta name="description" content={DESCRIPTION} />
      <link rel="canonical" href={resolveCanonical("/privacy-policy")} />
      <meta property="og:title" content={TITLE} />
      <meta property="og:description" content={DESCRIPTION} />
      <meta property="og:url" content={resolveCanonical("/privacy-policy")} />
      <meta name="twitter:title" content={TITLE} />
      <meta name="twitter:description" content={DESCRIPTION} />
    </>
  );
}
