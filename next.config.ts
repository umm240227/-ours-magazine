import type { NextConfig } from "next";

const redirectProtectedPrefixes = [
  "_next",
  "images",
  "articles",
  "category",
  "tags",
  "contact",
  "search",
  "icon",
  "apple-icon",
].join("|");

const redirectProtectedFiles = [
  "robots\\.txt",
  "sitemap\\.xml",
  "favicon\\.ico",
].join("|");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
        pathname: "/**",
      },
    ],
  },
  async redirects() {
    return [
      {
        source:
          `/:path((?!(?:${redirectProtectedPrefixes})(?:/|$))(?!(?:${redirectProtectedFiles})$)(?!.*\\.[^/]+$).+)`,
        destination: "/",
        statusCode: 301,
      },
    ];
  },
};

export default nextConfig;
