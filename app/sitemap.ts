import type { MetadataRoute } from "next";

import {
  getAllArticles,
  getCategoryStaticParams,
  getTagStaticParams,
  normalizeCategory,
} from "../lib/markdown";

const siteUrl = "https://www.ours-magazine.jp";

const categoryBySlug: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X（Twitter）",
  youtube: "YouTube",
  sns: "SNS運用",
};

const legacySlugByCategory: Record<string, string> = {
  "instagram攻略": "instagram",
  "tiktok攻略": "tiktok",
  "x（twitter）": "x",
  "x（ｔｗｉｔｔｅｒ）": "x",
  "x (twitter)": "x",
  x: "x",
  instagram: "instagram",
  tiktok: "tiktok",
  youtube: "youtube",
  "sns運用": "sns",
  "sns運用ノウハウ": "sns",
};

function resolveCategorySlug(input: string) {
  const normalized = normalizeCategory(input);

  if (categoryBySlug[normalized]) {
    return normalized;
  }

  return legacySlugByCategory[normalized] ?? normalized;
}

function parseArticleDate(dateText: string) {
  const parsed = new Date(dateText.replace(/\./g, "-"));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/articles/pickup`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${siteUrl}/search`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.4,
    },
  ];

  const categoryPages: MetadataRoute.Sitemap = Array.from(
    new Set<string>([
      ...Object.keys(categoryBySlug),
      ...getCategoryStaticParams().map((item) => resolveCategorySlug(item.slug)),
    ]),
  ).map((slug) => ({
    url: `${siteUrl}/category/${encodeURIComponent(slug)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const tagPages: MetadataRoute.Sitemap = getTagStaticParams().map(({ tag }) => ({
    url: `${siteUrl}/tags/${encodeURIComponent(tag)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  const articlePages: MetadataRoute.Sitemap = getAllArticles().map((article) => ({
    url: `${siteUrl}/articles/${encodeURIComponent(article.id)}`,
    lastModified: parseArticleDate(article.date),
    changeFrequency: "monthly" as const,
    priority: 0.9,
  }));

  return [...staticPages, ...categoryPages, ...tagPages, ...articlePages];
}
