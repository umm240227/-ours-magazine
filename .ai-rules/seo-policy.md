# SNS헬프 SEO·AEO·GEO 정책 (정본)

> 이 문서는 비-블로그 페이지의 메타·H1·Schema·콘텐츠 작성 규칙의 정본이다.
> 새 페이지를 만들거나 기존 페이지의 메타를 수정할 때 반드시 이 문서를 따른다.

## 0. 평가 프레임워크 (가중치)

- **SEO 40%**: title, meta description, H1, alt, canonical, sitemap, schema, 내부 링크
- **AEO 35%**: FAQPage/HowTo schema, 직답 문장, 질문형 헤딩, llms.txt, 서버 렌더링
- **GEO 25%**: 엔터티 정의, 인용 가능한 사실, 출처/날짜, sameAs, E-E-A-T

자세한 점수 산정 방법은 `tmp/copy-seo-aeo-geo-{date}.md` 형식의 audit 리포트를 참조한다.

---

## 1. 페이지 메타 작성 규칙 (DefaultLayout prop)

### 1.1 필수 prop

모든 색인 대상(robotsIndex=true) 페이지는 다음 4개 prop을 **페이지 고유 값**으로 작성한다. 다른 페이지와 동일한 boilerplate 사용 금지.

| prop | 길이·형식 | 예시 |
|---|---|---|
| `title` | 30~60자, 핵심 키워드 + 차별점 + 브랜드 | `"인스타그램 한국인 팔로워 가격 인하 안내 (120원 → 115원) | SNS헬프"` |
| `description` | 100~160자, 핵심 정보 + USP + CTA | `"인스타그램 이슈 해결 후 작업 안정화에 따라 한국인 팔로워 단가를 120원에서 115원으로 인하했습니다. 동일한 품질 유지, 더 합리적인 가격으로 제공합니다."` |
| `ogTitle` | title과 동일하거나 약간 짧게 (소셜 공유 친화) | — |
| `ogDescription` | description과 동일하거나 SNS 공유 친화 형태 | — |

### 1.2 H1 정책

DefaultLayout의 헤더는 시각적 요소(카테고리 라벨)이며 SEO H1 가치는 본문에 위임한다.

- **`pageH1` prop 사용 (권장)**: 키워드 풍부 H1 문장. DefaultLayout이 sr-only로 본문 최상단에 출력하고 헤더 topTitle을 `<p role="heading" aria-level="2">`로 강등 → H1 단일성 보장.
- **서비스 상세(`/[platform]/[title]/`)**: `serviceTitle` prop으로 동적 서비스명 전달. SubHeader.astro의 `topTitle === '주문'` 분기(L152-L161 부근)에서 `<h1>{serviceTitle || '주문'}</h1>`로 렌더.
- **`pageH1` 형식**: 30~70자, 1~2개 핵심 키워드 + USP. 예: `"실제 한국인 인스타 팔로워·좋아요 구매 1위 — SNS헬프"`

### 1.3 금지 사항

- ❌ `keywords` 메타 (Google 무시·Naver 저품질 신호). 부득이한 경우만 페이지 고유 prop으로 명시.
- ❌ 페이지 간 동일 title/description boilerplate 사용 (duplicate content)
- ❌ 종료된 이벤트·삭제 예정 콘텐츠가 `robotsIndex={true}` 유지
- ❌ `datePublished` 하드코딩 (DefaultLayout이 git first-commit 시각으로 자동 처리)

### 1.5 메인 키워드 → title 정확 어구 룰 (블로그 글 전용, CRITICAL)

