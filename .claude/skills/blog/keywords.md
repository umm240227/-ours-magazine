
# blog/keywords.md — 타겟 키워드 추천

## 역할

주제 또는 기존 글을 시드로, **Semrush 데이터 기반** 타겟 키워드 후보를 산출하고 우선순위를 매긴다. SEO·AEO·GEO 적합도까지 함께 표시한다.

**snshelp 사이트 특화 원칙** — `seo-policy.md §9.0`을 반드시 Read·적용:
- snshelp는 **셀프 마케팅 플랫폼**(팔로워·좋아요·구독자·조회수·댓글 셀프 구매 서비스). 거래/상업 의도 키워드가 1순위, 정보형은 보조.
- 의도 식별 신호어: `구매`, `늘리기`, `늘리는 법`, `늘리는 사이트`, `추천`, `순위`, `비교`, `후기`, `빨리`, `자동`.
- 검색량이 낮아도 거래 의도가 명확하면 채택한다. 정보형 1,000 < 거래형 200.

**Sub agent 규칙**: 모든 sub-agent는 Pre-flight / 승인 대기 없이 즉시 실행한다.

## ⚠️ Semrush MCP 비용 게이트 (CRITICAL)

**호출 전 [.ai-rules/semrush-budget.md](../../../.ai-rules/semrush-budget.md) 정본 반드시 적용**.

**이 스킬에서 비싼 호출 주의**:
- `phrase_related` 40/line (limit=30이면 1,200 units) — **사전 비용 announce 필수**
- `phrase_questions` 40/line — 동일
- `phrase_kdi` 50/line — KD 정확값 필요한 경우만 사용
- `phrase_these` 10/line — **저렴. 가능하면 이걸로 우선 사용**

**임계값**: < 500 자동 / 500~2,000 사전 보고 / ≥ 2,000 STOP+승인 / 누적 ≥ 5,000 중단.
호출 직후 형식: `[Semrush: +X units / 세션 누적 Y]`

Sub-agent 위임 시: 예산 한도 명시 + 초과 시 중단 지시 + `.ai-rules/semrush-budget.md` Read 강제.

---

## 입력

| 인자 | 의미 |
|---|---|
| `<주제 문구>` | 자유 텍스트 시드 (예: "인스타 팔로워 늘리기") |
| `--post=<id>` | 기존 글을 시드로 (`content/articles/{id}.md`의 메인 키워드 추출) |
| `--gap` | 우리 도메인이 다루지 않은 콘텐츠 갭 위주 |

---

## 사전 조건

- Semrush MCP 인증 완료 (`/mcp` → semrush → Authenticate)
- 미인증 / 미가용 시: 즉시 사용자에게 안내하고 종료. 추측 키워드 생성 금지.

---

## 실행 흐름

### Phase 0: 정본 로드
0. **`.ai-rules/jp-site-config.md`를 가장 먼저 Read** (상대경로 `../../../.ai-rules/jp-site-config.md`) — JP 플랫폼/로케일 정본. 본 문서와 충돌하는 발행 경로·DB·Naver·draft 경로·/referral·폰트·검증 타깃은 이 문서가 **무조건 우선**.
1. `.ai-rules/seo-policy.md` Read (블로그 글 전용 룰은 §9 정본 통합본)
2. `content/_taxonomy.json` Read (카테고리 매핑용)
3. Semrush MCP 가용성 확인

### Phase 1: 시드 키워드 결정
- `<주제>` 입력 시: 그대로 시드
- `--post=<id>`: 글 frontmatter title + 첫 H2에서 명사구 추출
- `--gap`: 시드 없이 도메인 기반 갭 분석으로 진행

### Phase 2: Semrush 데이터 수집
시드 키워드로 다음 호출 (Semrush MCP 실제 report 이름 사용, database=jp):
1. **`phrase_fullsearch`** — 시드 포함 변형/유사어 모음
2. **`phrase_related`** — 시드의 의미적 인접어 (Related Relevance 0.3 미만이면 시드가 작은 토픽이라 신뢰도 낮음)
3. **`phrase_questions`** — 질문형 키워드 (AEO/FAQ 후보)
4. **`phrase_these`** — 후보 batch 검색량·CPC·경쟁도 (semicolon 구분)
5. **`phrase_kdi`** — 정확한 KD가 필요한 경우 별도 호출. `phrase_these`는 KD 반환 안 함
6. **`phrase_organic`** — SERP 상위 10개 (의도 매칭 검증용, **필수**)

