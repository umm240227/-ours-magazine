import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export type ArticleFrontmatter = {
  title: string;
  description: string;
  date: string;
  category: string;
  image: string;
  tags: string[];
  featured?: boolean;
  recommended?: boolean;
};

export type Article = ArticleFrontmatter & {
  id: string;
  content: string;
};

const articlesDirectory = path.join(process.cwd(), "content", "articles");

function toTimestamp(dateText: string) {
  return new Date(dateText.replace(/\./g, "-")).getTime();
}

function parseBooleanFlag(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return undefined;
}

export function normalizeTag(tag: string) {
  return tag.trim().replace(/^#/, "").toLowerCase();
}

export function normalizeCategory(category: string) {
  return category.trim().toLowerCase();
}

export function getArticleIds(): string[] {
  return fs
    .readdirSync(articlesDirectory)
    .filter((fileName) => fileName.endsWith(".md"))
    .map((fileName) => fileName.replace(/\.md$/, ""));
}

export function getArticleById(id: string): Article | null {
  const fullPath = path.join(articlesDirectory, `${id}.md`);

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const fileContents = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(fileContents);

  return {
    id,
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    date: String(data.date ?? ""),
    category: String(data.category ?? ""),
    image: String(data.image ?? ""),
    tags: Array.isArray(data.tags) ? data.tags.map((tag) => String(tag)) : [],
    featured: parseBooleanFlag(data.featured),
    recommended: parseBooleanFlag(data.recommended),
    content,
  };
}

export function getAllArticles(): Article[] {
  return getArticleIds()
    .map((id) => getArticleById(id))
    .filter((article): article is Article => article !== null)
    .sort((a, b) => toTimestamp(b.date) - toTimestamp(a.date));
}

export function getArticlesByTag(tag: string): Article[] {
  const normalizedTargetTag = normalizeTag(tag);

  return getAllArticles().filter((article) =>
    article.tags.some((articleTag) => normalizeTag(articleTag) === normalizedTargetTag),
  );
}

export function getArticlesByCategory(category: string): Article[] {
  const normalizedTargetCategory = normalizeCategory(category);

  return getAllArticles().filter((article) => normalizeCategory(article.category) === normalizedTargetCategory);
}

export function getTagStaticParams() {
  const uniqueTags = new Set<string>();

  for (const article of getAllArticles()) {
    for (const tag of article.tags) {
      uniqueTags.add(normalizeTag(tag));
    }
  }

  return Array.from(uniqueTags).map((tag) => ({ tag }));
}

export function getCategoryStaticParams() {
  const uniqueCategories = new Set<string>();

  for (const article of getAllArticles()) {
    uniqueCategories.add(article.category.trim());
  }

  return Array.from(uniqueCategories).map((slug) => ({ slug }));
}

export function getRecommendedArticles(currentId: string, limit = 3): Article[] {
  return getAllArticles()
    .filter((article) => article.id !== currentId)
    .slice(0, limit);
}

export function searchArticles(keyword: string): Article[] {
  const normalizedKeyword = keyword.trim().toLowerCase();

  if (!normalizedKeyword) {
    return [];
  }

  return getAllArticles().filter((article) => {
    const joinedTags = article.tags.join(" ");
    const searchableText = [article.title, article.description, joinedTags, article.content].join("\n").toLowerCase();
    return searchableText.includes(normalizedKeyword);
  });
}
