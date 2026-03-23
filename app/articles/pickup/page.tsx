import Link from "next/link";

const categories = [
  { label: "Instagram", slug: "instagram" },
  { label: "TikTok", slug: "tiktok" },
  { label: "X（Twitter）", slug: "x" },
  { label: "YouTube", slug: "youtube" },
  { label: "SNS運用", slug: "sns" },
];

const tags = ["#Instagram", "#TikTok", "#インスタ運用", "#YouTube収益化", "#リール動画", "#ショート動画", "#広告", "#SNSマーケティング"];

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

function getTagHref(tag: string) {
  return `/tags/${encodeURIComponent(tag.replace(/^#/, "").trim().toLowerCase())}`;
}
const recommendedArticles = [
  {
    id: 1,
    category: "Instagram",
    title: "保存率を上げる投稿設計の基本",
    date: "2026.03.12",
    image: "https://picsum.photos/seed/reco-1/800/600",
    href: "/articles/post-1",
  },
  {
    id: 2,
    category: "TikTok",
    title: "冒頭3秒で離脱を防ぐ見せ方",
    date: "2026.03.09",
    image: "https://picsum.photos/seed/reco-2/800/600",
    href: "/articles/post-2",
  },
  {
    id: 3,
    category: "SNS運用",
    title: "少人数でも続く週間運用フロー",
    date: "2026.03.07",
    image: "https://picsum.photos/seed/reco-3/800/600",
    href: "/articles/post-3",
  },
];

