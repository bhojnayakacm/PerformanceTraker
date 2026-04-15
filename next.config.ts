import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // Never precache server-side work — always hit the network for fresh data.
  exclude: [/\/api\//, /_next\/static\/.*\.map$/],
});

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSerwist(nextConfig);
