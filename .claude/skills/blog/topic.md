
# blog/topic.md — 블로그 주제 선정

## 역할

snshelp가 다음에 쓸 블로그 글의 **주제**를 결정한다. 키워드 한 개가 아니라 글 제목·범위·진입 키워드까지 묶은 "주제 후보 카드"를 만든다.

- 입력에 시드가 있으면 그 주변에서 깊게 후보 산출
- 시드가 없으면 카테고리별 콘텐츠 갭에서 자동 발굴

snshelp 사이트 특성상 **거래/상업 의도** 후보를 1순위로, 정보형은 거래 다리 가능성을 평가해 채택한다. 이 원칙은 `seo-policy.md §9.0`이 정본.

**Sub agent 규칙**: 모든 sub-agent는 Pre-flight / 승인 대기 없이 즉시 실행한다.

## ⚠️ Semrush MCP 비용 게이트 (CRITICAL)

**호출 전 [.ai-rules/semrush-budget.md](../../../.ai-rules/semrush-budget.md) 정본 반드시 적용**.

이 스킬은 후보 5-10개에 대해 시드 분석 시 비용 폭발 위험:
- 후보당 `phrase_these` (10/line, 5 키워드) = 50 units → 10 후보 = 500 units
- 후보당 `phrase_organic` (10/line, limit=10) = 100 units → 10 후보 = 1,000 units
- 후보당 `phrase_related` (40/line, limit=20) = 800 units → **10 후보 = 8,000 units 폭발!**

**phrase_related는 후보 압축 후(Top 3-5) 적용**. 처음부터 10 후보 전체에 호출 금지.

임계값: < 500 자동 / 500~2,000 사전 보고 / ≥ 2,000 STOP+승인 / 누적 ≥ 5,000 중단.
호출 직후 형식: `[Semrush: +X units / 세션 누적 Y]`

---

## 입력

| 인자 | 의미 |
|---|---|
| `<시드 주제>` (선택) | 예: `"유튜브 광고 수익"`, `"인스타 팔로워"`. 시드 주변에서 깊이 탐색 |
| 빈 입력 | 전체 카테고리 갭 + 거래 의도 점수만으로 자동 발굴 |

---

## 사전 조건

- Semrush MCP 인증 완료 (`/mcp` → semrush → Authenticate). 미가용 시 검색량 검증 못 함을 명시하고 진행.
- `seo-policy.md §9.0` (거래 의도 우선 원칙)을 Phase 0에서 반드시 Read.

---

## 실행 흐름

### Phase 0: 정본·환경 준비

0. **`.ai-rules/jp-site-config.md`를 가장 먼저 Read** (상대경로 `../../../.ai-rules/jp-site-config.md`) — JP 플랫폼/로케일 정본. 본 문서와 충돌하는 발행 경로·DB·Naver·draft 경로·/referral·폰트·검증 타깃은 이 문서가 **무조건 우선**.
1. `.ai-rules/seo-policy.md` **반드시 Read** (특히 §9.0 의도 분류, §9.0 SERP 의도 검증 — 블로그 글 전용 정본 통합본)
2. `content/_taxonomy.json` Read — 카테고리·태그 ID/이름 매핑 (**[JP override]** jp-site-config §2: KR `wp-content/` 경로 → JP `content/`로 매핑)
3. `content/articles/*.md` 파일 목록 + 각 frontmatter `title`·`categories` 수집 — 갭 분석용
4. snshelp 서비스 페이지 목록 확인: `src/pages/[platform]/` 구조에서 가능한 platform·title 슬러그 추출
5. **referral cluster 게이트 — [JP override] 전체 제거 (jp-site-config §9·§10)**:
   - JP는 정보 중심 매거진 + referral 모델 없음 → **referral cluster 게이트·강제 시드 모드 전체 SKIP.**
   - 빈 시드 호출(`/blog create auto`)은 **항상 정상 Phase 1**(시의성 발굴 → 갭 fallback)으로 진행. `referral-cluster.md` Read·sliding-window 검사·강제 시드 **하지 않음.**
   - 게이트 결과는 항상 `referral_cluster_gate: normal`로 보고(또는 생략).
   - (아래 KR "referral cluster 강제 모드" 분기는 JP 미사용 — 실행 금지, KR 참고용.)

