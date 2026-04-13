import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ensureArticleImageSrc,
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

function getCategoryPageContext(decodedSlug: string) {
  const categorySlug = resolveCategorySlug(decodedSlug);
  const mappedCategoryName = categoryBySlug[categorySlug];
  const aliasCategories = (categoryAliasesBySlug[categorySlug] ?? [decodedSlug]).map((name) => normalizeCategory(name));
  const articles = getAllArticles().filter((article) => aliasCategories.includes(normalizeCategory(article.category)));
  const categoryName = mappedCategoryName ?? decodedSlug;
  const shouldNotFound = articles.length === 0 && !mappedCategoryName;
  return { categoryName, articles, shouldNotFound };
}

export function generateStaticParams() {
  const slugs = new Set<string>([
    ...Object.keys(categoryBySlug),
    ...getCategoryStaticParams().map((item) => resolveCategorySlug(item.slug)),
  ]);
  return Array.from(slugs).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);
  const { categoryName, articles, shouldNotFound } = getCategoryPageContext(decodedSlug);

  if (shouldNotFound) {
    return {
      title: "カテゴリが見つかりません | SNS OURS MAGAZINE",
      description: "お探しのカテゴリは存在しないか、まだ用意されていません。",
    };
  }

  const title = `${categoryName}の記事一覧 | SNS OURS MAGAZINE`;
  const description =
    articles.length > 0
      ? `${categoryName}に関する実践的な記事を${articles.length}件掲載しています。SNS OURS MAGAZINEの編集記事です。`
      : `${categoryName}の記事は現在、準備中です。公開までしばらくお待ちください。`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
    },
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);
  const { categoryName, articles, shouldNotFound } = getCategoryPageContext(decodedSlug);

  if (shouldNotFound) {
    notFound();
  }

  return (
    <div className="bg-site-bg text-brand-primary">
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-24 lg:pt-8">
        <nav aria-label="パンくず" className="mb-8 text-sm text-gray-500">
          <ol className="flex flex-wrap items-center">
            <li>
              <Link href="/" className="transition-colors hover:text-brand-primary hover:underline">
                ホーム
              </Link>
            </li>
            <li aria-hidden="true" className="px-2 text-gray-400">
              &gt;
            </li>
            <li className="text-gray-500">{categoryName}の記事一覧</li>
          </ol>
        </nav>

        <section className="border-b border-slate-200 py-12">
          <p className="text-sm font-semibold tracking-wide text-brand-primary/80">カテゴリ</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">{categoryName}</h1>
          {articles.length > 0 ? (
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-brand-primary/75">
              このカテゴリに分類された記事の一覧です。気になるタイトルを開いてお読みください。
            </p>
          ) : (
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-brand-primary/75">
              このカテゴリに該当する記事は、まだありません。トップの記事一覧や、ほかのカテゴリからもお読みいただけます。
            </p>
          )}
        </section>

        <section className="py-12">
          {articles.length > 0 ? (
            <ul className="divide-y divide-slate-200">
              {articles.map((article, index) => (
                <li key={article.id} className="py-8">
                  <Link
                    href={`/articles/${article.id}`}
                    className="group flex flex-col gap-6 transition-opacity duration-200 hover:opacity-80 md:flex-row"
                  >
                    <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-md bg-slate-100 md:w-[380px]">
                      <Image
                        src={ensureArticleImageSrc(article.image)}
                        alt={`${article.title}のサムネイル`}
                        fill
                        sizes="(max-width: 768px) 100vw, 380px"
                        className="object-cover object-center"
                        priority={index === 0}
                      />
                    </div>
                    <div className="flex min-h-[140px] flex-col justify-center">
                      <h2 className="text-2xl font-bold leading-snug transition-opacity duration-200 group-hover:opacity-80">
                        {article.title}
                      </h2>
                      {article.description ? (
                        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-brand-primary/75">{article.description}</p>
                      ) : null}
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
            <div className="space-y-4 text-base leading-relaxed text-brand-primary/70">
              <p>記事の追加をお待ちください。公開のタイミングでこちらに表示されます。</p>
              <p>
                <Link href="/" className="font-semibold text-brand-primary underline decoration-2 underline-offset-4 transition-opacity hover:opacity-80">
                  トップへ戻る
                </Link>
                から新着記事を読むか、メニューから別のカテゴリを選んでみてください。
              </p>
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
