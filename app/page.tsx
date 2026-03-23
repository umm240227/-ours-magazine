import { Search } from "lucide-react";
import Link from "next/link";
import PickupArticleCard from "./components/PickupArticleCard";
import { getAllArticles, type Article } from "../lib/markdown";

const articleCards = [
  {
    id: 1,
    category: "Instagram",
    title: "伸びる投稿を作る3つの型",
    excerpt: "保存される投稿に共通する、企画から構成までの基本をやさしく解説。",
    date: "2026.03.10",
    image: "https://picsum.photos/seed/article-1/800/600",
  },
  {
    id: 2,
    category: "TikTok",
    title: "再生数が伸びる冒頭設計",
    excerpt: "最初の3秒で離脱を防ぐための導入テンプレートを紹介します。",
    date: "2026.03.08",
    image: "https://picsum.photos/seed/article-2/800/600",
  },
  {
    id: 3,
    category: "SNS運用",
    title: "少人数でも回る運用フロー",
    excerpt: "担当が少なくても無理なく続く、週次運用の分担方法をまとめました。",
    date: "2026.03.06",
    image: "https://picsum.photos/seed/article-3/800/600",
  },
  {
    id: 4,
    category: "YouTube",
    title: "分析時間を半分にする習慣",
    excerpt: "毎日の集計作業を短縮するための、実務で使える見直しポイント集。",
    date: "2026.03.04",
    image: "https://picsum.photos/seed/article-4/800/600",
  },
];

const rankingItems = [
  {
    title: "2026年版Instagramアルゴリズム完全攻略: 再生回数を劇的に伸ばす実践ロードマップ",
    image: "https://picsum.photos/seed/rank-instagram-1/180/120",
    href: "/articles/post-instagram-algorithm",
  },
  {
    title: "YouTube収益化の条件クリアを最速で達成するロードマップ: 90日で土台を作り、180日で安定到達する実践設計",
    image: "https://picsum.photos/seed/rank-youtube-2/180/120",
    href: "/articles/youtube-monetization-roadmap",
  },
  {
    title: "少額から始めるSNS広告の費用対効果を最大化するコツ: 月3万円でも成果を出す実践ロードマップ",
    image: "https://picsum.photos/seed/rank-ads-3/180/120",
    href: "/articles/sns-ads-small-budget-roi",
  },
  {
    title: "ユーザーが自然とクチコミを投稿したくなるUGC創出の仕掛け: 売り込まずに広がるSNS運用の実践設計",
    image: "https://picsum.photos/seed/rank-ugc-4/180/120",
    href: "/articles/ugc-natural-word-of-mouth-mechanism",
  },
  {
    title: "Xでフォロワー1万人を現実にする実践ロードマップ: 0から積み上げる運用設計と毎日の改善手順",
    image: "https://picsum.photos/seed/rank-x-5/180/120",
    href: "/articles/x-10000-roadmap",
  },
];

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