### Phase 1: 시드 처리

**referral cluster 강제 모드** — ⚠️ **[JP override] 폐기·JP 미실행** (jp-site-config §9·§10): Phase 0에서 게이트를 제거해 `forced_seed`가 **발생하지 않으므로 이 분기는 도달 불가**. KR 원본의 강제 시드 선정·`_referral_cluster` 마커·`/referral/` anchor 절차는 KR 레포(`snshelp-astro`) 참조. JP는 항상 아래 일반 모드.

**일반 모드** (항상 JP — referral 게이트 없음):

**시드 있는 경우** (`<시드 주제>` 인자 제공):
- 시드를 그대로 사용
- 시드의 의도 분류 (transactional / commercial / informational / navigational)
- 시드가 informational이면 거래 의도로 변형한 후보를 함께 생성 (예: 시드 "유튜브 알고리즘" → 후보에 "유튜브 알고리즘 활용해서 구독자 늘리기" 추가)

**시드 없는 경우** (빈 입력) — **시의성 시드 우선** → 적합 시의성 0개면 카테고리 갭으로 fallback:

#### 1) 시의성 시드 발굴 (CRITICAL, WebSearch 활용)

다음 3개 채널을 차례로 탐색해 **snshelp 고객(자영업·1인 마케터·인플루언서)이 운영에 즉시 적용 가능한** 시의성 시드를 후보 5-10개 발굴.

**(a) 플랫폼 공식 발표·업데이트** (최근 4주 lookback):
- `WebSearch("Instagram update {YYYY} {MM} algorithm announcement")` — Adam Mosseri / 인스타 헤드 발언
- `WebSearch("YouTube algorithm update {YYYY} creator")` — Neal Mohan 발언, YouTube Blog 업데이트
- `WebSearch("TikTok {YYYY} new feature creator")` — TikTok Newsroom
- `WebSearch("Meta AI Instagram {YYYY} release")` — Meta 신기능
- 한국어 보조: `WebSearch("인스타그램 새 기능 {YYYY}")`, `WebSearch("유튜브 정책 변경 {YYYY}")`

**(b) 시즌·이벤트 캘린더** (오늘 + 14일 lookahead):

**[JP override]** 현재 seasonal-calendar.yml은 KR. JP 캘린더로 교체 예정(C4/E). 그때까지 일본 시즈널은 WebSearch로 보강.

정본 캘린더: [`seasonal-calendar.yml`](./seasonal-calendar.yml) — 한국 마케팅 데이(빼빼로/삼겹살/구구/할로윈/블프 등) + 시즌(여름휴가·새학기·연말) + 음력 공휴일(설/추석) 모두 포함. 각 entry는 양력 날짜 범위 + snshelp 마케팅 각도 + 가중치(0.5~2.0) + 적합 타깃(foodservice/retail/education/gift/general/digital) 명시.

**매칭 절차** (Phase 1에서 매번 실행):

```bash
TODAY=$(date +%m-%d)
# YAML 파싱은 python3 + pyyaml 또는 grep/awk로
python3 <<EOF
import yaml, datetime
with open('.claude/skills/blog/seasonal-calendar.yml') as f:
    cal = yaml.safe_load(f)
today = datetime.date.today()
lookahead_end = today + datetime.timedelta(days=14)

# 1) fixed_dates 매칭 (범위 안에 today 또는 lookahead 포함)
for e in cal['fixed_dates']:
    start_m, start_d = map(int, e['range_start'].split('-'))
    end_m, end_d = map(int, e['range_end'].split('-'))
    # ... range가 today~lookahead와 겹치는지 + weight·각도 출력

# 2) seasons 매칭 (긴 범위)
# 3) lunar_holidays 매칭 — WebSearch로 그해 양력 날짜 확보 후 매칭
EOF
```

