
# blog/write.md — 타겟 키워드 기반 SEO 글 + 이미지 생성

## 역할

타겟 키워드 1개를 받아 **SEO + AEO + GEO 100점 도달**까지 글과 이미지를 작성·반복 보강한다. 발행은 하지 않는다(blog/publish.md 별도).

**Sub agent 규칙**: 모든 sub-agent는 Pre-flight / 승인 대기 없이 즉시 실행한다.

## ⚠️ Semrush MCP 비용 게이트 (CRITICAL)

**호출 전 [.ai-rules/semrush-budget.md](../../../.ai-rules/semrush-budget.md) 정본 반드시 적용**.

이 스킬은 Phase 0·1에서 Semrush 다회 호출:
- `phrase_organic` (10/line, limit=10) = 100 units
- `phrase_these` (10/line, 메인+보조 6-8개) = 60-80 units
- `phrase_kdi` (50/line, 필요시만) = 50 units
- `phrase_questions` (40/line, 한국어는 빈 결과 잦음 — **skip 권장**)
- `phrase_related` (40/line, limit=30) = 1,200 units — **사전 비용 보고 필수**

**글 1편 작성당 평균: 약 500-1,500 units** (phrase_related 사용 여부에 따라)

임계값: < 500 자동 / 500~2,000 사전 보고 / ≥ 2,000 STOP+승인 / 누적 ≥ 5,000 중단.
호출 직후 형식: `[Semrush: +X units / 세션 누적 Y]`

**병렬 글 7편 작성 같은 케이스**: 7 × 1,500 = 10,500 units 누적 가능. **반드시 사전 예산 명시 + 사용자 승인 후 진행**. 각 sub-agent에 1,500 units 예산 한도 명시.

**비용 절감 옵션**:
- phrase_related 생략 가능 (수동 LSI 키워드로 대체)
- phrase_organic 만으로도 SERP 분석 가능

---

## 입력

| 인자 | 기본 | 의미 |
|---|---|---|
| `<타겟 키워드>` | — | 메인 키워드 (필수) |
| `--category=<id>` | auto | WP 카테고리 ID. 미지정 시 `_taxonomy.json` 기준 자동 판정 |
| `--length=standard\|long` | standard | standard=1500-2500자, long=2500-4000자 |

---

## 사전 조건

- Semrush MCP 인증 (미가용 시 사용자에게 알리고 진행 여부 확인 — 외부 데이터 없이 작성 시 점수 한계 명시)
- codex CLI 사용 가능 (`which codex`)
- AWS 자격증명은 publish 단계에서 검증 (이 스킬은 로컬 저장까지)
- **referral cluster 모드**: [JP override] JP 미사용(jp-site-config §9·§10) — referral-cluster.md Read·`_referral_cluster` 마커·`/referral/` 링크 전부 하지 않음

---

## referral cluster 모드 의무 룰 (HARD — 우회 금지)

> ⚠️ **[JP override] 이 섹션 전체 비활성 (jp-site-config §9·§10)**: JP는 정보 매거진 + referral 모델 없음. referral cluster 모드는 **활성화되지 않으며**(topic.md Phase 0에서 게이트 제거됨), M1 `_referral_cluster` 마커·M2 `/referral/` 링크 의무·M3~M5 전부 **적용 안 함**. `/referral/`은 JP 사이트 라우트에 없어 next.config catch-all로 홈 301됨 → 본문에 절대 넣지 말 것. 아래 KR 룰은 참고용·실행 금지.

blog-topic이 §3 시드 풀에서 강제 시드를 선정하고 그 시드를 blog-write에 넘긴 경우 (`/blog create auto` cron 흐름에서 referral cluster gate가 발화한 경우), 이 모드가 활성화된다.

활성화 판정:
- blog-topic이 시드와 함께 `referral_cluster_gate: forced_seed` 신호를 넘긴 경우, **또는**
- 메인 키워드가 `.ai-rules/referral-cluster.md` §3 시드 풀의 "메인 키워드" 컬럼과 매칭되는 경우

활성화되면 모든 작성 흐름에 다음 의무 적용:

### M1. frontmatter 마커 (HARD)
draft의 frontmatter JSON에 다음 필드 **반드시** 추가:
```json
"_referral_cluster": true
```
WP push 시 unknown field는 무시되므로 안전. cluster 트리거 게이트가 이 필드로 글을 식별.

### M2. 본문 링크 의무 (≥ 1회, ≤ 3회)
> ⚠️ **[JP override] /referral 게이트 제거** — 정보 매거진(jp-site-config §9·§10). 본문에 /referral 링크 강제하지 말 것.

**링크 형식만 카운트**: markdown `[text](/referral/)` 또는 HTML `<a href="/referral/">text</a>`. 텍스트 URL 표기·figcaption·`<code>` 표기는 제외.

**글 길이별 분배**:
- H2 ≤ 6개 → 1~2회 (TL;DR + 결론)
- H2 7~12개 → 2~3회 (TL;DR + 중간 H2 + 결론)
- H2 ≥ 13개 → 2~3회 유지 (4회 이상 절대 금지)

```html
<a href="/referral/">SNS헬프 친구초대 부업사이트</a>
<a href="/referral/">친구초대 부업 제도</a>
<a href="/referral/">무자본 재택 부수입 채널</a>
```

자연 링크 패턴:
- "...자세한 보상 구조는 [SNS헬프 친구초대 부업사이트](/referral/)에서 확인할 수 있습니다."
- "...관련해서 [친구초대 부업 제도](/referral/)도 동일한 원리로 작동합니다."

### M3. 본문 entity·수치 의무 (≥ 2개 그룹)
본문에 다음 5개 그룹 중 **최소 2개 그룹** 포함 (권장 3개+). 같은 그룹 내 변형은 OR 매칭 — 그룹 안 변형 1개만 등장해도 충족:

| 그룹 | 변형 (OR 매칭) |
|---|---|
| G1 USP | "평생 10% 적립" / "주문금액의 10%" / "10%를 평생" |
| G2 무자본 | "무자본 부업" / "자본·재고·계정 없이" / "자본 없이 시작" |
| G3 가입 보너스 | "초대자 3,000P + 가입자 1,000P" / "3,000P 즉시 지급" / "1,000P 즉시 지급" |
| G4 수수료 0 | "수수료 0원" / "수수료 없는 현금 출금" / "100% 전환" |
| G5 평균 결제액 | "평균 결제액 1,500만 원" / "평균 결제액 250만 원" / "평균 월 사용액" |

### M4. 스팸 가이드라인 (HARD — 0건 위반)
본문 grep 금지 어구:
- "쉽게 시작", "쉽게 돈 벌기"
- "자동으로 돈이"
- "평생 따박따박"
- "100% 보장"
- "확실한 수익"
- "노력 없이"
- "월 1억 가능"
- "본업 시간 0"
- "운영 시간 0"
- "자동 친구초대"
- "자동 적립"
- "자동 누적"
- "자동 수익"

