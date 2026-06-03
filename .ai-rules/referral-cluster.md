# SNS헬프 친구초대 cluster 글 룰 (정본)

> 자동 블로그 발행에서 **최소 주 1회는 /referral/ 유도 cluster 글**을 발행해 topical authority 누적 + 내부 링크 신호를 만든다.

## 0. 목적

- `/referral/` SEO 마케팅 페이지(메인 키워드: 재택부업, 보조: 부업추천·무자본부업·패시브인컴·셀프마케팅·SNS헬프 친구초대)에 매주 신선한 cluster 글에서 inbound link 1~2회 자동 누적
- 부업 의도 검색자(직장인·자영업·블로거)를 cluster 글 → /referral/ → 회원가입으로 자연 funnel
- 부업 키워드 스팸 가이드라인 (Google + Naver) 100% 준수

## 1. 트리거 룰 (sliding window)

자동 블로그 시스템 (`/blog create auto`) 매 실행 시 다음을 가장 먼저 검사:

```python
import json, os, datetime, glob
cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=7)
recent_cluster_count = 0
for path in glob.glob('wp-content/posts/*.md'):
    text = open(path).read()
    parts = text.split('---', 2)
    if len(parts) < 3: continue
    try:
        meta = json.loads(parts[1])
    except Exception:
        continue
    if not meta.get('_referral_cluster'):
        continue
    raw = meta.get('date_gmt') or meta.get('date') or ''
    if not raw: continue
    try:
        dt = datetime.datetime.fromisoformat(raw.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
    except Exception:
        continue
    if dt >= cutoff:
        recent_cluster_count += 1
print(recent_cluster_count)
```

**결과 분기**:

| recent_cluster_count | 동작 |
|---|---|
| **0** | 이번 실행은 **referral cluster 강제 시드**. Phase 1 시의성·갭 발굴 스킵. §3 cluster 시드 풀에서 1개 선정 |
| ≥ 1 | 정상 Phase 1 진행 (시의성 → 갭 fallback) |

## 2. cluster 글 작성 의무 룰 (HARD — 우회 금지)

cluster 강제 시드로 작성되는 글은 다음을 **모두** 충족.

### 2.1 frontmatter 마커
```json
{
  "id": ...,
  "_referral_cluster": true,
  "_referral_cluster_seed_id": 1,
  ...
}
```
- `_referral_cluster`: cluster 글 식별 boolean (트리거 게이트가 grep)
- `_referral_cluster_seed_id`: §3 시드 풀의 번호 (1~20). 28일 안에 같은 시드 재선정 방지용
- 두 필드 모두 wp-publish-new.mjs는 unknown field로 인식해 WP push payload에 포함되지 않으므로 로컬 frontmatter에만 존재. WP API에는 영향 없음

### 2.1-1 시드 재선정 방지 (28일 sliding window)

cluster 강제 모드에서 시드 선정 시:
```python
# 28일 안에 발행된 _referral_cluster_seed_id 집합
import json, glob, datetime
cutoff_28d = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=28)
recent_ids = set()
for path in glob.glob('wp-content/posts/*.md'):
    parts = open(path).read().split('---', 2)
    if len(parts) < 3: continue
    try: meta = json.loads(parts[1])
    except: continue
    if not meta.get('_referral_cluster'): continue
    raw = meta.get('date_gmt') or ''
    try:
        dt = datetime.datetime.fromisoformat(raw.replace('Z','+00:00'))
        if dt.tzinfo is None: dt = dt.replace(tzinfo=datetime.timezone.utc)
    except: continue
    if dt >= cutoff_28d:
        sid = meta.get('_referral_cluster_seed_id')
        if sid: recent_ids.add(sid)
# 가용 시드: 1~20 중 recent_ids에 없는 것
available = [i for i in range(1, 21) if i not in recent_ids]
# 모두 발행됐다면 가장 오래된 발행 시드 재사용 (각도·페르소나 다르게)
```

### 2.2 본문 링크 의무 (≥ 1회, ≤ 3회)

본문 어디에든 다음 **링크 형식만** 1회 이상 삽입 (최대 3회):