음력 공휴일(설/추석/부처님오신날)은 `lookup_method` 필드에 WebSearch 쿼리 명시 — Phase 1 시작 시 한 번 호출해 그해 양력 날짜 확보.

수능일(매년 11월 셋째 목요일)도 동일하게 WebSearch fallback (`"YYYY년 수능 일자"`).

**가중치 활용**: 매칭 entry가 여러 개면 weight 가장 높은 것 우선. weight ≥ 1.5는 시그니처 시즌(크리스마스·빼빼로·여름휴가·블랙프라이데이) — 글 1편 강제로 시도 권장.

**snshelp_angles가 빈 entry는 글 작성 제외**: 추모일(현충일/광복절)·정치 기념일·마케팅 약함 데이는 빈 배열로 비워둠. Phase 1이 매칭해도 후보로 채택 X.

**대표 매칭 예시**:
- 오늘 11-01 → range "11-01 ~ 11-11" 빼빼로데이 매칭 → weight 2.0, snshelp_angles 4개 후보 추출
- 오늘 05-13 → range "04-25 ~ 05-05" 어린이날 ❌ (지남) + "05-08 ~ 05-15" 스승의 날 ✅ + "봄 시즌" ✅. 가중치 비교 후 스승의 날 우선
- 오늘 07-04 → range "07-08 ~ 07-14" 실버데이 ✅ + "06-25 ~ 08-25" 여름휴가 시즌 ✅. weight 1.8 vs 0.7 → 여름휴가 우선

**비-시즌 처리**: fixed_dates·seasons·lunar 모두 매칭 0개면 (b) 시즌 시드 X — (a) 플랫폼 발표 / (c) 트렌딩 콘텐츠로만 시의성 발굴.

**(c) 트렌딩 콘텐츠·음원·챌린지** (이번 주):
- `WebSearch("인스타 릴스 트렌딩 음원 {YYYY}-{MM}")` — 인스타 음원 차트
- `WebSearch("TikTok trending sounds Korea {YYYY}-{MM}")` — 틱톡 트렌드
- `WebSearch("Instagram Reels viral marketing trend {YYYY}")` — 바이럴 패턴
- 출처 URL + 시점 + 트렌딩 정도(조회수·사용 영상 수) 명시

#### 2) snshelp 적합도 필터 (CRITICAL — 부적합 시의성 즉시 제외)

각 후보 시드에 대해 다음 4개 질문을 **모두 통과**해야 채택. 하나라도 ❌면 제외.

- [ ] **운영 액션 가능?** snshelp 고객이 이 주제 글을 읽고 **운영 전략을 바꾸거나 즉시 적용할 작업**이 있나?
- [ ] **거래 다리 가능?** snshelp 서비스 페이지(`/instagram/`, `/youtube/`, `/tiktok/`) 또는 핵심 서비스(팔로워·좋아요·재생수 부스팅)와 자연 연결되나?
- [ ] **검색 의도 있음?** 사람들이 이 주제로 실제 검색하나? ("어떻게/방법/전략/후기" 질의 형태)
- [ ] **콘텐츠 깊이 가능?** 1차 출처 + 사용자 시나리오 + 측정값을 5,000자 이상 채울 수 있나? (단순 1-2줄 사실 보도면 X)

**부적합 예시 (제외)**:
- ❌ "메타가 어떤 소송에서 졌다" — 운영 액션 0
- ❌ "블랙핑크가 인스타 시작" — 일반 연예 뉴스
- ❌ "메타 CEO 정치 발언" — snshelp 무관
- ❌ "유튜브 모회사 주가 변동" — 비즈니스 뉴스
- ❌ "인스타 데이터 유출 사건" — 운영 전략 X
- ❌ "트럼프가 X(트위터) 복귀" — 일반 시사

**적합 예시**:
- ✅ "인스타 CEO Mosseri 발표 — 2026 릴스 알고리즘 변경 3가지" — 운영 전략 직접 영향
- ✅ "YouTube Shorts 광고 수익 분배율 변경 — 크리에이터 대응 가이드" — 수익 직결
- ✅ "크리스마스 인스타 마케팅 전략 2026 — 자영업 5단계" — 시즌 운영
- ✅ "요즘 떡상 중인 릴스 음원 Top 10 — 자영업·1인 마케터가 활용하는 법" — 트렌딩 즉시 활용
- ✅ "TikTok Auto Captions 한국어 지원 — 첫 30일 노출 전략" — 신기능 선점