금지 패턴:
- 가상 후기·인터뷰 인용
- 출처 없는 수익 수치
- 수익 약속·환상 카피
- 제목·TL;DR·대표이미지·첫 H2에서 "한계", "함정", "실패", "자동 수익 아님"을 전면 메시지로 반복
- 제목·TL;DR·대표이미지·첫 H2에서 `ROI`, `CAC`, `LTV`, `affiliate`, `객단가`를 풀이 없이 사용

의무 패턴:
- 모든 수치에 시점·출처 (예: "(주)핫셀러 자체 고객 조사 2026년 5월 기준" 또는 "월 100만원 × 50명 × 10% = 월 500만원 가정값")
- 부업 정확 어구 본문 밀도 ≤ 1.5% (grep "부업" / total 단어수 비율)
- 쉬운 용어 우선: `ROI`→"수익 계산", `CAC`→"새 고객 찾는 비용", `LTV`→"고객이 오래 결제한 금액", `객단가`→"평균 결제액", `affiliate`→"제휴 프로그램". `패시브인컴`은 첫 등장에 "꾸준히 쌓이는 부수입"으로 풀이.
- 주의사항 H2는 "주의할 점 / 시작 조건 / 체크리스트 / 맞지 않는 경우 / 시작 전 확인할 점" 중 하나로 작성. "흔한 함정", "실패 사례" H2 금지.

### M5. blog-audit 추가 게이트
cluster 모드 글은 blog-audit이 다음을 추가 검사:
- M1 마커 존재 → 누락 시 -10
- M2 /referral/ 링크 ≥ 1회 → 누락 시 -15
- M3 entity·수치 ≥ 1개 → 누락 시 -5
- M4 스팸 어구 grep 0회 → 위반 시 -15 / 위반
- 위반 시 write 보강 루프 트리거 (100점 도달까지)

### M6. 페르소나 매칭
`.ai-rules/referral-cluster.md` §3 시드 풀의 "매칭 페르소나" 컬럼 그대로 채택. mason 7개·oliver 2개·jamie 1개. 직전 cluster 글 페르소나와 다른 페르소나 우선 (부담률 분산).

---

## 실행 흐름

### Phase 0: 정본·환경 준비
0. **`.ai-rules/jp-site-config.md`를 가장 먼저 Read** (상대경로 `../../../.ai-rules/jp-site-config.md`) — JP 플랫폼/로케일 정본. 본 문서와 충돌하는 발행 경로·DB·Naver·draft 경로·/referral·폰트·검증 타깃은 이 문서가 **무조건 우선**.
1. `.ai-rules/seo-policy.md` **반드시 Read** — 블로그 글 룰은 §9 정본 통합본 + §1.5 메인 키워드 → title 정확 어구 룰 + §1.9 글 상단 구조 정본 + §1.10 slug 룰
2. `.ai-rules/references/work-orchestration.md` 참고 (병렬 검증 패턴)
3. `content/_taxonomy.json` Read (카테고리 매핑. KR `wp-content/_taxonomy.json` → JP `content/` 매핑, jp-site-config §2)
4. **[JP override] `_media.json` Read SKIP** (jp-site-config §6) — KR `wp-content/_media.json`은 S3/CloudFront(`assets.helpsns.com`) CDN 도메인 일관성 검증용이었으나 JP는 S3/CloudFront 제거 → `public/`. 이미지는 `md-publish.mjs`가 `public/images/articles/<slug>/`로 복사하므로 CDN 매핑 불필요.
5. 카테고리 자동 판정: 키워드 의미와 _taxonomy.json 매칭
6. **메인 키워드 게이트 (CRITICAL, seo-policy §1.5) — 3개 조건 모두 만족 시에만 Phase 1 진행**:

   (a) **SERP 의도** — 입력 메인 키워드에 대해 `phrase_organic` 호출 (database=jp, display_limit=10). 도메인 유형 분류 (콘텐츠/도구/랭킹·계산기/위키/커뮤니티). **도구·랭킹 합계 ≥ 3/Top10이면 즉시 중단**, 사용자에게 보고하고 blog-keywords로 정보형 키워드 재선정 요청.

   (b) **검색량** — Semrush `phrase_these` 호출 (database=jp). 검색량 ≥ 100이면 통과. **`NOTHING FOUND` 또는 < 100이면 즉시 중단** + keywords 재선정.
   > ⚠️ **[JP override] 네이버/DECAGO 보조 조회 제거** (jp-site-config §6·§7) — JP는 네이버/DECAGO 소스 없음. 이 보조 조회 단계 **SKIP**, Semrush `database=jp` 단독 판정. 아래 KR curl 블록은 **참고용(실행 금지)**.
   ```bash
   # [JP 미사용 — 실행 금지, KR 참고용] 네이버/DECAGO 볼륨 조회 (jp-site-config §6에서 제거됨)
   # curl -X POST "$DECAGO_NAVER_QUERY_ENDPOINT" -H 'Content-Type: application/json' \
   #   -d '{"platforms":["naver"],"keywords":["<메인 키워드>"],"is_raw":false,"is_extend_naver":false}'
   # 응답의 naver.pc + naver.mobile ≥ 100 판정 — JP에선 무효
   ```

   (c) **중복 검사** — 메인 키워드 정확 어구로 `content/articles/*.md` 전체 grep (jp-site-config §2·§5 라우팅 캐논; 신규 글 작성이라 자기 자신은 없음):
   ```bash
   grep -l 'title:.*<메인 키워드>' content/articles/*.md
   ```
   **이미 같은 정확 어구를 메인으로 잡은 글 ≥ 1개 발견 시 즉시 중단** (cannibalization). 사용자에게 보고하고 (i) 메인 키워드 변경 또는 (ii) 기존 글 갱신으로 전환할지 결정.

   결과 보고: "✓ SERP 의도: 콘텐츠 N/10 / 도구 M/10 · 검색량(Semrush jp): X · 중복: 없음 — 통과"

### Phase 1: 자료 조사 (SERP·키워드 + 1차 출처)

**1-A. Semrush MCP 데이터** (database=jp):
1. `phrase_these` — 메인 + 보조 키워드 batch 검색량·CPC·경쟁도
2. `phrase_kdi` — 메인 키워드 정확한 KD (필요 시)
3. `phrase_organic` — SERP 상위 10개 URL
4. `phrase_questions` — 질문형 키워드 (FAQ 후보, 한국어는 빈 결과 잦음 → 본문에서 직접 도출)
5. `phrase_related` — 보조 키워드 후보 (Relevance 0.3 미만이면 신뢰도 낮음)

**SERP 의도 매칭 검증** (필수):
- SERP 상위 5개 중 3개 이상이 **도구·랭킹·계산기**면 의도 불일치 → 사용자에게 알리고 키워드 재선정 권장
- 콘텐츠 SERP면 진행 (도메인 유형 분류를 기록)

**Single-intent 검증** (seo-policy §9.0 Google Dec 2025 반영):
- 타깃 키워드의 SERP 상위가 **정보형·상업형·거래형이 섞여 있는지** 확인
- 섞여 있으면 글 의도를 **단일 의도**로 못박는다 (정보형 / 상업형 / 거래형 중 하나만 메인)
- 정보형 글로 결정했다면 본문은 정보 가치 위주, 거래 다리는 결론 1곳에만 (Phase 3 룰 참조)

