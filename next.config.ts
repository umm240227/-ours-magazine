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
  "admin",
  "api",
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
      {
        protocol: "https",
        hostname: "images.unsplash.com",
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
