import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { ARTICLE_IMAGE_PLACEHOLDER_PATH, ensureArticleImageSrc } from "./article-image";

export { ARTICLE_IMAGE_PLACEHOLDER_PATH, ensureArticleImageSrc };

export type FaqItem = { question: string; answer: string };

export type ArticleFrontmatter = {
  title: string;
  description: string;
  date: string;
  category: string;
  image: string;
  tags: string[];
  featured?: boolean;
  recommended?: boolean;
  author?: string;
  // FAQPage JSON-LD용 (write 단계가 본문 「よくある質問」와 함께 frontmatter로도 출력). 없으면 FAQ 스키마 생략.
  faq?: FaqItem[];
};

export type Article = ArticleFrontmatter & {
  id: string;
  content: string;
};

const articlesDirectory = path.join(process.cwd(), "content", "articles");
const publicDirectory = path.join(process.cwd(), "public");

function toTimestamp(dateText: string) {
  return new Date(dateText.replace(/\./g, "-")).getTime();
}

// 표시용 날짜를 "YYYY.MM.DD"(점) 형식으로 통일 (jp-site-config §4). 하이픈/슬래시 혼재 정규화.
function normalizeDateDot(dateText: string) {
  return dateText.trim().replace(/[-/]/g, ".");
}

function parseFaq(value: unknown): FaqItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const question = String(record.question ?? record.q ?? "").trim();
      const answer = String(record.answer ?? record.a ?? "").trim();
      return question && answer ? { question, answer } : null;
    })
    .filter((item): item is FaqItem => item !== null);
  return items.length > 0 ? items : undefined;
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

function getFallbackImage(): string {
  return ARTICLE_IMAGE_PLACEHOLDER_PATH;
}

function resolveArticleImage(image: string, id: string, category: string) {
  const trimmedImage = image.trim();

  if (!trimmedImage) {
    return getFallbackImage();
  }

  if (/^https?:\/\//i.test(trimmedImage)) {
    return trimmedImage;
  }

  if (!trimmedImage.startsWith("/")) {
    return getFallbackImage();
  }

  const normalizedSegments = trimmedImage
    .replace(/^\/+/, "")
    .split(/[?#]/)[0]
    .split("/")
    .filter(Boolean);

  const fullPath = path.join(publicDirectory, ...normalizedSegments);

  if (normalizedSegments.length > 0 && fs.existsSync(fullPath)) {
    return trimmedImage;
  }

  return getFallbackImage();
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

  const resolvedImage = resolveArticleImage(String(data.image ?? ""), id, String(data.category ?? ""));

  return {
    id,
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    date: normalizeDateDot(String(data.date ?? "")),
    category: String(data.category ?? ""),
    image: ensureArticleImageSrc(resolvedImage),
    tags: Array.isArray(data.tags) ? data.tags.map((tag) => String(tag)) : [],
    featured: parseBooleanFlag(data.featured),
    recommended: parseBooleanFlag(data.recommended),
    author: data.author ? String(data.author) : undefined,
    faq: parseFaq(data.faq),
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

function countSharedTags(a: Article, b: Article): number {
  const setB = new Set(b.tags.map((t) => normalizeTag(t)));
  let n = 0;
  for (const t of a.tags) {
    if (setB.has(normalizeTag(t))) {
      n += 1;
    }
  }
  return n;
}

/**
 * 「こちらもおすすめ」用: 同カテゴリ → タグが重なる他カテゴリ（重複数・日付）→ それでも足りなければ新着順
 */
export function getRecommendedArticles(currentId: string, limit = 3): Article[] {
  const current = getArticleById(currentId);
  if (!current) {
    return [];
  }

  const others = getAllArticles().filter((article) => article.id !== currentId);
  const currentCategory = normalizeCategory(current.category);
  const currentTagSet = new Set(current.tags.map((t) => normalizeTag(t)));

  const result: Article[] = [];
  const picked = new Set<string>();

  const takeFrom = (pool: Article[]) => {
    for (const article of pool) {
      if (result.length >= limit) {
        return;
      }
      if (picked.has(article.id)) {
        continue;
      }
      picked.add(article.id);
      result.push(article);
    }
  };

  const sameCategory = others.filter((article) => normalizeCategory(article.category) === currentCategory);
  takeFrom(sameCategory);

  if (result.length < limit && currentTagSet.size > 0) {
    const sharedTagCandidates = others
      .filter((article) => !picked.has(article.id) && article.tags.some((t) => currentTagSet.has(normalizeTag(t))))
      .sort((a, b) => {
        const overlapDiff = countSharedTags(b, current) - countSharedTags(a, current);
        if (overlapDiff !== 0) {
          return overlapDiff;
        }
        return toTimestamp(b.date) - toTimestamp(a.date);
      });
    takeFrom(sharedTagCandidates);
  }

  if (result.length < limit) {
    takeFrom(others.filter((article) => !picked.has(article.id)));
  }

  return result;
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