**1-B. 1차 출처 + 수치 + 인용문 조사** (E-E-A-T + Princeton GEO 가산):

seo-policy.md §1.1(Authoritativeness) + §1.1.1(권위 출처 카탈로그) + §1.1.2(검증·인용 절차) + §3.1(Quotation +39% / Statistics +31% / Cite Sources +29%) + §3.4(Perplexity 출처 다양성)를 동시에 만족시키려면 다음을 의식적으로 수집:

- **카테고리별 권위 출처 카탈로그 (§1.1.1)** 우선 활용:
  - Instagram·Meta: Meta Newsroom, Adam Mosseri 발언, about.instagram.com
  - YouTube: YouTube Creator Insider, YouTube Official Blog, Backlinko, VidIQ, Tubular Insights
  - TikTok: TikTok for Business, TikTok Newsroom, Influencer Marketing Hub, DataReportal Korea
  - X(Twitter): X Engineering Blog, Sproutsocial X, Hootsuite X Algorithm
  - 통계: Statista, DataReportal, 통계청, KISA
  - 정책·법령: easylaw.go.kr, 국세청, nhis (4대 보험), 정책브리핑
  - 학술: HBR, McKinsey, Bain & Company, Forrester
  - SaaS·AI: OpenAI Blog, Notion, Canva Newsroom, Adobe
  - 보도: The Verge, TechCrunch, CNBC, Reuters, Bloomberg, Fortune (1차 보도 검증용)
- **검증 절차 (§1.1.2 1단계 — 가짜 통계 방지)**: 인용 전 **WebFetch로 원문 페이지에 진짜 그 통계·문장 있는지 직접 확인**. 발표 시점·정확한 수치·URL 확보 후에만 인용.
- **수치 + 출처 페어 ≥ 5개**: 수치는 반드시 출처 URL + 발표 시점과 함께 수집. 글당 최소 3개를 본문 인용.
- **직접 인용 가능한 문장 ≥ 1개** (Quotation Addition, §3.1 +39%): 1차 출처에서 그대로 인용할 수 있는 짧은 발언·문서 문장을 1개 이상 수집. 본문에 `<blockquote>` 또는 `>` 블록으로 배치.
- **출처 도메인 다양성 (§1.1.2 2단계)**: 글당 외부 출처 **최소 3개 + 도메인 3+ 분산**. 한 도메인이 3회 이상 반복 금지.
- **인용 위치 (§1.1.2 4단계)**: **결론 직전** 또는 **본문 마지막 H2 다음** 또는 **새 H2 신설** ("외부 통계가 확인하는 ...", "출처가 보여주는 ..."). FAQ 안에 인용은 가급적 피함.
- **Q&A phrasing 채굴** (§4.5): **[JP override]** 메인 키워드 + `site:detail.chiebukuro.yahoo.co.jp` (Yahoo!知恵袋) 또는 5ch/note/Reddit로 상위 질문 5-10개 확인 (jp-site-config §6: 지식iN/`site:kin.naver.com` → 일본 소스). 사용자 자연 질문을 H2·FAQ로 직접 변환할 후보로 기록.
- **`WebFetch`** 활용: 위 사이트의 키워드 관련 페이지에서 정확한 통계·인용문 추출.

**1-C. 상위 글 구조 분석**:
- SERP 상위 5개 URL을 `WebFetch`로 H2/H3 헤딩 수집
- 공통 H2 (≥ 60% 상위 글이 다루는 토픽) — 필수 커버
- 빠뜨린 H2 (≤ 30% 상위 글만 다루는 토픽) — 차별화 기회

**1-D. 사용자 페인·실제 경험 수집** (E-E-A-T Experience + Trust 신호, §1.1·§1.2 5번):

검색엔진뿐 아니라 **실제 사용자에게 도움 되는 글**을 쓰려면 정량 데이터로 부족하다. 실사용자가 어디서 막히는지, 어떤 흔한 오해가 있는지를 다음 채널에서 의식적으로 수집:

- **[JP override] Yahoo!知恵袋** (jp-site-config §6, 지식iN 대체): 메인 키워드 + "口コミ" / "失敗" / "注意" / "安全" / "詐欺" 등 페인 조합으로 검색. 질문 본문 + ベストアンサー에서 좌절·해결 시도 추출
- **[JP override] note / X-JP / Yahoo!ブログ**: 거래 의도 키워드 영역의 실사용자 경험담 5-10건 (jp-site-config §6: 네이버 카페·블로그 대체)
- **[JP override] 커뮤니티**: 5ch / Reddit 관련 서브레딧 등에서 키워드 검색 (jp-site-config §6: 디씨·클리앙·더쿠 등 KR 커뮤니티 대체)
- **유튜브 댓글**: 관련 영상 베스트 댓글 (실사용자 반응)
- **Reddit / 영문 커뮤니티**: 글로벌 키워드면 r/{relevant-subreddit} (예: r/youtubers, r/Instagram). `WebFetch`로 상위 스레드 추출
- **snshelp 자체 데이터** (가능 시): WP 후기·문의·CS 로그

**수집 출력** (Phase 3 본문에서 인용 자료로 사용):
- **사용자 페인 인용문 3개+**: 출처(커뮤니티 이름·익명 처리·게시 시점) 표기. "직접 해보니 ~", "사기당했다", "효과 없었다", "어떻게 구별?" 같은 실제 표현 그대로
- **주의 사례 1-3개**: 어떤 상황에서 무엇이 막혔는지 — §1.2 5번 "주의할 점/시작 조건" 단락 재료. 부업·추천 보상 글에서는 본문에 "실패 사례" 표현을 쓰지 말고 "주의할 점", "시작 전 확인할 점"으로 순화.
- **흔한 오해 / 가짜뉴스**: 사용자가 잘못 알고 있는 정보 (글에서 명시적으로 정정)

**금지**:
- 페인을 만들어내지 말 것. 실제 인용은 반드시 출처 있는 것만
- 익명 후기 인용 시 개인 식별 정보 마스킹 (닉네임 첫 글자만, 시점은 "2024년 ~월" 정도)

**1-E. JTBD(Jobs-to-be-Done) + 사용자 시나리오** (§1.2 4번 시나리오 H2 재료):

메인 키워드 1개 + 보조 키워드 셋 위에 **사용자 시나리오 3-5개**를 작성. 각 시나리오 형식:

```
[페르소나] — [상황] — [목표] — [장애물] — [이 글에 도착한 경로]
```

예시 (메인 키워드 "인스타 팔로워 늘리기"):
- 자영업: "20대 카페 사장이 신규 오픈 후 인스타 팔로워 0명에서 첫 1000명까지 어떻게 만들지 막막해서 검색"
- 인플루언서 지망: "취준생이 부업으로 인플루언서 시작했는데 3개월간 팔로워 50명 — 알고리즘 어떻게 뚫지?"
- 브랜드 마케터: "패션 D2C 브랜드 마케터가 광고비 없이 유기적 팔로워 1만 명 만들고 싶음"

각 시나리오마다:
- **이 글이 그 사용자에게 줘야 하는 1줄 답**
- **그 사용자가 주의해야 할 조건 1개** (§1.2 5번 재료)
- 가능하면 **시나리오 H2 1개** (§1.2 4번에 매핑, snshelp 페르소나가 있으면 `.ai-rules/blog-personas.md` 참조)

