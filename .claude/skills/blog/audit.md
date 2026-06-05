
# blog/audit.md — 블로그 글 SEO/AEO/GEO 감사

## 역할

기존 WordPress 글을 **Google SEO + AEO + GEO** 관점에서 감사하고, 점수(0-100)와 우선순위 개선안을 제시한다. 정본 룰은 `.ai-rules/seo-policy.md`에서 가져온다 (블로그 글 룰은 §9 정본 통합본 — 비-블로그 페이지 룰과 통합).

**Sub agent 규칙**: 모든 sub-agent는 Pre-flight / 승인 대기 없이 즉시 실행한다.

## ⚠️ Semrush MCP 비용 게이트 (CRITICAL)

**호출 전 [.ai-rules/semrush-budget.md](../../../.ai-rules/semrush-budget.md) 정본 반드시 적용**.

- 글 1개 감사당 평균: `phrase_organic` (100 units) + `phrase_these`(메인+보조 60-80 units) = 약 200 units
- `--all` 또는 `--recent=N`은 N × 200 units 누적 → **N=10이면 2,000 units, N=50이면 10,000 units 폭발**
- **N ≥ 10인 일괄 감사는 사전 예상 비용 보고 + 명시 승인 필수**

임계값: < 500 자동 / 500~2,000 사전 보고 / ≥ 2,000 STOP+승인 / 누적 ≥ 5,000 중단.
호출 직후 형식: `[Semrush: +X units / 세션 누적 Y]`

---

## 입력

| 인자 | 의미 |
|---|---|
| `<post-id>` (숫자) | 특정 글 1개 감사 |
| `--all` | `content/articles/` 전체 감사 (큰 작업, 100+ 글) |
| `--recent=N` | 최근 수정된 N개 |

---

## 실행 흐름

### Phase 0: 정본·환경 준비
0. `.ai-rules/jp-site-config.md`를 **가장 먼저 Read** (상대경로 `../../../.ai-rules/jp-site-config.md`) — JP 플랫폼/로케일 정본. 본 문서와 충돌하는 **발행 경로·DB·Naver·draft 경로·/referral·폰트·검증 타깃**은 이 문서가 **무조건 우선**한다.
1. `.ai-rules/seo-policy.md`를 **반드시 Read** (블로그 글 룰은 §9 정본 통합본)
2. `.ai-rules/references/work-orchestration.md` 참고 (sub-agent 패턴)
3. `content/_taxonomy.json`, `content/_media.json` 로드 (카테고리·이미지 매핑) `[JP override]` (jp-site-config §2·§6): KR `wp-content/*` → JP `content/*` 매핑
4. Semrush MCP 가용성 확인 (`mcp__semrush__*` 존재 여부)
   - 미가용 시 → 외부 데이터 없이 본문 기반 감사만 수행, 보고에 명시

### Phase 1: 대상 글 로드
- post-id 지정 시: `content/articles/{id}.md` Read (단일 글 감사)
- `--all` / `--recent` (= `/blog audit-all` 진입): **글 1편당 독립 sub-agent 1개, 8개씩 병렬 cycle**로 전수조사. 정본 절차는 [.ai-rules/survey-methodology.md](../../../.ai-rules/survey-methodology.md) "블로그 본문/figure/SEO 전수조사 (글 1편당 sub-agent 1개)" 섹션을 **그대로 따른다**. 메인이 직접 순차 채점하거나 batch로 묶어 위임하지 않는다 (샘플링·결함 누락 방지).

### Phase 2: 본문 분석 (단일 글: Claude 직접 / `--all`: per-post sub-agent가 동일 기준으로)
seo-policy.md §5 점수 기준에 따라 7개 영역 0-100 채점. **AI 직접 판단이 1차 진실**이고 audit-*.mjs 스크립트는 보조다 (스크립트 사각지대 + self-improving 루프는 [blog/SKILL.md §3-D](../blog/SKILL.md) / [.ai-rules/audit-script-loop.md](../../../.ai-rules/audit-script-loop.md) 정본):

> [JP 주석] 답변캡슐·GFM구조 게이트가 부르는 `measure-answer-capsule.mjs`·`validate-post-html.mjs`·`audit-post-html.mjs`는 **C2에서 GFM 파싱으로 재작성 완료** — JP 본문(순수 GFM 마크다운) 대상, `jp-paths.mjs` 경로, slug·draft 경로 입력 가능. `audit-cdn-gate.mjs`도 C1 repath 완료(`--source=local` 발행 게이트). 인포그래픽 정적 감사 `audit-infographic-visual.mjs`·`audit-blog-image-quality.mjs`도 **C4 포팅 완료**(drafts/images·content/articles 경로, JP 誇大広告 사전, 빈경로 false-pass 제거).