요청 토큰 보호: 한 번에 50개씩 batch, `display_limit` 30-50 권장.

**한국어 시드 Fallback**:
- `phrase_questions` → `ERROR 50 :: NOTHING FOUND` 빈번. 본문/주제에서 의문형 키워드를 **직접 도출**해 보고.
- `phrase_related` Relevance가 0.3 미만 일색이면 보조 키워드는 본문 주제 분해로 직접 만들고, 가능성 있는 후보만 `phrase_these`로 검색량 검증.

### Phase 2.4: 네이버 월간 검색량 보조 조회 (CRITICAL — Semrush fallback)

> **[JP override] 이 Phase 2.4(네이버/DECAGO) 전체 SKIP** — JP는 네이버 없음, Semrush jp 단일 소스(jp-site-config §7). 아래 KR 절차는 참고용.

**JP 동작**: Semrush `database=jp`에서 `phrase_these` 가 `NOTHING FOUND`인 키워드는 **채택하지 않고 제외**한다. 네이버/DECAGO fallback **호출 금지**(JP는 네이버 없음). 검색량 보조 소스가 필요하면 Phase 3에서 CRM Trendkit(Google Ads Keyword Planner, GEO=JP)으로 통합한다. — 정본: [jp-site-config.md](../../../.ai-rules/jp-site-config.md) §6·§7.

> (KR 원본의 네이버 DECAGO 호출 방법·응답 형식·의사결정 룰은 KR 레포(`snshelp-astro`) 참조. JP 미사용 — 실행 금지.)

### Phase 2.5: 의도 분류 + SERP 의도 검증 (필수 단계)

**의도 분류** — 각 후보를 §9.0 표 + 2026 8 granular intent 보강 (seo-policy §1.6 외부 참고 7):
- **거래형 (Transactional)**: `구매`, `사기`, `결제`, `늘리기` + 명사 / `늘리는 사이트` / `빠르게` 결합 → **★★★**
- **상업형 (Commercial Investigation)**: `추천`, `순위`, `비교`, `후기` → ★★
- **정보형 (Informational)** — 8 granular type:
  - `Definition` (란?, 의미) → 첫 H2에 정의 단락 필수
  - `Instruction` (방법, 하는 법, 5단계) → numbered list 우선, listicle 형식 가산 (§1.6)
  - `Comparison` (vs, 차이, 비교) → 표 우선
  - `Short Fact` (얼마, 언제, 어디서) → 직답 1문장 + 부연 패턴
  - `Consequence` (안 하면, 위험, 결과) → 사용자 페인 인용 + 함정 H2 필수
  - `Reason` (왜, 원리) → 1차 출처 + 논리 체인
  - `Statistics` (통계, 데이터, 트렌드) → 데이터 시각화·표·차트
  - `Listicle` (N가지, 총정리, 모음) → AI 인용 74.2%가 listicle, 가산 우선
- **탐색형 (Navigational)**: 특정 브랜드 → 일반 키워드 후보에서 제외 (브랜드 자체 도구·랭킹 사이트가 SERP 점유)

**SERP 의도 매칭** — 각 상위 후보(최소 Top 10)에 대해 `phrase_organic`으로 SERP 상위 10개 분석:
- 도메인 유형 분류: 콘텐츠 / 도구 / 랭킹 / 위키 / 커뮤니티
- **SERP 콘텐츠 형식 분류 (2026 보강, seo-policy §1.6 외부 참고 8)** — 콘텐츠 도메인의 글이 어떤 형식으로 상위에 있는지:
  - `guide` (단계 가이드) — Instruction intent 대응
  - `comparison` (비교 글) — Comparison intent 대응
  - `tool` (계산기·도구) — 콘텐츠 글로 타깃 불가, 제외
  - `listicle` (Top N, 모음) — Listicle intent 대응, 74.2% AI 인용 (§1.6)
  - `discussion` (Reddit·Quora·커뮤니티) — Reason·Consequence intent 대응
  - `definition` (위키·정의 페이지) — Definition intent 대응