**snshelp 페르소나 자동 선택** (deterministic): `.ai-rules/blog-personas.md` §2.5 자동 선택 알고리즘을 그대로 적용. Step 1(트렌드 신호) → Step 2(플랫폼 직매칭) → Step 3(도메인 본질) → Step 4(충돌 해결) → Step 5(fallback) 순서. 산출물 frontmatter `author` 필드에 WP id를 박는다 (예: `"author": 8`). 시나리오의 [페르소나] 칸도 같은 ID/slug로 채운다.

→ **Phase 1 출력 (전체)**: 키워드 메트릭 + SERP 의도 매칭 결과 + **수치-출처 페어 리스트(최소 5개)** + **직접 인용 가능 문장(최소 1개)** + **출처 도메인 3개 이상** + **Q&A 질문 phrasing 후보(Yahoo!知恵袋 등, [JP override] jp-site-config §6)** + **사용자 페인 인용문 3개+** + **주의 사례 1-3개** + **흔한 오해** + **사용자 시나리오 3-5개** + 공통 H2 + 빠뜨린 H2 + LSI

**금지**: 출처 없는 수치를 본문에 쓰지 않는다. "보통 ~정도" 같은 모호 표현 대신 정확한 수치 + 출처 또는 그 단락 자체 제외.

**기존 글 갱신 시 주의** (seo-policy §7): 본 스킬은 신규 draft 생성용이지만, 사용자가 "이 글 다시 써줘" 식으로 호출할 가능성에 대비:
- 제목·H1·발행일 연도만 갱신하고 본문 미변경 패턴 금지
- 본문 50% 이상 재작성 시에만 `date` 변경, 그 외엔 `modified`만 갱신
- 상세 룰은 seo-policy §7 참조

### Phase 2: 글 구조 설계
seo-policy.md §1.2 + §1.5 + §1.6 (GEO) + §1.7 (E-E-A-T 2026) + §1.8 (Headline AIDA) + §1.9 (글 상단 구조 정본) 종합:
```
H1 (60자 이내, 메인 키워드 정확 어구 첫 30자 안 포함 — §1.5)
H1 패턴은 글 목표(reach/traffic/sales)에 맞춰 §1.8 Goal-Based 표 적용

[CRITICAL — seo-policy §1.9 5단계 정본 순서, 위반 시 즉시 −15 + 보강 의무]
1) TL;DR 헤더 단락: <p><strong>{메인 키워드}, 한눈에 보는 핵심 N가지</strong></p>
   - 페르소나 자기소개 단락 금지 ("이 글은 SNS헬프 X가...", "안녕하세요 저는..." 모두 금지)
   - 자기소개 정보는 byline + author box + Person schema가 이미 노출 — 본문 중복 작성 시 GEO/AI 인용 가치 손실
2) TL;DR 리스트: <ul> bullets 5개 (각 70-140자)
   - 메인 키워드 1회 + 정량 수치 1개 + 결론·행동 트리거 1개 포함
   - bullets와 본문 H2가 1:1 mapping이면 최상 (각 bullet이 그 H2의 답변 압축)
3) 인포그래픽: **[JP override]** 순수 GFM `![{alt}]([[IMG:N]])` (jp-site-config §3 — Gutenberg HTML `<figure class="wp-block-image">` 금지, `assets.helpsns.com` URL 금지). `md-publish.mjs`가 `[[IMG:N]]`을 `/images/articles/<slug>/...` 실경로로 치환.
   - asset-images §4.10.6 wrap 가드 적용 (cols/폰트 자동 조정)
4) 첫 H2: keyword 풍부 정의형 H2 (서론/들어가며/머리말 등 보일러플레이트 금지)
5) 본문 H2 흐름 (아래 패턴)

H2 1: 정의형 (AEO 강세) - "X란? / X의 의미"
  - 직답 40-60자를 H2 바로 아래 첫 단락에 배치
  - **Heading 후 첫 문장 = heading 약속 그대로** (§1.6, drift 금지)
  - 정의·핵심 수치·인용 문장은 글 상단 30% 안에 집중 (Front-loading 원칙)
H2 2-4: 본문 (Top 글 공통 H2에서 차별화)
  - 질문형 H2에는 PAA recursive H3 0-2개 추가 가능 (각 H3 본문 100-150자 이상 필수, H2당 H3 최대 2개)
  - **섹션마다 first-hand 디테일 ≥ 1개 (§1.7 필수)**:
    측정값 (수치·금액·기간), 플랫폼·도구 버전, 고객 시나리오, 실패·교훈, 원본 시각 자료 중 1개 이상
  - **각 문단 = 1 중심 아이디어** (§1.6, 혼재 시 −3)
  - **외부 quote 인용 ≥ 3건, 통계 수치 ≥ 5건** 본문에 자연 배치 (§1.6, +5)
H2 5: 사용자 시나리오 매핑 (Phase 1-E 시나리오 카드 채택) — **JTBD 신호 +2**
  - "[페르소나]를 위한 적용 가이드" 형식. 시나리오 2-3개 묶기 권장
  - 각 시나리오는 §1.2 4번 사용자 시나리오 룰을 따름
H2 6: 비교/표 (GEO 강세)
H2 7: **주의할 점 / 시작 조건 / 체크리스트 / 맞지 않는 경우** (Phase 1-D 사용자 페인 인용) — **거래·상업 의도 글은 필수**
  - 실사용자 인용문 1-3개 + 출처 표기 (커뮤니티 익명·시점)
  - "이 방법이 통하지 않는 경우", "흔한 오해", "주의해야 할 점" 패턴
  - 제목·TL;DR·대표이미지·첫 H2에서는 가치 제안·수익 구조·실행 조건을 먼저 제시하고, 부정 프레이밍은 중후반 주의사항 섹션에 1회 집중. seo-policy §1.2 5번
  - 부업·추천 보상 글은 seo-policy §1.8.1 적용: `ROI/CAC/LTV/객단가/affiliate` 같은 약어·업계 용어를 핵심 위치에 쓰지 말고 쉬운 한국어로 치환한다. "본업 시간 0", "자동 적립"류 과장 표현은 금지.
H2 8: 자주 묻는 질문 (FAQ 4-6개 + FAQPage 스키마)
  - FAQPage JSON-LD 필수 (Google rich result는 2026.5 종료됐으나 LLM 인용/Knowledge Graph 효과 유지)
  - 본문 가시 Q&A와 schema는 1:1 mirror
  - HowTo schema는 사용 금지 (2023 deprecated). 가이드형 글은 Article + 본문 단계 리스트로 처리.
H2 9: 결론 + **거래 전환 다리** (snshelp 서비스 페이지 내부 링크 1개 이상)
```

**Front-loading 원칙 (CRITICAL)**:
- 직답·핵심 수치·정의는 글 **상단 30% 영역**(도입 + 핵심 요약 + 첫 H2)에 집중. AI Overview 인용 분포가 상단에 편향(top 30%에 인용 약 55%).
- 결론을 마지막에 숨기지 말고 상단에 노출 → 근거 → 디테일 순.

