import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source:
          "/:path((?!_next(?:/|$)|articles(?:/|$)|category(?:/|$)|tags(?:/|$)|contact(?:/|$)|search(?:/|$)|robots\\.txt$|sitemap\\.xml$|favicon\\.ico$|icon(?:/|$)|apple-icon(?:/|$)).+)",
        destination: "/",
        statusCode: 301,
      },
    ];
  },
};

export default nextConfig;