**링크 카운트 정의 (CRITICAL)**:
- markdown 링크 `[text](/referral/)` 또는 HTML `<a href="/referral/">text</a>` **둘 중 하나만** 카운트
- 텍스트 내 URL 표기(예: "https://www.helpsns.com/referral/"), figcaption 출처 표기, `<code>/referral/</code>` 코드 블록 표기는 **링크가 아니므로 카운트 제외**
- grep 패턴: `grep -oE '\[[^]]+\]\(/referral/\)|<a href="/referral/">' | wc -l`

**글 길이별 링크 분배 가이드 (자연 배치)**:
- H2 ≤ 6개: 1~2회 (TL;DR + 결론)
- H2 7~12개: 2~3회 (TL;DR + 중간 H2 + 결론)
- H2 ≥ 13개: 2~3회 유지 (4회 이상 절대 금지 — over-optimization 신호)

```html
<a href="/referral/">SNS헬프 친구초대 부업사이트</a>
<a href="/referral/">친구초대 부업 제도</a>
<a href="/referral/">무자본 재택 부수입 채널</a>
```

**자연 링크 패턴 예시**:
- "...자세한 보상 구조는 [SNS헬프 친구초대 부업사이트](/referral/)에서 확인할 수 있습니다."
- "...이런 분이라면 [무자본 재택 부수입 채널](/referral/)을 함께 운영해보는 것도 방법입니다."
- "...관련해서 [친구초대 부업 제도](/referral/)도 동일한 원리로 작동합니다."

### 2.3 본문 컨텍스트 의무

cluster 글 본문에는 다음 5개 entity·수치 그룹 중 **최소 2개 그룹** 본문에 포함 (권장 3개 이상). 같은 그룹 내 변형 중 1개만 등장해도 그 그룹은 충족:

| 그룹 | 변형 (OR 매칭) |
|---|---|
| G1 USP | "평생 10% 적립" / "주문금액의 10%" / "10%를 평생" |
| G2 무자본 | "무자본 부업" / "자본·재고·계정 없이" / "자본 없이 시작" |
| G3 가입 보너스 | "초대자 3,000P + 가입자 1,000P" / "3,000P 즉시 지급" / "1,000P 즉시 지급" |
| G4 수수료 0 | "수수료 0원" / "수수료 없는 현금 출금" / "100% 전환" |
| G5 평균 결제액 | "평균 결제액 1,500만 원" (대행사) / "평균 결제액 250만 원" (자영업) / "평균 월 사용액" |

### 2.4 스팸 가이드라인 (HARD — 0건 위반)

cluster 글이 부업 키워드를 다루므로 스팸 신호를 특히 엄격히 회피:

**금지 어구 (본문 grep 0회)**:
- "쉽게 시작" / "쉽게 돈 벌기"
- "자동으로 돈이"
- "평생 따박따박"
- "100% 보장"
- "확실한 수익"
- "노력 없이"
- "월 1억 가능"
- "100명만 하면 끝"

**금지 패턴**:
- 가상 후기·인터뷰 인용
- 출처 없는 수익 수치
- 수익 약속·환상 카피
- 외부 affiliate 광고 링크
- 제목·TL;DR·대표이미지에서 "한계", "함정", "실패", "자동 수익 아님"을 전면 메시지로 쓰는 방식. 주의사항은 중후반 조건·체크리스트 섹션에서 다룬다.
- 제목·TL;DR·대표이미지·첫 H2에서 "본업 시간 0", "운영 시간 0", "자동 친구초대", "자동 적립", "자동 누적", "자동 수익"처럼 무노력·자동 수익으로 읽히는 표현
- 제목·TL;DR·대표이미지·첫 H2에서 `ROI`, `CAC`, `LTV`, `affiliate`, `객단가` 같은 어려운 약어·업계 용어를 풀이 없이 쓰는 방식. 핵심 위치에서는 "수익 계산", "새 고객 찾는 비용", "고객이 오래 결제한 금액", "제휴 프로그램", "평균 결제액"으로 쓴다.

