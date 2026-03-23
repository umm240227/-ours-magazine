import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllArticles,
  getCategoryStaticParams,
  normalizeCategory,
} from "../../../lib/markdown";

const categoryBySlug: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X（Twitter）",
  youtube: "YouTube",
  sns: "SNS運用",
};

const categoryAliasesBySlug: Record<string, string[]> = {
  instagram: ["Instagram", "instagram", "Instagram攻略"],
  tiktok: ["TikTok", "tiktok", "TikTok攻略"],
  x: ["X", "x", "X（Twitter）"],
  youtube: ["YouTube", "youtube"],
  sns: ["SNS運用", "SNS運用ノウハウ"],
};

const legacySlugByCategory: Record<string, string> = {
  "instagram攻略": "instagram",
  "tiktok攻略": "tiktok",
  "x（twitter）": "x",
  "x（ｔｗｉｔｔｅｒ）": "x",
  x: "x",
  tiktok: "tiktok",
  "x (twitter)": "x",
  youtube: "youtube",
  "sns運用ノウハウ": "sns",
  "sns運用": "sns",
  instagram: "instagram",
};
type CategoryPageProps = {
  params: Promise<{ slug: string }>;
};

function resolveCategorySlug(input: string) {
  const normalized = normalizeCategory(input);
  if (categoryBySlug[normalized]) {
    return normalized;
  }
  return legacySlugByCategory[normalized] ?? normalized;
}

export function generateStaticParams() {
  const slugs = new Set<string>([
    ...Object.keys(categoryBySlug),
    ...getCategoryStaticParams().map((item) => resolveCategorySlug(item.slug)),
  ]);
  return Array.from(slugs).map((slug) => ({ slug }));
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);
  const categorySlug = resolveCategorySlug(decodedSlug);
  const mappedCategoryName = categoryBySlug[categorySlug];
  const aliasCategories = (categoryAliasesBySlug[categorySlug] ?? [decodedSlug]).map((name) => normalizeCategory(name));
  const articles = getAllArticles().filter((article) => aliasCategories.includes(normalizeCategory(article.category)));

  if (articles.length === 0 && !mappedCategoryName) {
    notFound();
  }

  const categoryName = mappedCategoryName ?? decodedSlug;

  return (
    <div className="bg-site-bg text-brand-primary">
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-24 lg:pt-8">
        <section className="border-b border-slate-200 py-12">
          <p className="text-sm font-semibold tracking-wide text-brand-primary/80">Results for :</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">{categoryName}</h1>
        </section>

        <section className="py-12">
          {articles.length > 0 ? (
            <ul className="divide-y divide-slate-200">
              {articles.map((article) => (
                <li key={article.id} className="py-8">
                  <Link
                    href={`/articles/${article.id}`}
                    className="group flex flex-col gap-6 transition-opacity duration-200 hover:opacity-80 md:flex-row"
                  >
                    <div
                      role="img"
                      aria-label={`${article.title}のサムネイル`}
                      className="aspect-[16/10] w-full shrink-0 rounded-md bg-cover bg-center md:w-[380px]"
                      style={{ backgroundImage: `url('${article.image}')` }}
                    />
                    <div className="flex min-h-[140px] flex-col justify-center">
                      <h2 className="text-2xl font-bold leading-snug transition-opacity duration-200 group-hover:opacity-80">
                        {article.title}
                      </h2>
                      <div className="mt-4 flex items-center gap-3 text-sm text-brand-primary/70">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold">
                          編
                        </span>
                        <span>編集部</span>
                        <time>{article.date}</time>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-base text-brand-primary/70">このカテゴリの記事は準備中です。</p>
          )}
        </section>
      </section>
    </div>
  );
}