- 후보 리포트에 "SERP 형식" 컬럼 추가 → 글 구조 설계 시 같은 형식 우선 채택 (예: SERP guide 우세 → 5단계 워크플로우 글 작성)
- **Topical authority 측정 (외부 참고 7)**: topic cluster의 pillar page 후보로 적합한지 평가. high topical authority + low domain authority 조합도 AI search 시대에는 가능
- 상위 5개 중 **3개 이상이 도구·랭킹·계산기**면 → 사용자가 콘텐츠가 아닌 도구를 찾는 상태 → **해당 키워드 타깃 제외**
- 예시: "유튜브 통계"(검색량 390) — vling/playboard/noxinfluencer 등 도구 위주 SERP → 통계 콘텐츠 글로 타깃 불가. 대신 "유튜브 시청 시간"(480, 콘텐츠 SERP)으로 재타깃.

검증 결과를 후보 표의 "SERP 의도" 컬럼에 명시: ✅ 일치 / ⚠️ 부분 일치 / ❌ 불일치 (불일치는 즉시 제외).

### Phase 3: 필터링 (메인 키워드 채택 기준, CRITICAL)

메인 키워드는 다음 4개 조건을 **모두** 만족해야 채택 가능 (보조 키워드는 (1)만 충족):

1. **검색량 ≥ 100** — **[JP override]** (jp-site-config §6·§7): **Semrush `database=jp` `phrase_these` 검색량 ≥ 100 단독**. 네이버 PC+모바일 보조 판정(Phase 2.4)은 SKIP. Semrush jp 검색량 < 100이면 즉시 제외. (정보 매거진이나 거래 의도가 명확하면 10-50도 채택 가능, 메인 키워드는 100 기준 엄격 적용)
2. **KD ≤ 50** (Semrush phrase_kdi 또는 phrase_these에서, 현실적 진입 난이도)
3. **intent**: snshelp는 **transactional > commercial > informational** 순. 정보형도 채택 가능하나 거래 다리·CTA 의무
4. **SERP 의도 ✅ 일치 또는 ⚠️ 부분 일치** (Phase 2.5 ❌ 불일치는 즉시 제외)

부가 조건:
- 언어 = 일본어 (**[JP override]** jp-site-config §6·§7: Semrush `database=jp` 응답. 네이버 응답 없음)
- 보조 키워드는 (1)만 충족하면 채택 가능 (검색량 0이어도 메인 키워드의 변형·롱테일이면 H2/FAQ 후보로 활용)

### Phase 4: AEO/GEO 분류
키워드 형태로 적합 영역 표기:
- **AEO 강세**: 의문형 (`X란?`, `X 방법`, `X 하는 법`, `X 차이`)
- **GEO 강세**: 정의형·비교형 (`X vs Y`, `X 의미`, `X 종류`)
- **SEO 일반**: 명사구 (`X 추천`, `X 후기`)

### Phase 5: 콘텐츠 갭 분석 (CRITICAL — 메인 키워드 중복 금지)

기존 글이 같은 메인 키워드를 이미 타깃으로 잡았다면 cannibalization(자체 경쟁)이 발생해 둘 다 순위 손실. **메인 키워드는 다른 글과 절대 중복 금지**.

**방법**:
1. 후보 메인 키워드 정확 어구로 `content/articles/*.md` 전체 frontmatter `title` + 본문 H1 grep
2. **이미 같은 정확 어구를 메인 키워드로 잡은 글 ≥ 1개 발견 → 후보에서 즉시 제외** (♻️ 갱신 후보로만 표기, 메인 X)
3. 변형·부분 매칭만 발견된 경우 (예: 후보="인스타 릴스 만들기", 기존 글="릴스 만드는 법") → ⚠️ 인접으로 표기. 채택은 가능하지만 차별화 포인트 필수 (페르소나·도구·플랫폼 등)
4. 완전 미사용 → 🆕 마크, gap_weight 가산