#### 3) 카테고리 갭 시드 (fallback — 적합 시의성 < 3개일 때)

시의성 시드가 4/4 필터 통과 ≥ 3개면 그걸로 진행. 부족하면 갭 시드로 보충 또는 전체 대체.

**70/30 분기 (CRITICAL — 사이트 키워드 다양성 + 잠재 고객 진입 통로 확보)**:

갭 시드 진입 시 다음 명령으로 랜덤 분기 결정:
```bash
BRANCH=$(python3 -c "import random; print('info' if random.random() < 0.30 else 'transaction')")
```

- **transaction 분기 (70%)** — 기존 거래 의도 룰:
  - `_taxonomy.json` 카테고리 5개(유튜브·인스타·공통·소상공인·카카오톡 등)별 기존 글 수 카운트
  - snshelp 서비스 페이지(`/[platform]/[title]/`)와 기존 블로그 글 매핑
  - **서비스 페이지는 있는데 블로그 글이 빈약한 매핑**을 갭으로 식별
  - 거래 의도 키워드군 (`~ 구매`, `~ 늘리기`, `~ 추천`)

- **info 분기 (30%)** — 잠재 고객 진입 통로 (정보형 우선, 거래 다리는 약해도 됨):

  사용자가 직접 거래 의도로 검색하지는 않지만 snshelp 도메인 인접 정보를 궁금해하는 키워드. 콘텐츠 글 + 본문 내 자연스러운 snshelp 서비스 연결로 잠재 고객을 모집한다. 다양성·롱테일 트래픽·E-E-A-T 도메인 권위 확보가 목적.

  **정보형 키워드군 카탈로그**:

  | 분류 | 패턴 | 예시 |
  |---|---|---|
  | 운영 노하우 정보형 | `~ 알고리즘`, `~ 트렌드`, `~ 통계`, `~ 신호`, `~ 작동 원리` | "유튜브 알고리즘", "인스타 알고리즘 2026 변화", "릴스 노출 신호" |
  | 사용자 호기심 정보형 | `~ 몰래보기`, `~ 익명`, `~ 비공개 보는 법`, `~ 놀라운 사실` | "인스타 스토리 몰래보기", "유튜브 비공개 영상 보는 법" |
  | 카테고리 마케팅 정보형 | `{업종} 마케팅`, `{업종} 인스타 운영`, `{업종} 후기 관리` | "식당 마케팅", "카페 인스타 마케팅", "학원 SNS 운영" |
  | 수익·조건 정보형 | `~ 수익 창출 조건`, `~ YPP`, `~ 광고 단가`, `~ 파트너십 조건` | "유튜브 수익 창출 조건", "인스타 광고 단가", "TikTok Creativity 조건" |
  | 도구·기능 사용법 정보형 | `~ 사용법`, `~ 설정`, `~ 기능 정리` | "Sora 한국어 사용법", "인스타 새 기능 정리" |
  | 비교·차이 정보형 | `~ vs ~`, `~ 차이`, `~ 어떤 게 나아` | "릴스 vs 쇼츠", "Runway vs Sora 차이" |

  **info 분기 적합도 룰** (transaction 분기와 다른 점):
  - ✅ 거래 다리 약해도 OK (본문 끝 1곳 자연 연결만 있어도 채택)
  - ✅ 검색량 ≥ 500 권장 (롱테일 트래픽이 목적이라 transaction보다 검색량 기준 ↑)
  - ✅ 정보 깊이 ≥ 5,000자 가능해야 (전문성 시그널 — 잠재 고객 E-E-A-T 확보)
  - ❌ 단순 사실·뉴스 1줄 보도형 X (이전 시의성 부적합 룰 동일)
  - ❌ snshelp 도메인 완전 외부 (예: "주식 투자 방법", "다이어트 식단") X

  **거래 다리 약화 인정**: Phase 8 Topic Reviewer "거래 다리 가능성" 항목은 info 분기에서 가중 0.5 적용 (transaction 분기는 1.0). 단, 거래 다리 0이면 X (snshelp 서비스 페이지로 연결 가능한 어떤 각도라도 1개 이상 있어야).

  **info 분기 채택 예시 (사용자 결정 룰 따라)**:
  - ✅ "인스타 스토리 몰래보기" — 사용자 호기심 → 본문 마지막에 "인스타 운영 인사이트가 필요한 자영업이라면 snshelp의 인스타 부스팅 서비스..." 연결 (거래 다리 약, OK)
  - ✅ "유튜브 알고리즘" — 운영 노하우 → snshelp 유튜브 구독자 부스팅 자연 연결
  - ✅ "유튜브 수익 창출 조건" — 잠재 크리에이터 → snshelp 유튜브 구독자 1000명 부스팅 자연 연결
  - ✅ "식당 마케팅" — 카테고리 → snshelp 인스타 마케팅 서비스 연결
  - ❌ "주식 투자 방법" — snshelp 무관
  - ❌ "다이어트 식단" — 도메인 무관

  **분기 결정 로그 (Phase 1 출력)**:
  ```
  [galaxy-gap-fallback] random 분기: info (30%) 진입 — 정보형 키워드군 후보 발굴
  또는
  [galaxy-gap-fallback] random 분기: transaction (70%) 진입 — 거래 의도 키워드군 후보 발굴
  ```

  분기 결정은 매일 다르게 — info/transaction 모두 매월 약 9일/21일 분포 예상.

