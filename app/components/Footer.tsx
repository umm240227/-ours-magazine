import Link from "next/link";

const footerCategories = [
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

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-10 text-sm text-brand-primary/80 md:grid-cols-2 lg:grid-cols-4">
        <section className="space-y-4">
          <p className="text-base font-extrabold tracking-[0.12em] text-brand-primary">
            SNS <span className="mx-1 rounded-sm bg-brand-accent px-1.5 py-0.5">OURS</span> MAGAZINE
          </p>
          <p className="leading-relaxed">
            SNSを伸ばすすべての人へ。実践的なノウハウをお届けするマーケティングメディアです。
          </p>
          <a href="#" className="inline-flex items-center text-sm font-semibold text-brand-primary hover:opacity-70">
            編集部のおすすめを見る →
          </a>
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-extrabold text-brand-primary">カテゴリ</h3>
          <ul className="space-y-2">
            {footerCategories.map((category) => (
              <li key={category.slug}>
                <Link href={`/category/${category.slug}`} className="hover:opacity-70">
                  {category.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="hidden space-y-3 lg:block">
          <h3 className="text-base font-extrabold text-brand-primary">人気トピック</h3>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Link
                key={`footer-${tag}`}
                href={getTagHref(tag)}
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-brand-primary hover:bg-brand-accent"
              >
                {tag}
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-base font-extrabold text-brand-primary">お問い合わせ</h3>
          <p className="text-sm leading-relaxed">
            記事内容に関するご質問や掲載についてのご連絡はこちらからお送りいただけます。
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center text-sm font-semibold text-brand-primary transition-colors hover:text-gray-900 hover:underline"
          >
            編集部へのお問い合わせ →
          </Link>
        </section>
      </div>
      <div className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-brand-primary/70 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 SNS OURS MAGAZINE. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:opacity-70">
              プライバシーポリシー
            </a>
            <a href="#" className="hover:opacity-70">
              サイトマップ
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
