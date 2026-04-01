import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

export default function nextConfig(phase) {
  return {
    reactStrictMode: true,
    // Keep development and production artifacts separate so `next dev` and `next build`
    // do not corrupt each other's server chunk graph.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    async headers() {
      return [
        {
          source: "/service-worker.js",
          headers: [
            {
              key: "Cache-Control",
              value: "no-cache, no-store, must-revalidate"
            },
            {
              key: "Service-Worker-Allowed",
              value: "/"
            }
          ]
        }
      ];
    }
  };
}