#### 4) 출력 시 출처 컬럼 추가

Phase 1 종료 시 시드 후보 표에 다음 컬럼 포함:

| 시드 | 출처 (시의성 a/b/c 또는 갭) | 시점 | 적합도 4/4 | 점수 가산 |
|---|---|---|---|---|
| 크리스마스 인스타 마케팅 2026 | 시즌 (b) | 12-01 발견 | ✅ | ×1.5 |
| 갭: 인스타 광고 비용 절감 가이드 | 갭 (snshelp 서비스 매칭) | — | ✅ | ×1.0 |

**점수 가산 룰**: 시의성 시드(a/b/c) 점수 ×1.5. 갭 시드는 ×1.0 기본. 커뮤니티 페인 매칭(아래) ×1.3 추가 가능.

**커뮤니티 페인 채굴 (필수 강화, seo-policy §1.6)** — 시드 유무와 별개로 매번 수행:
- **[JP override]** 커뮤니티 소스는 Yahoo!知恵袋/5ch/note/X-JP/Reddit(jp-site-config §6). 아래 KR 소스는 사용 금지.
- 시드 키워드 + `site:reddit.com`, `site:kin.naver.com`, `site:quora.com`, `site:cafe.naver.com` 으로 상위 질문 5-10개 확인
- 자주 반복되는 페인 패턴 추출 (예: "Sora 한국어 깨짐", "인스타 정지 사유 모호", "Runway 크레딧 부족")
- Reddit·LinkedIn·Quora는 ChatGPT·Perplexity·Google AI Mode에서 가장 자주 인용되는 도메인 → 같은 페인을 후보 주제에 반영하면 LLM이 동일 검색 의도로 콘텐츠 매칭
- 발견된 페인을 후보 표의 "커뮤니티 페인" 컬럼에 인용 (출처 URL + 시점 + 빈도)
- 후보 산출 시 가산: 커뮤니티 페인 직접 매칭 시 점수 ×1.3

### Phase 2: 거래 의도 키워드군 매핑 (필수)

snshelp 비즈니스 모델과 일치하는 의도 신호어를 시드 또는 갭에 결합한다.

