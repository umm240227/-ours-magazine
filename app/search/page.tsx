import Link from "next/link";
import { searchArticles } from "../../lib/markdown";

type SearchPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = Array.isArray(q) ? q[0] ?? "" : q ?? "";
  const trimmedQuery = query.trim();
  const articles = searchArticles(trimmedQuery);

  return (
    <div className="bg-site-bg text-brand-primary">
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-24 lg:pt-8">
        <section className="border-b border-slate-200 py-12">
          <p className="text-sm font-semibold tracking-wide text-brand-primary/80">Search results for :</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">
            &quot;{trimmedQuery}&quot;
          </h1>
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
            <p className="text-base text-brand-primary/70">記事が見つかりませんでした</p>
          )}
        </section>
      </section>
    </div>
  );
}
