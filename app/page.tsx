import { Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import PickupArticleCard from "./components/PickupArticleCard";
import {
  ARTICLE_IMAGE_PLACEHOLDER_PATH,
  ensureArticleImageSrc,
  getAllArticles,
  type Article,
} from "../lib/markdown";

const RANKING_ARTICLE_IDS = [
  "post-instagram-algorithm",
  "youtube-monetization-roadmap",
  "sns-ads-small-budget-roi",
  "ugc-natural-word-of-mouth-mechanism",
  "x-10000-roadmap",
] as const;

const sidebarFeaturedFallbackIds = [
  "post-instagram-algorithm",
  "youtube-monetization-roadmap",
  "sns-ads-small-budget-roi",
];

const categories = [
  { label: "Instagram", slug: "instagram" },
  { label: "TikTok", slug: "tiktok" },
  { label: "X（Twitter）", slug: "x" },
  { label: "YouTube", slug: "youtube" },
  { label: "SNS運用", slug: "sns" },
];
const tags = ["#Instagram", "#TikTok", "#インスタ運用", "#YouTube収益化", "#リール動画", "#ショート動画", "#広告", "#SNSマーケティング"];
type CategoryArticleItem = {
  id: number;
  title: string;
  excerpt: string;
  image: string;
  href?: string;
};

type CategoryArticleSection = {
  name: string;
  items: CategoryArticleItem[];
};

type RankingItem = {
  title: string;
  image: string;
  description: string;
  href: string;
};

type CategorySectionSpec = {
  name: string;
  entries: { id: number; slug: string }[];
};

const CATEGORY_SECTION_SPECS: CategorySectionSpec[] = [
  {
    name: "Instagram",
    entries: [
      { id: 101, slug: "instagram-save-post-structure" },
      { id: 104, slug: "instagram-followers-growth-fixes" },
      { id: 102, slug: "instagram-profile-checklist-retention" },
    ],
  },
  {
    name: "TikTok",
    entries: [
      { id: 201, slug: "tiktok-first-3-seconds-hook" },
      { id: 202, slug: "tiktok-watch-through-structure" },
      { id: 203, slug: "tiktok-comment-engagement-guide" },
    ],
  },
  {
    name: "YouTube",
    entries: [
      { id: 301, slug: "youtube-content-planning-for-views" },
      { id: 302, slug: "youtube-thumbnail-title-ctr-guide" },
      { id: 303, slug: "youtube-analytics-metrics-improvement-guide" },
    ],
  },
];

function buildRankingItems(allArticles: Article[]): RankingItem[] {
  const byId = new Map(allArticles.map((a) => [a.id, a]));
  return RANKING_ARTICLE_IDS.map((id) => {
    const article = byId.get(id);
    return {
      title: article?.title ?? "",
      image: article?.image ?? ARTICLE_IMAGE_PLACEHOLDER_PATH,
      description: article?.description ?? "",
      href: `/articles/${id}`,
    };
  });
}

function buildCategoryArticleSections(allArticles: Article[]): CategoryArticleSection[] {
  const byId = new Map(allArticles.map((a) => [a.id, a]));
  return CATEGORY_SECTION_SPECS.map((section) => ({
    name: section.name,
    items: section.entries.map((entry) => {
      const article = byId.get(entry.slug);
      return {
        id: entry.id,
        title: article?.title ?? "",
        excerpt: article?.description ?? "",
        image: article?.image ?? ARTICLE_IMAGE_PLACEHOLDER_PATH,
        href: `/articles/${entry.slug}`,
      };
    }),
  }));
}

function getTagHref(tag: string) {
  return `/tags/${encodeURIComponent(tag.replace(/^#/, "").trim().toLowerCase())}`;
}

function RankCrownBadge({ rank }: { rank: number }) {
  const badgeColors = [
    { crown: "#F4D44E", base: "#E8C93A" },
    { crown: "#B8BAC4", base: "#A9ACB6" },
    { crown: "#D58A4F", base: "#C67A40" },
    { crown: "#E7DFA5", base: "#D5CC8D" },
    { crown: "#E7DFA5", base: "#D5CC8D" },
  ];
  const selected = badgeColors[Math.min(rank - 1, badgeColors.length - 1)];

  return (
    <span className="h-8 w-10 shrink-0">
      <svg viewBox="0 0 72 56" className="h-full w-full" role="img" aria-label={`${rank}位`}>
        <path
          d="M5 18 L18 8 L29 21 L36 4 L43 21 L54 8 L67 18 L62 42 H10 Z"
          fill={selected.crown}
          stroke="rgba(0,0,0,0.08)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <circle cx="18" cy="8" r="3" fill={selected.crown} />
        <circle cx="36" cy="4" r="3" fill={selected.crown} />
        <circle cx="54" cy="8" r="3" fill={selected.crown} />
        <rect x="10" y="44" width="52" height="8" rx="2" fill={selected.base} />
        <text
          x="36"
          y="33"
          textAnchor="middle"
          fontSize="24"
          fontWeight="800"
          fill="white"
          fontFamily="Arial, sans-serif"
        >
          {rank}
        </text>
      </svg>
    </span>
  );
}

function MainLatestArticlesSection({ latestArticles }: { latestArticles: ReturnType<typeof getAllArticles> }) {
  return (
    <div className="space-y-6">
      <h2 className="text-4xl font-extrabold">新着記事</h2>
      <ul className="space-y-6">
        {latestArticles.map((article) => (
          <li
            key={`desktop-latest-${article.id}`}
            className="border-b border-slate-200 pb-6 last:border-b-0 last:pb-0"
          >
            <Link href={`/articles/${article.id}`} className="group block">
              <article className="flex items-stretch gap-5">
                <div className="relative h-[108px] w-48 shrink-0 overflow-hidden rounded-md bg-slate-100">
                  <Image
                    src={ensureArticleImageSrc(article.image)}
                    alt={`${article.title}のサムネイル`}
                    fill
                    sizes="192px"
                    className="object-cover object-center"
                  />
                </div>
                <div className="min-w-0 flex min-h-[108px] flex-1 flex-col">
                  <h3 className="text-base font-bold leading-relaxed transition-opacity duration-200 group-hover:opacity-80">
                    {article.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-brand-primary/80">{article.description}</p>
                  <div className="mt-auto pt-2 flex items-center gap-2 text-xs leading-tight text-brand-primary/65">
                    <span>{article.category}</span>
                    <span aria-hidden="true">・</span>
                    <span>{article.date}</span>
                  </div>
                </div>
              </article>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function selectSidebarFeaturedArticles(allArticles: Article[]): Article[] {
  const flaggedArticles = allArticles
    .filter((article) => article.featured || article.recommended)
    .slice(0, 3);

  if (flaggedArticles.length === 3) {
    return flaggedArticles;
  }

  const fallbackArticles = sidebarFeaturedFallbackIds
    .map((id) => allArticles.find((article) => article.id === id))
    .filter((article): article is Article => Boolean(article));

  if (fallbackArticles.length === 3) {
    return fallbackArticles;
  }

  return allArticles.slice(0, 3);
}

function SidebarFeaturedArticlesSection({ featuredArticles }: { featuredArticles: Article[] }) {
  return (
    <section className="sidebar-featured-articles rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h3 className="text-xl font-bold leading-snug text-brand-primary">今読むべき記事</h3>
      <ul className="mt-6 space-y-8">
        {featuredArticles.map((article) => (
          <li key={`sidebar-featured-article-${article.id}`} className="sidebar-featured-article-item">
            <Link
              href={`/articles/${article.id}`}
              className="block overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg"
            >
              <article className="sidebar-featured-article-card">
                <div className="sidebar-featured-thumbnail relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                  <Image
                    src={ensureArticleImageSrc(article.image)}
                    alt={`${article.title}のサムネイル`}
                    fill
                    sizes="(max-width: 768px) 100vw, 300px"
                    className="object-cover object-center"
                  />
                  <span className="absolute left-3 top-3 z-10 inline-flex rounded-md bg-brand-accent px-2 py-1 text-[11px] font-bold leading-none text-brand-primary">
                    ピックアップ
                  </span>
                </div>
                <div className="px-4 pb-4 pt-3">
                  <h4 className="sidebar-featured-title line-clamp-3 min-h-[4.5rem] text-base font-bold leading-snug text-brand-primary">
                    {article.title}
                  </h4>
                </div>
              </article>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Home() {
  const allArticles = getAllArticles();
  const rankingItems = buildRankingItems(allArticles);
  const categoryArticleSections = buildCategoryArticleSections(allArticles);
  const latestArticles = allArticles.slice(0, 6);
  const sidebarFeaturedArticles = selectSidebarFeaturedArticles(allArticles);
  const topPickupArticle = latestArticles[0];

  return (
    <div className="bg-site-bg text-brand-primary">
      <h1 className="sr-only">記事一覧</h1>
      <section className="mx-auto block max-w-6xl space-y-8 px-4 pb-8 pt-24 lg:hidden">
        <section className="space-y-3">
          <h2 className="text-xl font-extrabold">おすすめ記事</h2>
          <PickupArticleCard
            imageUrl={topPickupArticle?.image ?? ARTICLE_IMAGE_PLACEHOLDER_PATH}
            href={topPickupArticle ? `/articles/${topPickupArticle.id}` : "/articles/post-1"}
            title={topPickupArticle?.title}
            description={topPickupArticle?.description}
            category={topPickupArticle?.category}
            date={topPickupArticle?.date}
          />
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-extrabold">新着記事</h2>
          <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3">
            {latestArticles.slice(0, 3).map((article, index) => (
              <Link
                key={`mobile-latest-${article.id}`}
                href={`/articles/${article.id}`}
                className="flex h-full flex-col overflow-hidden rounded-lg bg-card-bg shadow-sm ring-1 ring-slate-200 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <article className="flex h-full flex-col">
                  <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                    <Image
                      src={ensureArticleImageSrc(article.image)}
                      alt={`${article.title}のサムネイル`}
                      fill
                      sizes="(max-width: 479px) 100vw, (max-width: 767px) 50vw, 33vw"
                      className="object-cover object-center"
                      priority={index === 0}
                    />
                  </div>
                  <div className="flex h-full flex-col gap-2 p-3">
                    <span className="inline-flex w-fit rounded-md bg-brand-accent px-2 py-1 text-[11px] font-semibold leading-none text-brand-primary">
                      {article.category}
                    </span>
                    <h3 className="line-clamp-2 min-h-[2.8rem] text-sm font-bold leading-snug">{article.title}</h3>
                    {article.description ? (
                      <p className="line-clamp-2 text-[11px] leading-relaxed text-brand-primary/75">{article.description}</p>
                    ) : null}
                    <p className="mt-auto text-[11px] leading-tight text-brand-primary/70">{article.date}</p>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-extrabold">人気記事ランキング</h2>
          <ul className="space-y-3">
            {rankingItems.slice(0, 5).map((item, index) => (
              <li key={item.href}>
                <Link href={item.href} className="flex items-center gap-3 rounded-lg bg-card-bg p-3 shadow-sm ring-1 ring-slate-200">
                  <RankCrownBadge rank={index + 1} />
                  <p className="line-clamp-2 text-sm font-semibold leading-snug">{item.title}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-6">
          <h2 className="text-xl font-extrabold">人気のカテゴリ</h2>
          <div className="space-y-8">
            {categoryArticleSections.map((section) => (
              <section
                key={section.name}
                className="space-y-4 border-t border-slate-200 pt-6 first:border-t-0 first:pt-0"
              >
                <h3 className="text-lg font-extrabold">{section.name}</h3>
                <ul className="space-y-4">
                  {section.items.map((item) => (
                    <li key={`${section.name}-${item.id}`}>
                      <Link
                        href={item.href ?? "#"}
                        className="flex items-start gap-3 rounded-lg bg-card-bg px-3 py-2 shadow-sm ring-1 ring-slate-200"
                      >
                        <div className="relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-md bg-slate-100">
                          <Image
                            src={ensureArticleImageSrc(item.image)}
                            alt={`${item.title}のサムネイル`}
                            fill
                            sizes="92px"
                            className="object-cover object-center"
                          />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="line-clamp-2 text-base font-bold leading-snug">{item.title}</p>
                          <p className="line-clamp-2 text-xs text-brand-primary/80">{item.excerpt}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
                <a href="#" className="inline-flex items-center text-sm font-semibold hover:opacity-70">
                  もっと見る →
                </a>
              </section>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <section className="rounded-lg bg-card-bg p-4 shadow-sm ring-1 ring-slate-200">
            <h3 className="mb-3 text-lg font-extrabold">カテゴリ</h3>
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
            <h3 className="mb-3 text-lg font-extrabold">タグ</h3>
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
        </section>
      </section>

      <section className="mx-auto hidden max-w-6xl px-4 py-8 lg:block">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-start">
          <section className="space-y-6 lg:col-span-8">
            <section className="space-y-6">
              <h2 className="text-4xl font-extrabold">おすすめ記事</h2>
              <PickupArticleCard
                imageUrl={topPickupArticle?.image ?? ARTICLE_IMAGE_PLACEHOLDER_PATH}
                href={topPickupArticle ? `/articles/${topPickupArticle.id}` : "/articles/post-1"}
                title={topPickupArticle?.title}
                description={topPickupArticle?.description}
                category={topPickupArticle?.category}
                date={topPickupArticle?.date}
              />
            </section>

            <MainLatestArticlesSection latestArticles={latestArticles} />

            <section className="space-y-6">
              <h2 className="text-4xl font-extrabold">人気のカテゴリ</h2>
              <div className="space-y-10">
                {categoryArticleSections.map((section) => (
                  <section
                    key={`desktop-${section.name}`}
                    className="space-y-4 border-t border-slate-200 pt-7 first:border-t-0 first:pt-0"
                  >
                    <h3 className="text-2xl font-extrabold">{section.name}</h3>
                    <ul className="space-y-4">
                      {section.items.map((item) => (
                        <li key={`desktop-${section.name}-${item.id}`}>
                          <Link
                            href={item.href ?? "#"}
                            className="flex min-h-[90px] items-center gap-4 rounded-lg bg-card-bg p-3 shadow-sm ring-1 ring-slate-200"
                          >
                            <div className="relative h-[90px] w-[96px] shrink-0 overflow-hidden rounded-md bg-slate-100">
                              <Image
                                src={ensureArticleImageSrc(item.image)}
                                alt={`${item.title}のサムネイル`}
                                fill
                                sizes="96px"
                                className="object-cover object-center"
                              />
                            </div>
                            <div className="space-y-1">
                              <p className="line-clamp-2 text-base font-bold leading-snug">{item.title}</p>
                              <p className="line-clamp-2 text-sm text-brand-primary/80">{item.excerpt}</p>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <a
                      href="#"
                      className="inline-flex items-center text-sm font-semibold text-brand-primary hover:opacity-70"
                    >
                      もっと見る →
                    </a>
                  </section>
                ))}
              </div>
            </section>
          </section>

          <aside className="lg:col-span-4 self-start">
            <div className="flex flex-col gap-6 lg:sticky lg:top-8">
              <section className="mt-[64px] rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200 xl:mt-[72px]">
                <label htmlFor="sidebar-search" className="sr-only">
                  記事検索
                </label>
                <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
                  <Search className="h-4 w-4 text-brand-primary/60" aria-hidden="true" />
                  <input
                    id="sidebar-search"
                    type="search"
                    placeholder="記事を検索（例：フォロワー 増やす）"
                    className="w-full bg-transparent text-sm text-brand-primary placeholder:text-brand-primary/50 focus:outline-none"
                  />
                </div>
              </section>

              <section className="space-y-4">
                <h2 className="text-4xl font-extrabold">人気記事</h2>
                <div className="rounded-lg bg-card-bg p-4 shadow-sm ring-1 ring-slate-200">
                  <ul className="space-y-3">
                    {rankingItems.map((item, index) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-3 rounded-md p-1 hover:bg-slate-50"
                        >
                          <RankCrownBadge rank={index + 1} />
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-slate-100">
                            <Image
                              src={ensureArticleImageSrc(item.image)}
                              alt={`${item.title}のサムネイル`}
                              fill
                              sizes="56px"
                              className="object-cover"
                            />
                          </div>
                          <p className="min-w-0 line-clamp-2 text-sm font-semibold leading-snug">{item.title}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <SidebarFeaturedArticlesSection featuredArticles={sidebarFeaturedArticles} />

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