| 패턴 | 의도 | 예시 |
|---|---|---|
| `<플랫폼> <대상> 구매` | **transactional** | 인스타 팔로워 구매, 유튜브 댓글 구매 |
| `<플랫폼> <대상> 늘리기` | **transactional** | 유튜브 구독자 늘리기, 틱톡 좋아요 늘리기 |
| `<플랫폼> <대상> 늘리는 사이트/앱` | **commercial** | 인스타 팔로워 늘리는 사이트 추천 |
| `<플랫폼> <대상> 빠르게/자동` | **transactional** | 인스타 팔로워 빠르게 늘리기 |
| `<플랫폼> <대상> 추천/비교/순위` | **commercial** | 유튜브 조회수 늘리는 앱 비교 |
| `<플랫폼> <대상> 후기/리뷰` | **commercial** | snshelp 후기 |
| `<플랫폼> <대상>이란?/방법/원리` | informational | 유튜브 알고리즘이란? |

거래·상업 패턴이 매칭되는 후보를 우선 채택. 정보형은 거래 전환 다리가 가능한 경우만 채택 후보로 보존.

### Phase 3: Semrush MCP 데이터 검증 (가용 시)

각 후보에 대해 `database=jp`로 호출:
1. **`phrase_these`** — 후보 batch 검색량·CPC·경쟁도 (semicolon 구분, 10-20개씩)
2. **`phrase_organic`** — 후보 중 점수 높은 Top 5에 대해 SERP 상위 10개 조회
3. **`phrase_kdi`** (선택) — 최종 Top 3 후보의 정확한 KD

**SERP 의도 매칭 검증 (필수)**:
- 후보 SERP 상위 5개 중 3개 이상이 **도구·랭킹·계산기**면 의도 불일치 → 콘텐츠 글 타깃으로 부적합. 후보에서 제외 또는 ⚠️ 표시.
- 콘텐츠(블로그/매체/가이드)가 다수면 ✅
- 위키·커뮤니티가 다수면 ⚠️ (참고만)

**한국어 시드 Fallback** (blog-keywords와 동일):
- `phrase_questions` `ERROR 50` 시 본문 주제에서 직접 도출
- `phrase_related` Relevance 0.3 미만이면 작은 토픽 → 검색량만으로 결정 금지, 거래 의도 신호어 가산점으로 보완

### Phase 4: 콘텐츠 갭 분석

각 후보에 대해 기존 글 매칭 상태 표기:
- 🆕 — 같은 키워드를 타깃한 기존 글 없음
- ♻️ — 비슷한 주제 기존 글 있음 (보강 후보, post-id 기록)
- 🚫 — 거의 동일한 글 이미 존재 (제외)

기존 글 매칭은 frontmatter `title`을 기준으로 메인 키워드 substring 매칭. 100개 넘는 글이라 grep 사용. (대상 경로 = `content/articles/*.md`)

### Phase 5: snshelp 서비스 페이지 매칭

각 후보에 대해 매칭되는 서비스 페이지 슬러그 표기:
- 예: 후보 "인스타 팔로워 늘리기" → `/instagram/instagram-followers/`
- 매칭이 있으면 **거래 전환 동선 확보 가능** → 우선순위 가산
- 매칭이 없으면 정보형 가치 위주로만 평가

### Phase 6: 우선순위 산출

각 후보의 점수 = `의도_가중치 × 검색량 × (100 - KD) / 100 × 갭_가중치 × SERP_매칭 × 서비스_링크_가산`

| 변수 | 값 |
|---|---|
| 의도_가중치 | transactional=2.0, commercial=1.5, informational=1.0 |
| 갭_가중치 | 🆕=1.5, ♻️=1.0, 🚫=0 |
| SERP_매칭 | ✅=1.0, ⚠️=0.6, ❌=0 |
| 서비스_링크_가산 | 매칭 있음=1.2, 없음=1.0 |

(검색량·KD가 빠진 경우 보수적으로 검색량 100·KD 30 가정. Semrush 미가용 시 그 사실을 명시.)

상위 **5-10개**만 후보 카드로 출력.

### Phase 7: 후보 카드 리포트

각 후보를 다음 형식으로 출력 (Top 10):