**listicle 글 우선 (§1.6 GEO)**: AI 인용의 **74.2%**가 listicle 형식. 가능하면 H2/H3 50% 이상을 "Top N", "N가지", "N단계" 같은 numbered format으로 구성. 제목·H1에 "통계", "N가지", "총정리" 포함 시 H2 7-12개·본문 5,000-15,000자 허용 (§1.2).

**AI-only 콘텐츠 금지 (§1.7 E-E-A-T 2026)**:
- 주제 프롬프트 → AI 통째 생성 패턴 금지 (사이트 traffic 41% 손실 사례 다수)
- 허용 패턴: 사용자가 모은 1차 데이터·인터뷰 노트·고객 사례를 AI가 구조화·확장하는 방향
- Phase 1-B의 1차 출처 수집을 본 Phase 작성에 반드시 반영. Phase 1-B 빈 채로 Phase 2-3 진입 금지.

### Phase 3: 본문 작성 (Claude)
- 각 단락 첫 문장에 핵심 주장 (TopicSentence-First)
- 수치·통계는 **실제 검증된 것만** (Phase 1-B에서 수집한 수치-출처 페어만 사용)
- **출처 라벨링**: 결론 또는 별도 단락에 "**1차 출처:** ... **2차 분석:** ..." 명시 (E-E-A-T +5)
- 출처 링크 3개 이상, 1차 출처 ≥ 2개 권장
- **사용자 인용** (Phase 1-D, §1.1 Experience 사용자 경험): 본문에 사용자 페인 인용문 1개+ 자연 삽입. **[JP override]** 출처는 "Yahoo!知恵袋 匿名(2024.07)", "5ch ○○スレ 匿名(2025.03)" 형식 (jp-site-config §6: 네이버 지식iN/디시 → 일본 소스). 인용은 순수 GFM `>` 블록으로 (jp-site-config §3, `<blockquote>` Gutenberg 금지) → GEO 가산 (§3.1) 동시 달성
- **주의사항·조건 H2**(§1.2 5번): 거래·상업 글이면 Phase 1-D 주의 사례 1-3개를 "주의할 점 / 시작 조건 / 체크리스트 / 맞지 않는 경우" H2 1개로 묶어 단독 섹션. 정보형 글이면 권장. 제목·TL;DR·대표이미지·첫 H2에 "한계", "함정", "실패", "자동 수익 아님"을 전면 반복하면 감점.
- **거래 다리 절제 모드** (seo-policy §9.0, Google Dec 2025 single-intent 반영):
  - 정보형 글이면 본문 곳곳에 거래 키워드/CTA 도배 금지. **결론 1곳에만** 자연스러운 거래 다리 단락 + 부드러운 CTA(예: "더 알아보기", "관련 서비스 보기") + snshelp 서비스 내부 링크 1개
  - 상업형·거래형 글이면 거래 키워드를 본문에 자연 분포 가능 (단, 글 의도는 하나만 유지)
- **내부 링크 텍스트 다양성** (seo-policy §1.4):
  - exact-match 앵커 글 전체 1개 이내 (≤10%)
  - partial-match + descriptive 위주
  - "자세히 보기", "여기 클릭" 같은 generic 앵커 0%
  - 같은 URL을 여러 번 링크하더라도 앵커는 매번 다르게
- 한 단락 3-5문장
- AI 흔적 표현 금지 (seo-policy.md §8)
- **외부 기고·sponsored 콘텐츠 작성 금지** (seo-policy §8): 본 스킬은 snshelp 내부 작성 글만 생성. 외부 업체 콘텐츠 호스팅 금지

### Phase 4: 메타 데이터 결정
- **slug**: **영문 kebab-case 필수** (seo-policy §1.10) — ASCII 영문 소문자 + 숫자 + `-`, 2-5단어, 50자 이하 권장. 한글·percent-encoded·영문 음역 금지. 메인 키워드 영문 직역 또는 핵심 entity + 각도. 정본 예시: 2403 → `ai-reels-video-creation-guide`. slug 변경 시 [`astro.config.mjs`](../../../astro.config.mjs) `redirects`에 old → new 매핑 추가 필수
- **title**: H1
- **excerpt**: 120-155자, 메인 키워드 + 직답
- **categories**: Phase 0 자동 판정값
- **tags**: 3-7개 (LSI에서 선별)
- **format**: standard
- **status**: draft (반드시)

### Phase 5: 이미지 생성 (codex CLI + 인포그래픽 분할 결정)

대표 이미지(hero) 1 + 본문 이미지 2-3장 + 인포그래픽 1-N장.

**Hero 룰 (CRITICAL — asset-images §4.8.2)**: hero는 **항상 typography 인포그래픽 1장**. photo·screenshot·chart는 hero에 사용 금지(본문 보조 이미지로만). `script/hero-templates/` 정본 3종 중 1개 선택 — 모두 16:9 1200×675 viewport 강제:

- `script/hero-templates/title-typography.html` — 제목·문구 중심 hero (v1)
- `script/hero-templates/v2-stat-hero.html` — 수치 강조 hero (가장 흔히 쓰임, v2)
- `script/hero-templates/v3-split.html` — 좌측 패널 + 우측 컨텐츠 hero (v3)

선택한 hero 템플릿은 frontmatter `_draft.hero_template`에 기록 (`"v1"` / `"v2"` / `"v3"` 또는 파일명). 직전 5편의 `_draft.hero_template`가 모두 같은 값이면 다른 템플릿 강제. 같은 글 카테고리 안에서 같은 템플릿이 3편 연속도 금지. §4.8.5 모바일 가독성 규격 강제.

**이미지 카피 쉬운 용어 게이트 (CRITICAL)**: hero·본문 인포그래픽의 visible text와 alt/caption에도 seo-policy §1.8.1을 그대로 적용한다. `ROI/CAC/LTV/객단가/affiliate`, "본업 시간 0", "자동 적립", "자동 누적"이 보이면 렌더 전 HTML을 수정하고, 이미 렌더했다면 WebP를 재생성한다.

**T07~T16 카탈로그(`script/infographic-templates/style-T*.html`)는 본문 인포그래픽 전용** — hero 사용 금지. T*를 hero에 쓰면 16:9 viewport가 강제되지 않아 비율 깨짐 (실측 1200×1368, 1600×1551 등 1:1 근접). T* 카탈로그는 asset-images §4.10.3 본문 다양성 룰에 사용.

**인포그래픽 분할 결정 트리 (asset-images.md §4.10.5)** — 인포그래픽 HTML 렌더 직후 자동 적용:

1. **render fit 결과 ≤ 2000px** → 단일 인포그래픽 1장, 글 TL;DR 직후
2. **fit 결과 2000-3600px** → HTML을 A·B 두 파일로 split:
   - A: 헤더 + 핵심 데이터 1-2개 (외주 vs AI 비교, hero 일러스트)
   - B: 매트릭스 / 추천 조합 / 페르소나 시나리오 (상세 데이터)
   - 글 TL;DR 직후 A → B 순차 배치, 둘 다 ≤ 2000px