**의무 패턴**:
- 모든 수치에 시점·출처 (예: "(주)핫셀러 자체 고객 조사 2026년 5월 기준")
- 이론값은 계산 근거 명시 (예: "월 100만원 × 50명 × 10% = 월 500만원 가정값")
- E-E-A-T 마커 본문 ≥ 1개
- **부업 정확 어구 본문 밀도 ≤ 1.5%** — 분모 정의: `<main>` 본문 한국어 문자수(`grep -o '[가-힣]' wp-content/posts/draft-*.md | wc -l`). frontmatter·script·schema·HTML 태그 제외. 분자: `grep -o '부업' | wc -l`. **wc -w는 한국어에 부정확하므로 금지**
- 주의사항 H2는 "주의할 점", "시작 조건", "체크리스트", "맞지 않는 경우", "시작 전 확인할 점" 중 하나로 긍정·실행형 프레임을 쓴다. referral cluster에서는 "흔한 함정", "실패 사례"를 H2로 쓰지 않는다.
- `패시브인컴`은 메인 키워드일 때만 제목·첫 H2에 허용하고, 첫 등장에 "꾸준히 쌓이는 부수입"으로 풀어쓴다.

## 3. cluster 시드 풀 (메인 키워드 + 페르소나 매칭)

자동 발행이 cluster 강제 시드 모드일 때, 다음 풀에서 **최근 4주 안에 발행되지 않은 시드** 중 weight·페르소나 부담률을 고려해 1개 선정.

**메인 키워드 표기 룰**: 한국어 공백 표기는 검색 SERP에서 동일 의도로 매칭됨 (예: "직장인부업" == "직장인 부업"). title 작성 시 공백 표기 우선 (자연 가독성). 검색량 검증 시 두 표기 모두 DECAGO/Semrush 조회 후 합 ≥ 100이면 통과.

| # | 시드 (제목 후보) | 메인 키워드 | 보조 키워드 | 매칭 페르소나 | snshelp 서비스 매칭 |
|---|---|---|---|---|---|
| 1 | 직장인 부업 추천 — 비용·시간·예상 적립액으로 비교한 SNS 마케팅 부수입 5가지 | 직장인부업 (= "직장인 부업") | 부업추천·무자본부업·패시브인컴 | mason | /referral/, /instagram/ |
| 2 | 셀프마케팅 부수입 만들기 — 자영업·소상공인의 친구초대 부업 모델 | 셀프마케팅 | 마케팅 대행사 부업·평생 10% | oliver | /referral/, /instagram/ |
| 3 | 자영업 사장님 부수입 — 같은 업종 사장님 네트워크로 평생 10% 적립 | 자영업 부수입 | 친구초대 부업·재택부수입 | oliver | /referral/, /instagram/ |
| 4 | 블로거 패시브인컴 — SNS헬프 글 공유로 친구초대 적립 구조 만들기 | 블로거 패시브인컴 | 무자본부업·블로그 부업 | jamie | /referral/, /blog/ |
| 5 | 재택부업 추천 2026 — 마케터·블로거에게 가장 잘 맞는 무자본 모델 | 재택부업 | 무자본부업·재택 부수입 | mason | /referral/, /instagram/ |
| 6 | 마케팅 대행사 부업 — 평균 결제액 1,500만 원 고객 추천 수익 계산법 | 마케팅 대행사 부업 | 부업추천·셀프마케팅 | mason | /referral/, /instagram/ |
| 7 | SNS 부업 — 친구초대 평생 10% 적립 구조와 시작법 | SNS 부업 | 평생 10% 적립·무자본부업 | mason | /referral/ |
| 8 | 음식점·미용실 사장님 부수입 — 자영업 평균 월 250만 원 결제액의 친구초대 | 음식점 부수입 | 자영업 부업·평생 10% | oliver | /referral/, /instagram/ |
| 9 | 1인 마케터 부업 — 기존 고객 네트워크로 평생 적립되는 추천 보상 채널 | 1인 마케터 부업 | 부업추천·패시브인컴 | mason | /referral/ |
| 10 | 무자본부업 어디서 시작? — SNS헬프 친구초대 부업사이트 분석 가이드 | 무자본부업 | 부업사이트·재택부업 | mason | /referral/ |
| 11 | 부업사이트 비교 — 무자본으로 평생 적립 가능한 곳 분석 | 부업사이트 | 무자본부업·평생 10% 적립·재택부업사이트 | mason | /referral/ |
| 12 | 집에서 하는 부업 — 자본 0으로 시작하는 추천코드 모델 가이드 | 집에서 하는 부업 | 재택부업·무자본부업·집에서 할 수 있는 부업 | oliver | /referral/ |
| 13 | 재택부업사이트 추천 — 친구초대로 평생 적립 만드는 채널 | 재택부업사이트 | 부업사이트·재택부업·무자본부업 | mason | /referral/ |
| 14 | 집에서 할 수 있는 부업 — 주부·직장인 대상 평생 적립형 모델 | 집에서 할 수 있는 부업 | 재택부업·주부 부업·집에서 하는 부업 | oliver | /referral/ |
| 15 | 온라인 부업 — SNS 마케팅 추천 보상 채널로 평생 10% | 온라인 부업 | 재택부업·SNS 부업·무자본부업 | mason | /referral/, /instagram/ |
| 16 | 직장인 부수입 만들기 — 마케팅 대행사 직군의 평생 적립형 추천 | 직장인 부수입 | 직장인부업·마케팅 대행사 부업·평생 10% | mason | /referral/ |
| 17 | N잡 추천 — 본업 외 자동 적립되는 추천 보상 모델 | N잡 | 직장인부업·부수입·평생 10% 적립 | mason | /referral/ |
| 18 | 대학생 부업 — 시간·자본 없이 추천코드로 시작하는 부수입 | 대학생 부업 | 무자본부업·부수입·온라인 부업 | jamie | /referral/ |
| 19 | 컴퓨터 부업 — PC 활용 무자본 추천 보상 채널 정리 | 컴퓨터 부업 | 재택부업·온라인 부업·무자본부업 | mason | /referral/ |
| 20 | 50대 부업 — 추가 노동 없는 평생 적립형 추천 모델 | 50대 부업 | 재택부업·부수입·무자본부업 | mason | /referral/ |

