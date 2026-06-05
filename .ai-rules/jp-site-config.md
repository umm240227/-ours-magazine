# JP 사이트 설정 정본 (ours-magazine.jp) — 플랫폼 델타

> 이 문서는 KR `snshelp-astro` 자동화를 일본 매거진 `ours-magazine.jp`로 포팅할 때 **플랫폼/로케일이 강제하는 변경의 단일 기준점**이다.
> KR 스킬(`.claude/skills/blog/*`)·룰(`.ai-rules/*`)이 WordPress/S3/Naver/Amplify를 가정하는 모든 지점은 **이 문서가 우선**한다. 충돌 시 JP(이 문서)를 따른다.

## 1. 플랫폼
- 렌더: **Next.js (App Router) + Vercel**. 기사 라우트 `app/articles/[id]/page.tsx` → 공개 URL `https://www.ours-magazine.jp/articles/<slug>`.
- 파서: `gray-matter` + `react-markdown` + `remark-gfm` (`lib/markdown.ts`).
- 배포: **git push → Vercel 자동빌드** (Amplify 아님).

## 2. 경로 컨벤션
| | 발행본 (커밋됨) | draft (gitignore) |
|---|---|---|
| 마크다운 | `content/articles/<slug>.md` | `drafts/<slug>.md` |
| 이미지 | `public/images/articles/<slug>/` | `drafts/images/<slug>/` |
- slug = 파일명 = 영문 kebab-case (2–5단어, ≤50자). KR `wp-content/posts/*.md` 경로 전부 → 위로 매핑.

## 3. 본문 포맷 (CRITICAL — KR과 가장 큰 차이)
- **순수 GFM 마크다운.** Gutenberg HTML(`<figure class="wp-block-image">`, `<ul>`, `<p><strong>`) **금지.**
- **강조(굵게) `**텍스트**`**: 일본어 구두점·괄호(`、。「」（）`)에 바로 붙어도 사이트가 `remark-cjk-friendly`(page.tsx)로 렌더 복구 — 표준 CommonMark flanking 규칙이면 별표가 리터럴로 노출되는 것을 방지(원본 마크다운 보존). 단 `**`는 **반드시 짝수로 닫을 것**: 닫는 `**` 누락은 플러그인도 복구 못 하고 `validate-post-html.mjs` `unparsed-emphasis` 게이트(audit −20)에서 차단된다.
- KR write.md의 **본문 상단 5단 강제 순서는 유지하되 마크다운으로 표현**:
  1. TL;DR 헤더 → `**{메인키워드}、{N}つのポイント**` (페르소나 자기소개 금지)
  2. TL;DR 리스트 → `- ` bullets 5±2 (각 70–140자 상당, 본문 H2와 1:1)
  3. 인포그래픽 → `![{alt}]([[IMG:N]])` (TL;DR 직후)
  4. 첫 H2 → `## ` 키워드 풍부 정의형 (はじめに/序論 등 보일러플레이트 금지)
  5. 본문 H2 흐름 (`## `/`### `, 표는 GFM `| |`)
- **이미지 placeholder**: 본문 이미지는 `![{alt}]([[IMG:N]])`. `md-publish.mjs`가 `[[IMG:N]]` → 실제 경로로 치환. **hero(featured)는 본문에 넣지 않음** → frontmatter `image:`로만.

## 4. frontmatter (`ArticleFrontmatter` 정본 + 자동화 메타)
필수: `title, description(120–160字), date("YYYY.MM.DD" 점 구분), category, image(/images/articles/<slug>/...), tags[]("#...")`. 선택: `featured, recommended, author, faq`.
- **`author`**(선택, 문자열): 페르소나 표시명 → 사이트가 Article JSON-LD `author`(Person)로 렌더. 없으면 Organization(ours-magazine).
- **`faq`**(선택, `[{question, answer}]`): write 단계가 본문 `## よくある質問` 섹션과 **함께 frontmatter로도 출력** → 사이트(E)가 **FAQPage JSON-LD** 생성(AEO §9). 없으면 FAQ 스키마 생략. (본문엔 순수 GFM Q&A, JSON-LD는 사이트가 frontmatter에서 생성 — react-markdown이 본문 raw HTML/script를 안 받으므로 §3.)
- 자동화 메타(`_audit_score, _audit_cycles, _draft`)는 보존 — 사이트 파서가 무시하므로 무해, 재감사·디버그용.
- 사이트(E)는 Article/Organization/BreadcrumbList JSON-LD를 frontmatter에서 자동 생성, date를 점 형식으로 정규화, 본문 표/blockquote/img/ol/code를 스타일 렌더.