블로그 글(wp-content/posts/*.md)의 경우 다음 두 조건을 모두 만족해야 한다.

1. **메인 키워드 정확 어구가 title 첫 30자 안에 포함**: 변형·부분 매칭 금지. "AI 영상 만들기"가 메인 키워드면 title에 "AI 영상 만들기"가 그대로 들어가야 한다. "AI로 영상 만드는" 같은 변형은 다른 검색 의도로 인식돼 SERP 매칭 실패.
2. **메인 키워드는 SERP 의도가 "콘텐츠"인 것만 채택**: Semrush `phrase_organic` 상위 10개 중 도구·랭킹·계산기가 3개 이상이면 그 키워드는 콘텐츠 글 타깃에서 제외. keywords 단계(blog/keywords.md) Phase 2.5 (선정), write 단계(blog/write.md) Phase 0 (작성 전 게이트), audit 단계(blog/audit.md) (감사) 3단계 모두 동일 룰 적용.


**검색량 기준 (메인 키워드 채택 필수)**:
- **Semrush kr `phrase_these` 검색량 ≥ 100** OR **네이버 PC + 모바일 합 ≥ 100** 중 하나 이상 충족. 둘 다 0이면 즉시 제외
- Semrush가 `NOTHING FOUND`로 누락된 한국어 롱테일은 네이버 API로 fallback 필수 (한국어 롱테일은 Semrush kr DB에 자주 빠짐)

**네이버 월간 검색량 API (DECAGO 프록시) — 호출 방법**:

엔드포인트는 `.env`의 `DECAGO_NAVER_QUERY_ENDPOINT`에 있음.

```bash
set -a; source .env; set +a
curl -X POST "$DECAGO_NAVER_QUERY_ENDPOINT" \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
    "platforms": ["naver"],
    "keywords": ["인스타팔로워","인스타 릴스 만들기"],
    "is_raw": false,
    "is_extend_naver": false
  }'
```

응답 형식:
```json
{ "list": [
  { "keyword": "인스타팔로워", "naver": { "pc": 1030, "mobile": 5290 }, "daum": null, "google": null, "youtube": null },
  { "keyword": "인스타 릴스 만들기", "naver": { "pc": 750, "mobile": 5250 }, ... }
] }
```

채택 판정: `naver.pc + naver.mobile ≥ 100`.

**관찰된 API 동작** (룰 적용 시 주의):
- 입력 키워드의 공백을 제거하고 정규화한 후 매칭 ("인스타 릴스 만들기" → "인스타릴스만들기"로 응답에 표기될 수 있음)
- `is_extend_naver: false`에도 응답에 확장 관련 키워드가 함께 들어오는 경우가 있음 → 추가 후보 발굴에 활용 가능
- Semrush kr에서 NOTHING FOUND인 한국어 롱테일이 네이버에서 1,000+로 잡히는 케이스가 흔함 (예: "인스타 릴스 만들기"가 Semrush 0이지만 네이버 PC+모바일 합 6,000 수준)

**중복 금지 (메인 키워드 cannibalization 방지)**:
- 후보 메인 키워드 정확 어구로 `wp-content/posts/*.md` 전체 grep → 같은 정확 어구를 메인으로 잡은 글 ≥1 발견 시 **후보에서 즉시 제외**. 갱신 후보로만 처리
- 변형·부분 매칭만 발견 (인접) → 채택 가능하지만 페르소나·도구·플랫폼 차별화 필수

**위반 시 페널티**:
- title에 메인 키워드 정확 어구 미포함: audit 단계(blog/audit.md) 키워드 영역 **−10** (본문 기반, 감사에서 적용)
- 정확 어구 메인 키워드 중복 글 발행: 키워드 영역 **−10** (cannibalization, 본문 grep으로 검증)

**검색량·SERP 의도(Semrush 의존)는 키워드 발굴(keywords 단계, blog/keywords.md) 게이트에서만 적용**한다. **audit 단계(blog/audit.md) 감사·전수조사 채점에서는 검색량 미달·SERP 의도를 감점하지 않는다** (감사는 Semrush OFF·100% 본문 기반 — §9.5.1). 발굴 시 이미 통과한 키워드를 감사에서 외부 데이터 부재로 재차 깎지 않는다.

### 1.4 비색인 페이지

- `/my/*`, `/admin/*`, 관리자 영역, 회원 전용 페이지는 `robotsIndex` prop을 지정하지 않는다 (DefaultLayout default = `noindex, follow`).
- 종료된 이벤트는 명시적으로 `robotsIndex={false}` 설정.

### 1.6 GEO (Generative Engine Optimization) 가산 룰 — 2026 신설

ChatGPT·Perplexity·Google AI Mode·Gemini 등 LLM 기반 답변 엔진이 콘텐츠를 인용·추천하도록 최적화하는 룰. 검색엔진 SEO와 별도 차원이며 블로그 글의 도달·신뢰도에 직접 영향. (출처: §8 외부 참고 1, 2, 4)

**가산 신호 (각 +3~5)**:
- **외부 quote 인용 ≥ 3건** + **통계 수치 ≥ 5건** — 본문에 자연 배치 (padding 아닌 자연 간격). 인용·통계 포함 시 AI 답변 가시성 +30-40%
- **Listicle 구조 우선**: H2/H3의 50% 이상이 "Top N", "N가지", "N단계" 같은 numbered format. AI 인용의 **74.2%**가 listicle 형식
- **Schema 풀스택**: Organization + FAQPage + Article(또는 적합 type) + datePublished/dateModified 모두 출력 시 **1.8× 인용률**
- **Reddit·LinkedIn·Quora·지식iN 페인 인용 ≥ 1건**: 커뮤니티가 ChatGPT·Perplexity·Google AI Mode에서 가장 자주 인용되는 도메인. 본문 직접 인용·요약 시 LLM이 동일 페인으로 콘텐츠 매칭

**감점 신호 (각 −3~5)**:
- **Heading 후 첫 문장이 heading 약속과 drift**: H2 "왜 중요한가"인데 첫 문장이 "이 글에서는 다음을 다룹니다" 식 메타 진술 → AI 추출 실패
- **각 문단이 2개 이상 아이디어 혼재**: 1 문단 = 1 중심 아이디어 원칙 위반 시 AI granular extraction 실패
- **콘텐츠 갱신 6개월 이상 정체**: 10-15% 정기 갱신으로 fresh signal 유지 권장

**구조적 룰**:
- 정의 단락은 H2 직후 첫 문단에 명확히 (LLM이 entity 추출 가능한 형태)
- 비교·매트릭스는 표로 (LLM이 column-wise 추출 가능)
- 절차·How-to는 numbered list (LLM이 step 추출 가능)

### 1.7 E-E-A-T 2026 — Experience가 최우선 차별화 (CRITICAL)

2026년 3월 Google 코어 업데이트로 **Experience(경험)가 E-E-A-T 4축 중 가장 가중 ↑**. 종합 overview·AI-only 콘텐츠는 traffic 잃고(전체 41% 손실 추정), first-hand 경험이 담긴 콘텐츠가 보상. (출처: §8 외부 참고 3, 10)

**필수 신호 (모두 충족)**:

1. **Experience 신호는 byline + author box + Person schema 3중으로 노출** (본문 첫 단락에 박지 말 것):
   - byline (Astro 레이아웃이 페이지 상단에 자동 노출, 작성자 이름 + `rel="author"` author page 링크)
   - 글 말미 author box (Astro 레이아웃이 자동 삽입, 사진·자격·LinkedIn·도메인 전문성)
   - Person JSON-LD schema (sameAs·image·credential, Astro 레이아웃이 자동 생성)
   - **본문 첫 단락에 "이 글은 SNS헬프 X가 N년..." 자기소개 작성 금지** (§1.9 글 상단 구조 정본 참조). 이건 E-E-A-T 시그널 강화가 아니라 GEO/AI 인용 가치 손실 + 첫 100자 keyword density 낭비 + 검색 사용자 이탈률 ↑

2. **섹션마다 first-hand 디테일 ≥ 1개**:
   - 측정값 (수치·금액·기간 — "월 23만 도달", "3주 동안 운영")
   - 플랫폼·도구 버전 ("Sora 1.5", "Runway Gen-4")
   - 고객·페르소나 시나리오 (검증 가능한 맥락)
   - 실패·교훈 (어떤 시도가 실패했고 왜)
   - 원본 시각 자료 (스크린샷, 데이터 차트, 표)

3. **AI-only 콘텐츠 금지**:
   - 주제 프롬프트 → AI 통째 생성 패턴 금지
   - 허용 패턴: 사용자가 모은 1차 데이터·인터뷰 노트·고객 사례를 AI가 구조화·확장
   - 모든 글은 작성자 검증·편집 통과

4. **작성자 페이지 완전성** (`.ai-rules/blog-personas.md` 연결):
   - 전문 헤드샷, 전체 이름
   - 자격증·학위·경력 연차
   - LinkedIn 또는 검증 가능한 외부 링크
   - 도메인 전문성 명시
   - 그 작성자가 쓴 글 인덱스

**감점**:
- 본문 첫 단락이 페르소나 자기소개("이 글은 SNS헬프 X가...", "안녕하세요 저는...", "X는 SNS헬프 ... 입니다") → **−15** (§1.9 위반)
- 섹션 절반 이상에 first-hand 디테일 없음 → **−10**
- 무작성자(author 미지정) 또는 페르소나 매칭 실패 → **−5**

### 1.8 헤드라인·후킹 작성 룰 — Goal-Based + AIDA

블로그 글의 title·H1·도입 100자는 글의 도달 목표에 맞춰 최적화한다. (출처: §8 외부 참고 5, 6)

**Goal-Based 최적화**:

| 글 목표 | 헤드라인 우선순위 | 패턴 |
|---|---|---|
| **Reach** (브랜드 노출, SNS 공유) | Stopping power | 질문·통계 shock·반전 ("외주 영상비 100만 원, AI로는 4만 원") |
| **Traffic** (검색·SEO 트래픽) | Clarity + Curiosity | 키워드 명시 + 의문 유발 ("인스타 릴스 만들기, AI 영상 도구 5종 비교") |
| **Sales** (전환·CTA) | Specificity + Proof | 구체 결과 + 시점 ("3개월 운영 후 팔로워 1만 도달한 방법") |

snshelp 블로그는 거래·상업 의도 글이 1순위라 **대부분 Traffic + Sales 패턴**이 적합.

**AIDA 프레임워크 (모든 글 도입부)**:
- **Attention**: title + 도입 첫 문장에 hook (숫자·질문·통계·메타포·반전)
- **Interest**: 도입 100-150자에 "왜 이 글이 중요한가" + 글 가치 제안
- **Desire**: TL;DR 5 bullet로 "이 글을 읽으면 무엇을 얻는가" 구체화
- **Action**: 결론 + 거래 다리 (snshelp 서비스 페이지 내부 링크)

**Attention-함정 회피**:
- Attention 90% / Interest+Desire 10% 분배는 클릭률 ↑이나 이탈률 ↑. 균형 잡힌 도입부 필수.
- Hook과 솔루션 사이 bridge 단락 (도입 100-150자) 누락 시 **−3**

**구체 헤드라인 패턴** (적용 권장):
- 숫자 + 명사 + 결과: "5종 AI 영상 도구 비교 — 비용 96% 절감"
- 의문형: "AI 영상으로 정말 릴스 만들 수 있을까?"
- 통계 shock: "한국 1인 마케터 68%가 쓰는 AI 도구"
- 반전: "외주 영상비 100만 원, AI로는 4만 원"
- 가이드 약속: "초보자도 따라하는 5단계 워크플로우"

### 1.8.1 쉬운 용어·과장 방지 룰 — 부업·추천 보상 글

부업·친구초대·추천 보상 cluster 글은 검색 사용자가 초보자인 경우가 많으므로, title·TL;DR·대표이미지·첫 H2에서는 쉬운 한국어를 우선한다.

**핵심 위치 금지/치환**:
- `ROI` → "수익 계산" 또는 "수익률"
- `CAC` → "새 고객 찾는 비용"
- `LTV` → "고객이 오래 결제한 금액" 또는 "오래 결제한 금액"
- `객단가` → "평균 결제액"
- `affiliate` / "어필리에이트" → "제휴 프로그램" 또는 "제휴 마케팅"
- `패시브인컴` → 메인 키워드일 때만 허용. 첫 등장에 "꾸준히 쌓이는 부수입"을 함께 쓴다.

**무노력·자동 수익으로 읽히는 표현 금지**:
- "본업 시간 0", "운영 시간 0", "자동 친구초대", "자동 적립", "자동 누적", "자동 수익", "노력 없이", "100% 보장"
- 필요하면 "추가 시간을 크게 줄일 수 있음", "결제 때마다 적립", "시스템에서 추적", "가정 계산"처럼 조건이 드러나는 표현으로 낮춘다.

**주의사항 프레임**:
- title·TL;DR·대표이미지·첫 H2에서 "함정", "실패", "한계", "자동 수익 아님"을 전면 메시지로 쓰지 않는다.
- 주의 섹션 H2는 "주의할 점", "시작 조건", "체크리스트", "맞지 않는 경우", "시작 전 확인할 점"처럼 실행형으로 쓴다.
- 수익 수치는 반드시 "가정값", "실제 결제 발생 시", "N년 N월 기준" 같은 조건과 출처를 붙인다.

### 1.9 글 상단 구조 정본 (블로그 글 전용, CRITICAL — 100점 게이트)

모든 블로그 글(wp-content/posts/*.md)의 본문은 **반드시 아래 5단계 순서**를 따른다. 위반 시 audit에서 즉시 감점 + Phase 9 보강 루프 의무 발동.

```
1. TL;DR 헤더 단락:  <p><strong>{메인 키워드}, 한눈에 보는 핵심 N가지</strong></p>
2. TL;DR 리스트:     <ul> bullets 5개 (각 70~140자, 본문 핵심 답변 압축) </ul>
3. 인포그래픽:        <figure class="wp-block-image"><img src="https://assets.helpsns.com/..."></figure>  (정본 §4.10.0)
4. 첫 H2:             본문 시작 — keyword 풍부 H2 (서론/들어가며 같은 보일러플레이트 H2 금지)
5. 본문 H2 흐름:      §3.2 직답 문장 룰 따라 작성
```

**Why**: (a) AI Mode/GEO 인용은 본문 첫 단락 우선 — TL;DR이 첫 단락이면 featured snippet/Perplexity·ChatGPT 답변에 통째 인용 가능. (b) Google의 첫 100-200자 keyword 가중치 룰 — 키워드 + intent 답변이 와야 함. (c) 검색 사용자는 답을 빨리 보고 싶음 — 자기소개부터 읽혀야 하면 이탈.

**금지 패턴 (본문 첫 단락)**:
- ❌ "이 글은 SNS헬프 {페르소나}가 ..."
- ❌ "안녕하세요, 저는 SNS헬프 ..."
- ❌ "{페르소나명}는 SNS헬프 ... 전문가로 ..."
- ❌ "{페르소나명}는 ... N년차로 ..."
- ❌ "SNS헬프 {팀명} 담당 {페르소나명}입니다 ..."
- ❌ 첫 H2가 `서론`, `들어가며`, `들어가기`, `왜 중요한가`, `시작하며`, `머리말`, `개요란`, `들어가는 말`

**페르소나 정보 노출 경로 (E-E-A-T 시그널 보장)**:
- (a) 페이지 상단 byline (`/blog/{slug}/` 페이지에서 Astro 레이아웃이 작성자명 + `rel="author"` author page 링크를 자동 노출)
- (b) 글 말미 "저자 소개" 박스 (Astro 레이아웃이 [`src/widgets/blog/AuthorBox.tsx`] 컴포넌트로 자동 삽입, 본문 markdown에 박지 않음 — 페르소나·작성자 페이지 정보 활용)
- (c) Person JSON-LD schema (자동 생성, `/blog/[slug]/index.astro`)

이 3중 노출만으로 E-E-A-T Experience·Author Authority 시그널은 **충분히** 전달된다. 본문에 추가로 자기소개 단락을 박는 것은 중복 + 위 SEO 손실을 유발한다.

**TL;DR 작성 요건**:
- bullets 5개 ± 2 (최소 3개, 최대 7개)
- 각 bullet 70~140자 — 너무 짧으면 정보 가치 약, 너무 길면 가독성 ↓
- bullets는 본문 H2의 답변을 압축 — bullets 5개와 본문 H2 5개가 1:1 mapping이면 최상
- 첫 단락 `<strong>` 헤더에 메인 키워드 정확 어구 포함 (§1.5)

**감점**:
- 본문 첫 단락이 페르소나 자기소개 → **−15** (즉시 보강 의무)
- 첫 H2가 보일러플레이트 (서론/들어가며 등) → **−10**
- TL;DR 누락 또는 5단계 순서 위반 → **−15**
- 인포그래픽이 TL;DR 직후가 아닌 다른 위치 → **−5**

**정본 참고**: 5단계 정본 순서가 적용된 발행 글 1편을 기준점으로 운영 (TL;DR 헤더 + 5 bullets + 인포그래픽 + 첫 H2 흐름이 정확히 일치하는 최근 글). 발행 글이 룰을 추월하면 룰을 먼저 갱신할 것.

### 1.10 블로그 글 slug 작성 룰 — 영문 kebab-case 정본

**룰**: 모든 블로그 글의 frontmatter `slug` (= URL의 `/blog/{slug}/` 부분)는 **영문 kebab-case**로 작성한다.

**작성 규칙**:
- ASCII 영문 소문자 + 숫자 + 하이픈(`-`)만 사용 (`a-z0-9-`)
- 2-5 단어 (전체 길이 **50자 이하 권장**, 최대 80자)
- 메인 키워드의 영문 직역 또는 핵심 entity + 각도 압축
- 한글 → 영문 음역(transliteration) 금지: `insta-pal-lo-wo` ❌
- 글 ID·날짜·연도 포함 지양 (`2025-`로 시작하지 말 것 — 발행 후 시점이 어색해짐)
- 메인 키워드 영문 표현이 어려우면 핵심 entity + 각도: 예) "인스타 팔로워 늘리기 안전 가이드" → `instagram-followers-safe-guide`
- 같은 slug 중복 금지 (`wp-content/posts/*.md` 전체에서 unique)

**영문 slug 기준**:
- Google Search Central 권장: 비ASCII 문자(한글 포함) URL 사용 비권장
- 카톡·X·페이스북 공유 시 한글 percent-encoded URL은 미리보기 깨짐. 영문은 의미 전달
- ChatGPT·Perplexity 답변에 URL 노출 시 의미 명확
- **백링크 anchor text 신호 ↑**: 다른 사이트가 URL을 그대로 텍스트로 노출할 때 영문이 신호 전달

**좋은 예시**:
- "AI로 인스타 릴스 만들기" → `ai-reels-video-creation-guide`
- "인스타 팔로워 늘리기" → `instagram-followers-grow`
- "유튜브 썸네일 제작 도구 비교" → `youtube-thumbnail-tools`
- "노란우산공제 자영업자 가이드" → `noran-umbrella-saving`

**나쁜 예시 (모두 금지)**:
- `%eb%85%bc-%ec%9c%a0%ed%8a%9c%eb%b8%8c-...` (percent-encoded 한글)
- `insta-paloyo-neulligi` (영문 음역)
- `2025-instagram-followers-guide` (연도 prefix — 발행 후 시점 어색)
- `how-to-grow-instagram-followers-in-2025-complete-guide-for-beginners` (과도하게 김)

**slug 변경 시 redirect 처리 (CRITICAL — 백링크·검색 인덱스 보존)**:

기존 운영 글의 slug를 바꿀 때는 **반드시 [`src/shared/data/slug-redirects.js`](../src/shared/data/slug-redirects.js) 매핑에 old → new** 추가. 누락 시 외부 백링크가 404, 검색 인덱스 단기 손실 → Naver/Google이 옛 URL을 soft 404로 분류. Astro `output: 'static'` + [astro.config.mjs](../astro.config.mjs) `redirects: slugRedirects` 설정이 빌드 시 old URL에 meta refresh HTML(canonical 포함)을 생성.

```js
// src/shared/data/slug-redirects.js
export const slugRedirects = {
  '/blog/%ec%9d%b8...': '/blog/instagram-followers-grow/',
  // ...
};
```

**상품 페이지 slug 변경 시에도 동일 적용 (CRITICAL)**:

[`src/shared/data/product-slug-map.ts`](../src/shared/data/product-slug-map.ts)의 한국어→영문 slug 매핑을 변경·삭제할 때는 **반드시** `slug-redirects.js`에도 옛 URL → 새 URL entry를 추가해야 한다. 한국어 slug 인코딩 룰: 공백→`%20`, 한글→UTF-8 percent-encoding, `(`,`)`→raw, `/`→`-`, `[`,`]`→`%5B`,`%5D`. 빌드 시 [`script/check-redirect-coverage.mjs`](../script/check-redirect-coverage.mjs)가 productSlugMap 한국어 키 vs slug-redirects.js 매칭을 검증하여 누락을 경고한다(warn-only). [`script/check-og-leak.mjs`](../script/check-og-leak.mjs)는 dist HTML에서 `currentPath/meta/og.png` 같은 상대경로 OG image leak을 검출해 leak 발견 시 빌드를 실패시킨다.

**감점 (audit)**:
- slug가 percent-encoded 한글 (비ASCII) → **−5** (UX·공유·AI 인용 가치 손실)
- slug에 영문 음역 사용 → **−5**
- slug 변경 시 redirect 매핑 누락 → **−10** (백링크 손실 위험)
- productSlugMap 변경 시 slug-redirects.js 동기화 누락 → **−10** (Naver/Google soft 404 분류 위험)

---

## 2. Schema.org 작성 규칙

### 2.1 자동 주입 (DefaultLayout)

다음 schema는 모든 페이지에 자동 주입된다 (페이지 코드에서 작성 불필요):
- `Organization` (alternateName 7개 + sameAs)
- `WebSite` (publisher 연결)
- `WebPage` (dynamic datePublished/dateModified, breadcrumb)

### 2.2 페이지별 Schema (페이지 .astro에서 직접 작성)

> **2026 컨텍스트 — 리치 결과 vs AI 추출 신호**
>
> Google은 2023-09 HowTo 리치 결과, 2026-05-07 FAQ 리치 결과를 SERP에서 공식 종료했다. **그러나 schema는 유지가 정답**이다 — AI Overviews / Perplexity / ChatGPT Search / Claude가 Q&A 페어·절차·엔티티를 schema에서 직접 추출해 인용한다.
>
> 따라서 본 정책의 schema 룰은 "SERP 별점·접힘 노출 기대"가 아니라 **"AI 추출 신호 + 엔티티 명확화"**를 목적으로 한다. 마크업 자체에 SERP 노출이 안 된다고 schema를 제거하면 AI 인용 자격을 잃는다.

| 페이지 유형 | 사용 Schema | 위치 |
|---|---|---|
| FAQ 목록 | `FAQPage` (mainEntity = Question[]) | faq/index.astro |
| FAQ 상세 (단일 Q&A) | `QAPage` | faq/[id]/index.astro |
| 절차형 콘텐츠 (이용 방법, 주문 흐름) | `HowTo` (step 배열) | platform 위젯 |
| 카탈로그/허브 페이지 | `CollectionPage` (hasPart) | service-group |
| 공지·이벤트 | `NewsArticle` 또는 `Article` | notice 상세 |
| 서비스 상세 | `Service` + `Product` (offers, brand) | [platform]/[title] |
| 저자 | `Person` (worksFor, sameAs, hasCredential, knowsAbout) | author/[slug] |

### 2.3 dates 정책 (CRITICAL)

#### 2.3.1 데이터 소스 우선순위
1. **명시적 prop** (페이지가 `datePublished` prop 전달) — 가장 정확한 콘텐츠 발행 시각
2. **콘텐츠 API의 발행/수정 시각**:
   - WordPress: `date_gmt` (UTC, 발행), `modified_gmt` (UTC, 수정) — **반드시 _fields에 명시해야 응답에 포함됨**
   - 자체 API: `published_at` / `modified_at`
3. **빌드 타임 git 캐시** (`.astro/page-dates.json`) — `script/prefetch-page-dates.mjs`가 prebuild에서 생성
4. **빌드 시각 폴백** — 최후. 매 빌드마다 변동하므로 검색엔진 신뢰도 손상

#### 2.3.2 절대 금지 (DO NOT)
- ❌ `datePublished`/`dateModified` 하드코딩 (DefaultLayout이 git first-commit으로 자동 처리)
- ❌ `new Date().toISOString()` 폴백 패턴 (`let date = new Date()...` 같은 초기값 footgun)
- ❌ **`.replace('Z', '+09:00')` 단순 문자열 치환** — UTC를 KST로 잘못 표기, **9시간 오차 발생**
- ❌ SSR/페이지 코드에서 `execSync('git log ...')` 직접 호출 — **Astro SSR worker는 child_process 차단**, 빌드 시각 폴백 발화
- ❌ WP API `_fields`에 `date_gmt`/`modified_gmt` 누락 (date 단일 필드만 사용 시 schema가 폴백 발화)

#### 2.3.3 필수 표준 (DO)
- ✅ UTC → KST 변환은 `src/shared/lib/schema/pageDates.ts` 의 **`toKstIso()`** 헬퍼 사용. `+9h` 산술 후 ISO 변환
- ✅ 페이지 datePublished/dateModified는 `DefaultLayout`의 자동 처리에 위임. 페이지 코드에서 직접 schema 작성 시 `getPagePublishedTime(currentPath)`/`getPageModifiedTime(currentPath)` await로 사용
- ✅ WP 글의 BlogPosting/Article schema는 **`postData.date_gmt`/`postData.modified_gmt`를 `toKstIso()`로 변환** (UTC → KST)
- ✅ schema의 `datePublished`와 `dateModified`는 **서로 다른 변수 참조**. 같은 변수 사용 시 글 수정해도 dateModified가 안 바뀜
- ✅ 변환 결과 null이면 schema 키 자체를 생략 (잘못된 빌드 시각 송신 금지)

#### 2.3.4 빌드 타임 git 캐시 패턴 (CRITICAL)
**원인**: Astro SSR 빌드는 worker process에서 실행되며 `child_process.execSync('git log ...')` 시도가 차단되어 catch 분기로 빌드 시각 폴백 발화. 같은 코드가 `astro.config.mjs` (메인 Node) 에선 정상 동작하지만 SSR worker는 안 됨.

**해결책 (정본)**:
1. `script/prefetch-page-dates.mjs` (prebuild)에서 메인 Node가 `src/pages/` 모든 .astro 파일의 git first/last commit 시각을 `.astro/page-dates.json`에 저장. 정적 페이지는 url path 키, 동적 라우트(`[..]` 포함)는 정규식 패턴 키.
2. `pageDates.ts`의 `getPagePublishedTime`/`getPageModifiedTime`이 이 캐시를 lookup. 캐시 미스 시 execSync 폴백 (dev 환경용).
3. `package.json` build script에 `--pre script/prefetch-page-dates.mjs` 필수.

**위반 시 증상**: schema의 `datePublished`/`dateModified` ISO에 밀리초가 `.893`, `.871` 같은 변동 값 (빌드 시각). 정상은 git ISO 형식이라 밀리초 `.000` 또는 밀리초 없음.

#### 2.3.5 검증 명령
```bash
# dist 빌드 후 schema 검증
python3 -c "
import re, json
html = open('dist/index.html').read()
for s in re.findall(r'<script type=\"application/ld\+json\"[^>]*>(.+?)</script>', html, re.DOTALL):
    try:
        d = json.loads(s)
        for n in d.get('@graph', [d]):
            if isinstance(n, dict) and n.get('@type') == 'WebPage':
                dp = n.get('datePublished', '-')
                ms = dp.split('.')[1][:3] if '.' in dp else '000'
                print('OK' if ms == '000' else 'FAIL (빌드 시각 폴백)', dp)
    except: pass"
```

### 2.4 FAQPage 작성 규칙

- **2026-05-07 Google FAQ rich result(SERP 표시) 종료** + 2026.6 Rich Results Test, 2026.8 Search Console API 단계 종료. **그러나 FAQPage 스키마 자체는 계속 소비**: AI Overviews / Perplexity / ChatGPT / Bing / voice assistant / RAG / Knowledge Graph 모두에서 Q&A 페어를 직접 추출해 인용. 제거 시 AI 인용 자격 손실. **SERP rich result 기대 근거 추가 금지** — 본 룰의 목적은 SERP 별점·접힘 노출이 아니라 AI 추출 신호 + 엔티티 명확화.
- `mainEntity`는 Question[] 배열, 각 Question은 acceptedAnswer.text를 plain text로 (HTML 태그 제거 필수).
- `inLanguage: "ko-KR"` 명시.
- `publisher`는 `{ '@id': 'https://www.helpsns.com#organization' }`로 Organization 참조.
- 답변은 첫 문장에 결론 → 부연 설명 순으로 작성 (LLM 인용 친화).
- 광고·SERP 점유 목적의 인위적 FAQ 금지 (Google이 schema 신뢰도 자체를 떨어뜨림). 페이지 본문에 실제로 노출된 Q&A만 마크업.

### 2.5 HowTo 작성 규칙

- **2023-09 이후 Google HowTo 리치 결과 종료** — 그래도 schema는 유지. AI 추출 + 엔티티 명확화 목적. **SERP rich result 기대 근거 추가 금지** — schema는 LLM·AI Overviews 인용용이지 SERP 별점용이 아니다.
- 절차형 콘텐츠(이미지로만 안내된 가이드)는 반드시 HowTo schema + sr-only 텍스트 step 병행.
- 각 step은 50자 이내 짧은 명령형 + name + text.

---

## 3. 콘텐츠 작성 규칙

### 3.1 이미지 안 텍스트 처리

이미지 안에 들어 있는 텍스트(가이드, 인포그래픽, 배너)는 **반드시** 다음 중 하나로 보완:
1. sr-only HTML 텍스트로 본문에 병행 출력 (시각 디자인 유지)
2. 또는 alt 텍스트에 핵심 정보 모두 담기

인포그래픽은 곧 정보 이미지이므로 AEO/GEO 측면에서 **sr-only HTML mirror 사용을 권장**한다. 인포그래픽 안 헤드라인·stat 라벨·핵심 수치는 본문에 동일 텍스트를 sr-only로 병행 출력해 LLM이 텍스트로 추출할 수 있게 한다 (이미지 OCR 의존 회피).

`alt=""` (빈 alt)는 순수 장식 이미지에만 허용. 정보가 있는 이미지의 빈 alt는 SEO/AEO 0%.

### 3.2 alt 텍스트 작성

- ❌ "팔로워 이미지" (장르명만)
- ❌ "" (정보 누락)
- ❌ "sns헬프 설장 그래프" (오타)
- ✅ "인스타그램 팔로워 늘리기 서비스 아이콘"
- ✅ "㈜핫셀러 SNS 빅데이터 솔루션 부문 3년 연속 브랜드파워 1위 수상 인증서"

**figcaption ↔ 이미지 실제 내용 일치 룰**: figcaption에 출처/자료/기관명/연도/통계 수치가 인용되는 경우, 해당 이미지는 그 출처의 데이터를 직접 시각화한 인포그래픽/차트여야 한다. 인물·풍경·라이프스타일 사진/일러스트에 통계 출처 표기 금지. 사진/일러스트는 figcaption 형식 `"이미지: {라이선스/출처}"` 또는 `"예시 이미지"` 만 허용. 정본 룰은 `.ai-rules/asset-images.md §4.8.6`.

**alt 길이 + caption 길이**: alt 15-80자, caption 40-120자. §9.3.7 룰과 정합. caption에 figcaption ↔ 이미지 일치 룰 적용.

### 3.3 사실 주장 (fact citation)

- 매출·수상 이력·점유율 등 fact 주장에는 시점 + 출처 명시. 출처가 없으면 "자체 조사 기준" 명시.
- 비교 가격("타사 대비 30% 저렴")은 "{년도}년 {월} 자체 조사 기준" 같이 시점 + 근거 표기.
- ❌ "타사대비 저렴한 가격" → ✅ "실제 한국인 팔로워 115원부터 시작하는 합리적인 가격 정책"

### 3.4 직답 문장 (AEO 친화)

- 답변/설명의 첫 문장에 결론을 둔다. 부연 설명은 그 뒤.
- 질문형 헤딩 사용: "어떻게 이용하나요?", "왜 중요한가요?", "안전한가요?"
- 답변에 brand 키워드(SNS헬프) + 도메인 키워드(인스타 팔로워, 유튜브 구독자) 자연스럽게 포함.

### 3.5 AI 추출 청크(Passage) 룰

AI Overviews / Perplexity / ChatGPT Search는 페이지 전체가 아니라 **130~160 단어 자기완결 청크 단위**로 인용한다. 통제 실험에서 의미를 동일하게 두고 구조만 청크화했을 때 6개 생성 엔진 평균 인용률 +17.3% 관찰.

- **청크 = H2/H3 직후 130~160 단어 블록**. 외부 문맥 없이 단독으로 의미가 통해야 함.
- **한국어 글 적용 가이드 (CRITICAL)**: 영어 130~160 단어 ≈ 한국어 **250~400자** (문자수, `wc -m` 또는 `grep -o '[가-힣]' | wc -l` 기준). 한국어 어절은 영어 단어보다 의미 밀도가 높으므로 자수로 환산. 권장 범위 안이면 청크 충족. 비-블로그 페이지(`/referral/` 같은 마케팅 랜딩)는 130~160자도 허용(간결 표현 정합성). 자수 측정은 frontmatter·script·schema 제외 본문(`<main>` 안)만.
- **첫 문장 정의문**: "{엔티티}는 {정의}이다" 또는 "{질문에 대한 결론}이다" 구조. 미사여구·도입부 금지.
- **한 청크 = 한 주장**: 한 문단에 여러 주장을 섞으면 AI가 어느 문장을 인용할지 결정 못 해 통째로 스킵.
- **bullet/번호 리스트 우선**: 절차·비교·체크리스트는 자유 산문보다 bullet이 인용률이 높다 (AI가 가장 잘 뽑아감).
- **고유명사·숫자는 청크 안에 명시**: "위 표에서 본 것처럼", "앞서 언급한" 등 외부 참조 금지 — 청크 단독 인용 시 의미가 깨짐.
- **brand 키워드(SNS헬프)는 청크 첫 1~2 문장 안에 1회 포함**: AI가 인용할 때 출처 brand가 함께 노출되도록.

### 3.6 Experience(첫 번째 E) 신호

2026-03 Google 코어 업데이트로 E-E-A-T의 첫 번째 E(Experience, 경험)가 다른 신호를 압도. **schema로 만들 수 없고 본문 텍스처로만 나온다.** AI Overviews / Google 랭킹은 다음 마커의 밀도로 first-hand 경험을 간접 판정한다.

본문에 다음을 의식적으로 박는다:
- **사용한 도구·서비스·플랫폼 명**: "엑셀이 아니라 Notion에서", "iPhone 15 Pro 카메라로"
- **날짜 박힌 사건**: "2025-08 인스타그램 API 변경 시", "추석 연휴 3일간"
- **구체 수치**: "3,247건 처리", "전환율 1.76% → 4.2%"
- **실수·실패 사례**: "처음 시도했을 때 ~한 문제가 발생해서", "이 방법은 작동 안 함"
- **원본 결과물**: 스크린샷·인증서·내부 데이터(가능 범위 내)

❌ "효과적인 SNS 마케팅 방법" → ✅ "2026-03 카카오 알림톡 캠페인에서 전환율 2.3배 올린 5가지 발송 시점 (자체 데이터 1,247건)"

---

## 4. 인프라 정책

### 4.1 robots.txt

- `/admin/`, `/my/`, 추적 쿼리 파라미터(`?referral_id=`, `?q=`, `?page_type=`) Disallow 유지. 라우트가 없는 경로(`/api/`, `/oauth/`, `/callback/`, `/tags/`, `/kakaotalk/`)는 Disallow에 두지 않는다 (죽은 룰).
- 페이지 라우트와 robots Disallow 경로의 단/복수 일치 필수 (`/author/` vs `/authors/` 같은 불일치 금지).
- `/author/` (단수): 페이지에서 `robotsIndex={true}` + sitemap에 **포함**. robots.txt에는 일괄 Disallow 두지 않으며, byline `rel="author"` 링크 destination·Person JSON-LD로 E-E-A-T 신호를 강화한다. `/authors/`(복수)는 라우트 없음.

### 4.2 llms.txt

- AI 크롤러용 페이지 카탈로그 + 활용 정책 (`public/llms.txt`).
- 새 색인 대상 페이지 추가 시 llms.txt에도 등록.
- "ai-train: no, citation OK, 가격 변경 가능 명시" 정책 유지.

**기대치 정확화 (2026 Q1 기준)**:
- OpenAI/Google/Anthropic 등 주요 LLM 공급사 모두 llms.txt 공식 채택 안 함. AI 봇 트래픽 중 llms.txt 직접 요청 비율 ~0.1%. 9개 사이트 중 8개에서 트래픽 변화 0건.
- 따라서 llms.txt를 **AI 인용·랭킹 부스트 신호로 간주하지 말 것**. 정책 목적은 다음 둘로 한정:
  1. **저비용 보험**: 향후 표준화 시 즉시 호환. 유지 비용 반나절/분기.
  2. **개발자 도구 fetch 효율**: Cursor / GitHub Copilot / Claude Code가 문서 fetch 시 실제로 활용 → 토큰 효율 + 정확도 향상.
- 위 두 목적 외 신규 작업 정당화 사유로 llms.txt 효과를 인용 금지.

### 4.3 sitemap.xml

- `@astrojs/sitemap` 자동 생성. lastmod는 git log 기반.
- 비색인 페이지는 sitemap에서 제외 (DefaultLayout robots noindex 처리로 자동).

### 4.4 hreflang 다국어

- **현 시점 정책**: 한국 단일 언어. `hreflang="ko"` + `hreflang="x-default"`만 출력.
- ❌ **금지**: 영어 콘텐츠 부재 상태에서 `hreflang="en"` 출력 (깨진 alternate는 SEO 손실).
- **활성화 조건**: `/en/` 라우트가 색인 대상 페이지의 80% 이상 작성된 후 (=21개 색인 페이지 중 17개 이상). 도달 시 `src/layouts/DefaultLayout.astro` hreflang 블록의 주석 가이드를 따라 `<link rel="alternate" hreflang="en" href={...} />` 추가.
- **부분 활성화 금지**: 일부 페이지만 영어 버전이 있을 때 일부에만 hreflang en을 출력하는 패턴 금지 (Google이 incomplete cluster로 경고). 전체 또는 0이 원칙.

### 4.5 API 메타 백오피스 점검

- WordPress·서비스 운영 도구의 메타 필드(`meta_title`/`meta_description`/`meta_og_title`/`meta_og_description`) 누락은 동적 페이지(서비스 상세 100+개, FAQ 상세) SEO 점수를 직접 손상.
- **점검 대상**: `/api/order/service`(서비스 카탈로그) + `/api/board/faq`(FAQ 게시판). WordPress 블로그는 검사 대상이 아님.
- **점검 명령**: `npm run service-meta-check` (또는 `node --env-file=.env script/service-meta-check.mjs`)
- **출력**: `tmp/service-meta-check-{date}.md` — 누락 항목과 누락 필드 명시.
- **CI 게이트**: `node --env-file=.env script/service-meta-check.mjs --fail-on-missing` — 누락 ≥ 1건이면 exit 1. 향후 deploy 전 자동 게이트 추가 권장.
- **운영 권장**: wp-pull 후 또는 새 서비스 등록 후 매번 실행. 분기 1회 정기 점검.

### 4.6 후기·케이스 스터디 (E-E-A-T·GEO 신호)

- **사용자 후기**: `Review` schema (개별) + `AggregateRating` schema (브랜드 전체) 직렬화 → Google rich snippet 별점·후기 수 노출 자격.
- **B2B 케이스 스터디**: `Article` schema 배열 + `ItemList` 묶음. 각 케이스에 시점·출처·업종 명시.
- **위치**: 홈 페이지에 `<Review />` + `<CaseStudy />` 동시 출력 (현재 구현됨).
- **수치 표기 규칙**: Before/After 형식 + 추적 기간 + "{년도}년 자체 사례" 명시 (조작·과장 의심 방지).

### 4.7 author bio E-E-A-T 강화

- 페르소나 카탈로그 (`.ai-rules/blog-personas.md` + `src/shared/data/personas.ts`)에서 전문 분야·담당 주제·자기소개 fetch.
- Person schema 필수 속성:
  - `jobTitle` (전문 분야), `knowsAbout` (담당 주제 키워드 배열)
  - `hasOccupation` (Occupation 노드: name + occupationLocation)
  - `hasCredential` (자격증·경력·수상 — EducationalOccupationalCredential)
  - `worksFor` (Organization @id 참조로 본사 연결)
- **`sameAs` 의무화 (2026 GEO 최우선 신호)**: AI Overviews 인용 시 sameAs 체인을 Wikidata/Wikipedia/LinkedIn/ORCID까지 traversal해 엔티티 신뢰도 산출. 페르소나당 최소 1개 외부 프로필 링크 — **LinkedIn 우선**, 없으면 회사 공식 페이지 슬러그라도 의무 출력.
- 본문에 전문 분야 배지 + 담당 주제 칩 리스트 표시.
- **본문에 Experience 디테일 의무** (§3.6 참조): 페르소나 bio에 "{년도}년부터 {플랫폼} 운영", "처리한 캠페인 {수치}건" 같은 구체 마커가 없으면 GEO 인용 자격 약함. 추상 직함만 있는 bio는 페르소나 카탈로그 단에서 보강.
- WP description이 비어 있으면 페르소나 카탈로그 bio로 fallback.

### 4.8 Core Web Vitals (성능 게이트)

2026 기준 INP는 사이트 43%가 실패하는 가장 까다로운 CWV 지표. 200ms 초과 시 평균 0.8순위 하락 관찰.

- **임계값**: LCP ≤ 2.5s, **INP ≤ 200ms**, CLS ≤ 0.1 (mobile p75 기준).
- **게이트 위임**: 측정·게이트는 `/audit build` + `/audit site --lighthouse`가 정본. 본 정책에서는 임계값만 정의.
- **SEO 영향**: 단독 랭킹 요인은 아니지만 동률일 때 결정적. AI Overviews 후보 풀에 들기 위한 "Page Experience" 기준의 일부.

### 4.9 오프사이트 신호 (브랜드 인용 + 커뮤니티)

2026 ChatGPT 인용 가중치: referring domains 30% / 브랜드 검색량 25% / 커뮤니티(Reddit·Quora) 20%. 미국 ChatGPT 인용의 Wikipedia + Reddit 합산 점유율 25%+. **온페이지만으로는 GEO 상한이 정해진다.**

- **브랜드 언급 추적 (linked + unlinked)**:
  - 외부 매체·블로그가 "SNS헬프"를 텍스트로만 언급해도 AI 모델이 동시발생 빈도로 신뢰도를 학습. PR/제휴 기사에 백링크 강요보다 자연스러운 brand mention 우선.
  - 분기 1회 brand mention 모니터링 (Google Search "SNS헬프" 직접 검색 + Semrush brand mention 리포트).
- **한국 커뮤니티 (1순위)**:
  - **네이버 카페·지식iN**: 한국 시장 GEO에서 Reddit 등가. SNS 마케팅 카페 답변 + 지식iN 답변에 "SNS헬프" 자연 언급 확보.
  - 자작·매크로성 답변 금지 (네이버 어뷰징 필터·신뢰도 손상).
- **글로벌 커뮤니티 (2순위, /en 도입 시)**: Reddit r/socialmedia, r/Instagram / Quora 답변. 자사 직접 광고 금지, 가치 제공 답변 + bio 링크.
- **Wikipedia / 나무위키**:
  - 자사 항목 직접 작성 금지 (notability + COI 위반). 자연 발생한 언급에 대해서만 정합성(공식 사이트, 대표명, 설립연도) 정확성 확보.
  - Person schema `sameAs`에 Wikipedia/Wikidata URL이 들어가려면 먼저 외부 위키에 항목이 존재해야 함.

### 4.10 Naver 채널 신호 (한국 시장 정본)

Naver 2026 점유율 약 46.5% (Google 46.05% 박빙). 한국 시장에서 SEO/AEO/GEO 가중치 산정 시 Naver 알고리즘을 별도 축으로 본다.

- **C-rank (채널 신뢰도)**: 네이버 Blog/Cafe/지식iN의 채널 단위 권위 점수. 같은 글이라도 권위 채널에서 발행하면 상위 노출.
  - 사내 페르소나 운영 시 채널 활동 일관성 유지 (분기 1회 이상 발행, 답변 활동).
- **D.I.A (Deep Intent Analysis)**: 체류시간·공유·댓글·스크랩으로 사용자 의도 충족도 산출. Google 의도 매칭과 유사.
  - 콘텐츠 길이보다 **이탈률·체류시간**이 핵심. 본문 첫 화면에 답을 두는 §3.4 직답 룰이 D.I.A에도 직결.
- **검색량 검증은 DECAGO 프록시 정본 (§1.5)**: Semrush kr `NOTHING FOUND` 한국어 롱테일 fallback. 키워드 채택 게이트 그대로 적용.
- **E-E-A-T 정렬**: 2026 들어 Naver도 E-E-A-T 강화 — `pageH1`·Person schema·시점 박힌 사실 주장이 그대로 Naver에도 유효.

---

## 5. 점수 100점 체크리스트 (페이지별 self-check)

새 페이지 또는 기존 페이지 수정 시 다음 항목 모두 ✅ 확인:

### SEO
- [ ] `title` 페이지 고유 작성, 30~60자, 핵심 키워드 + 브랜드
- [ ] `description` 페이지 고유 작성, 100~160자
- [ ] `ogTitle`, `ogDescription` 페이지 고유 작성 (홈 description 재사용 금지)
- [ ] `pageH1` 또는 본문 명시적 `<h1>` 1개 (헤더 카테고리 라벨에 의존 금지)
- [ ] 모든 `<img>`에 정보가 담긴 `alt`
- [ ] 색인 정책 명확 (`robotsIndex={true|false}` 명시 또는 default noindex 의도)
- [ ] CWV 임계값 통과 — INP ≤ 200ms / LCP ≤ 2.5s / CLS ≤ 0.1 (`/audit build` 위임, §4.8)

### AEO
- [ ] FAQ가 있으면 FAQPage schema (ItemList 금지) — 리치 결과는 종료됐지만 AI 추출용 유지
- [ ] 절차가 있으면 HowTo schema + sr-only 텍스트
- [ ] 이미지 안 텍스트는 sr-only HTML 텍스트로도 출력
- [ ] 답변/설명 첫 문장에 결론
- [ ] **AI 추출 청크 룰** (§3.5): 답변 단위가 H2/H3 직후 130~160단어 자기완결 블록, bullet/번호 리스트 우선, brand 키워드 첫 1~2 문장에 1회

### GEO
- [ ] 사실 주장(매출·수상·점유율)에 시점·출처 명시
- [ ] 가격 비교 주장에 "자체 조사 기준" 등 근거 표기
- [ ] 게시일/수정일 사용자 가시 (필요 시)
- [ ] **Experience 마커** (§3.6): 도구명·날짜 박힌 사건·구체 수치·실수 사례 중 최소 2종 본문에 포함
- [ ] 저자 페이지면 Person schema에 `sameAs` 외부 프로필(LinkedIn 우선) 1개 이상 + `hasCredential` / `hasOccupation` 직렬화 (§4.7)
- [ ] 한국 타깃 페이지면 Naver D.I.A 친화 구조 — 첫 화면 직답 + 체류 유도 (§4.10)

---

## 6. 자주 묻는 작업 패턴

### 6.1 새 색인 페이지 추가

```astro
---
import DefaultLayout from 'layouts/DefaultLayout.astro';
const currentPath = Astro.url.pathname;
---

<DefaultLayout
  lang="ko"
  title="[페이지 핵심 키워드 - SNS헬프]"
  description="[100~160자 페이지 고유 설명]"
  ogTitle="[페이지 핵심 키워드 - SNS헬프]"
  ogDescription="[페이지 고유 설명]"
  pageH1="[키워드 풍부 H1 문장]"
  robotsIndex={true}
  ogUrl={currentPath}
  isMain={false}
  topTitle="[헤더 카테고리 라벨]"
  isDepth={true}
  isNavigate={true}
>
  {/* 페이지 고유 schema 있으면 여기 출력 */}
  <main>...</main>