```markdown
## 후보 #{N}: {추천 제목}

| 항목 | 값 |
|---|---|
| 메인 키워드 | {거래/상업 의도 키워드} |
| 보조 키워드 (예상) | {보조 1}, {보조 2}, {보조 3} |
| 의도 | transactional / commercial / informational |
| 검색량 (Semrush) | {N} |
| KD | {N} |
| SERP 의도 매칭 | ✅ / ⚠️ / ❌ |
| 갭 | 🆕 / ♻️ ({기존 글 id}) |
| snshelp 서비스 링크 | {/[platform]/[title]/ 또는 "없음"} |
| 점수 | {N} |
| 한 줄 메모 | 왜 이게 좋은지/주의점 |
```

리포트 저장: `tmp/topics-{YYYYMMDD-HHMMSS}.md`

### Phase 8: Topic Reviewer 독립 검증 + 재선정 루프 (최대 3회, CRITICAL)

4-역할 하네스(`.ai-rules/references/work-orchestration.md`) 적용. Top 10 후보를 독립 sub-agent가 검증한 뒤, 미통과 후보는 제외하고 Top 5가 채워지지 않으면 Phase 1-7 재실행.

**Topic Reviewer (sub-agent로 즉시 실행, Pre-flight 없이)**:

평가 대상: Top 10 후보 리포트 (`tmp/topics-{ts}.md`)
정본: `.ai-rules/seo-policy.md` §0.1, `.ai-rules/blog-personas.md`, `content/articles/*.md`

각 후보에 대해 다음 7개 항목을 **사실 검증** (추측 금지, 실제 파일/도구로 확인):

1. **시드 적합도** — 사용자 시드의 의도와 후보 주제가 같은 도메인·플랫폼·문제 범주에 있는가
2. **검색량 검증** — **[JP override]** (jp-site-config §6·§7): JP는 네이버/DECAGO 없음 → Semrush `database=jp` `phrase_these` 검색량 ≥ 100이면 통과, 0이면 **❌ 제외**. 네이버 fallback 없음(Semrush 단일). Semrush가 NOTHING FOUND인 경우 본문 주제에서 직접 도출(blog-keywords와 동일 fallback). 아래 KR 네이버 합산 절차는 참고용.
3. **SERP 의도** — `phrase_organic` 상위 10개 중 도구·랭킹 ≥3이면 콘텐츠 글 부적합 → **❌ 제외**
3-A. **시의성 시드 적합도 (시의성 채널 a/b/c 출처일 때만)** — Phase 1 §2 적합도 4/4 (운영 액션·거래 다리·검색 의도·콘텐츠 깊이) 모두 통과인가? 하나라도 ❌면 **❌ 제외**. 특히 다음 부적합 패턴 재검증:
   - 일반 연예·정치·소송·주가 뉴스 (snshelp 무관)
   - 사용자가 "운영 전략 바꿀 정보" 0인 단순 사실 보도
   - 거래 다리 불가능 (snshelp 서비스 자연 연결 X)
4. **갭 정확성 (CRITICAL)** — 후보 메인 키워드 정확 어구로 `content/articles/*.md` 전체 grep:
   ```bash
   grep -l '"title".*<메인 키워드 정확 어구>' content/articles/*.md
   ```
   - 0개: 🆕 유지
   - ≥1개: ♻️로 강등하거나 ❌ 제외 (메인 키워드 cannibalization 방지, seo-policy §1.5)
5. **거래 다리 가능성** — 후보 글에서 snshelp 서비스 페이지(`/[platform]/[title]/`)로 자연스러운 CTA 다리가 가능한가.
   - **transaction 분기 후보** (직접 거래 의도): 1.0 가중. 거래 다리 약하면 ❌ 제외
   - **info 분기 후보** (Phase 1-(3) 30% 정보형 분기 산출): 0.5 가중. 거래 다리 약해도 OK (본문 끝 1곳 자연 연결만 있으면 채택). 단 거래 다리 0이면 ❌ 제외
   - 시의성 시드 출처(a/b/c): 1.0 가중 (기본)
