import Link from "next/link";

type PickupArticleCardProps = {
  imageUrl: string;
  href?: string;
  title?: string;
  description?: string;
  category?: string;
  date?: string;
};

export default function PickupArticleCard({
  imageUrl,
  href = "/articles/post-1",
  title = "SNS運用を伸ばす最新トレンドまとめ",
  description = "明日から使えるSNS運用の実践ポイントをまとめた注目記事です。",
  category = "Pickup",
  date,
}: PickupArticleCardProps) {
  return (
    <Link
      href={href}
      className="block overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
    >
      <article>
        <div
          role="img"
          aria-label={`${title}のサムネイル`}
          className="relative aspect-[16/10] w-full bg-cover bg-center"
          style={{ backgroundImage: `url('${imageUrl}')` }}
        >
          <span className="absolute left-4 top-4 rounded-md bg-brand-accent px-3 py-1 text-xs font-bold text-brand-primary">
            Pickup
          </span>
        </div>
        <div className="space-y-3 p-5">
          <h3 className="text-2xl font-extrabold leading-tight text-brand-primary">{title}</h3>
          <p className="line-clamp-2 text-sm leading-relaxed text-brand-primary/80">{description}</p>
          <p className="text-xs leading-tight text-brand-primary/65">
            {category}
            {date ? ` ・ ${date}` : ""}
          </p>
          <p className="inline-flex items-center text-sm font-semibold text-brand-primary">記事を読む →</p>
        </div>
      </article>
    </Link>
  );
}
