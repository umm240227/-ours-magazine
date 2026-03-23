import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getArticleById, getArticleIds, getRecommendedArticles } from "../../../lib/markdown";

const categories = [
  { label: "Instagram", slug: "instagram" },
  { label: "TikTok", slug: "tiktok" },
  { label: "X（Twitter）", slug: "x" },
  { label: "YouTube", slug: "youtube" },
  { label: "SNS運用", slug: "sns" },
];

const tags = ["#Instagram", "#TikTok", "#インスタ運用", "#YouTube収益化", "#リール動画", "#ショート動画", "#広告", "#SNSマーケティング"];

function getTagHref(tag: string) {
  return `/tags/${encodeURIComponent(tag.replace(/^#/, "").trim().toLowerCase())}`;
}

const categorySlugByName: Record<string, string> = {
  instagram: "instagram",
  tiktok: "tiktok",
  "x（twitter）": "x",
  x: "x",
  youtube: "youtube",
  "sns運用": "sns",
  "instagram攻略": "instagram",
  "tiktok攻略": "tiktok",
  "sns運用ノウハウ": "sns",
};

function getCategoryHref(category: string) {
  const normalized = category.trim().toLowerCase();
  const resolvedSlug = categorySlugByName[normalized];
  return `/category/${resolvedSlug ?? encodeURIComponent(category)}`;
}

type ArticlePageProps = {
  params: Promise<{ id: string }>;
};

export function generateStaticParams() {
  return getArticleIds().map((id) => ({ id }));
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { id } = await params;
  const article = getArticleById(id);

  if (!article) {
    return {
      title: "SNS OURS MAGAZINE",
      description: "",
    };
  }

  return {
    title: `${article.title} | SNS OURS MAGAZINE`,
    description: article.description,
    openGraph: {
      title: `${article.title} | SNS OURS MAGAZINE`,
      description: article.description,
      images: [article.image],
    },
  };
}