6. **페르소나 매칭** — `.ai-rules/blog-personas.md` §2.5 deterministic 알고리즘으로 후보 주제에 매칭되는 페르소나가 있는가. 없으면 ⚠️ 표기 (글 작성 시 author 미지정 위험)

**Reviewer 출력 형식** (`tmp/topics-review-{ts}.md`):
```markdown
| # | 후보 | 시드 적합 | 검색량 | SERP | 갭 | 거래 다리 | 페르소나 | 종합 |
|---|---|---|---|---|---|---|---|---|
| 1 | … | ✅ | Semrush jp 6,000 ✅ | ⚠ 부분 | 🆕 | ✅ | ava | ✅ 채택 |
| 2 | … | ✅ | Semrush jp 0 ❌ | — | — | — | — | ❌ 제외 |
```

**재선정 루프**:
- Reviewer ✅ 채택 ≥ 5개 → 진행 (조기 종료)
- 채택 < 5개 → Phase 1-7 재실행 (시드 주변 다른 키워드군으로 확장, Reviewer 피드백을 Planner에 전달)
- 3회 후에도 채택 < 5개 → 사용자에게 보고: "현재 시드로는 5개 채택 불가. 시드 변경 / 채택된 N개로 진행 / 취소"

**호출 예시 (메인 에이전트)**:
```
Topic Reviewer에게 위임 (Agent tool, subagent_type=general-purpose):
- 평가 파일: tmp/topics-{ts}.md
- 정본: .ai-rules/seo-policy.md §9.0·§1.5, .ai-rules/blog-personas.md
- 도구: Bash (grep content/articles), Semrush MCP (phrase_these·organic, **`database=jp` 단독**). **[JP override]** (jp-site-config §6·§7): JP는 네이버/DECAGO 없음 → 네이버 API (DECAGO_NAVER_QUERY_ENDPOINT) 호출 단계 SKIP, Semrush `database=jp` 단독 사용. 아래 KR 절차는 참고용. (가드: Reviewer는 Semrush jp 단독 사용)
- 출력: tmp/topics-review-{ts}.md
- 추측 금지, 실제 파일·도구 호출만으로 검증
- Pre-flight 없이 즉시 실행
```

---

## 보고 (사용자에게)

상위 5개를 간단히 요약. 사용자가 선택하면 그 후보를 시드로 `blog/keywords.md` → `blog/write.md` 진행.

```
주제 후보 Top 5 (시드: "{시드 또는 자동}"):

1. ⭐ 인스타 팔로워 늘리기 빠른 방법 — trans, 1900회/m, KD 28, ✅ SERP, 🆕, 서비스 링크 ✓ (점수 2280)
2. 유튜브 댓글 구매 안전 가이드 — trans, 720회/m, KD 22, ✅ SERP, 🆕, 서비스 링크 ✓ (점수 1123)
3. 유튜브 조회수 늘리는 앱 추천 5선 — comm, 1000회/m, KD 30, ✅ SERP, ♻️ 글197, 서비스 링크 ✓ (점수 1050)
4. 틱톡 팔로워 늘리는 사이트 비교 — comm, 480회/m, KD 25, ✅ SERP, 🆕, 서비스 링크 ✓ (점수 810)
5. 인스타 좋아요 늘리기 자동화 도구 — comm, 320회/m, KD 18, ⚠️ SERP, 🆕, 서비스 링크 ✓ (점수 472)

다음 단계: /blog keywords "<선택한 후보의 메인 키워드>" 또는 /blog create <후보 번호>
리포트: tmp/topics-{YYYYMMDD-HHMMSS}.md
```

---

## 금지

- **거래/상업 후보를 무시하고 정보형 후보만 1순위로 추천 금지** (snshelp 비즈니스 모델 불일치)
- **검색량만 보고 SERP 의도 검증 없이 후보 채택 금지** (133번 작업의 핵심 학습)
- Semrush 미가용 시 검색량·KD를 추측해 점수 매기지 않기 (가정값임을 명시)
- 한 호출에 100+ 키워드 batch (토큰 과부하)
- 사용자가 시드를 줬는데 시드를 무시하고 다른 카테고리로 후보 만들기