| 영역 | 점검 |
|---|---|
| 구조 (§1.9 글 상단 정본, CRITICAL) | **5단계 정본 순서 (순수 GFM, jp-site-config §3)**: (1) TL;DR 헤더 `**{메인키워드}、핵심 N가지**` (마크다운 bold) (2) `- ` bullets 5개 (3) `![]([[IMG:N]])` 인포그래픽 (4) 첫 H2 `## ` (보일러플레이트 H2 금지) (5) 본문 흐름. **위반 시**: 본문 첫 단락이 페르소나 자기소개("이 글은 SNS헬프 X가...", "안녕하세요 저는...", "X는 ... 전문가로 N년...") 등 → **−15**. 첫 H2가 `서론`·`들어가며`·`머리말`·`왜 중요한가`·`개요란` → **−10**. TL;DR 누락 또는 5단계 순서 위반 → **−15**. 인포그래픽이 TL;DR 직후가 아닌 위치 → **−5**. H1 길이, H2 개수, 본문 길이. **사용자 시나리오 H2 1개 이상 시 +2** (JTBD §1.2 4번). **listicle 글은 §1.2 예외 적용** (H2 7-12개, 본문 5,000-15,000자 허용) |
| E-E-A-T | 외부 출처 링크 수, 작성자, 수치·통계 인용. **"1차 출처/2차 분석" 라벨 명시 시 +5**. **사용자 페인·실패 사례 인용 1+(커뮤니티/지식iN/후기 출처 표기) 시 +3** (§1.1 Experience 사용자 경험). **주의사항 H2가 긍정적 프레임("주의할 점 / 시작 조건 / 체크리스트 / 맞지 않는 경우")으로 단독 존재 시 +2** (Trust §1.2 5번). **거래·상업 의도 글인데 주의사항·조건 H2 누락 시 -5**. **제목·TL;DR·대표이미지·첫 H2 중 2곳 이상에서 "한계", "함정", "실패", "자동 수익 아님" 같은 부정 프레이밍을 전면 반복하면 -5**. **부업·추천 보상 글의 제목·TL;DR·대표이미지·첫 H2 중 1곳이라도 "본업 시간 0", "운영 시간 0", "자동 친구초대", "자동 적립", "자동 누적", "자동 수익"을 쓰면 -5**. **핵심 위치에 `ROI/CAC/LTV/객단가/affiliate`를 풀이 없이 쓰면 -5**. **Phase 1-D 페인 인용 0건 시 -3**. **§1.7 E-E-A-T 2026 Experience 신호**: Experience 시그널은 byline + author box + Person schema 3중으로 자동 노출 (본문에 자기소개 박지 말 것 — §1.9 위반 −15). 섹션마다 first-hand 디테일(측정값/플랫폼 버전/사례/실패/원본 시각) ≥ 1개일 때 +5, 절반 이상 누락 시 −10. 작성자 페이지 완전성 (헤드샷+자격증+LinkedIn) 미달 시 −5. **Reddit·LinkedIn·Quora·지식iN 페인 인용 ≥ 1건 시 +3** (§1.6 GEO) |
| 키워드 최적화 | 메인 키워드 위치(H1/도입/결론), 밀도 1-2%. **메인 키워드 정확 어구가 title 첫 30자 안에 있을 것**(seo-policy §1.5, 변형·부분 매칭 시 −10), **메인 키워드 중복 검사**(`content/articles/*.md` 전체에 같은 정확 어구가 다른 글에 메인으로 있으면 cannibalization −10, 본문 grep), **거래/상업 의도 키워드 §9.0 매칭 시 +5**, **snshelp 서비스 페이지 내부 링크 1+ 시 +3**, **정보형인데 거래 다리·CTA 없으면 -5**. **검색량·SERP 의도(Semrush 의존)는 채점 제외 — 감점·가점 모두 적용 안 함** (전수조사·감사는 Semrush OFF, 100% 본문 기반. seo-policy §9.5.1) |
| AEO 적합도 | 첫 단락 직답 유무, FAQ 섹션 4-6개, **FAQPage JSON-LD 스키마 존재**(2026.5 Google rich result 종료에도 LLM 인용·Knowledge Graph 효과로 필수), **HowTo schema는 §2.5 정합 유지 정책 — 잔존 자체로 감점하지 않음 (SERP 기대 근거 추가만 금지)**, **Front-loading**(직답·핵심 수치가 글 상단 30% 안에 위치 시 +3, 미달 시 -3), **PAA recursive H3**(질문형 H2 아래 H3 0-2개 + 각 H3 100-150자 이상 시 +2, thin content면 -3), **§9.2.3 Answer Capsule 측정 (CRITICAL)**: `node script/measure-answer-capsule.mjs <id> --json` 호출 → STRICT(50-80자) 통과율 산정. 100% +3 / 80%+ 통과 / <80% -5 / 0% 추가 -10 (주제 H2가 0개면 측정 제외, FAQ·listicle 순번·결론 H2는 자동 제외) |
| GEO 적합도 | 정의 단락, 리스트/표 사용, 1차 출처, **핵심 요약 블록(TL;DR) 존재 시 +3**(LLM 인용률 상승). **§1.6 GEO 가산**: 외부 quote ≥3건 + 통계 ≥5건 자연 배치 시 +5 (AI 답변 가시성 +30-40%), Listicle 형식(H2/H3 50%+ numbered) 시 +5 (AI 인용 74.2%가 listicle), Schema 풀스택(Organization + FAQPage + Article + dates) 시 +3 (1.8× 인용률), **Heading 후 첫 문장 drift(메타 진술) 발견 시 −3**, 각 문단 1-아이디어 원칙 위반 시 −3, **modified 6개월 이상 정체 시 −3** |
| 미디어 (§4.10.6 wrap 가드, CRITICAL) | 대표이미지 유무, 본문 이미지 개수(≥ 3 필수 — hero 1 + 본문 ≥ 2), alt 완성도. **인포그래픽 HTML 시각 감사** — `node script/audit-infographic-visual.mjs --post=<id>` (HTML 인포그래픽 전용). `risk:high` −15, `risk:medium` −10, 금지 색상 −5, footer 로고 누락 −3. **AC-룰-1 본문 figure 단독 codex 인물·장면 일러스트 사용 검출 시 −15** (asset-images §4.8.6). **AC-룰-2 figcaption ↔ 이미지 실제 내용 mismatch (출처·통계·연도 인용 캡션 + AI 일러스트 조합) 검출 시 −10**. **AC-룰-3 본문 `<img>` 또는 `<figure>` inline style 폭 제한 검출 −5**. **AC-룰-4 본문 `<img>` width < 1200 검출 −10** (인포그래픽/차트 한정. 사진 예외 명시). **AC-룰-5 글당 본문 이미지 개수 종류 분포 미달 (인포그래픽/차트/실사/스크린샷 중 ≥ 2 종) −5**. **AC-룰-6 인포그래픽 텍스트 글자 수 한계 초과·금지 문구 사전 매칭 −5**. **AC-레거시-명명-제거 본문 alt·figcaption·`<img>` src·S3 키에서 레거시 식별자(n8n) 매칭 0건 검증 — 검출 시 −5**. **Hero 종류 검증 (§4.8.2 typography 단일 고정)**: featured_media의 _media.json source_url + alt + slug 단서로 typography 외 사용 시 **−15**. **본문 보조 이미지 multimodal 시각 검증 (MANDATORY)**: 모든 `<img>` 시각 확인 — 텍스트 겹침/라벨/폰트/대비/데이터 일치/출처 일치. 결함 −10 (누적 최대 −20). **OG/Twitter card 회귀**: featured_media 교체 후 `og:image`, `twitter:image`, schema.org `image` URL이 새 featured_media URL과 일치하는지 자동 검증 — 불일치 시 −10. **AC-룰-7 본문 텍스트 `…`/truncate 말줄임 잘림 −15** (audit-post-html.mjs `body-text-truncation` — 공개 페이지 본문이 `…`로 끊김). **AC-룰-8 인포그래픽 본문 중복 출현(같은 인포 webp가 본문에 2회+) −10** (audit-post-html.mjs `infographic-body-duplicate`). **AC-룰-9 md5 중복 이미지(글 내 동일 이미지 2회+ 또는 글 간 동일 인포) −10** (audit-cdn-gate.mjs). **AC-룰-10 인포그래픽/차트 CDN 실물 dim 가로형 깨짐(ratio > 1.6) −15** (audit-cdn-gate.mjs — **로컬 draft 아닌 prod CDN webp 실측**. 의도된 가로형 타임라인/단계형은 ratio 1.2-1.6 허용, 1.6 초과만 깨짐 판정). matplotlib·codex 일러스트는 본 multimodal 단계가 유일한 검증 |
| 메타 | slug 적정, excerpt 120-155자, 카테고리/태그 |
| GFM 구조 | `node script/validate-post-html.mjs <slug>` 실행 (JP 순수 GFM sanity, jp-site-config §3 — KR Gutenberg `wp:block` 검사 폐기). 미닫힌 코드펜스(```` ``` ```` 홀수) + 깨진 GFM 표(헤더 행 다음 `|---|` 구분행 없음) + 깨진 마크다운 이미지/링크(`![..](`·`[..](` 미닫힘) + 미해석 강조(`unparsed-emphasis` — gfm+cjk-friendly 파싱 후에도 text에 남은 `**` = 닫는 `**` 누락 오타). **하나라도 위반 시 −20** (렌더 깨짐 위험) |

**각 영역마다 발견된 결함을 인용**: 헤딩명·줄번호·실제 문장. 추측 금지.

**자산 컴플라이언스 검사 의무 (CRITICAL — 누락 사고 방지)**:
audit은 본문 채점 외에 글의 **모든 자산(featured_media + 본문 이미지)이 현재 룰을 따르는지** 반드시 검증한다. 룰 변경 시 audit 검사 항목에 같이 추가하지 않으면 "audit 통과 = 룰 준수" 불일치가 발생한다. 현행 자산 룰 체크리스트:
- hero = typography 1장 (§4.8.2) — 위반 시 미디어 영역 −15
- 글당 _draft.images ≥ 3장 (hero 1 + 본문 ≥ 2, §4.8.4) — 위반 시 미디어 영역 −10
- 본문 인포그래픽/차트 폭 = 1200 (§4.10.1 정본) — 위반 시 −10
- 본문 figure 단독 codex 인물·장면 일러스트 0건 (§4.8.6 AC-룰-1) — 위반 시 −15
- figcaption ↔ 이미지 내용 일치 (AC-룰-2) — mismatch 시 −10
- 산출물 레거시 식별자(n8n) 0건 (AC-레거시-명명-제거) — 검출 시 −5
- 인포그래픽 dim ≤ 2000px (§4.10.4) — 위반 시 미디어 영역 −10
- 인포그래픽 HTML wrap·대비 (§4.10.6, audit-infographic-visual.mjs) — 위 표대로
- **hero + 본문 모든 이미지 multimodal 시각 검증** (텍스트 겹침·잘림·가독성·데이터 일치) — 위 표대로
- **부업·추천 보상 이미지 쉬운 용어 검증** — visible text·alt·caption에 `ROI/CAC/LTV/객단가/affiliate`, "본업 시간 0", "자동 적립", "자동 누적"이 있으면 미디어 영역 −5. "수익 계산/새 고객 찾는 비용/고객이 오래 결제한 금액/평균 결제액/제휴 프로그램"으로 보강 요구.
- **본문 텍스트 `…` 잘림 0건** (AC-룰-7) — 검출 시 −15
- **인포그래픽 본문 중복 출현 0건** (AC-룰-8) — 같은 인포 2회+ 시 −10
- **md5 중복 이미지 0건** (AC-룰-9) — 글 내·글 간 동일 이미지 −10
- **CDN 실물 dim 게이트** (AC-룰-10) — `node script/audit-cdn-gate.mjs --post=<id>` 통과. 로컬 draft 아닌 prod CDN webp 실측. ratio > 1.6 가로형 깨짐 −15

**검증 대상 = prod 실물 고정 (CRITICAL, audit-script-loop.md §6.1)**: 이미지·본문 "정상/완료" 판정은 **공개 페이지 `https://www.ours-magazine.jp/articles/{slug}/` + 실물 이미지(`public/images/articles/{slug}/`)** `[JP override]` (jp-site-config §1·§2·§6): KR `helpsns.com/blog/{slug}` + S3/CloudFront CDN → JP Vercel prod URL + `public/` 정적 자산을 대상으로 한다. 로컬 draft 렌더로 통과 금지. HTML만 고치고 CDN 재발행을 누락하면 prod는 옛 이미지 그대로다. 모든 "통과" 판정은 **재현 증거(CDN URL·실측 dim·md5·HTTP 200)를 산출물에 첨부**한다 (§6.2). 증거 없는 판정은 미완료.

**자동 검사 vs 시각 검사 적용 범위**:
| 자산 종류 | 자동 검사 | multimodal 시각 검사 |
|---|---|---|
| HTML 인포그래픽 (script/infographic-templates) | audit-infographic-visual.mjs (wrap·대비·금지 색상) + audit-cdn-gate.mjs (CDN 실물 dim·md5·중복출현) | 추가 시각 검증 (폰트 가독성·과밀·의미) |
| matplotlib 차트 (.py → PNG/WebP) | audit-cdn-gate.mjs (dim·md5만) | **필수** (시각 정확성은 자동 불가) |
| codex 일러스트 (PNG/WebP) | audit-cdn-gate.mjs (dim·md5만) | **필수** (asset-images §4.9 5단계) |
| 스크린샷 (PNG/WebP) | audit-cdn-gate.mjs (dim·md5만) | **필수** (alt 일치 + 가독성) |

audit-infographic-visual.mjs는 HTML 인포그래픽 CSS 정적 분석 전용. audit-cdn-gate.mjs는 **prod CDN 실물**의 객관 측정(dim·md5·중복출현·본문 `…`잘림)을 모든 자산 종류에 강제하는 하한선. 폰트 가독성·과밀·의미·시각 정확성은 게이트로 못 잡으므로 multimodal Read가 유일한 검증 경로 (audit-script-loop.md §6.5).

**1건당 sub-agent 1개 (sonnet) — CRITICAL**: 본문 모든 `<img>`·`<figure>` multimodal 시각 검증은 **이미지 1개 = sub-agent 1개(`model: "sonnet"`)**로 진행. 4종 자산(HTML 인포그래픽 / codex 일러스트 / matplotlib 차트 / 스크린샷) + figcaption mismatch(AC-룰-2) 모두 포함. 8개 병렬 cycle. 정본 `.ai-rules/survey-methodology.md` "인포그래픽·본문 figure 시각 검증" §.

호출 패턴:
1. 메인이 본문에서 모든 `<img>` 추출 → `{postId, figureIdx, imageUrl, type, figcaption}` 리스트 구성
2. 8개씩 cycle: 같은 메시지에 Agent tool 8개 호출 (`model: "sonnet"`, `subagent_type: "general-purpose"`)
3. 각 sub-agent 프롬프트 필수:
   - 대상 이미지 URL 1개 + 종류(infographic-html / codex / matplotlib / screenshot) + 인접 figcaption 1줄
   - HTML 인포그래픽: `script/audit-infographic-visual.mjs --post=<id>` 1차 결과 첨부 (메인이 실행 후 sub-agent에 전달)
   - `.ai-rules/asset-images.md` Read 강제 (§4.8 codex / §4.9 5단계 / §4.10 인포그래픽)
   - `.ai-rules/infographic-html.md` Read 강제 (인포그래픽 한정)
   - **대상 = prod 실물 URL** (`https://www.ours-magazine.jp/images/articles/{slug}/...`) `[JP override]` (jp-site-config §1·§2·§6): KR `assets.helpsns.com/...` S3/CloudFront CDN → JP Vercel prod 정적 자산. 로컬 draft webp로 판정 금지 (audit-script-loop.md §6.1). 이미지를 `fetch`로 받아 Read tool로 직접 시각 확인 — 텍스트 겹침/라벨/폰트/대비/데이터 일치/출처 일치/figcaption 정합/AI 일러스트 인물·장면 단독 사용
   - 산출: `tmp/per-image-audit/{postId}-{figureIdx}.json` (`{postId, figureIdx, imageUrl, type, score:0~100, defects:[{rule, severity:high|medium|low, detail, fix}], evidence:{cdn_url, dim:{w,h,ratio}, md5, http_status, source:"cdn"}}`). **evidence 미첨부 = 미완료**(§6.2): "정상" 판정은 dim 실측·md5·HTTP 200 근거를 반드시 채운다
   - 한 줄 보고: `"img={postId}#{figureIdx} 결함={N} ratio={r}" 1줄`
4. cycle 완료마다 다음 cycle launch
5. 모든 cycle 종료 후 메인이 결함 합산 → 미디어 영역 감점 적용 (개별 결함은 위 표 §4.10.6 wrap 가드 표대로)

**금지**: batch sub-agent에 N개 이미지 묶기 (multimodal attention 분산), audit-infographic-visual.mjs 통과만으로 시각 통과 결론, Sonnet 외 모델 사용.

**listicle 판정 기준**: 제목·H1에 "통계", "N가지", "리스트", "정리", "총정리" 포함 OR 본문 H2의 50% 이상이 데이터 카테고리(연도·국가·플랫폼별 묶음). 판정되면 구조 영역의 길이·H2 카운트 감점 룰 적용 안 함.

**referral cluster 글 추가 게이트 (CRITICAL)**:

대상 글의 frontmatter에 `_referral_cluster: true`가 있으면 [.ai-rules/referral-cluster.md](../../../.ai-rules/referral-cluster.md) §2 의무 룰을 추가 검사. 본문 점수와 별도 cluster 영역으로 채점. 위반 시 즉시 보강 루프 트리거.

| 검사 항목 | 통과 조건 | 감점 |
|---|---|---|
| M1 마커 (`_referral_cluster: true`) | frontmatter에 존재 | -10 |
| M2 /referral/ 링크 | **[JP override] M2 /referral 게이트 제거**(jp-site-config §9) — 정보 매거진. 이 -15 적용 안 함. | ~~-15 (누락)~~ 무력화 / -5 (3회 초과) |
| M3 entity·수치 그룹 | 5개 그룹(G1 USP / G2 무자본 / G3 가입 보너스 / G4 수수료 0 / G5 평균 결제액) 중 ≥ 2개 그룹 포함 (그룹 내 변형 OR 매칭) | -5 |
| M4-1 스팸 trigger 어구 | "쉽게 시작", "자동으로 돈이", "평생 따박따박", "100% 보장", "확실한 수익", "노력 없이", "월 1억 가능", "본업 시간 0", "운영 시간 0", "자동 친구초대", "자동 적립", "자동 누적", "자동 수익" — 모두 본문 0회 | 1종 위반 -15 · 누적 합산 (cluster 영역 0점 cap) |
| M4-2 부업 정확 어구 밀도 | `grep -o '부업' \| wc -l` / `grep -o '[가-힣]' \| wc -l` ≤ 1.5% (한국어 음절 분모. `wc -w` 금지) | -5 |
| M4-3 수치 시점·출처 | 모든 수치 옆에 "자체 고객 조사 N년 N월 기준" 등 시점·출처 명시 | 누락 수치당 -3 (**최대 -15 cap**) |
| M4-4 쉬운 용어·주의 H2 | title·TL;DR·대표이미지·첫 H2에 `ROI/CAC/LTV/객단가/affiliate` 풀이 없는 사용 0회. 주의 섹션 H2는 "주의할 점 / 시작 조건 / 체크리스트 / 맞지 않는 경우 / 시작 전 확인할 점" 사용. "흔한 함정", "실패 사례" H2 금지 | -5 |
| M5 페르소나 매칭 | §3 시드 풀의 "매칭 페르소나" 컬럼 그대로 (mason/oliver/jamie) | -3 |

**감점 합계 cap**: cluster 영역 점수 = max(0, 100 - 합계 감점). 음수 방지.

cluster 영역 점수 = 100 - 합계 감점. cluster 영역 < 100이면 본문 점수와 별개로 **즉시 write 보강 루프 트리거** + 위반 항목 보고.

본문 점수 100점과 cluster 영역 점수 100점 **둘 다 충족**해야 발행 게이트 통과.

### Phase 3: Semrush MCP 데이터 수집 (가용 시)
글의 메인 키워드(frontmatter title 또는 H1에서 추출)로 다음 조회:
- `phrase_these` — 후보 키워드 batch 검색량·CPC·경쟁도 (semicolon 구분, database=jp)
- `phrase_kdi` — 정확한 KD(난이도)가 필요한 경우 별도 호출. `phrase_these`는 KD 반환 안 함
- `phrase_organic` — SERP 상위 10개 (경쟁 분석용)
- `phrase_questions` — 질문형 키워드 (FAQ 후보)
- `phrase_related` — 의미적 인접어 (보조 키워드 후보)

**Semrush 한국어 시드 Fallback 룰**:
- `phrase_questions`에서 `ERROR 50 :: NOTHING FOUND` 자주 발생 (한국어 질문형 인덱싱 부족). 이 경우 본문의 수치·주제·도입 의문점에서 FAQ를 **직접 도출**한다.
- `phrase_related`의 Related Relevance가 모두 0.3 미만이면 시드가 작은 토픽. 보조 키워드 발굴은 본문에서 직접 추출.
- **메인 키워드가 Semrush `phrase_these`에서 NOTHING FOUND 또는 검색량 < 100인 경우** `[JP override]` (jp-site-config §6·§7): **JP는 네이버/DECAGO 없음 → 이 보조 조회 단계 전체 SKIP**. Semrush `database=jp` 단독으로 판정하고, NOTHING FOUND·검색량 미상이면 본문 기반으로만 진행(외부 데이터 부재는 감점 사유 아님 — 본 문서 "금지" 참조). 아래 KR 절차(네이버 검색광고 API)는 **참고용·호출 금지**:
  ```bash
  # [JP override] 호출 금지 — JP는 네이버/DECAGO 미사용. KR 참고용 보존.
  curl -X POST "$DECAGO_NAVER_QUERY_ENDPOINT" -H 'Content-Type: application/json' \
    -d '{"platforms":["naver"],"keywords":["<메인 키워드>"],"is_raw":false,"is_extend_naver":false}'
  ```
  - (KR 참고) 응답의 `naver.pc + naver.mobile ≥ 100`이면 검색량 통과로 판정
  - (KR 참고) 둘 다 < 100이면 키워드 영역 −10 적용 + 보고에 명시

**메인 키워드 중복 검사 (cannibalization, 필수)**:
- 글의 메인 키워드 정확 어구로 `content/articles/*.md` 전체 grep, **현재 감사 중인 글 ID는 결과에서 제외**:
  ```bash
  grep -l '"title".*<메인 키워드>' content/articles/*.md | grep -v "/{현재-감사-글-id}.md"
  ```
- 결과에 다른 글 1개라도 남으면 cannibalization → **−10** 및 갱신 권장 보고
- 0개면 통과

**SERP 의도 매칭 검증 (필수)**:
- `phrase_organic` 결과의 상위 도메인 유형을 분류한다: 콘텐츠 / 도구 / 랭킹 / 위키 / 커뮤니티.
- 상위 5개 중 3개 이상이 **도구·랭킹·계산기**면 SERP 의도가 "사용자가 도구를 찾는 상태" → **그 키워드는 콘텐츠 글의 타깃에서 제외**. 이를 발견하면 점수의 키워드 최적화 영역에서 -10.
- 검증 누락 시 audit 리포트의 "외부 데이터" 섹션에 명시.

결과를 점수에 반영(가산·감점은 §5.1에 따름)하고 **별도 섹션 "외부 데이터 + SERP 의도 분석"** 에 보고.

### Phase 3.5: 적대적 팩트체크 패스 (MANDATORY — jp-site-config §9, 한국 초과 항목)
> 발행 게이트 `fact-check-gate.mjs`가 frontmatter `_fact_checked` 마커 + 외부 출처 ≥3개 + 죽은 링크 0을 **강제**한다. 이 패스를 안 하면 `md-publish.mjs` exit 2로 발행 차단.

본문의 **모든 통계·수치·사실 주장**에 대해:
1. 각 주장의 **인용 출처 URL을 `WebFetch`로 직접 fetch**해 그 페이지에 해당 수치·문구가 **실재하는지 대조**(추측 금지). 1 주장 = 1 독립 검증(여러 개면 sub-agent 병렬, survey-methodology 패턴).
2. 분류: (a) **검증됨**(URL이 수치 뒷받침) → 본문에 `[出典名](URL)` 마크다운 링크. (b) **부분/귀속오류**(출처는 있으나 수치·연도·귀속 부정확) → 수정. (c) **미검증**(출처 못 찾음 = 합성 의심) → **출처 추가 / `編集部目安`로 명시 완화 / 삭제** 중 택1.
3. **외부 1차 출처 마크다운 링크 ≥3개** 확보(E-E-A-T 검증 가능 citation). 이름만 나열 금지.
4. frontmatter에 **기록**:
   ```yaml
   _fact_checked:
     at: <ISO timestamp>
     sources: [검증한 URL...]
     corrected: [수정한 귀속/수치...]   # 선택
     unsupported: []                    # 남은 미검증 주장. 비어있지 않으면 게이트 차단
   ```
   `unsupported`가 비어있지 않으면 `fact-check-gate.mjs`가 차단 → 전부 처리 후 발행.
- (실측: 이 패스가 "SAKIYOMI 100アカウント分析"=조작 출처, "4000保存事例"=합성 수치를 잡아냄. KR audit엔 없는 검증 단계.)

### Phase 4: 종합 점수
- 가중 평균 (seo-policy.md §5 가중치 사용)
- **100**: 발행 가능 ✅
- **95-99**: 가벼운 보강 권장 (1회 보강 후 발행 가능)
- **80-94**: **codex-second-opinion 자동 호출** → 별도 시각 보강
- **80 미만**: 재작성 권장 ❌

### Phase 5: Codex 세컨드 오피니언 (조건부)
`.claude/skills/_shared/codex-second-opinion.md`를 Read해 규칙 따름.
- 트리거: 종합 점수 80-94 (snshelp 100점 통과 정책)
- 호출: `codex exec` Bash (MCP 도구 사용 금지 — codex-second-opinion §2 참조)
- 프롬프트: 점수·내부 링크 정보 일절 포함 금지. 객관 정보(파일 경로, 평가 기준)만 전달
- 응답 통합: 동의·불일치 처리 정본 규칙대로

### Phase 6: 리포트 저장
- 단일 글: `tmp/audit-{id}.md`
- 일괄: `tmp/audit-summary-{YYYYMMDD-HHMMSS}.md` + `tmp/audit/{id}.md` 개별

### Phase 6.5: frontmatter 점수 기록 (CRITICAL — publish 게이트 연결)

audit 종료 직후 대상 글의 frontmatter에 점수를 기록한다. `md-publish.mjs`가 이 값을 읽어 `< 100`이면 발행 차단한다 (jp-site-config §5, JP 발행 게이트).

대상 파일:
- 신규 draft: `drafts/{slug}.md`
- 기존 글: `content/articles/{slug}.md`

추가/갱신할 키:
```json
{
  "_audit_score": 100,
  "_audit_cycles": 3,
  "_audit_at": "2026-05-20T08:14:05Z"
}
```

- `_audit_score`: Phase 4 종합 점수(0-100). 정수
- `_audit_cycles`: 같은 글에 대해 누적 audit 실행 횟수. 보강 루프(write↔audit)가 외부에서 카운트 +1 후 호출하므로 audit은 받은 값을 그대로 기록. 받은 값 없으면 1
- `_audit_at`: ISO 8601 UTC

**구현**: Phase 6 리포트 저장 직후 같은 트랜잭션으로 frontmatter merge. `_draft` 키 등 기존 키 보존. body는 손대지 않음.

**Why**: cron 자동 모드에서 100점 미달 상태로 publish되는 사고 차단. SKILL.md §3-A의 "무제한 보강" 정책이 prompt 일탈 없이 실제로 enforce되려면 publish 시점 코드 게이트가 점수를 알아야 한다.
**How to apply**: `--all`·`--recent` 일괄 모드도 각 글마다 동일하게 frontmatter 갱신. 점수가 frontmatter에 기록되지 않으면 md-publish.mjs는 안전을 위해 발행 차단(점수 미상 = 미달로 간주).

리포트 형식:
```markdown
# {제목} (id: {id})

## 종합 점수: {N}/100 — {상태}

## 영역별 점수
| 영역 | 점수 | 발견 결함 |
|---|---|---|

## 우선순위 개선안 (Top 5)
1. **[High]** ... — Why / How
2. ...

## 외부 데이터 + SERP 의도 분석 (Semrush)
- 메인 키워드 검색량/난이도/의도: ...
- 경쟁 SERP 상위 10개: 도메인 유형 분류(콘텐츠/도구/랭킹/위키/커뮤니티)
- **SERP 의도 매칭 판정**: 일치 / 부분 일치 / 불일치 (불일치면 키워드 -10 사유)
- 후보 거래·상업 키워드 매칭 결과 (§9.0): ...

## Codex 세컨드 오피니언 (있을 시)
- 호출: N회 / 결과: 동의|불일치
- 핵심 차이: ...
```

---

## 보고 (사용자에게)

리포트 경로 + 종합 점수 + Top 3 개선안만 텍스트로 요약. 전체 분석은 파일에서 확인하도록 안내.

```
[id] 제목 — 78/100 (보강 권장)
Top 3: ① FAQ 섹션 없음(AEO 0점) ② 외부 출처 1개뿐(E-E-A-T) ③ excerpt 80자 (짧음)
리포트: tmp/audit-{id}.md
```

---

## 금지

- 점수만 추측. 반드시 본문 라인 인용
- 외부 데이터 부재를 점수 차감 사유로 사용 금지 (감사 자체는 본문 기반)
- 사용자 승인 없이 글 수정 금지 (audit은 read-only)
