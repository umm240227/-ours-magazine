import Image from "next/image";
import Link from "next/link";
import { ensureArticleImageSrc, searchArticles } from "../../lib/markdown";

type SearchPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = Array.isArray(q) ? q[0] ?? "" : q ?? "";
  const trimmedQuery = query.trim();
  const articles = searchArticles(trimmedQuery);
  const isEmptyQuery = trimmedQuery === "";

  return (
    <div className="bg-site-bg text-brand-primary">
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-24 lg:pt-8">
        <section className="border-b border-slate-200 py-12">
          {isEmptyQuery ? (
            <>
              <p className="text-sm font-semibold tracking-wide text-brand-primary/80">記事を検索</p>
              <h1 className="mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">キーワードを入力してください</h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-brand-primary/75">
                サイト上部の検索欄にキーワードを入れて検索すると、記事のタイトル・説明・本文・タグから該当する記事を表示します。
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold tracking-wide text-brand-primary/80">検索結果</p>
              <h1 className="mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">
                &quot;{trimmedQuery}&quot;
              </h1>
            </>
          )}
        </section>

        {!isEmptyQuery && (
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
            <p className="text-base leading-relaxed text-brand-primary/70">
              「{trimmedQuery}」に一致する記事はありませんでした。ほかのキーワードでお試しください。
            </p>
          )}
        </section>
        )}
      </section>
    </div>
  );
}
