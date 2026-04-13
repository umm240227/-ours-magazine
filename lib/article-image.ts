/** public に実体を置く。外部画像サービスに依存しないフォールバック用パス */
export const ARTICLE_IMAGE_PLACEHOLDER_PATH = "/images/articles/placeholder.png";

/** クライアントコンポーネントからも import 可能（node:fs に依存しない） */
export function ensureArticleImageSrc(src: string): string {
  const t = src.trim();
  return t.length > 0 ? t : ARTICLE_IMAGE_PLACEHOLDER_PATH;
}