**점수 산식**:
- 🆕 (정확 어구·인접 모두 미사용): `gap_weight = 1.5`
- ⚠️ 인접 (변형·부분 매칭 글 존재): `gap_weight = 0.9`
- ♻️ 정확 어구 중복 (기존 글 타깃): **메인 키워드 후보에서 제외, 갱신 후보로만**

**보고 표에 명시**: `갭 상태` 컬럼 (🆕 / ⚠️ / ♻️) + 인접·중복 글 id 인용 (예: `⚠️ 인접 (글 N)`).

### Phase 6: 우선순위 산출
점수 = `검색량 × (100 - KD) / 100 × intent_weight × gap_weight × serp_match`
- `intent_weight` (snshelp 셀프 마케팅 플랫폼 가중): **transactional=2.0, commercial=1.5, informational=1.0** (정보형 글은 거래 다리·CTA 의무라는 전제)
- `gap_weight`: 🆕=1.5, ♻️=1.0
- `serp_match`: ✅ 일치=1.0, ⚠️ 부분=0.6, ❌ 불일치=0 (자동 제외)
- 상위 30개를 리스트로 출력

### Phase 7: 리포트 저장
`tmp/keywords-{slug}.md` 또는 `tmp/keywords-{YYYYMMDD-HHMMSS}.md`

### Phase 8: Keyword Reviewer 독립 검증 + 재선정 루프 (최대 3회, CRITICAL)

4-역할 하네스(`.ai-rules/references/work-orchestration.md`) 적용. Phase 6 점수 Top 10 키워드를 독립 sub-agent가 사실 검증한 뒤, 메인 키워드 후보 ≥ 3개가 ✅ 통과될 때까지 Phase 2-6 재실행.

**Keyword Reviewer (sub-agent로 즉시 실행)**:

평가 대상: `tmp/keywords-{slug}.md` Top 10
정본: `.ai-rules/seo-policy.md` §1.5, `content/articles/*.md`

각 후보에 대해 **사실 검증** (추측 금지):

1. **검색량 ≥ 100** — **[JP override]** (jp-site-config §6·§7): JP는 네이버/DECAGO 없음 → **Semrush `database=jp` `phrase_these` 검색량 ≥ 100 단독 판정**. 이 단계의 네이버 API 재호출은 **SKIP**. **가드: Semrush jp가 `NOTHING FOUND`이면 해당 키워드를 ❌ 제외 — 네이버 재호출 금지.** 아래 KR 절차(네이버 재호출)는 참고용이며 JP에서 실행하지 않는다.
   ```bash
   # [JP override] 네이버 재호출 금지 — 아래 KR 블록은 참고용, 실행 X
   # set -a; source .env; set +a
   # curl -X POST "$DECAGO_NAVER_QUERY_ENDPOINT" -H 'Content-Type: application/json' \
   #   -d '{"platforms":["naver"],"keywords":["<후보>"],"is_raw":false,"is_extend_naver":false}'
   ```
   Semrush jp 검색량 < 100이면 **❌ 제외** (네이버 보조 판정 없음)

2. **SERP 의도 매칭 정확성** — `phrase_organic` 상위 10개 도메인 유형을 직접 분류해서 후보 리포트의 ✅/⚠/❌ 판정이 맞는지 재검증. 잘못된 판정이면 정정. 도구·랭킹 ≥ 3/Top10이면 **❌ 제외**

3. **중복 검사 (정확 어구)** — 메인 키워드 후보 정확 어구로 grep:
   ```bash
   grep -l '"title".*<메인 키워드 정확 어구>' content/articles/*.md
   ```
   ≥1개면 ♻️ 강등 또는 **❌ 제외** (cannibalization, seo-policy §1.5)

4. **KD ≤ 50** — `phrase_kdi` 또는 `phrase_these` 결과로 검증. > 50이면 ⚠ 경고 (초기 진입 어려움)

5. **intent 분류 정확성** — 후보의 의도(transactional/commercial/informational/탐색형) 판정이 §9.0 표와 일치하는가. 탐색형(브랜드 단일)이면 ❌ 제외

6. **title 정확 어구 적합도** — 후보가 title 첫 30자 안에 정확 어구로 들어갈 수 있는 길이(15자 이내 권장)인가. 너무 길면(예: 30자) title 어구 룰 위반 위험 → ⚠ 표기