## 5. 발행 레이어 (라우팅 캐논)
- KR `wp-publish-new.mjs` / `wp-push.mjs` / `wp-pull.mjs`(WP/S3/CloudFront 결합)는 **JP 경로에서 호출 금지.**
- 발행 명령 = **`node script/md-publish.mjs <draft.md>`** (Phase 0 로컬 생성) / **`--push`** (Phase 1 `git push origin main` → Vercel 자동빌드).
- 브랜치 = **`main`** (KR `master` 아님).
- 게이트 로직(`_audit_score===100` / 이미지≥3 / hero 1 / `validate-blog-publish` / `audit-cdn-gate --source=local`)은 **그대로 유지·연결 완료(C5)**: md-publish.mjs가 인라인 게이트(점수·이미지·hero·placeholder) + `validate-blog-publish.mjs`(여백비율·width≥1200·타입다양성) + `audit-cdn-gate.mjs --source=local`(dim ratio·md5)을 subprocess로 실제 호출, 비0 종료 시 발행 차단(F4 해소).

## 6. 제거/대체 (로케일·플랫폼 강제)
- **WordPress 전부 제거** (REST·Gutenberg·`wp-pull/push`·media POST).
- **S3/CloudFront 제거** → `public/`.
- **Naver 전부 제거**: DECAGO 볼륨 / IndexNow Naver / `audit-seo-naver.mjs` / 지식iN 인용 → 일본 소스로.
- **codex 일러스트 경로 제거** (외부 의존 B3). 이미지 ≥3 = **typography hero 인포그래픽 1 + 본문 인포그래픽/차트 ≥2**로 충족. (본문 단독 codex 일러스트는 asset-images §4.8.6에서 이미 금지)
- 폰트: **Pretendard → Noto Sans JP**.
- **인포그래픽 템플릿 CDN 의존 정책 (확정)**: 39개 템플릿이 `cdn.tailwindcss.com`(Tailwind JIT) + `fonts.googleapis.com`(Noto Sans JP)에 의존. **Phase 0 = CDN 허용**(렌더 호스트 = 네트워크 있는 Mac, 동작 확인됨). **Phase 3(Railway 무인) = self-host 필수** — Tailwind는 사용 클래스로 정적 CSS 빌드(arbitrary value `text-[64px]` 포함), Noto Sans JP는 woff2 로컬 `@font-face`. 미self-host 시 오프라인/CDN차단에서 무스타일·tofu 렌더. (hero/body schema.json의 `common.tailwind` CDN 값도 동일 정책 — Phase 3에서 self-host 경로로 교체.) **Next 사이트 폰트도 동일**: `app/layout.tsx`의 `next/font/google` Noto Sans JP는 빌드 시 Google Fonts를 fetch하므로 오프라인 빌드 실패 → Phase 3에서 next/font 로컬 파일(self-host)로 전환.
- 커뮤니티 페인 소스: 지식iN/디시/클리앙 → **Yahoo!知恵袋 / 5ch / note / X-JP / Reddit**.
- 시즈널: 한국 캘린더 → **일본**(お正月/GW/お盆/年末商戦 등).
- 검증 타깃(prod 실물): `assets.helpsns.com` → **Vercel preview/prod URL**.

## 7. 키워드 볼륨
- Phase 0: **Semrush `database=jp`**. (네이버 fallback 없음 → Semrush 단일.)
- Phase 3 옵션: CRM Trendkit(Google Ads Keyword Planner, GEO=JP) 재사용.

