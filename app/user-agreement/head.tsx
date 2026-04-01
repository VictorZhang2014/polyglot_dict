import { resolveCanonical, SITE_NAME } from "@/lib/seo";

const TITLE = `User Agreement | ${SITE_NAME}`;
const DESCRIPTION = "Review the ParlerAI user agreement, service terms, acceptable use, and account responsibilities.";

export default function Head() {
  return (
    <>
      <title>{TITLE}</title>
      <meta name="description" content={DESCRIPTION} />
      <link rel="canonical" href={resolveCanonical("/user-agreement")} />
      <meta property="og:title" content={TITLE} />
      <meta property="og:description" content={DESCRIPTION} />
      <meta property="og:url" content={resolveCanonical("/user-agreement")} />
      <meta name="twitter:title" content={TITLE} />
      <meta name="twitter:description" content={DESCRIPTION} />
    </>
  );
}