**시드 선정 절차**:

1. `wp-content/posts/*.md` 전체에서 `_referral_cluster: true` 글의 frontmatter `date_gmt` 추출
2. 최근 4주(28일) 안에 발행된 시드 #(1-20) 식별
3. **위 풀에서 28일 안에 발행되지 않은 시드** 중 시드 #1부터 순회하며 검색량 큰 것 우선
4. 모든 시드가 28일 안에 발행됐다면 가장 오래된 발행 시드 재사용 (각도·페르소나 다르게)

**페르소나 부담률**:
- mason 14개·oliver 4개·jamie 2개 → mason 부담 큼. mason이 직전 cluster 글 작성자였다면 다른 페르소나 우선

## 4. 검색량 채택 게이트 (메인 키워드)

위 시드 풀의 메인 키워드는 모두 사전 검증된 값이지만, 발행 직전 한 번 더 확인:
- 네이버 DECAGO PC + Mobile 합산 ≥ 100 (룰: seo-policy.md §1.5)
- 풀에 있는 시드가 모두 통과 (직장인부업 2,810, 셀프마케팅 6,980, 자영업 부수입 540 등)

**Semrush API 실패 시 fallback (CRITICAL)**:
Semrush units 부족·인증 실패 등 외부 API 장애 발생 시 **즉시 DECAGO 네이버 프록시로 fallback**. 작성자 책임 아니므로 키워드 영역 점수 영향 없음. fallback 호출 명령:
```bash
set -a && source .env && set +a
curl -X POST "$DECAGO_NAVER_QUERY_ENDPOINT" \
  -H 'Content-Type: application/json' \
  -d '{"platforms":["naver"],"keywords":["<메인>","<보조1>",...],"is_raw":false,"is_extend_naver":false}'
```
응답 `naver.pc + naver.mobile ≥ 100`이면 통과로 판정.