export default function PickupArticleDetailPage() {
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
                  <Link href={getCategoryHref("SNS運用")} className="transition-colors hover:text-brand-primary hover:underline">
                    SNS運用
                  </Link>
                </li>
                <li aria-hidden="true" className="px-2 text-gray-400">
                  &gt;
                </li>
                <li className="text-gray-500">2026年版SNS運用を伸ばす最新トレンドまとめ</li>
              </ol>
            </nav>

            <header className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex rounded-md bg-brand-accent px-3 py-1 text-xs font-bold text-brand-primary">Pickup</span>
                <time className="text-sm text-slate-400">2026.03.15</time>
              </div>
              <h1 className="text-3xl font-bold leading-tight text-brand-primary md:text-4xl">
                2026年版SNS運用を伸ばす最新トレンドまとめ
              </h1>
              <div
                role="img"
                aria-label="海と山のイメージ画像"
                className="aspect-video w-full rounded-2xl bg-cover bg-center"
                style={{ backgroundImage: "url('https://picsum.photos/seed/pickup-main/1200/700')" }}
              />
            </header>

            <article className="space-y-8 text-base leading-relaxed text-slate-700 md:text-lg">
              <p>
                2026年のSNS運用は、以前のように「とにかく投稿数を増やす」だけでは成果が出にくい局面に入っています。多くの企業や店舗が発信を強化したことで、
                見る側の選択肢は一気に増え、情報の質と届け方の両方が厳しく比較されるようになりました。今求められるのは、単発の話題作りではなく、
                生活者の行動に寄り添って信頼を積み上げる設計です。つまり、投稿は広告の代わりではなく、来店前の接客、購入前の相談、購入後のフォローまでを支える
                「継続的なコミュニケーション」として捉える必要があります。
              </p>

              <p>
                この記事では、2026年時点で成果につながりやすい運用トレンドを、現場で再現しやすい順番で整理します。アルゴリズムの細かな変化を追うだけではなく、
                どの業種でも共通して効く基本設計に焦点を当て、明日から実行できる形に落とし込みます。特に、フォロワー数だけを追わない評価設計、短尺動画と静止画の
                役割分担、口コミを生みやすい導線づくり、運用チームの負荷を抑える仕組み化の4点は、2026年の勝ち筋として押さえておきたいポイントです。
              </p>

              <h2 className="border-l-4 border-brand-primary bg-slate-50 px-4 py-2 text-2xl font-bold leading-snug text-brand-primary">
                2026年のSNS運用で重視したい4つの視点
              </h2>

              <p>
                2026年は、投稿の見た目や勢いだけでなく、アカウント全体の体験品質が強く問われる年です。特定の投稿が一時的に伸びても、
                そこからプロフィール、過去投稿、外部リンクへと移動したときに「次の行動」が見えなければ、成果は続きません。逆に、導線が明確で、
                見る人が迷わない設計ができているアカウントは、急激にバズらなくても安定して数字を積み上げています。
              </p>

              <h3 className="text-xl font-semibold leading-snug text-brand-primary">1. 保存される情報を優先する</h3>
              <p>
                2026年は、瞬間的な反応より「後で見返される価値」がより重視されています。保存される投稿は、表示機会が長く続くため、
                長期的な集客資産になりやすいのが特徴です。特に、チェックリスト、比較表、失敗回避の手順、初心者向けの順番解説は保存率が高く、
                そこから指名検索や問い合わせにつながる傾向があります。見出しで結論を先に示し、本文で理由と実例を補足し、最後に「次の一歩」を提示する。
                この基本構造を守るだけでも、投稿の再利用価値は大きく上がります。
              </p>

              <h3 className="text-xl font-semibold leading-snug text-brand-primary">2. 冒頭3秒の設計を見直す</h3>
              <p>
                リールやショート動画では、冒頭3秒の設計がこれまで以上に重要です。ただし、刺激の強い演出だけに頼る方法は長続きしません。
                今は「誰のどんな悩みを、何分でどう解決するか」を最初に明確に伝える動画が評価されやすくなっています。たとえば、
                「飲食店の投稿が伸びない原因を30秒で解説します」のように対象と価値をセットで示し、続けてビフォーアフターや具体例を入れる形です。
                見る人が途中離脱しにくくなり、最後まで視聴される比率が安定します。
              </p>

              <h3 className="text-xl font-semibold leading-snug text-brand-primary">3. フォロワー数だけで評価しない</h3>
              <p>
                2026年に成果を出しているチームは、フォロワー数だけで良し悪しを判断していません。重視しているのは、プロフィール遷移率、
                保存率、コメントの質、リンク先での行動、来店や予約への貢献度です。フォロワーは増えても、問い合わせが増えない運用は
                ビジネス成果に直結しません。逆にフォロワーの伸びが緩やかでも、購入前の不安を解消できる投稿を継続すれば、成約率は着実に上がります。
                指標を「見られた数」から「行動された数」へ寄せることが、投下時間の最適化につながります。
              </p>

              <h3 className="text-xl font-semibold leading-snug text-brand-primary">4. 運用を続ける仕組みを作る</h3>
              <p>
                属人的な運用は、担当者の忙しさや異動で簡単に止まります。だからこそ、2026年は「誰がやっても最低ラインを維持できる仕組み」が重要です。
                具体的には、週ごとのテーマ表、素材管理の置き場、投稿文の型、返信ルール、週次の振り返りシートを標準化します。
                これにより、急な欠員が出ても発信が止まりにくくなり、品質のブレを最小限に抑えられます。
              </p>

              <ul className="list-disc space-y-2 pl-6 marker:text-brand-primary">
                <li>投稿の目的を「認知」「比較」「行動」に分けて、役割を混ぜない</li>
                <li>1本ごとに対象者を1人に絞り、冒頭で悩みを言語化する</li>
                <li>保存されやすい型を毎月3つ選び、繰り返し改善する</li>
                <li>週1回の定例で改善点を1つだけ決め、翌週に反映する</li>
              </ul>

              <h2 className="border-l-4 border-brand-primary bg-slate-50 px-4 py-2 text-2xl font-bold leading-snug text-brand-primary">
                主要プラットフォーム別の実践ポイント
              </h2>

              <p>
                同じ内容をそのまま横展開する方法は、2026年には通用しづらくなっています。各プラットフォームで「見られ方」が異なるため、
                素材は共通でも、見せ方を変える前提が必要です。ここでは運用現場で実行しやすい分け方を紹介します。
              </p>

              <h3 className="text-xl font-semibold leading-snug text-brand-primary">Instagram: 信頼形成と比較検討の場</h3>
              <p>
                Instagramでは、世界観の統一よりも「必要な情報にすぐ辿り着ける構成」が重要です。プロフィール上部に代表投稿を固定し、
                ハイライトでよくある質問を整理すると、初見ユーザーの離脱を抑えられます。カルーセル投稿では、1枚目で課題、2枚目で結論、
                3枚目以降で具体策を提示する流れが安定して機能します。店舗系アカウントの場合は、地図、価格目安、予約方法を定期的に明示すると
                来店意欲が高まりやすくなります。
              </p>

              <h3 className="text-xl font-semibold leading-snug text-brand-primary">TikTok: 発見拡大と第一接点の場</h3>
              <p>
                TikTokでは、完成度の高さよりも「わかりやすさ」と「テンポ」が優先されます。編集を凝りすぎるより、1テーマ1メッセージで
                短く伝えるほうが再生維持率は上がります。特に、店舗スタッフや担当者の顔が見える動画は親近感が生まれやすく、
                コメント欄での会話を通じて関係が深まりやすい傾向があります。動画の終わりには次の行動を明示し、
                プロフィール誘導や保存の呼びかけを自然に入れることが効果的です。
              </p>

              <h3 className="text-xl font-semibold leading-snug text-brand-primary">X: 速報性と意思表示の場</h3>
              <p>
                Xでは、情報の速さと一貫した視点が評価されます。単なるニュース共有では埋もれやすいため、自社や自店の立場から
                「どう解釈し、何をするか」を短く添えることが重要です。加えて、日々の投稿をスレッドで整理しておくと、
                新規フォロワーが過去の知見を追いやすくなります。炎上リスクを避けるためには、意見の強さより事実の明確さを優先し、
                誤解されやすい表現は事前にチェックする運用ルールが必要です。
              </p>

              <h2 className="border-l-4 border-brand-primary bg-slate-50 px-4 py-2 text-2xl font-bold leading-snug text-brand-primary">
                成果につながる90日運用プラン
              </h2>

              <p>
                「何から始めればよいかわからない」という状態を防ぐには、90日を3段階に分けるのが有効です。最初の30日は準備、
                次の30日は改善、最後の30日は拡張に集中します。この順番を守ることで、運用の空回りを減らせます。
              </p>

              <h3 className="text-xl font-semibold leading-snug text-brand-primary">1〜30日: 土台づくり</h3>
              <p>
                誰に向けたアカウントかを明確にし、投稿テーマを3つに絞ります。プロフィール、固定投稿、導線を整え、
                まずは最低限の信頼が伝わる状態を作ります。ここでは完璧よりも、見た人が迷わないことを優先してください。
              </p>

              <h3 className="text-xl font-semibold leading-snug text-brand-primary">31〜60日: 検証と改善</h3>
              <p>
                反応が良かった投稿を型にして再現し、弱かった投稿は冒頭と見出しを中心に改善します。改善点を一度に増やしすぎると
                何が効いたか分からなくなるため、毎週1テーマだけ変更するのがコツです。コメントや質問内容を分類し、
                次の投稿企画に反映すると、自然な需要に沿った発信ができます。
              </p>

              <h3 className="text-xl font-semibold leading-snug text-brand-primary">61〜90日: 拡張と仕組み化</h3>
              <p>
                成果が出た型を中心に投稿本数を増やし、短尺動画、静止画、ストーリーズの役割を分担します。同時に、
                投稿作成から公開後の振り返りまでを手順書化し、担当者が変わっても回る運用に移行します。ここまで進むと、
                運用は「気合い」ではなく「仕組み」で継続できるようになります。
              </p>

              <h2 className="border-l-4 border-brand-primary bg-slate-50 px-4 py-2 text-2xl font-bold leading-snug text-brand-primary">
                2026年に避けたい失敗パターン
              </h2>

              <p>
                最後に、成果が伸び悩むアカウントに共通する失敗も押さえておきましょう。流行の表現を追うこと自体は悪くありませんが、
                目的と導線がないまま試すと、運用コストだけが増えてしまいます。特に次の3点は、早い段階で見直す価値があります。
              </p>

              <ul className="list-disc space-y-2 pl-6 marker:text-brand-primary">
                <li>投稿テーマが広すぎて、誰向けの発信か伝わらない</li>
                <li>数値の振れ幅に一喜一憂し、検証期間を確保できない</li>
                <li>成果投稿の再現をせず、毎回ゼロから企画して疲弊する</li>
              </ul>

              <p>
                2026年のSNS運用は、派手な1本を狙う競争ではなく、価値ある発信を継続して信頼を積み上げる競争です。投稿を作る作業だけでなく、
                見る人の行動を設計し、運用の仕組みを整えることで、少人数でも結果を出せる状態に近づきます。まずは「対象者を絞る」「保存される型を作る」
                「週1回だけ改善する」という3つから始めてください。ここを押さえるだけでも、発信の手応えは大きく変わります。
              </p>
            </article>

            <section className="space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-brand-primary/80">この記事のタグ</h3>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Link
                      key={tag}
                      href={getTagHref(tag)}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-brand-primary transition-colors hover:bg-slate-100"
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
                {recommendedArticles.map((article) => (
                  <Link
                    key={article.id}
                    href={article.href}
                    className="block overflow-hidden rounded-lg bg-card-bg shadow-sm ring-1 ring-slate-200 transition-all duration-300 hover:shadow-md"
                  >
                    <article>
                      <div
                        role="img"
                        aria-label={`${article.title}のサムネイル`}
                        className="aspect-[16/11] w-full bg-cover bg-center opacity-90"
                        style={{ backgroundImage: `url('${article.image}')` }}
                      />
                      <div className="space-y-2 p-4">
                        <span className="inline-block rounded-full bg-brand-accent px-3 py-1 text-xs font-semibold text-brand-primary">
                          {article.category}
                        </span>
                        <h3 className="line-clamp-2 text-base font-bold leading-snug text-brand-primary">{article.title}</h3>
                        <p className="text-xs text-brand-primary/70">{article.date}</p>
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
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
