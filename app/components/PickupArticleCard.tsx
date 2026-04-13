import Image from "next/image";
import Link from "next/link";
import { ensureArticleImageSrc } from "../../lib/article-image";

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
  category = "SNS運用",
  date,
}: PickupArticleCardProps) {
  const src = ensureArticleImageSrc(imageUrl);

  return (
    <Link
      href={href}
      className="block overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
    >
      <article>
        <div className="relative aspect-[16/10] w-full bg-slate-100">
          <Image
            src={src}
            alt={`${title}のサムネイル`}
            fill
            sizes="(max-width: 1024px) 100vw, 896px"
            className="object-cover object-center"
            priority
          />
          <span className="absolute left-4 top-4 z-10 rounded-md bg-brand-accent px-3 py-1 text-xs font-bold text-brand-primary">
            ピックアップ
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