**DECAGO 검증 결과별 채택 절차 (CRITICAL)**:
1. **메인 키워드 합 ≥ 100**: 정상 채택. 보조 키워드도 확인 후 본문 분포 계획
2. **메인 키워드 합 < 100인데 보조 키워드 중 1개 이상 ≥ 100**:
   - 시드 풀 정본 메인 키워드(title 정확 어구)는 그대로 유지 (시드 풀이 정본 — 검색량 작은 long-tail 메인도 SERP 의도 우선)
   - 보조 키워드 중 검색량 큰 것 1개 이상을 본문·H2·schema에 의도 보완용으로 강화 배치 (보조 키워드 분포 의무 + audit 키워드 영역 -10 페널티 회피)
   - 작성 보고에 "메인 N + 보조 X 채택" 형식 명시
3. **메인·보조 모두 합 < 100 (DECAGO 전체 fail)**:
   - 시드 풀 사전 검증값 신뢰 (시드 풀이 정본). 단 audit 보고에 "DECAGO 전수 미달, 시드 풀 사전값으로 진행" 명시
   - 다음 갱신 사이클에 시드 풀 재검토 (referral-cluster.md §3 메인 키워드 후보 갱신)
4. **DECAGO API 자체 장애 (네트워크·인증 실패)**: 시드 풀 사전 검증값 신뢰 + audit 보고에 "DECAGO API 장애로 시드 풀 사전값 채택" 명시. 작성자 책임 아님

## 5. 자동 발행 흐름 (cluster 강제 시드 시)

```
1. topic 단계(blog/topic.md) Phase 0 끝: §1 트리거 게이트 검사
   recent_cluster_count == 0
   → §3 시드 풀에서 1개 강제 선정
   → Phase 1 시의성·갭 스킵
2. keywords 단계(blog/keywords.md): 메인 키워드 = 시드의 "메인 키워드" 컬럼 그대로 채택
3. write 단계(blog/write.md):
   - frontmatter에 _referral_cluster: true 마커 추가
   - 본문에 /referral/ 링크 1~2회 §2.2 패턴으로 자연 삽입
   - 본문에 §2.3 entity·수치 1개 이상 포함
   - 페르소나 = §3 시드 풀의 "매칭 페르소나" 컬럼
4. audit 단계(blog/audit.md):
   - §2.4 스팸 어구 grep 0회 확인
   - /referral/ 링크 1회 이상 확인
   - cluster 글 추가 게이트: 누락 시 -15 감점 (write 보강 루프 트리거)
5. publish 단계(blog/publish.md): 정상 발행 + git push
```

## 6. 검증 명령

cluster 글 발행 직후 (또는 매주 모니터링):

```bash
# 최근 7일 안에 _referral_cluster=true 글이 1편 이상 발행됐는지
python3 -c "
import json, glob, datetime
cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=7)
hits = []
for path in glob.glob('wp-content/posts/*.md'):
    parts = open(path).read().split('---', 2)
    if len(parts) < 3: continue
    try: meta = json.loads(parts[1])
    except: continue
    if not meta.get('_referral_cluster'): continue
    raw = meta.get('date_gmt') or ''
    try:
        dt = datetime.datetime.fromisoformat(raw.replace('Z','+00:00'))
        if dt.tzinfo is None: dt = dt.replace(tzinfo=datetime.timezone.utc)
    except: continue
    if dt >= cutoff:
        hits.append((meta.get('id'), meta.get('title',{}).get('rendered','-') if isinstance(meta.get('title'),dict) else meta.get('title','-'), raw))
print(f'최근 7일 cluster 글 {len(hits)}편')
for h in hits: print(' ', h)
"
```

결과가 0편이면 다음 자동 발행 회차에서 강제 시드 발화. 1편 이상이면 정상.

## 7. 비범위 (이번 룰 정본 제외)

- 기존 운영 블로그 글에 /referral/ 링크 후추가 작업 (wp-push 위험으로 보류)
- /referral/ 페이지 본문 추가 보강 (이미 100점 완성)
- 외부 백링크·브랜드 PR (외부 작업, 별도)