export default async function ArticleDetailPage({ params }: ArticlePageProps) {
  const { id } = await params;
  const article = getArticleById(id);

  if (!article) {
    notFound();
  }

  const recommendedArticles = getRecommendedArticles(id, 3);

  return (
    <div className="bg-site-bg text-brand-primary">
      <section className="mx-auto max-w-6xl px-4 pb-8 pt-24 lg:py-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
          <section className="space-y-8 lg:col-span-8">
            <nav aria-label="パンくず" className="text-sm text-gray-500">
              <ol className="flex flex-wrap items-center">
                <li>
                  <Link href="/" className="transition-colors hover:text-brand-primary hover:underline">
                    ホーム
                  </Link>
                </li>
                <li aria-hidden="true" className="px-2 text-gray-400">
                  &gt;
                </li>
                <li>
                  <Link href={getCategoryHref(article.category)} className="transition-colors hover:text-brand-primary hover:underline">
                    {article.category}
                  </Link>
                </li>
                <li aria-hidden="true" className="px-2 text-gray-400">
                  &gt;
                </li>
                <li className="text-gray-500">{article.title}</li>
              </ol>
            </nav>

            <header className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex rounded-md bg-brand-accent px-3 py-1 text-xs font-bold text-brand-primary">Pickup</span>
                <time className="text-sm text-slate-400">{article.date}</time>
              </div>
              <h1 className="text-3xl font-bold leading-tight text-brand-primary md:text-4xl">{article.title}</h1>
              <div
                role="img"
                aria-label={`${article.title}のメイン画像`}
                className="aspect-video w-full rounded-2xl bg-cover bg-center"
                style={{ backgroundImage: `url('${article.image}')` }}
              />
            </header>

            <article className="space-y-8 text-base leading-relaxed text-slate-700 md:text-lg">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h2: ({ children }) => (
                    <h2 className="border-l-4 border-brand-primary bg-slate-50 px-4 py-2 text-2xl font-bold leading-snug text-brand-primary">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-xl font-semibold leading-snug text-brand-primary">{children}</h3>
                  ),
                  p: ({ children }) => <p>{children}</p>,
                  ul: ({ children }) => <ul className="list-disc space-y-2 pl-6 marker:text-brand-primary">{children}</ul>,
                  li: ({ children }) => <li>{children}</li>,
                  a: ({ children, href }) => (
                    <a
                      href={href}
                      className="font-semibold text-brand-primary underline decoration-2 underline-offset-4 transition-opacity duration-150 hover:opacity-70"
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {article.content}
              </ReactMarkdown>
            </article>

            <section className="space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-brand-primary/80">この記事のタグ</h3>
                <div className="flex flex-wrap gap-2">
                  {article.tags.map((tag) => (
                    <Link
                      key={tag}
                      href={getTagHref(tag)}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-brand-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-100"
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
              </div>

              <hr className="border-slate-200" />

              <div className="space-y-4">
                <p className="text-center text-sm font-medium text-gray-500">この記事をシェアする</p>
                <div className="flex justify-center gap-4">
                  <button
                    type="button"
                    aria-label="Xでシェア"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-sm font-bold text-white transition-opacity hover:opacity-85"
                  >
                    X
                  </button>
                  <button
                    type="button"
                    aria-label="Facebookでシェア"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1877F2] text-sm font-bold text-white transition-opacity hover:opacity-85"
                  >
                    f
                  </button>
                  <button
                    type="button"
                    aria-label="LINEでシェア"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-[#06C755] text-xs font-bold text-white transition-opacity hover:opacity-85"
                  >
                    LINE
                  </button>
                  <button
                    type="button"
                    aria-label="リンクをコピー"
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-600 text-xs font-bold text-white transition-opacity hover:opacity-85"
                  >
                    URL
                  </button>
                </div>
              </div>
            </section>

            <section className="mt-12 space-y-5">
              <h2 className="text-xl font-bold text-brand-primary">こちらもおすすめ</h2>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {recommendedArticles.map((recommendedArticle) => (
                  <Link
                    key={recommendedArticle.id}
                    href={`/articles/${recommendedArticle.id}`}
                    className="block overflow-hidden rounded-lg bg-card-bg shadow-sm ring-1 ring-slate-200 transition-all duration-300 hover:shadow-md"
                  >
                    <article>
                      <div
                        role="img"
                        aria-label={`${recommendedArticle.title}のサムネイル`}
                        className="aspect-[16/11] w-full bg-cover bg-center opacity-90"
                        style={{ backgroundImage: `url('${recommendedArticle.image}')` }}
                      />
                      <div className="space-y-2 p-4">
                        <span className="inline-block rounded-full bg-brand-accent px-3 py-1 text-xs font-semibold text-brand-primary">
                          {recommendedArticle.category}
                        </span>
                        <h3 className="line-clamp-2 text-base font-bold leading-snug text-brand-primary">
                          {recommendedArticle.title}
                        </h3>
                        <p className="text-xs text-brand-primary/70">{recommendedArticle.date}</p>
                      </div>
                    </article>
                  </Link>
                ))}
              </div>
            </section>
          </section>

          <aside className="lg:col-span-4 self-start">
            <div className="flex flex-col gap-6 lg:sticky lg:top-8">
              <section className="rounded-lg bg-card-bg p-4 shadow-sm ring-1 ring-slate-200">
                <h3 className="mb-3 text-xl font-extrabold">カテゴリ</h3>
                <ul className="space-y-2">
                  {categories.map((category) => (
                    <li key={category.slug}>
                      <Link
                        href={`/category/${category.slug}`}
                        className="flex items-center justify-between rounded-md px-2 py-2 text-sm font-medium hover:bg-slate-50"
                      >
                        <span>{category.label}</span>
                        <span aria-hidden="true" className="text-brand-primary/60">
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-lg bg-card-bg p-4 shadow-sm ring-1 ring-slate-200">
                <h3 className="mb-3 text-xl font-extrabold">タグ</h3>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Link
                      key={tag}
                      href={getTagHref(tag)}
                      className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-brand-primary transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-accent"
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
              </section>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