3. **fit 결과 > 3600px** → 본문 H2 섹션별 분산 배치:
   - 글 H2 "비교" 직후 → 매트릭스 인포그래픽 (~800×1400)
   - 글 H2 "페르소나 시나리오" 직후 → 시나리오 인포그래픽 (~800×1300)
   - 각 미니 인포그래픽 ≤ 1500px 권장

**자동 측정 방법**:
```bash
# Chrome으로 큰 캔버스에 캡처 후 실제 콘텐츠 height 측정
"$CHROME" --headless=new --window-size=800,4500 --screenshot=/tmp/_audit.png "file://${HTML_ABS_PATH}"
node -e 'sharp("/tmp/_audit.png").raw().toBuffer({resolveWithObject:true}).then(({data,info})=>{...})'
# → 결과를 분할 결정 트리에 대입
```

**Split 패턴** (Python 권장):
- HTML의 main 안 섹션 단위(`<!-- HEADER -->`, `<!-- TOOL MATRIX -->`, `<!-- 추천 -->`, `<!-- FOOTER -->`)를 링크 ID로 추출
- A 파일 = HEADER + 첫 1-2 섹션 + FOOTER
- B 파일 = 나머지 섹션 + FOOTER
- 각각 별도 webp로 render → **[JP override]** `md-publish.mjs`가 `public/images/articles/<slug>/`로 복사 → 글 본문 GFM `![{alt}]([[IMG:N]])` 2개 순차 배치 (jp-site-config §3·§5·§6: WP 미디어 업로드·`wp:image` Gutenberg 금지)

**본문 인포그래픽 정본**: 폭 **1200px** (asset-images.md §4.10.1). `render-infographic.mjs` default 1200(max-height 2000, 콘텐츠에 맞게 trim). `--width` 명시 지정 금지. DPR=2 → webp 2400×N. CSS dim ≤ 2000 유지.
**[JP CRITICAL] hero는 반드시 `--max-height=675`로 렌더**: `node script/render-infographic.mjs <hero.html> <hero.webp> --max-height=675`. hero HTML은 `h-[675px]` 16:9지만, 기본 max-height(2000)로 렌더하면 콘텐츠 675px 아래에 그라데이션 빈 공간 1325px가 남아 **2400×4000 세로형으로 깨진다**(gradient라 trim 안 됨). `--max-height=675`를 줘야 2400×1350(ratio 1.78=16:9). 본문 인포/차트는 가변높이라 플래그 없이 default. (asset-images.md §4.8.2)

**카탈로그 사용 절차**:
- Hero: `script/hero-templates/` 8종 중 글 주제에 맞는 1개 선택(v1-typography / v2-stat / v3-split / v4-quote / v5-checklist / v6-comparison / v7-timeline / v8-persona). 직전 5편 연속 같은 템플릿 사용 시 다른 템플릿 강제. 선택 결과를 frontmatter `_draft.hero_template`에 기록.
- 본문 인포그래픽: `script/infographic-templates/` 31종 중 데이터 형태에 맞는 N개 선택. `schema.json`의 placeholder/SAMPLE_DATA 키 채워서 렌더.
- 렌더 직후 **`node script/audit-hero-templates.mjs` 및 `node script/audit-infographic-templates.mjs` 호출 의무** — sample data 자동 검증 통과 후 진입.

대표 이미지 1 + 본문 이미지 ≥ 2장 (글당 _draft.images ≥ 3).

이미지 1장당 명령 (bash로 실행):
```bash
codex exec --sandbox workspace-write --cd "$(pwd)" \
  "Use your built-in AI image generation tool to create a [photorealistic|illustration|infographic] image: {상세 프롬프트}. Aspect ratio 16:9, no text overlay unless required. Save to drafts/images/{slug}/{N}-{purpose}.png and report file path." < /dev/null
```

**프롬프트 작성 원칙**:
- 한국 맥락이면 명시 ("Korean", "한국 카페", "한국인 모델")
- 본문 H2와 1:1 매핑 (대표=H1 / 본문=H2 핵심)
- 텍스트 오버레이 금지 (검색엔진 OCR 불가, 다국어 깨짐)
- alt 텍스트 별도 작성 (메인 키워드 자연 포함)

**이미지 확보 결정 트리 (실행 순서, deterministic) — 신규 codex 생성 우선 + 검증 5회**