## 8. 헤드리스 자동화 (완전 무인)
- 진입점: **`/blog create auto <seed>`** — KR `create auto`는 시드 미수용 → 시드 허용하도록 확장. 시드 없으면 KR 자동 주제 선정.
- **Phase 8 부분실패 자동값**: topic 채택<5 / keyword 메인<3 (3회 후)에도 사용자 보고 대신 **도출된 N개로 진행, N=0이면 `{"status":"no_topic"}` 출력 종료**.
- **publish 승인 자동**: KR publish.md Phase 2(발행)·Phase 6(push) 사용자 승인 게이트 → cron/headless에선 자동 진행.
- Railway 인증(Phase 3): `claude -p` 키체인 OAuth → `ANTHROPIC_API_KEY`, Semrush MCP → HTTP API, Google OAuth → `GOOGLE_REFRESH_TOKEN`.

## 9. 품질 패치 (한국 초과 — §7)
- **답변캡슐 100% 강제** (KR 80% 허용 → JP H2 전부 커버, `measure-answer-capsule.mjs` 통과율 100% 게이트화).
- **적대적 팩트체크 패스**: 본문 각 통계/주장마다 독립 sub-agent가 인용 URL fetch → 수치 문자열 실재 검증 (KR audit엔 없는 항목).
- **출처 = 검증 가능한 마크다운 링크 필수**: 외부 1차 출처는 `[출처명](https://원문URL)` 형식으로 본문/出典에 링크. 이름만 나열(링크 없음) 금지 — 독자가 검증 못 하면 E-E-A-T/팩트체크가 약함. (audit: 외부 출처 ≥3개 + URL 있을 것.)
- **상업 감점 제거 후 재배분**: M2 `/referral/` −15, "정보형 거래 다리 없음" −5 → 정보 매거진이므로 제거. 그 가중치를 위 품질 게이트로.
- **delta-stop**: cron 무제한 보강 루프에 "점수 증가 정체 시 중단" 추가.
- 본문 답변캡슐 규격 **50–80자로 통일** (KR write 40–60 / audit 50–80 불일치 해소).

## 10. 사이트 성격
- **정보 중심 + 약한 유입.** 거래 의도 로직 약하게, CTA는 결론에서만 가볍게. 유입 타깃 서비스 URL은 Phase 1 확정.
- 품질 코어(E-E-A-T·답변캡슐·인포그래픽·100점 감사)는 **100% 유지·강화.**

## 11. draft frontmatter 계약 (YAML 단일 — 확정)
- JP는 **draft·발행본 모두 YAML frontmatter(gray-matter)**. KR의 JSON `_draft`(JSON.parse/JSON.stringify) 계약은 **폐기.**
- write 단계는 `drafts/<slug>.md`를 **YAML**로 산출(`_draft.images[]`·`_audit_score`·`_audit_cycles` 포함). 이미지는 `drafts/images/<slug>/`.
- `validate-blog-publish.mjs`의 `JSON.parse`(parseFile, L27)는 **gray-matter로 교체**(C5). `md-publish.mjs`는 이미 gray-matter.
- 파서 하나(gray-matter)로 draft·published·검증기 전부 통일.

## 12. override 강제 (CRITICAL — root cause 차단)
- **모든 blog 스킬(SKILL·topic·keywords·write·audit·publish)은 각자 Phase 0 "정본 로드"에서 이 문서(`.ai-rules/jp-site-config.md`)를 가장 먼저 Read한다.**
- KR 본문과 충돌하는 모든 지점 — **발행 경로(md-publish), DB(`database=jp`), Naver 전부 제거, draft 경로(`drafts/<slug>.md`), `/referral` 제거, 본문=순수 GFM, 폰트 Noto JP, 검증 타깃 Vercel** — 은 이 문서가 **무조건 우선.**
- 이 Read 후크가 없으면 헤드리스 실행자(`/blog create auto`)가 KR 절차(wp-publish-new·52.79.247.124·S3)로 빠진다 = 지금까지의 근본 결함(스킬↔override 끊긴 링크). **후크 삽입은 선택 아님.**