const categoryArticleSections: CategoryArticleSection[] = [
  {
    name: "Instagram",
    items: [
      {
        id: 101,
        title: "保存率を高めるカルーセル1枚目の作り方",
        excerpt: "スクロールを止める見出し設計と、情報の出し方の順番を整理。",
        image: "https://picsum.photos/seed/insta-guide-1/320/220",
        href: "/articles/instagram-save-post-structure",
      },
      {
        id: 104,
        title: "フォロワーが増えない原因と改善方法",
        excerpt: "投稿内容・ターゲット・導線・継続の4つの視点から改善策を解説。",
        image: "https://picsum.photos/seed/insta-guide-4/320/220",
        href: "/articles/instagram-followers-growth-fixes",
      },
      {
        id: 102,
        title: "プロフィール改善チェックリスト（離脱防止）",
        excerpt: "離脱されないプロフィールに整えるための確認項目を、改善例つきで解説。",
        image: "https://picsum.photos/seed/insta-guide-2-profile/320/220",
        href: "/articles/instagram-profile-checklist-retention",
      },
    ],
  },
  {
    name: "TikTok",
    items: [
      {
        id: 201,
        title: "TikTokで冒頭3秒の離脱を減らすフックの作り方",
        excerpt: "視聴維持率の基本、バズるフック例、NGパターン、即使えるテンプレを解説。",
        image: "https://picsum.photos/seed/tiktok-guide-1/320/220",
        href: "/articles/tiktok-first-3-seconds-hook",
      },
      {
        id: 202,
        title: "最後まで見られる動画構成の作り方（完走率アップ）",
        excerpt: "導入→展開→オチの設計、離脱ポイント、改善方法、テンポ設計のコツを紹介。",
        image: "https://picsum.photos/seed/tiktok-guide-2/320/220",
        href: "/articles/tiktok-watch-through-structure",
      },
      {
        id: 203,
        title: "コメントを増やす仕掛け（エンゲージメント向上）",
        excerpt: "質問の作り方、参加型企画、アルゴリズムとの関係、NG例まで実践的に解説。",
        image: "https://picsum.photos/seed/tiktok-guide-3/320/220",
        href: "/articles/tiktok-comment-engagement-guide",
      },
    ],
  },
  {
    name: "YouTube",
    items: [
      {
        id: 301,
        title: "再生回数が伸びる企画の作り方",
        excerpt: "伸びる企画と伸びない企画の違い、検索型とバズ型、すぐ使える企画テンプレを解説。",
        image: "https://picsum.photos/seed/youtube-planning-1/320/220",
        href: "/articles/youtube-content-planning-for-views",
      },
      {
        id: 302,
        title: "クリックされるサムネイルとタイトルの作り方",
        excerpt: "CTRを上げる設計の基本、NG例、改善パターンを初心者向けにわかりやすく紹介。",
        image: "https://picsum.photos/seed/youtube-thumbnail-2/320/220",
        href: "/articles/youtube-thumbnail-title-ctr-guide",
      },
      {
        id: 303,
        title: "初心者がやるべきYouTube分析指標と改善方法",
        excerpt: "CTR・視聴維持率などの見方、よくある勘違い、具体的な改善手順をまとめて解説。",
        image: "https://picsum.photos/seed/youtube-analytics-3/320/220",
        href: "/articles/youtube-analytics-metrics-improvement-guide",
      },
    ],
  },
];

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
                <div className="h-[108px] w-48 shrink-0 overflow-hidden rounded-md bg-slate-100">
                  <img
                    src={article.image}
                    alt={`${article.title}のサムネイル`}
                    className="h-full w-full object-cover object-center"
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
                <div
                  role="img"
                  aria-label={`${article.title}のサムネイル`}
                  className="sidebar-featured-thumbnail relative aspect-[16/10] w-full bg-cover bg-center"
                  style={{ backgroundImage: `url('${article.image}')` }}
                >
                  <span className="absolute left-3 top-3 inline-flex rounded-md bg-brand-accent px-2 py-1 text-[11px] font-bold leading-none text-brand-primary">
                    PICKUP
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
            imageUrl={topPickupArticle?.image ?? "https://picsum.photos/seed/pickup-main/1200/700"}
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
            {latestArticles.slice(0, 3).map((article) => (
              <Link
                key={`mobile-latest-${article.id}`}
                href={`/articles/${article.id}`}
                className="flex h-full flex-col overflow-hidden rounded-lg bg-card-bg shadow-sm ring-1 ring-slate-200 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <article className="flex h-full flex-col">
                  <div
                    role="img"
                    aria-label={`${article.title}のサムネイル`}
                    className="aspect-[16/10] w-full bg-cover bg-center"
                    style={{ backgroundImage: `url('${article.image}')` }}
                  />
                  <div className="flex h-full flex-col gap-2 p-3">
                    <span className="inline-flex w-fit rounded-md bg-brand-accent px-2 py-1 text-[11px] font-semibold leading-none text-brand-primary">
                      {article.category}
                    </span>
                    <h3 className="line-clamp-2 min-h-[2.8rem] text-sm font-bold leading-snug">{article.title}</h3>
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
              <li key={item.title}>
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
                        <div
                          role="img"
                          aria-label={`${item.title}のサムネイル`}
                          className="h-[92px] w-[92px] shrink-0 rounded-md bg-cover bg-center"
                          style={{ backgroundImage: `url('${item.image}')` }}
                        />
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
                imageUrl={topPickupArticle?.image ?? "https://picsum.photos/seed/pickup-main/1200/700"}
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
                            <div
                              role="img"
                              aria-label={`${item.title}のサムネイル`}
                              className="h-[90px] w-[96px] shrink-0 rounded-md bg-cover bg-center"
                              style={{ backgroundImage: `url('${item.image}')` }}
                            />
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
                      <li key={item.title}>
                        <Link
                          href={item.href}
                          className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-3 rounded-md p-1 hover:bg-slate-50"
                        >
                          <RankCrownBadge rank={index + 1} />
                          <img
                            src={item.image}
                            alt={`${item.title}のサムネイル`}
                            className="h-14 w-14 shrink-0 rounded-md object-cover"
                          />
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