```
0. 이미지 종류 분기 (글당 본문 이미지 2-3장)
   ├─ 인포그래픽 (도구 비교·매트릭스·전후 비교·추천 조합) → Step 1A HTML+Chrome headless
   ├─ 일러스트 (캐릭터·메타포·시나리오) → Step 1B codex + 검증
   └─ 단순 보조 차트 (단일 막대·라인) → Step 1C matplotlib (옵션, 대부분 인포그래픽 안에 포함)

1A. HTML 인포그래픽 (정본) — asset-images.md §4.10.0~4.10.4
   ├─ 위치: 글 상단 TL;DR 직후 (§4.10.0 정본 구조)
   ├─ 템플릿 = 콘텐츠 유형 × 비주얼 스타일 2차원 조합 (§4.10.3 카탈로그)
   │
   │   [1차원] 콘텐츠 유형 — 글 주제에 맞는 레이아웃 구조
   │   ├─ ✅ 도구 비교 → tools-comparison-template.html
   │   ├─ ✅ 단계 가이드 → steps-guide-template.html
   │   ├─ ✅ 통계 인사이트 → stats-insights-template.html
   │   ├─ ✅ 체크리스트 (Do/Don't) → checklist-template.html
   │   ├─ ⏳ 페르소나 시나리오 → personas-scenarios-template.html (TODO, 첫 등장 시 prototype 작성)
   │   ├─ ⏳ 이벤트·뉴스 → event-timeline-template.html (TODO, 첫 등장 시 prototype 작성)
   │   └─ lean 확장 규칙: TODO 유형 글이 처음 등장하면 그때 prototype 추가 + 카탈로그 ✅ 갱신
   │
   │   [2차원] 비주얼 스타일 — script/infographic-templates/style-T*.html 참조
   │   ├─ T07 Hero Stat    (style-T07-hero-stat.html)    딥 인디고, 거대 단일 숫자 → 임팩트 지표 강조
   │   ├─ T08 Timeline     (style-T08-timeline.html)     인디고, 세로 연대기 → 변천사·역사·단계 추적
   │   ├─ T09 Funnel       (style-T09-funnel.html)       파란 그라디언트, 퍼널 → 전환율·프로세스 흐름
   │   ├─ T10 Bento        (style-T10-bento.html)        흰 배경 비대칭 그리드 → 다수 플랫폼·항목 비교
   │   ├─ T11 VS Battle    (style-T11-vs-battle.html)    다크/라이트 좌우 분할 → 두 가지 선택지 대결
   │   ├─ T12 Scorecard    (style-T12-scorecard.html)    흰 배경 성적표 테이블 → 평가·랭킹·등급 매기기
   │   ├─ T13 Pull Quote   (style-T13-pull-quote.html)   로즈, 거대 인용구 → 사례·증언·스토리텔링
   │   ├─ T14 Icon Matrix  (style-T14-icon-matrix.html)  교번 배경 4×2 그리드 → 플랫폼·항목 스냅샷
   │   ├─ T15 Dashboard    (style-T15-dashboard.html)    다크 대시보드 → 성과 리포트·KPI·주간 트렌드
   │   └─ T16 Roadmap      (style-T16-roadmap.html)      에메랄드, 3Phase 연결 → 로드맵·시작 가이드
   │
   │   스타일 적용 방법:
   │   1) 콘텐츠 유형이 적합하면 해당 style-T*.html 을 그대로 데이터만 교체해 사용
   │   2) 또는 콘텐츠 유형 HTML + 선택한 style-T*.html 색상 팔레트를 조합
   │   3) 이미지 경로는 ../../../illustrations/ (3단계 상위) 사용
   │
   ├─ 반복 금지 (2가지 모두 적용):
   │   ├─ 콘텐츠 유형: 같은 주제 클러스터에서 연속 2편 동일 유형 X
   │   └─ 비주얼 스타일: 연속 3편 동일 T* 사용 X — 글 작성 후 사용한 T* 메모
   ├─ 데이터 채우기 (실데이터, 출처 표기 필수). HTML 내 <!-- SAMPLE_DATA: ... --> 마커 위치만 교체
   ├─ 일러스트: **항상 codex 신규 생성** (재활용 금지)
   │   - §4.8 톤앤매너 preamble + §4.9 검증 5회 통과 필수
   │   - 5회 실패 시 발행 중단 (재활용 fallback 없음)
   ├─ Chrome headless 렌더 (fit-to-content 자동 trim, §4.10.4):
   │    node script/render-infographic.mjs input.html output.webp
   │    # 옵션: --width=1200 --max-height=2000 --bg=#F6F8FB --bottom-padding=32
   │    # 산출물 한 변 > 2000px이면 exit 1 → HTML 압축 또는 2장 분할
   ├─ **a11y 자동 게이트 (MANDATORY — 렌더 직후 강제 실행)**:
   │    node script/audit-infographic-visual.mjs --post=<id>
   │    - 검사 항목: WCAG AA 대비비 (4.5:1 일반/3:1 large) / wrap 위험 / 라인브레이크 균형 / 폰트 크기 / 금지 색상
   │    - **risk:high 1건이라도 잔존 시 차단** → HTML 수정 → 재렌더 → 재검사 (최대 3회)
   │    - risk:medium은 경고. 같은 슬롯 카드들의 본문 길이/줄 수 불균형은 문구 단축 또는 폰트 조정
   │    - 3회 후에도 risk:high 잔존 → 발행 중단 + 사용자 보고
   ├─ 검증: **Read 도구로 webp 직접 열어서 로고·텍스트·색상 눈으로 확인 (MANDATORY)**
   │    - 확인 항목: 로고 보임 / 텍스트 색상 진함 / 폰트 크기 읽기 충분 / 레이아웃 깨짐 없음
   │    - 같은 grid 안 카드들의 본문 줄 수가 같은지 확인 (한 카드만 줄 수 다르면 문구 또는 폰트 조정)
   │    - 이상 있으면 HTML 수정 → 재렌더 → 재확인. 이상 없으면 다음 단계 진행
   └─ 통과한 WebP를 _draft.images[N].file로 등록

1. codex CLI 신규 생성 (사진형) — asset-images.md §4.8 톤앤매너 preamble 강제 prepend
   ├─ 프롬프트 = preamble + task-specific + output spec
   ├─ codex 실행:
   │    codex exec --sandbox workspace-write --cd "$(pwd)" \
   │      "{preamble} {task prompt} Save to drafts/images/{slug}/{N}-{purpose}.png at 1792x1024." < /dev/null
   ├─ 생성 후 → Step 2 검증 (필수)
   └─ frontmatter `_draft.images[N]`에 통과한 파일 경로 기록

1B. Python matplotlib (통계·차트) — asset-images.md §4.10
   ├─ 실데이터 확보 (Semrush·DataReportal·정부·자체 DB) — 출처 표기 필수
   ├─ script/chart-template.py 사용 (brand color #3B70FF + **[JP override] 폰트 Noto Sans JP** — jp-site-config §6, KR Pretendard 대체)
   ├─ 출력: 1792×1024 또는 1600×900 PNG
   ├─ figcaption에 "출처: {조직명}, {발표연도}" 명시
   └─ 검증 불필요 (코드 기반, AI 환각 없음)

1C. Mermaid CLI (다이어그램)
   ├─ .mmd 파일 작성 (graph TD, sequenceDiagram 등)
   ├─ npx @mermaid-js/mermaid-cli -i input.mmd -o output.png -w 1792 -H 1024
   └─ 검증 불필요

2. 검증 + 재시도 (codex만, 최대 5회) — asset-images.md §4.9
   ├─ Read tool로 PNG 직접 읽음 (Claude multimodal)
   ├─ 체크리스트:
   │   - 의도 매칭 (주체·구도·맥락)
   │   - AI 실패 신호 없음 (손가락 6+, 일그러진 얼굴, 깨진 텍스트)
   │   - 톤앤매너 일치 (photorealistic, brand color, 한국 맥락)
   │   - 비율 정확 (1792×1024)
   ├─ 실패 시 재생성 (최대 5회):
   │   - 기존 파일 보존, 새 파일명 `{N}-{purpose}-v2.png`, `-v3.png`...
   │   - 매번 프롬프트 변형:
   │     v2: 실패 원인 부정 ("without distorted hands", "without text in image")
   │     v3: 구도·각도 변경
   │     v4: 주체·배경 단순화
   │     v5: 다른 visualization 방향
   └─ 5회 후에도 실패 → **발행 중단** (재활용 fallback 없음)
```

**원칙**:
- **항상 신규 생성**: 글마다 fresh 이미지로 시각적 다양성 확보 + featured_media 중복 방지. **재활용 금지** — codex 5회 실패 시 발행 중단.
- **시각 검증 강제 게이트 (CRITICAL — Phase 5 완료 조건)**:
  - 모든 codex 일러스트는 `.ai-rules/asset-images.md §4.9` 5단계 체크리스트 통과 필수 (Claude Read multimodal)
  - 모든 인포그래픽 산출물(webp)은 `.ai-rules/asset-images.md §4.9.1` 6항목 Reviewer + §4.10.7 정적 감사 (`audit-infographic-visual.mjs`) 둘 다 통과 필수
  - 차원 ≤2000px 확인 (file <path>) → Read 가능 보장 → multimodal vision으로 빈 박스·글자 깨짐·구도 결함 검출
  - **게이트 미통과 글은 Phase 6 (draft 저장) 진입 금지** — Phase 5 안에서 보강 루프 (codex 최대 5회 + 인포 최대 3회) 또는 발행 중단
  - 게이트 결과 로그: `tmp/image-verify-{slug}.md` (시도 횟수·통과 항목·잔존 결함)
  - cron 자동 모드(`/blog create auto`)는 게이트 실패 시 status JSON `{"status":"failed","phase":"image-verify"}` 출력 + Slack 알림