**Reviewer 출력 형식** (`tmp/keywords-review-{slug}.md`):
```markdown
| # | 키워드 | 검색량(소스) | KD | SERP | 중복 | intent | 길이 | 종합 |
|---|---|---|---|---|---|---|---|---|
| 1 | 인스타 릴스 만들기 | 6,000 (Semrush jp) | — | ⚠ 부분 | 0개 ✅ | informational | 10자 ✅ | ✅ 메인 채택 |
| 2 | AI 영상 만들기 | 6,600 (Semrush) | — | ❌ 도구 10/10 | 0개 ✅ | informational | 9자 ✅ | ❌ 제외 |
```

**재선정 루프**:
- Reviewer ✅ 메인 후보 ≥ 3개 → 진행
- ✅ 메인 후보 < 3개 → Phase 2-6 재실행 (시드를 인접 키워드군으로 확장, Reviewer 피드백 반영)
- 3회 후에도 < 3개 → 사용자 보고: "메인 키워드 후보 부족. 시드 변경 / 보조만으로 글 작성 / 취소"

**호출 예시**:
```
Keyword Reviewer에게 위임 (Agent tool, subagent_type=general-purpose):
- 평가 파일: tmp/keywords-{slug}.md
- 정본: .ai-rules/seo-policy.md §1.5
- 도구: Bash (grep content/articles), Semrush MCP (phrase_these·organic·kdi, database=jp). **[JP override]**: 네이버 API curl 도구 없음 (jp-site-config §6·§7)
- 출력: tmp/keywords-review-{slug}.md
- 추측 금지. 모든 판정은 실제 API 호출 + 파일 grep 결과로 인용
- Pre-flight 없이 즉시 실행
```

```markdown
# 키워드 리서치: {시드}

## 시드
- 입력: {주제 또는 post-id}
- 메인 키워드 후보: {Top 3}

## 추천 Top 30
| # | 키워드 | 검색량 | KD | 의도 | 영역 | SERP매칭 | 상태 | 점수 |
|---|---|---|---|---|---|---|---|---|
| 1 | 인스타 팔로워 구매 | 1900 | 28 | **trans** | SEO | ✅ | 🆕 | 2052 |
| 2 | 인스타 팔로워 늘리는 사이트 | 880 | 22 | **comm** | SEO | ✅ | 🆕 | 1029 |
| 3 | 인스타 팔로워 늘리는 법 | 5400 | 32 | info | AEO | ✅ | 🆕 | 367 |

## SERP 상위 인사이트 (Top 5 키워드별)
- 키워드 X: 상위 글 평균 길이 2400자, 공통 H2: ...
- 도메인 유형 분류: 콘텐츠 N / 도구 N / 랭킹 N / 위키 N / 커뮤니티 N

## SERP 의도 불일치로 제외된 키워드
- 키워드 Y (검색량 N): SERP 상위가 도구 위주 → 콘텐츠 글로 타깃 불가

## 콘텐츠 갭 (도메인)
- 안 다룬 영역: ...
```

---

## 보고 (사용자에게)

상위 10개 키워드만 텍스트로. 전체 리포트 경로 안내.

```
시드: "인스타 팔로워 늘리기"
Semrush 추천 Top 10:
1. 인스타 팔로워 늘리는 법 (검색량 5400, KD 32) 🆕 AEO
2. 인스타 팔로워 빨리 늘리기 (1900, 28) 🆕 SEO
...
다음 단계: blog/write.md "<선택한 키워드>"
리포트: tmp/keywords-{slug}.md
```

---

## 금지

- Semrush 미가용 시 추측·일반 지식으로 키워드 만들기 금지
- 검색량·KD를 임의 추정하지 않기 (Semrush 응답값 그대로 인용)
- 한 호출에 100+ 키워드 batch (토큰 과부하)
- **SERP 의도 검증 없이 검색량만 보고 키워드 채택 금지** (133번 작업의 핵심 학습)
- **거래/상업 의도 키워드가 후보에 있는데 정보형부터 추천 금지** (snshelp 비즈니스 모델 불일치)