</DefaultLayout>
```

### 6.2 동적 페이지 (API 데이터)

API meta가 비어있을 때 fallback 정책:
```ts
const metaTitle = data?.meta?.meta_title?.trim() || `${data.title} - SNS헬프`;
const metaDescription = data?.meta?.meta_description?.trim() || `${data.description.slice(0, 155)}…`;
```

직접 `${data?.meta?.meta_title}` 사용 금지 (undefined 출력 위험).

### 6.3 종료된 이벤트 처리

```astro
<DefaultLayout
  ...
  title="추석 기념 10% 할인 이벤트 (종료) | SNS헬프 공지"
  robotsIndex={false}  {/* 종료된 콘텐츠는 색인 차단 */}
  ...
>
```

---

## 7. 관련 문서

- `tmp/copy-seo-aeo-geo-{date}.md` — 정기 audit 리포트 (분기 1회 실행)
- `.ai-rules/ui-coding.md` — 컴포넌트 작성 규칙
- `.ai-rules/ui-ux.md` — 문구·디자인 원칙
- `public/llms.txt` — AI 크롤러용 페이지 카탈로그
- `public/robots.txt` — 검색엔진 크롤링 정책

---

## 8. 외부 참고 자료 (룰 근거)

§1.6 GEO, §1.7 E-E-A-T 2026, §1.8 헤드라인 룰의 근거가 된 2026 5월 시점 외부 자료. 향후 정기 업데이트(6개월 주기 권장) 시 재확인 후 룰 갱신.

1. [Generative Engine Optimization Best Practices Complete 2026 Playbook — GenOptima](https://www.gen-optima.com/blog/generative-engine-optimization-best-practices-complete-2026-playbook/) — schema 풀스택 1.8× 인용률, listicle 74.2% 통계
2. [Generative Engine Optimization (GEO): How to Win in AI Search — Backlinko](https://backlinko.com/generative-engine-optimization-geo) — quote/통계 인용 +30-40% 가시성, Reddit·LinkedIn 인용 분포
3. [E-E-A-T March 2026 Update — Digital Applied](https://www.digitalapplied.com/blog/e-e-a-t-march-2026-google-rewards-experience-content-guide) — AI-only 41% traffic 손실, Experience 가중 ↑, 작성자 페이지 룰
4. [GEO Best Practices for 2026 — Firebrand](https://www.firebrand.marketing/2025/12/geo-best-practices-2026/) — content freshness 10-15%, paragraph 1-아이디어 원칙
5. [How To Write Headlines That Work — Copyblogger](https://copyblogger.com/how-to-write-headlines-that-work/) — Goal-based 헤드라인 (reach/traffic/sales 분기)
6. [2026 Complete Guide to Copywriting Frameworks — Medium](https://medium.com/@giovannaromano215/the-2026-complete-guide-to-copywriting-frameworks-you-must-know-5427815ceef5) — AIDA 프레임워크 + Attention-함정 회피
7. [Topical Authority SEO Guide — Keyword Insights](https://www.keywordinsights.ai/blog/how-to-build-topical-authority-in-seo/) — topic cluster + pillar page, granular intent 8 type
8. [Keyword Research Complete Guide 2026 — W3Era](https://www.w3era.com/blog/seo/keyword-research-complete-guide/) — SERP type 분류 (guide/comparison/tool/listicle/discussion)
9. [Design Trends 2026 — Adobe Express](https://www.adobe.com/express/learn/blog/design-trends-2026) — premium minimalism, human-centered design
10. [Helpful Content & EEAT 2026 — Digital Monk Marketing](https://digitalmonkmarketing.com/eeat-helpful-content-2026/) — first-hand 디테일 룰
11. [Marketing & Design Trends 2026 — Venngage](https://venngage.com/blog/ai-and-design-trends/) — data storytelling, motion·interactive 인포그래픽
12. [SE Ranking — AI Citation 30만 도메인 분석](https://seranking.com/) — llms.txt 효과 무의미 통계
13. [Ahrefs — 75K 도메인 Brand Mention 연구](https://ahrefs.com/) — unlinked brand mention과 AI 인용 0.664 상관 (백링크 ~3× 강함)
14. [ChatGPT Citation Pattern 분석] — 인용 페이지 72.4%가 Answer Capsule (H1·H2 직후 50-80자 정의 블록) 패턴 보유, listicle이 인용 21.9% 점유
15. [Princeton GEO — Aggarwal et al. KDD 2024](https://arxiv.org/abs/2311.09735) — Quotation/Statistics/Cite Sources 30-40% 인용률 개선
16. [Google March 2026 Spam Update / Programmatic SEO 차단] — 템플릿 양산형 페이지 doorway 분류
17. [Naver AI Briefing 도입 가이드 — Cue: 종료 후속] — 비교표·단계별 가이드·FAQ가 인용 빈도 ↑, "내돈내산" 실증 30%+ 필수
18. [Core Web Vitals 2026 임계 강화] — LCP 2.5s → 2.0s 강화, INP 200ms 사이트 43% 실패

**갱신 룰**: 위 자료 중 1년 이상 경과한 출처는 audit 시 재검증. 새 자료로 대체되면 §1.6~1.8·§9~§10 룰도 함께 갱신.

---

## 9. 블로그 글 전용 룰 (정본 — `wp-content/posts/*.md`)

블로그 글(`wp-content/posts/{id}.md`)에만 적용되는 룰. 비-블로그 페이지(`/about/`, `/referral/`, `/[platform]/[title]/` 등)는 §0~§8을 따른다.

§1.5 / §1.7 / §1.9 / §1.10도 블로그 글에 적용되는 룰이지만 §1에 두는 이유는 페이지 메타·H1·slug 작성 컨텍스트가 비-블로그 페이지와 공유되기 때문이다. 본 §9는 그 외 블로그 본문·점수·갱신·발행 정본을 담는다.

### 9.0 snshelp 사이트 특화 원칙 — 거래/구매 의도 키워드 우선

snshelp는 **셀프 마케팅 플랫폼**(인스타·유튜브·틱톡 등 팔로워·좋아요·구독자·조회수·댓글 등 셀프 구매 서비스 제공)이다. 따라서 블로그 글의 1차 타깃은 **구매 의도가 높은 키워드(transactional/commercial intent)**이며, 정보형(informational) 키워드는 보조다.

| 의도 분류 | 영문 | 특징 | 예시 | 우선순위 |
|---|---|---|---|---|
| **거래형** | transactional | 즉시 구매/행동 의도 | `인스타 팔로워 구매`, `유튜브 댓글 구매`, `인스타 좋아요 늘리기` | **★★★ (최우선)** |
| **상업형** | commercial | 구매 전 비교·평가 | `인스타 팔로워 늘리는 사이트 추천`, `유튜브 조회수 늘리는 앱 비교` | ★★ |
| **정보형** | informational | 학습·이해 의도 | `인스타 알고리즘 원리`, `유튜브 시청 시간이란?` | ★ (보조) |
| **탐색형** | navigational | 특정 브랜드·앱 찾기 | `snshelp 후기`, `인스타 공식 앱` | (브랜드 페이지가 별도 처리) |

**거래/상업 의도 식별 신호어 (한국어)**:
- `구매` / `구입` / `사기` / `결제` — 거래형 직접 표현
- `늘리기` / `늘리는 법` / `늘리는 사이트` — 셀프 마케팅 핵심 의도, snshelp 비즈니스와 정확히 일치
- `추천` / `순위` / `비교` / `후기` — 상업형
- `빠르게` / `빨리` / `자동` — 행동 트리거가 붙으면 거래형으로 수렴

**거래형 키워드 작성 룰**:
1. 한 글에 거래형 메인 키워드 1개 + 상업형 보조 2-3개를 짝짓는다 (예: `인스타 팔로워 늘리기` + `인스타 팔로워 늘리는 사이트 추천` + `인스타 팔로워 빠르게 늘리기`).
2. 본문 결론·CTA에 **snshelp 서비스 페이지로 향하는 내부 링크**를 반드시 1개 이상 둔다 (`/[platform]/` 또는 `/[platform]/[title]/`).
3. 정보형 글의 거래 다리는 **선택적·절제 모드**로 둔다. 본문 곳곳에 거래 키워드/CTA를 박지 말고, 글 끝 결론 1곳에만 자연스러운 다리 단락 + 부드러운 CTA(예: "더 알아보기", "관련 서비스 보기") 1개 + 서비스 페이지 내부 링크 1개로 한정. 본문은 정보 가치 위주.
4. **검색량이 낮아도 거래 의도가 명확하면 채택**한다. 정보형 검색량 1,000 < 거래형 검색량 200 (snshelp 기준).

**Single-intent per URL 원칙** (Google Dec 2025 Core Update 반영):
- 한 URL은 **하나의 주된 의도**만 충족한다. 정보형 글이 본문 곳곳에서 거래·상업·정보 의도를 동시에 만족시키려 하면 "혼합 의도" 페널티 위험.
- 정보형 글의 거래 전환은 **결론 1곳에 한정**(룰 3 참조). 상업형 비교·후기 글은 거래 키워드 자연 분포 허용.
- 거래형·상업형·정보형 의도가 모두 강한 단일 키워드는 **별도 URL로 분리**한다 (예: "X란?" 정보 글 / "X 추천" 비교 글 / "X 구매" 거래 페이지를 각각 분리).

### 9.0.1 거래형 vs 정보형 페이지 분리 룰 — 쿼리 의도별 분리 (CRITICAL)

AI Overviews(AIO) 인용 데이터: 정보형 쿼리 36% / 거래형 쿼리 5%. 같은 페이지에 두 의도를 혼재시키면 AIO 인용 타깃과 conversion 타깃 모두 손해.

- **정보형 글**(`~ 방법`, `~ 가이드`, `~란`, `~ 차이`): 블로그·가이드 글로 작성해 AIO 인용 타깃. 결론 1곳에만 거래 다리.
- **거래형 페이지**(`~ 구매`, `~ 가격`, `~ 신청`): 서비스 LP(`/[platform]/`, `/[platform]/[title]/`)로 작성해 conversion 타깃. 정보 콘텐츠는 결론 안내 형태로만 노출.
- **동일 페이지에 두 의도 혼재 금지**.

### 9.0.2 토픽 클러스터 전략 (snshelp 절제 버전)

거래형 메인 키워드는 단일 글이 아니라 **pillar + supporting 글 묶음**으로 다뤄야 topical authority가 잡힌다 (HubSpot: 클러스터 글이 standalone 대비 +30-43% 트래픽, AI 인용 3.2배).
- **Pillar 1개**: 거래형 메인 키워드의 종합 가이드 (예: `인스타 팔로워 늘리는 법 — 완벽 가이드`, 3,000-5,000자)
- **Supporting 5-10개**: pillar에서 가지친 보조 키워드 글 (예: 빠르게 늘리기 / 무료 vs 유료 / 사이트 추천 / 알고리즘 원리 / 자주 묻는 질문 등)
- **상한 10개 권장**: 인력·검증 부담 + thin content 위험을 고려해 5-10개로 한정. 양산 금지. 부족하면 그때 확장.
- **모든 supporting → pillar 내부링크 필수**, pillar → 각 supporting 내부링크도 필수 (양방향)
- 클러스터 내 글은 §9.1.5 anchor 다양성 룰을 준수

**SERP 의도 검증 (필수 단계)**:
- 후보 키워드의 SERP 상위 10개를 확인해 글 의도와 일치하는지 검사한다.
- 검색량이 매력적이어도 SERP 상위가 **도구 사이트·계산기·랭킹 페이지**로 채워져 있으면 **타깃에서 제외**한다.
- 예: "유튜브 통계"(검색량 390)의 SERP가 vling/playboard 등 도구 위주 → 통계 모음 글로 타깃 불가. 대신 "유튜브 시청 시간"(검색량 480)으로 재타깃.

### 9.0.3 Programmatic SEO 차단 룰 (March 2026 Spam Update)

카테고리·서비스·인덱스 페이지를 템플릿으로 양산하면 doorway page로 분류되어 deindex 위험. (출처: §8 외부 참고 추가)

- **각 페이지마다 자사 운영 데이터·실제 사례·고유 분석 1건 이상 포함**. 템플릿 반복 금지.
- audit 측정: 동일 description/ogDescription 페이지 N개 검출 시 미디어/메타 영역 **−10**.
- 본문 80% 이상이 다른 페이지와 중복(예: 보일러플레이트 인트로·결론)이면 doorway 의심.

**검출·자동 수정 도구 (정본)**: [`script/audit-programmatic-seo.mjs`](../script/audit-programmatic-seo.mjs). `/audit programmatic [--fix]` 호출 시 자동 실행.

**검출 항목 6종 (모든 robotsIndex=true 페이지 대상, dist HTML 전수 스캔)**:

| 항목 | 검출 기준 | 자동 수정 |
|---|---|---|
| (a) 동일 description | 정확 일치 또는 Jaccard ≥ 0.9 토큰 유사도 (사이트 wide fallback 사용도 포함) | ✅ 가능 |
| (b) 동일 ogDescription | 정확 일치 | ✅ 가능 |
| (c) 동일 ogImage | 정확 일치 (fallback `/meta/og.png` 사용도 포함) | ✅ 가능 |
| (d) title 패턴 반복 | 숫자·플랫폼 slug 정규화 후 3편 이상 동일 패턴 | ✅ 가능 |
| (e) 고유 운영 데이터 부재 | 본문 `<main>` 첫 1,500자 안에 수치·년도·고유 entity 0건 | ❌ 수동 검수 |
| (f) canonical 충돌 | 다른 페이지가 같은 og:url을 가리킴 | ✅ 가능 |

**자동 수정 안전 룰** (`--fix` 모드):
- 정적 라우트 (`src/pages/<path>/index.astro`)만 자동 수정. `[slug]`/`[platform]`/`[title]` dynamic 라우트는 수동 검수 큐로 escalation
- prop 값이 literal string `"..."` 형태일 때만 자동 수정. 표현식 `{...}` 형태는 사용자 검수 큐
- 자동 description 생성 시 페이지 H1·H2 기반으로 100~160자 strict 생성
- 본문 콘텐츠는 자동 수정 안 함. 메타 prop만 갱신 (description / ogDescription)
- 한 cycle에 한 페이지만 수정 (race 방지)

**호출 절차**:
1. `npm run build`로 dist/ 빌드 산출물 생성
2. `node script/audit-programmatic-seo.mjs` → 전수 검출 (read-only, `tmp/audit-programmatic-seo-{ts}.md` 보고서)
3. 결함 있으면 `node script/audit-programmatic-seo.mjs --fix` → 자동 수정 (정적 페이지만)
4. 재빌드 후 재검사로 통과 확인 (최대 3 cycle 권장)
5. 수동 검수 큐(=dynamic 라우트, 고유 데이터 부재)는 보고서에 명시되며 사용자가 직접 보강

**판단 가이드**:
- (e) 고유 운영 데이터 부재 검출 페이지는 본문에 자사 운영 수치·연도·고유 entity를 1건 이상 추가하여 doorway page 분류 회피
- dynamic 라우트(예: `/[platform]/[title]/`)는 데이터 소스(WordPress·API meta)에서 페이지별 고유 description·ogImage가 오는지 확인. 같은 boilerplate면 데이터 소스 단에서 차별화
- title 패턴 반복은 USP·시점·페르소나 어구로 차별화

---

### 9.1 Google SEO (E-E-A-T 기반)

#### 9.1.1 E-E-A-T 4요소
- **Experience(경험)** — 두 갈래로 분리해 모두 확보:
  - **작성자 경험**: 실제 사용·시도 사례, 스크린샷, "직접 해보니~" 표현
  - **사용자 경험 인용**: 네이버 지식iN·카페·커뮤니티(디씨·클리앙·인스티즈)·유튜브 댓글 등에서 수집한 실사용자 좌절·성공·실패담을 출처 표기와 함께 인용. write 단계(blog/write.md) Phase 1-D에서 수집.
- **Expertise(전문성)**: 정확한 용어, 정량 데이터, 구체 수치
- **Authoritativeness(권위)**: 1차 출처 인용, 공식 문서 링크, 통계 출처 명시 → §9.1.2 권위 출처 카탈로그 + §9.1.3 출처 검증·인용 절차 준수
- **Trust(신뢰)**: 작성일·수정일 명시, 출처 링크, 모순 없음
  - 거래 의도 글은 주의사항·조건·실패 가능성을 숨기지 않되, 제목·TL;DR·대표이미지·첫 H2에서는 혜택·수익 구조·실행 조건을 먼저 제시한다.
  - 리스크 고지는 중후반의 **"주의할 점 / 시작 조건 / 체크리스트 / 맞지 않는 경우"** 섹션에서 1회 집중 정리한다. "한계", "함정", "실패", "자동 수익 아님" 같은 부정 프레이밍을 상단 핵심 메시지로 반복하지 않는다.

§1.7 E-E-A-T 2026 (Experience 최우선 차별화)는 블로그 글에도 그대로 적용.

#### 9.1.2 snshelp 권위 출처 카탈로그

블로그 글에서 인용 가능한 **1차/2차 출처** 카테고리별 정리. audit·LLM 인용 모두에서 가산 신호로 작동한다.

**1차 출처 (공식 발표·연구)**:

| 카테고리 | 출처 | 인용 강점 |
|---|---|---|
| Instagram·Meta | Meta Newsroom, Adam Mosseri 공식 발언, about.instagram.com (Engineering) | 알고리즘 발표, AI 투자, 정책 변경 |
| YouTube | YouTube Creator Insider, YouTube Official Blog, Creator Academy | 알고리즘 가이드, 시청 시간·CTR 룰 |
| TikTok | TikTok for Business, TikTok Newsroom | 사용자 통계, 알고리즘 변경 |
| X(Twitter) | X Engineering Blog (open-source algorithm), Adam Mosseri 등 임원 발언 | 알고리즘 작동 원리 |
| 통계·인구 | Statista, DataReportal, 통계청, 한국언론진흥재단, KISA | 사용자 수·시청 시간·시장 규모 |
| 정책·법령 | easylaw.go.kr, 국세청 공식, 4대 보험 공단(nhis 등), 정책브리핑 | 4대 보험·세무·창업 지원 |
| 학술·연구 | HBR, McKinsey, Bain & Company, Forrester, Gartner | 마케팅 ROI, 고객 충성도, 디지털 전환 |
| AI·SaaS 공식 | OpenAI Blog, Anthropic, Notion Blog, Canva Newsroom, Adobe | 신기능 발표, 마케터 도입률 |

**2차 분석 (권위 매체)** — 1차가 어렵거나 보완할 때:

| 카테고리 | 출처 |
|---|---|
| SNS 마케팅 일반 | Sproutsocial, Hootsuite, Buffer (벤치마크·트렌드 보고서) |
| YouTube SEO | Backlinko, VidIQ Blog, Tubular Insights, Awesome Creator Academy |
| 인플루언서 마케팅 | Influencer Marketing Hub, HubSpot, Later |
| 일반 마케팅 | Search Engine Land, Search Engine Journal, MarketingProfs |
| IT·기업 보도 | The Verge, TechCrunch, CNBC, Reuters, Bloomberg, Fortune, WSJ |
| 한국 IT 보도 | 디지털데일리, 전자신문, ZDNet Korea, 블로터 |
| Instagram·릴스 분석 | Sprinklr, Later, Sprout Social, Hootsuite |
| 한국 시장 통계 | DataReportal Digital Korea, KISDI, 한국인터넷진흥원, 정책브리핑 |

**금지 출처**:
- 출처 불명 블로그·tistory·티스토리 등 개인 매체 (E-E-A-T 약함)
- 광고성 기업 블로그 (단 자체 통계 발표는 1차 인정)
- 한 글에 같은 도메인 3회 이상 (다양성 위반)

#### 9.1.3 출처 검증·인용 절차 (필수)

**1단계 — 출처 검증 (가짜 통계 방지)**:
- WebFetch로 원문 페이지에 진짜 그 통계·문장이 있는지 **반드시 직접 확인**
- 발표 시점·정확한 수치·URL 확보 후에만 인용
- 본문 기존 수치는 1차 보도로 뒷받침할 출처 검색 → 본문 수치-출처 페어 강화

**2단계 — 출처 다양성 (글당 도메인 3+)**:
- 글 1편당 외부 출처 **최소 3개**, **서로 다른 도메인 3+** 분산
- 한 도메인 3회 이상 = 다양성 위반
- audit `ext_links < 3` 또는 `ext_domains < 3` 시 −10 (E-E-A-T 영역)

**3단계 — 인용 형식 (Princeton GEO §9.3.1 +39%)**:
```html
<!-- wp:paragraph -->
<p>{출처 인용을 자연스럽게 도입하는 한 줄. 글 흐름 안에서 의미 있게.}</p>
<!-- /wp:paragraph -->

<!-- wp:quote -->
<blockquote class="wp-block-quote"><p>"{원문 핵심 문장 또는 한국어 자연 번역}"</p><cite>{출처명} — {매체/발표자} (<a href="{URL}" rel="nofollow noopener" target="_blank">{기관명}</a>, {연도})</cite></blockquote>
<!-- /wp:quote -->
```

**4단계 — 인용 위치 패턴**:
- **결론 직전** 또는 **본문 마지막 H2 다음 단락** — 본문 흐름 정리 + 권위 추가
- **새 H2 신설** ("외부 통계가 확인하는 ...", "출처가 보여주는 ...") 도 자연스러움
- FAQ 섹션 안에 인용은 가급적 피함 (FAQ는 직답 위주)

**금지**:
- generic 인용문 만들기 (원문 없는 추정)
- 가짜 통계·수치 (출처 페이지에 없는 내용)
- 글 주제와 무관한 출처
- 같은 출처 도메인 한 글에서 3회 이상 반복

### 9.1.4 글 구조 (필수)

```
1. H1 (= 글 제목, frontmatter title): 60자 이내, 메인 키워드 자연 포함
2. 도입 단락 (Hook + 직답): 100-150자, 검색 의도에 대한 직답 1문장 포함
3. 핵심 요약 블록 (TL;DR): 도입 직후, 첫 H2 직전에 배치. **bullet 5개 ±2 (3-7개), 각 bullet 70~140자** (정본 §1.9).
   - 메인 키워드 자연 포함, 정량 수치 1개 이상, 결론·행동 트리거 1개 포함
   - 한국어 환경에서 너무 짧으면 정보 가치 약 → §1.9 기준 70~140자
4. 본문 H2 섹션 4-7개: 각 섹션 200-400자, 한 H2당 1주제
   - 정의 / 이유 / 방법 / 예시 / 비교 / FAQ 패턴
   - **PAA recursive H3 (선택)**: 질문형 H2 아래 follow-up 질문 H3 0-2개. 각 H3 본문 100-150자 이상 필수 (thin content 방지). H2당 H3 최대 2개.
   - **사용자 시나리오 매핑(권장)**: 한 H2를 "[페르소나]를 위한 적용 가이드" 형태로 두면 JTBD와 직결되어 체류 시간이 늘어남. Phase 1-E 시나리오 카드에서 채택.
5. **주의할 점 / 시작 조건 / 체크리스트 / 맞지 않는 경우** H2 — **거래·상업 의도 글은 필수**, 정보형은 권장
   - 실사용자 페인·실패 사례 1-3개를 출처 표기와 함께 인용
   - "이 방법이 통하지 않는 경우", "주의해야 할 점", "흔한 오해" 등 균형 잡힌 시각
   - 제목·TL;DR·대표이미지·첫 H2에는 "한계", "함정", "실패", "자동 수익 아님"을 전면 배치하지 않는다. 상단은 가치 제안 → 조건 → 실행 흐름 순서로 작성한다.
6. FAQ 섹션 (H2 "자주 묻는 질문") - AEO/GEO 필수
7. 결론 H2 (요약 + 행동 유도 + 거래형 키워드 + snshelp 서비스 링크)
```

**Front-loading 원칙 (CRITICAL)**:
- 글 **상단 30% 영역**(도입 + 핵심 요약 + 첫 H2 직답)에 **직답·핵심 수치·정의**를 집중 배치한다.
- AI Overview·LLM 인용 분포가 상단에 편향(top 30%에 인용 약 55%)된다는 GEO 관측에 따라, 인용 가능 문장을 상단에 배치한다.
- 핵심 결론을 마지막에 숨기지 않는다. 결론 → 근거 → 디테일 순.

**예외 — 통계·listicle(리스트형) 글**:
- 본문 H2 섹션 **7-12개 허용**. FAQ·결론은 본문 H2 카운트 외 별도.
- 본문 길이 **5,000-15,000자 허용**. §9.6 채점 시 길이 기준 적용 안 함.
- 핵심 요약 블록은 동일 적용 (3-5 bullet).
- 거래형 키워드/CTA·snshelp 서비스 링크 룰(§9.0)은 동일 적용.

§1.9 글 상단 구조 정본 (TL;DR 헤더 + 5 bullets + 인포그래픽 + 첫 H2)이 모든 블로그 글에 의무 적용.

### 9.1.5 내부링크 + Anchor 다양성

- 글당 최소 **3개 내부링크** (관련 글)
- `wp-content/posts/`의 기존 글을 grep해서 관련 글 찾기
- **snshelp 서비스 페이지 링크 1개 이상 필수** (`/[platform]/` 또는 `/[platform]/[title]/`). 거래 전환 동선 확보 (§9.0).

**Anchor text 다양성** (LinkStorm 2.5M 내부링크 연구):
- **Exact-match 앵커 ≤ 10%**: 메인 키워드를 그대로 박는 앵커는 글 전체 내부링크 중 1개 이내로 제한 (anchor diversity가 높은 사이트가 평균 순위 1.3, 낮으면 3.5)
- **Partial-match 25-35%**: 메인 키워드 + 수식어/조사 변형 (예: "팔로워 늘리는 방법은 여기 참고")
- **Descriptive 나머지**: 문맥에 맞는 서술형 앵커 (예: "Meta가 2025년 발표한 알고리즘 변화")
- **금지**: "자세히 보기" / "여기 클릭" 같은 generic 앵커 (LinkStorm 기준 15% 노이즈로 분류) — snshelp는 0% 유지
- 1글 안에서 동일 앵커 반복 금지 (같은 URL이라도 앵커는 매번 다르게)

### 9.1.6 키워드 분포 (블로그 글)

- 메인 키워드: H1, 첫 단락, 마지막 단락에 자연 등장
- LSI(관련어): H2 헤딩 50% 이상에 분산
- **키워드 밀도**: 1-2% (강제 반복 금지, 자연스러움 우선)
- §1.5 메인 키워드 → title 정확 어구 룰을 그대로 따른다.

### 9.1.7 Brand Mention 시그널 (Ahrefs 0.664 상관 — 외부 신호 핵심)

**Brand Mention 우선**: 백링크보다 unlinked brand mention이 AI 인용에 ~3배 강함 (Ahrefs 75K 도메인 연구, 출처 §8 외부 참고 추가).

- 추적 채널: 매체 기고, 네이버 카페·지식iN, Reddit, LinkedIn, 팟캐스트
- 분기 1회 brand mention 모니터링 (Google Search "SNS헬프" 직접 검색 + Semrush brand mention 리포트)
- 자작·매크로성 답변 금지 (네이버 어뷰징 필터·신뢰도 손상)
- 자연 발생 mention 확보 우선. PR/제휴 기사에 백링크 강요보다 자연스러운 brand mention 가치 ↑

### 9.1.8 이미지 SEO (블로그 글)

- alt: 메인 또는 부가 키워드 포함, 15-80자
- 파일명: kebab-case 영문 또는 그대로 한글, 의미있는 단어
- 본문 이미지 **≥ 3개** (hero 1 + 본문 보조 ≥ 2). 상한 5개 권장 (LCP·페이지 무게 고려)
- WebP/AVIF 우선, PNG는 투명/도식용
- 본문 이미지 운영 최소 폭 1200px (asset-images §4.10.1 정본)

상세 인포그래픽·hero·codex 룰은 `.ai-rules/asset-images.md` 정본 참조.

### 9.1.9 스키마 마크업 권장 (CTR·AI 인용 영향)

SEO 관점에서 스키마는 SERP 리치 리절트로 **CTR 20-30% 상승** 효과가 있다. §2 Schema.org 작성 규칙이 정본. 블로그 글 권장 타입:

- **Article**: 모든 블로그 글 기본
- **BreadcrumbList**: SERP에 사이트 계층 노출 → CTR 영향. Article + BreadcrumbList 조합이 AI Overview 인용 **2.3배** 가산
- **Organization**: 사이트 전역 (snshelp 브랜드 신호)
- **Person** (author): E-E-A-T Author 신호 강화 (§9.5.3)
- **FAQPage**: AEO §9.2.3 정의

→ 구체 JSON-LD 구조·필수 필드는 §2를 따른다.

---

### 9.2 AEO (Answer Engine Optimization)

#### 9.2.1 강조 스니펫(Featured Snippet) 점유
- 검색 질문에 대한 **40-60자 직답을 H2 바로 아래 첫 단락에** 배치
- 형태: 정의형 / 단계형(리스트) / 비교형(표) 중 하나
- H2 헤딩은 **사용자 질문 그대로** 작성 ("X란?", "X 하는 방법", "X와 Y 차이")
- **Front-loading**: 첫 H2의 직답·정의는 글 **상단 30%** 안에 위치. AI Overview 인용 분포가 상단에 편향됨.

#### 9.2.2 People Also Ask 점유
- FAQ 섹션에 **5-8개 질문** (실제 검색 패턴, "어떻게", "왜", "언제", "얼마", "차이" 키워드)
- 각 답변 50-100자, 명사구로 시작 (대명사 시작 금지)
- **PAA recursive H3 (선택 옵션, 조건부)**: 본문 중 질문형 H2 아래에 follow-up 질문을 H3로 0-2개 추가하면 PAA chain 점유 가능.
  - **필수 조건**: 각 H3 본문 **100-150자 이상**. thin content면 오히려 SEO 감점.
  - **상한**: H2당 H3 최대 **2개**.
  - 적용 안 해도 감점 없음. 적용하면 가산 가능.

#### 9.2.3 Answer Capsule 룰 (ChatGPT 인용 72.4% — CRITICAL)

ChatGPT 인용 페이지의 72.4%가 동일 패턴: H1 직후 + 각 H2 직후에 **50-80자 정의/결론 답변 블록**을 가진다 (출처 §8 외부 참고 추가).

**룰**:
- 모든 블로그 글의 H1 직후 + 각 H2 직후에 **50-80자 정의·결론 답변 블록("capsule")**을 둔다.
- 첫 200자 안에 글 전체 결론 답변이 포함되어야 한다 (front-loading §9.1.4와 정합).
- 블록 첫 문장은 "{엔티티}는 {정의}이다" 또는 "{질문 결론}이다" 구조. 도입부·미사여구 금지.

**측정 단위 (CRITICAL)**:
- "50-80자"는 **공백·구두점·숫자·영문 포함 전체 character 수** (`len(plain_text)` 기준)
- 한국어 음절 분리 측정 (`grep -o '[가-힣]'`)은 §9.3.2 청크 측정에만 사용. §9.2.3은 전체 character.
- 측정 도구: `node script/measure-answer-capsule.mjs <id>` 정본

**예외 케이스 (capsule 강제 안 함)**:
다음 H2 종류는 capsule 적용 제외 + audit 측정에서 분모에서 빠짐:
- **FAQ H2**: 제목에 `자주 묻는 질문`, `FAQ`, `Q&A` 포함 — 직후가 Question·Answer 리스트라 50-80자 capsule 부적합
- **listicle 순번 H2**: 제목이 `^(\d+\.|\d+번|모델\s*\d+|시나리오\s*\d+|Step\s*\d+|단계\s*\d+)` 패턴 (예: `1. 핵심 개념`, `1번 도구.`, `모델 1 —`, `Step 1`, `단계 1`) — capsule 자체가 본문 (별도 답변 블록 불필요)
- **결론 H2**: 제목이 `결론`, `정리`, `요약`, `마무리`, `마치며` 단어로 시작 — 본문 자체가 결론 capsule (별도 50-80자 블록 강제 안 함)
- **참고자료 H2**: 제목이 `참고자료`, `참고문헌`, `출처`, `References`, `Sources`, `출처 분류` 키워드 — 직후가 인용 출처 목록이라 50-80자 capsule 부적합

위 4종 H2를 제외한 나머지 "주제 H2"가 측정 대상. `measure-answer-capsule.mjs`가 자동 분류.

**임계값 (§9.5.1 정본)**:
- 글 단위 STRICT 통과율 = (50-80자 capsule을 가진 주제 H2) / (전체 주제 H2)
- **100% 통과 → AEO 영역 +3** (가산)
- **80% 이상 통과 → 통과 (감점 없음)** — 한국어 글 작성 현실 반영
- **80% 미만 통과 → AEO 영역 −5** (감점)
- **0% 통과 → AEO 영역 −10** (추가 감점, 전수 결함)

**§9.3.2와의 정합 (CRITICAL)**:
- capsule 50-80자 단락 = H2 직후 첫 `<p>`
- §9.3.2 self-contained chunk 250-400자 단락 = capsule 다음 `<p>` (두 번째 단락)
- 두 단락 합계가 한 H2 섹션의 entry. capsule이 결론·정의, chunk가 근거·세부.

**측정 명령**:
```bash
node script/measure-answer-capsule.mjs <글 ID>
# 출력: STRICT 통과 N/M (M=주제 H2 수, FAQ/listicle/결론 제외)
#        LOOSE 통과 N/M (40-100자 허용 범위)
#        주제 H2 결함 목록 (H2명 + 직후 첫 단락 자수)
```

**감점**:
- STRICT < 80% → AEO 영역 **−5** (§9.5.1)
- STRICT = 0% → 추가 **−10**

#### 9.2.4 FAQPage·HowTo schema (블로그 글 적용)

**FAQPage JSON-LD** (정본 §2.4 정합):
- Google은 **2026.5.7부터 FAQ rich result(SERP 표시)를 종료**했고, 2026.6 Rich Results Test, 2026.8 Search Console API 단계 종료.
- **단, FAQPage 스키마 자체는 계속 유효**: Google이 페이지 이해(Knowledge Graph)에 계속 활용한다고 공식 발표. LLM(ChatGPT, Perplexity, Gemini)이 schema가 mirror하는 가시 Q&A 콘텐츠를 직접 추출해 인용 → GEO 측면에서 인용률 가장 높은 구조.
- **snshelp 정책**:
  - 모든 블로그 글에 FAQPage JSON-LD **계속 삽입**. 이유: ① LLM 인용 / Knowledge Graph 이해 효과는 만료 없음 ② AI Overviews·Perplexity·ChatGPT·Bing·voice·RAG 모두에서 계속 소비 ③ 제거 시 유지비용 > 유지 시 위험.
  - 단, **SERP rich result 노출 기대 근거 추가 금지**. 마크업 자체는 SERP 별점에 안 떠도 AI 인용 자격을 유지하는 게 목적.
  - **가시 Q&A 콘텐츠가 진짜**: schema만 있고 본문에 같은 Q&A가 없으면 의미 없음. 본문 FAQ 섹션과 schema는 1:1 mirror.
  - 본문 FAQ는 4-6개 Q&A, 답변 50-100자 자연어.

**HowTo JSON-LD** (정본 §2.5 정합):
- Google은 2023.9에 HowTo rich result를 desktop·mobile 모두 deprecated. SERP rich result 효과 종료.
- **그러나 schema 유지가 정답**: AI Overviews / Perplexity / ChatGPT Search / Claude가 절차·step을 schema에서 추출해 인용한다. §2 §2.5 룰을 따른다.
- **snshelp 정책**:
  - 절차형 글에는 HowTo schema **유지**. 새 글에도 적용 가능.
  - 단, **SERP rich result 노출 기대 근거 추가 금지**.
  - 본문에는 가시 단계 정보를 명확히 노출 (`<ol>` 번호 리스트 또는 H3 "Step 1, Step 2..."). LLM은 schema·본문 양쪽을 다 인용.

**FAQPage 형식**:
```html
<!-- wp:html -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    { "@type": "Question", "name": "Q", "acceptedAnswer": { "@type": "Answer", "text": "A" } }
  ]
}
</script>
<!-- /wp:html -->
```

---

### 9.3 GEO (Generative Engine Optimization)

LLM이 답변에서 인용하려면 글이 다음을 충족해야 한다.

#### 9.3.1 인용 가능성 5요소 (Princeton GEO 실측 수치)

**근거**: Aggarwal et al., "GEO: Generative Engine Optimization" (Princeton/KDD 2024, arXiv:2311.09735). GEO-bench Position-Adjusted Word Count 기준 상대 개선치.

| 기법 | 상대 개선치 | 적용 룰 |
|---|---|---|
| **Quotation Addition** (직접 인용문) | **+39%** | 1차 출처 발화자의 발언/공식 문서를 `<blockquote>` 또는 markdown `>` 블록으로 표기. 글당 1-2개 권장. |
| **Statistics Addition** (수치·통계) | **+31%** | 수치는 출처 + 시점과 함께. 글당 최소 3개. |
| **Cite Sources** (출처 인용) | **+29%** | 본문 인라인 출처 링크. 1차 출처 ≥ 2개, 전체 출처 ≥ 3개. 결론부 "1차 출처/2차 분석" 라벨링. |
| **Fluency Optimization** (유창성) | **+23%** | 매끄러운 한국어. 어색한 직역·번역체·접속사 남발 금지. AI 흔적 표현(§9.7) 금지. |
| **Keyword Stuffing** (키워드 도배) | **약 -1% (효과 없음)** | 키워드 밀도만 높이는 행위 금지. §9.1.6 1-2% 자연 분포 룰 준수. |

**Princeton 원문 인용**: "Top-performing methods — Cite Sources, Quotation Addition, and Statistics Addition — achieved a relative improvement of 30-40% on the Position-Adjusted Word Count metric."

**직접 인용문(Quotation) 블록 룰**:
- 인용은 markdown `>` 또는 HTML `<blockquote cite="URL">` 사용. 일반 단락에 따옴표만 둘러 인용 처리하지 말 것.
- 인용 직후 한 줄 출처: "— 발화자/문서명, 발표 시점, [링크](URL)".
- 1차 출처의 직접 인용은 Quotation Addition 가산에 직접 기여 (글당 1-2개 권장).

**1차 출처/2차 분석 라벨링 룰**:
- 결론 또는 별도 단락에 형식:
  ```
  **1차 출처**
  - [공식 자료명](URL) — 발표 시점·기관

  **2차 분석**
  - [매체명](URL) — 분석 시점
  ```
- 카테고리별 권위 출처 카탈로그는 §9.1.2, 출처 검증·인용 절차는 §9.1.3 참조.

#### 9.3.2 글의 LLM 가독성 + Self-contained Chunks (한국어 정본)

§3.5 AI 추출 청크 룰의 블로그 글 적용 보강.

**한국어 청크 정본 = 250-400자** (영어 130-160 단어 환산, AIO 추출 62%가 100-300단어 구간 점유). 측정: `grep -o '[가-힣]' | wc -l` 음절수.

**Self-contained chunks 룰**:
- 각 H2/H3 직후 250-400자 **자족 완결 단락 1개** 의무. 헤딩 질문에 단독으로 답이 되어야 함.
- 한 chunk 안에 **주제 + 정의 + 근거(수치·출처)** 모두 포함. "위에서 말한 ~", "앞서 본 ~" 같은 상호 의존 표현 회피.
- 헤딩 간 간격 200-360자 권장. 50단어 미만 매우 짧은 섹션은 citation rate 떨어지고, 단일 블록 500단어 초과는 retrieve 단위가 끊김.
- 비-블로그 페이지(`/referral/` 같은 마케팅 랜딩)는 130-160자도 허용(간결 표현 정합성).

**기본 가독성 룰**:
- 각 단락 첫 문장에 핵심 주장 (TopicSentence-First)
- 한 단락 3-5문장
- 모호한 표현 회피 ("것 같다", "아마", "어쩌면")
- 절대값 / 상대값 구분 ("증가" → "30% 증가")

#### 9.3.3 Author Entity (블로그 글)

LLM 및 AI Overview는 sameAs 그래프를 통해 author entity의 권위를 검증한다 (Wikidata → Wikipedia → LinkedIn → ORCID 체인). thin·invented author 엔티티는 citation share 손실.

**정본 룰** (사이트 구현은 §4.7 정본 참조):
- 모든 글에 작성자 정보(WP `author` 필드) 명시.
- 글 하단 author bio 박스: 이름 + 자격/경력 1-2줄 + **외부 권위 링크 1개 이상**.
- Person 스키마 JSON-LD `sameAs` 배열에 LinkedIn·Wikidata·외부 프로필 등 외부 ID 포함.

#### 9.3.4 Perplexity 별도 최적화

Perplexity는 **freshness(신선도)**와 **출처 다양성**에 다른 엔진보다 강한 가중치를 둔다 (업데이트 날짜 명시 시 인용률 3.2× 증가).

**Perplexity 특화 룰**:
- **발행일 + 최종 수정일** 모두 본문 HTML에 표기 (meta 태그뿐 아니라 사용자가 보는 위치에).
- 경쟁 주제는 14일 주기로 evergreen 갱신 권장 (수정일 갱신만으로도 freshness 신호 갱신). 단 §9.7 가짜 freshness 금지 룰과 함께 적용.
- robots.txt에 **PerplexityBot 허용** 필수.
- **출처 다양성**: 한 글에 **1차 출처 3개 이상** + 출처 도메인 중복 회피.

#### 9.3.5 Listicle + 분기 갱신 룰 (citation +28%)

정보형/비교형 글은 **'Top N + 순위' listicle 형식** 권장. AI 인용 전체의 21.9%가 listicle. ChatGPT 11건 중 1건이 listicle. **90일 안 분기별 업데이트** 시 citation +28% (출처 §8 외부 참고 추가).

- 1,000-2,000 단어 listicle 우선
- H2/H3 계층 구조로 순위·항목 명확화
- 90일 안 분기 1회 데이터 갱신 (§9.7 가짜 freshness 금지 준수 — 본문 실제 변경 필수)

#### 9.3.6 Multimodal (선택적 권장)

YouTube 영상 임베드는 Google AI Overview 인용을 끌어올린다 (AI Overview 내 YouTube 인용 300%+ 증가, AI 엔진이 YouTube를 다른 영상 플랫폼보다 200배 더 인용).

**룰 (강제 X, 권장)**:
- **Pillar 글**(거래형 메인 + 5,000자+)에는 관련 YouTube 영상 1개 임베드 권장.
- 이미지·표·영상 + Article/FAQ/Video 스키마를 함께 두면 멀티모달 신호 누적.
- 영상 제작 부담 고려 신규 글마다 강제하지 않음.

#### 9.3.7 GEO 이미지 룰 (alt + caption 하이브리드)

MLLM(Multimodal LLM)은 alt 단독보다 **alt + caption(figcaption) 조합**에서 이미지-텍스트 정렬이 더 정확하다.

**룰**:
- alt: 15-80자, 메인/부가 키워드 자연 포함, 화면 낭독용 간결 설명.
- **caption (figcaption)**: 이미지 아래 1-2문장(40-120자). 수치·맥락·출처 중 1개 이상 포함. 예: "2025년 1분기 인스타그램 활성 사용자 수 (출처: Meta 공식 발표)."
- 대표 이미지는 alt만 채워도 무방. 본문 데이터·차트·스크린샷은 **alt + caption 둘 다 채우는 것 권장**.
- **figcaption ↔ 이미지 일치 룰**: figcaption에 "출처/자료/기관명/연도/통계 수치"가 인용된다면 이미지는 그 출처의 데이터를 직접 시각화한 인포그래픽/차트여야 한다 (§3.2 alt 룰 + asset-images §4.8.6 정본 참조). 사진/일러스트에 통계 출처 표기 금지. 위반은 미디어 영역 −10.

---

### 9.4 한국어 SEO 특수성

#### 9.4.1 검색 의도
- 한국 사용자는 **의문형 검색** 빈도 높음 ("~하는 방법", "~란?", "~ 차이")
- H2를 의문형으로 작성하면 AEO와 일치

#### 9.4.2 키워드 패턴
- 메인 키워드: 명사구 (`인스타 팔로워 늘리기`)
- 롱테일: 행위 동사 + 명사 (`인스타 팔로워 빨리 늘리는 방법`)
- 정보형 vs 거래형 분리 (`~란` = 정보형, `~ 추천` = 거래형)

#### 9.4.3 띄어쓰기·맞춤법
- 키워드는 사용자 검색 패턴 그대로 (붙여쓰기·띄어쓰기 모두 등장 시 둘 다 자연스럽게 사용)
- 본문은 표준 맞춤법 (네이버 맞춤법 검사기 기준)

#### 9.4.4 Naver vs Google 분리 (helpsns.com은 Google 단일 타깃)

**핵심**: Naver는 C-Rank 기반으로 **자사 플랫폼(네이버 블로그·카페·지식iN)**을 검색 결과 상위 영역에 우선 배치한다. 외부 도메인은 별도 "웹사이트" 영역에서만 노출되며 구조적 제한.

**snshelp 정책**:
- helpsns.com 블로그는 **Google + AI 검색을 1차 타깃**으로 한다. Naver는 부수적 채널.
- Naver 자사 자산 운영은 helpsns.com과 별도 채널 전략으로 분리.
- 본문에 "네이버 맞춤법 검사기 기준"(§9.4.3) 유지는 한국어 표준이기 때문이지 Naver SEO 때문이 아니다.

§4.10 Naver 채널 신호 정본도 함께 참조 (C-rank·D.I.A·E-E-A-T 정렬).

#### 9.4.5 네이버 AI Briefing 인용 패턴

네이버 Cue:(2026-04 종료) 후속 **AI Briefing**이 검색 UI에 도입. 비교표·단계별 가이드·FAQ 형식이 빈번 인용된다. (출처 §8 외부 참고 추가)

- H3가 네이버 검색 쿼리와 유사한 질문 형식일 때 효과적
- **"내돈내산·직접 캡처" 실증 30%+** 필수 (C-rank 누락 회피 — 자체 데이터·스크린샷 비중)
- 비교표 + FAQPage schema + step-by-step 가이드 조합이 AI Briefing 인용 가능성 ↑

#### 9.4.6 지식iN 키워드·phrasing 채굴

지식iN은 한국 사용자가 실제로 쓰는 **자연 질문 phrasing**의 1차 소스다.

**룰**:
- `/blog`의 keywords·write 단계(`blog/keywords.md`·`blog/write.md`) Phase 1에서 메인 키워드 + "지식iN" 또는 `site:kin.naver.com`으로 Google 검색해 상위 5-10개 질문 확인.
- 실제 사용자 phrasing을 H2 의문형 또는 FAQ 질문으로 직접 채택.
- 답변 본문에는 광고·홍보성 표현 회피하고 §9.3.2 self-contained chunk 룰 적용.

**금지**: 지식iN 답변 본문 표절 금지. 질문 phrasing(헤딩 패턴)만 참고하고 답변은 자체 작성·1차 출처 기반.

---

### 9.5 점수 기준 (audit·평가용)

각 영역 0-100점, 가중 평균 = 종합 점수.

| 영역 | 가중치 | 만점 기준 |
|---|---|---|
| 구조 (제목·헤딩·길이) | 20% | 일반 글: H1 길이 적정, H2 4-7개, 1500-3000자. **listicle 예외 §9.1.4 적용** |
| E-E-A-T | 20% | 출처 링크 3+, 작성자 명시, 수치 인용. **1차/2차 출처 라벨 명시 시 가산** |
| 키워드 최적화 | 15% | 메인키워드 H1·도입·결론 위치, 밀도 1-2%. **거래/상업 의도 키워드 매칭 가산 (§9.0)** |
| AEO 적합도 | 15% | 직답 단락 존재, FAQ 5+, 스키마 마크업 |
| GEO 적합도 | 15% | 정의 단락, 리스트/표, 1차 출처 |
| 미디어 | 10% | 대표이미지, 본문 2+, alt 모두 채움 |
| 메타 데이터 | 5% | slug, excerpt 120-155자, 카테고리/태그 |

**종합 점수 기준 (snshelp는 100점 통과 정책)**:
- **100**: 발행 가능 ✅
- **95-99**: 가벼운 보강 권장 (1회 보강 시도 후 발행 가능)
- **80-94**: 보강 권장. **Codex 세컨드 오피니언 자동 호출**
- **80 미만**: 재작성 ❌

#### 9.5.1 가산·감점 룰

각 영역 0-100 채점 후, 아래 조건 충족 여부로 영역 점수에 가산·감점을 적용한다.

**가산 룰 (E-E-A-T)**
- 출처에 "**1차 출처**" / "**2차 분석**" 라벨 명시: **+5**
- Article + BreadcrumbList + Organization + Person 스키마 풀세트: **+3**
- Author entity 정보: 저자 페이지 또는 외부 권위 링크 1+: **+3**

**가산 룰 (키워드 최적화)**
- 메인 키워드가 거래/상업 의도 (§9.0): **+5**
- snshelp 서비스 페이지 내부 링크 1개 이상 (§9.0, §9.1.5): **+3**
- Single-intent per URL: 단일 의도 유지 (§9.0): **+2**

**가산 룰 (구조)**
- 핵심 요약 블록(TL;DR) 존재 — bullet 5±2개(3-7), 각 70~140자 (정본 §1.9): **+3**. **글자수 미달·초과는 minor(−2 이내)**, hard gate(−15)는 TL;DR 자체 누락·5단계 순서 위반에만 적용 (기존 발행 글 대량 감점 방지)
- Anchor 다양성 준수 — exact ≤10%, generic 0% (§9.1.5): **+2**
- 사용자 시나리오 H2 1개 이상 — JTBD 매핑 (§9.1.4 4번): **+2**

**가산 룰 (E-E-A-T: 사용자 가치)**
- 사용자 페인·실패 사례 인용 1개 이상 — 커뮤니티/지식iN/후기 출처 표기: **+3**
- 주의사항 H2가 긍정적 프레임("주의할 점 / 시작 조건 / 체크리스트 / 맞지 않는 경우")으로 단독 존재 — Trust 신호 (§9.1.4 5번): **+2**

**가산 룰 (AEO)**
- Front-loading: 직답·핵심 수치가 글 상단 30% 안 (§9.1.4, §9.2.1): **+3**
- FAQPage JSON-LD + 본문 Q&A 1:1 mirror (§9.2.4): **+3**
- PAA recursive H3 적용 — 질문형 H2 아래 H3 0-2개, 각 100자+ (§9.2.2): **+2**
- Answer Capsule (H1·H2 직후 50-80자 정의 블록, §9.2.3): **+3**

**가산 룰 (GEO)**
- 본문 직접 인용문 블록 — blockquote 또는 `>` 1개+ (§9.3.1): **+3**
- TL;DR 블록 존재 — LLM 인용률 상승 (§9.1.4): **+3**
- Image alt + caption 하이브리드 — 본문 차트·데이터·스크린샷 (§9.3.7): **+2**
- Listicle 'Top N + 순위' 형식 + 분기 갱신 (§9.3.5): **+3**

**감점 룰 (키워드 최적화)**
- 단일 의도 위반 — 본문 곳곳 거래 CTA 도배 (§9.0): **-5**
- 정보형 글인데 결론에 거래 전환 다리·CTA 없음 (§9.0): **-5**
- 거래형과 정보형이 동일 페이지 혼재 (§9.0.1): **-5**

**감점 룰 (사용자 가치)**
- 거래·상업 의도 글인데 주의사항·조건 H2 누락 (§9.1.4 5번): **-5**
- 제목·TL;DR·대표이미지·첫 H2 중 2곳 이상에서 "한계", "함정", "실패", "자동 수익 아님" 같은 부정 프레이밍을 전면 반복: **-5**
- Phase 1-D 사용자 페인 조사 없이 본문 작성: **-3**

**감점 룰 (AEO)**
- Front-loading 미달 — 핵심 결론이 글 하단에만 위치: **-3**
- PAA H3 thin content — 각 H3 본문 100자 미만: **-3**
- Answer Capsule 누락 — H1 또는 H2 직후 50-80자 정의 블록 없음 (§9.2.3): **-5**

**감점 룰 (E-E-A-T)**
- 외부 기고·sponsored 콘텐츠 (§9.7): **-20 (발행 차단)**
- 연도·날짜만 갱신, 본문 미변경 (§9.6): **-10**

**감점 룰 (구조)**
- generic 앵커 사용 — "자세히 보기" 등 (§9.1.5): **-2/회**
- 카테고리/서비스 페이지 템플릿 반복 — 자사 데이터·사례 없음 (§9.0.3): **-10**

**감점 룰 (전체)**
- llms.txt 효과 기대 — §4.2 기대치 정확화 위반: **-1**

---

### 9.6 콘텐츠 갱신 룰 (날짜 인위 갱신 금지)

Google은 "가짜 freshness" 패턴을 감지·페널티한다. 실제 변경 없이 발행일·제목 연도만 갱신하면 신뢰도 신호 감소 + recency-sensitive 쿼리에서 demotion.

#### 9.6.1 갱신 분류
| 변경 규모 | `date` (발행일) | `modified` (수정일) | 제목 연도 |
|---|---|---|---|
| 오타·링크 수정·이미지 교체 | 변경 X | 변경 O | 변경 X |
| H2 1-2개 보강·수치 갱신 | 변경 X | 변경 O | 제목에 연도 있으면 본문 갱신과 함께 변경 가능 |
| 본문 50% 이상 재작성·핵심 데이터 전면 갱신 | 변경 O (재발행) | 변경 O | 변경 O |

#### 9.6.2 금지
- 제목·H1 연도만 바꾸고 본문은 그대로 두는 패턴
- 본문 미변경 상태에서 `date` 필드만 미래로 미는 패턴
- "최신" / "OOOO년 최신" 같은 표현을 사용해놓고 실제 데이터가 1년 이상 묵은 경우

#### 9.6.3 권장
- 정량 데이터는 연 1회 이상 1차 출처 재확인 후 `modified` 갱신
- 큰 갱신 시 본문 끝에 "Update Log" 단락 두기
- 제목 연도 박지 말고 본문 도입부 "{현재 연도} 기준 데이터로 작성됨" 식으로 컨텍스트 제공

---

### 9.7 배포 시스템 동작 (블로그 글 전용)

snshelp 블로그는 **WordPress 컨텐츠 + Astro SSG 사이트**로 분리. 발행 흐름을 헷갈리면 "WP에는 글 있는데 helpsns.com에는 404" 상태.

| 작업 | 영향 받는 시스템 | 비고 |
|---|---|---|
| `node script/wp-pull.mjs` | 로컬 `wp-content/posts/*.md` | WP → 로컬 동기화 |
| `node script/wp-push.mjs <id>` | **WordPress origin만** | helpsns.com에는 영향 0 |
| `git push` (master) | Amplify 자동 빌드 → **helpsns.com 갱신** | WP에서 받아 SSG 빌드, 5~10분 |

**발행 후 production 반영 절차** (필수):
1. 로컬 `wp-content/posts/{id}.md` 수정
2. `node script/wp-push.mjs <id>` → WP 반영
3. `git add wp-content/posts/{id}.md && git commit && git push` → Amplify 빌드 → helpsns.com 반영

**WP에서만 publish하고 git push 안 하면 helpsns.com에는 안 보인다.** 정적 사이트는 빌드 시점 데이터로 고정.

코드 변경이 없는 콘텐츠 갱신도 반드시 git commit + push (빈 커밋 `--allow-empty`도 가능).

---

### 9.8 블로그 글 금지 사항

- **AI 표 표현 ("결론적으로", "마치며", "본격적으로")**: LLM 흔적, AEO 감점
- **물타기 단락**: 의미 없는 일반론 ("현대 사회는~" 등)
- **메타 디스크립션 키워드 도배**
- **이미지 alt에 키워드만 반복**
- **거짓 통계**: 출처 없는 수치 금지
- **타사 브랜드 부정적 직접 언급**: 비교 시 객관 사실만
- **광고성 표현 ("최고", "유일한", "100% 보장")**: 신뢰 감점
- **외부 작성자 게스트·sponsored 콘텐츠 호스팅 금지** (Google Site Reputation Abuse 정책):
  - helpsns.com 도메인에 외부 업체·필자 sponsored 글, 게스트 포스트, 제휴 디렉토리 호스팅 금지
  - 외부 기고를 받더라도 내부 직원이 편집·검수·발행 책임을 지고, 본인 페이지의 토픽 권위 범위 안에서만 게재
- **본문 곳곳에 거래 CTA 도배**: §9.0 절제 모드 위반
- **llms.txt 효과 인용 금지** (효과 없음): 효과를 신규 작업 정당화 사유로 인용 금지. §4.2 기대치 정확화 룰을 따른다 (저비용 보험 + 개발자 도구 fetch 효율 목적만 허용).
- **날짜 인위 갱신**: §9.6 위반

---

## 10. CWV·기타 2026 변경 (블로그 + 비-블로그 공통)

§4.8 Core Web Vitals 보강 — 2026 기준 강화 임계.

### 10.1 LCP 2.0초 임계 (2026 강화)

Google 2026 정본 LCP 임계는 **2.0초**. 2.0-2.5초 구간은 "Needs Improvement", > 2.5s는 "Poor". audit 영역 가산 산정 시 본 임계 적용.

- **임계값**: LCP ≤ **2.0s** (Good), 2.0-2.5s (Needs Improvement), > 2.5s (Poor)
- 모바일 p75 기준
- 게이트 위임은 §4.8과 동일: `/audit build` + `/audit site --lighthouse`
- **본문 인포그래픽 1200×N DPR2 webp (= 실제 2400×2N 픽셀, asset-images §4.10.4 정본) 운영 시 LCP 회귀 검증 의무**. hero 또는 본문 첫 인포그래픽이 LCP element이므로 폭 확장이 직접적인 영향. 본문 인포그래픽 폭·해상도 정책을 갱신할 때마다 `/audit site --lighthouse` 1회 호출로 LCP ≤ 2.0s 통과 확인.

### 10.2 INP 200ms 정밀화

§4.8 INP 200ms 룰 유지 + 모니터링 강화. 2026 사이트 43%가 실패하는 가장 까다로운 메트릭.

- **antd 컴포넌트 interaction 모니터링**: dropdown·modal·tooltip 같은 antd 위젯의 click·hover 응답 latency 측정.
- **차트 컴포넌트 interaction**: echarts 차트의 tooltip·zoom 응답 측정. 큰 데이터셋(10K+ 포인트)에서 INP 200ms 초과 위험.
- 측정·게이트 위임은 §4.8 (`/audit build` + `/audit site --lighthouse`).