- **새 프롬프트로 재시도**: 기존 이미지 수정·덮어쓰기 금지. 매번 프롬프트 변형으로 새 파일 생성 (`-v2`, `-v3`...).
- **톤앤매너 일관**: photorealistic + brand color + 한국 맥락 (asset-images.md §4.8 preamble). 일러스트·플랫·만화 혼용 금지.
- **통계는 codex 금지**: 수치 환각 위험. 무조건 Python matplotlib 정본.
- **publish 자동화** (jp-site-config §5): `md-publish.mjs`가 `_draft.images[N]`을 `public/images/articles/<slug>/`로 복사 + 본문 `[[IMG:N]]` placeholder를 실경로로 치환 + `content/articles/<slug>.md` 생성. hero(featured)는 frontmatter `image:`로 지정(본문 삽입 안 함, §3).
- **[JP override] 자산 경로** (jp-site-config §6): 모든 이미지는 `public/images/articles/<slug>/` 로컬 경로. KR `assets.helpsns.com` S3/CloudFront CDN 정본은 폐기.

**본문 placeholder 규칙 (publish가 치환)**:
- 본문 마크다운 안의 이미지는 **`[[IMG:0]]`, `[[IMG:1]]`, ...** placeholder로 표기
- 실제 파일 경로·URL은 frontmatter `_draft.images[N]`에 보관
- 예 (**[JP override]** 순수 GFM, jp-site-config §3 — Gutenberg `<!-- wp:image -->` 금지):
  ```markdown
  ![{alt}]([[IMG:0]])
  ```
- **[JP override] 이미지 경로는 `public/images/articles/<slug>/` 로컬** (jp-site-config §6) — `assets.helpsns.com`·`d14icj3tspgnn2.cloudfront.net` 등 KR S3/CloudFront CDN 도메인 및 `_media.json` 매핑 전부 폐기. `md-publish.mjs`가 `[[IMG:N]]`을 로컬 실경로로 치환.

### Phase 6: draft 저장
- 저장 직전 HTML 구조 검증 게이트 (CRITICAL):
  ```bash
  node script/validate-post-html.mjs draft-{slug}  # 또는 임시 파일 경로
  ```
  - **[JP override]** GFM 마크다운 짝(코드펜스·표·링크) + 알려진 사고 패턴 통과해야 저장 진행 (jp-site-config §3 — `wp:block` Gutenberg 검증은 JP 미적용, 본문은 순수 GFM)
  - 통과 못 하면 본문을 그대로 저장하지 말고 자가 수정 후 재검증. 3회 후에도 실패 시 사용자 보고
- 글: `drafts/{slug}.md` (**[JP override] YAML frontmatter 단일 계약** — jp-site-config §11, KR JSON `_draft` 폐기. 본문은 순수 GFM)
  ```markdown
  ---
  slug: "..."
  status: "draft"
  title: "..."
  description: "..."           # 120–160字 (jp-site-config §4)
  date: "YYYY.MM.DD"           # 점 구분 (jp-site-config §4)
  category: "..."
  image: "/images/articles/{slug}/1-hero.png"   # hero는 frontmatter image (jp-site-config §3·§5)
  tags: ["#...", "#..."]
  _draft:
    created_at: "ISO"
    target_keyword: "..."
    images:
      - file: "drafts/images/{slug}/1-hero.png"
        alt: "..."
        caption: "..."
        purpose: "hero"
  _audit_score: 0
  _audit_cycles: 0
  ---

  본문 (순수 GFM 마크다운, [[IMG:N]] placeholder) ...
  ```
- 이미지: `drafts/images/{slug}/` (jp-site-config §2·§11)

### Phase 7: 다각도 병렬 검증 (sub-agent)
spec 패턴 차용. 3개 sub-agent를 **동시 실행**:

1. **SEO Reviewer** — seo-policy.md §1, §5 기반 채점
2. **AEO/GEO Reviewer** — §2, §3 기반 채점 (직답 단락, FAQ 스키마, 정의/리스트/표, 인용 가능성)
3. **한국어 카피 Reviewer** — §4 + §7 금지사항, 자연스러움, 맞춤법

각 sub-agent에는 다음만 전달:
- 평가 대상 파일 경로
- 정본 경로(seo-policy.md)
- 평가 영역과 채점 기준
- "Pre-flight 없이 즉시 실행"

### Phase 8: Codex 세컨드 오피니언 (조건부)
`codex-second-opinion/SKILL.md` 규칙 그대로:
- 트리거: Phase 7 종합 점수 80-94, 또는 Reviewer간 점수 차 ≥ 15점 (snshelp 100점 통과 정책)
- 호출: `codex exec` Bash (MCP 도구 사용 금지 — codex-second-opinion §2 참조)
- 응답 종합: 동의 / 불일치(Claude 자율 결정)

### Phase 9: 보강 루프 (호출 모드별 한도 분기)
종합 100점 미달 시:
- 영역별 결함 모아서 Claude가 본문/메타/이미지 보강
- Phase 7 재실행
- **목표 점수는 100**. snshelp는 100점 통과 정책. 95-99는 1회 추가 보강 후 발행 허용, 80-94는 codex 호출 + 보강, 80 미만은 재작성

**호출 모드별 보강 한도 분기 (CRITICAL — blog/SKILL.md §3-A와 정합)**:
- **사용자 호출 (`/blog create [<시드>]`, `/blog write …`)**: 최대 **5회**. 5회 후에도 100 미달 시 → 현재 점수 + 남은 결함 + 권장 다음 액션을 사용자에게 보고하고 진행 여부 확인 (Pre-flight 의무).
- **cron 자동 호출 (`/blog create auto`)**: **무제한 반복** (100점 도달까지). 5회 cap **미적용**. 단 6회차부터는 매 사이클 종료 시 `tmp/audit-progress-{slug}.log`에 `cycle=N, score=M, top_defects=[...]` 1줄을 append해서 진행 상황 추적. 시간 초과(전체 실행 60분 이상)로 100 미도달 시 daily-blog-prompt.md의 audit-loop fallback에 따라 `{"status":"failed","phase":"audit-loop","error":"100점 미도달, cycles=N, last_score=M"}` 출력 후 종료. 다음 trigger 재시도.

cron 모드의 무제한 보강은 blog/SKILL.md §3-A `create auto` 자동 결정 룰 정본을 따른다.

### Phase 10: 사용자 최종 검토
```
[blog-write 완료]
키워드: "인스타 팔로워 늘리기"
종합 점수: 94/100 ✅
draft: drafts/instagram-followers.md
이미지: drafts/images/instagram-followers/ (3장)

영역별:
- SEO 95, AEO 92, GEO 90, 한국어 100, 미디어 95

다음: blog/publish.md draft-instagram-followers
```

---

## 산출물

| 파일 | 내용 |
|---|---|
| `drafts/{slug}.md` | 본문 + frontmatter (`_draft` 메타에 이미지 매핑) |
| `drafts/images/{slug}/*.png` | 이미지 파일 |
| `tmp/write-{slug}-report.md` | 검증 리포트 (점수, 영역별) |

---

## 금지

- 사용자 승인 없이 발행 (`blog/publish.md` 별도)
- 출처 없는 통계·수치 작성
- 본문에 광고성·과장 표현 (§7)
- 이미지에 텍스트 오버레이 (다국어·OCR 문제)
- 보강 루프 4회차 (무한 루프 방지)
- 다른 글 수정 (이 스킬은 신규 draft 생성만)
